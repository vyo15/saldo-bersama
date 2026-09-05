import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { FiPlus } from "react-icons/fi";
import { useNavigate } from "react-router";
import Money from "../../../components/common/Money.jsx";
import PageInfoButton from "../../../components/common/PageInfoButton.jsx";
import { useReducedMotion } from "../../../hooks/useReducedMotion.js";
import { semanticMotionDurationMs } from "../../../shared/motion.js";
import {
  ACCOUNT_BALANCE_GUIDANCE,
  accountCardOwnershipLabel,
  accountOwnerName,
  accountProviderLabel,
  accountScopeLabel,
  detectEwalletTemplate,
  formatAccountNumber,
} from "../../../shared/presentation/account.js";
import { AccountVisual } from "./AccountFinancialCard.jsx";
import styles from "./MobileAccountsExperience.module.css";

const MobileAccountActivity = lazy(() => import("./MobileAccountActivity.jsx"));
const MobileAccountTransferAction = lazy(() => import("./MobileAccountTransferAction.jsx"));

const OWNERSHIP_FILTERS = Object.freeze([
  ["all", "Semua"],
  ["self", "Saya"],
  ["partner", "Pasangan"],
  ["shared", "Bersama"],
]);

const MOBILE_STACK_SLOT_STYLES = Object.freeze({
  "-2": Object.freeze({ x: 48, y: -192, z: -250, rx: 44, ry: -7, rz: 16, opacity: 0, brightness: 0.66, saturate: 0.72 }),
  "-1": Object.freeze({ x: 38, y: -104, z: -105, rx: 18, ry: -5, rz: 10, opacity: 0.76, brightness: 0.8, saturate: 0.82 }),
  0: Object.freeze({ x: 0, y: 0, z: 150, rx: 0, ry: 0, rz: 0, opacity: 1, brightness: 1, saturate: 1 }),
  1: Object.freeze({ x: 38, y: 108, z: -110, rx: -18, ry: 5, rz: -10, opacity: 0.68, brightness: 0.74, saturate: 0.78 }),
  2: Object.freeze({ x: 48, y: 196, z: -260, rx: -44, ry: 7, rz: -16, opacity: 0, brightness: 0.64, saturate: 0.7 }),
});

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const modulo = (value, divisor) => ((value % divisor) + divisor) % divisor;
const interpolate = (from, to, progress) => from + (to - from) * progress;
const easeOutQuint = (progress) => 1 - ((1 - progress) ** 5);
const MOBILE_SYNTHETIC_CLICK_GUARD_MS = 500;

const shortestCircularDifference = (index, virtualPosition, count) => {
  let difference = index - virtualPosition;
  while (difference > count / 2) difference -= count;
  while (difference < -count / 2) difference += count;
  return difference;
};

const stackStyleAtDifference = (difference) => {
  if (difference <= -2) return MOBILE_STACK_SLOT_STYLES["-2"];
  if (difference >= 2) return MOBILE_STACK_SLOT_STYLES[2];
  const lower = Math.floor(difference);
  const upper = Math.ceil(difference);
  if (lower === upper) return MOBILE_STACK_SLOT_STYLES[lower];
  const from = MOBILE_STACK_SLOT_STYLES[lower];
  const to = MOBILE_STACK_SLOT_STYLES[upper];
  const progress = difference - lower;
  return Object.fromEntries(Object.keys(from).map((key) => [key, interpolate(from[key], to[key], progress)]));
};

const useMobileStackRefs = () => {
  const mobileStackCardRefs = useRef(new Map());
  const mobileStackStageRef = useRef(null);
  const mobileStackStatusRef = useRef(null);
  const mobileStackAccountsRef = useRef([]);
  const mobileStackPositionRef = useRef(0);
  const mobileStackSettledIndexRef = useRef(0);
  const mobileStackAnimationRef = useRef(0);
  const mobileStackAnimationTokenRef = useRef(0);
  const mobileStackAnimatingRef = useRef(false);
  const mobileStackGestureRef = useRef({
    tracking: false, dragging: false, rejected: false, pointerId: null, captureElement: null,
    startX: 0, startY: 0, startTime: 0, lastY: 0, lastTime: 0, velocityY: 0, suppressClick: false, suppressClickUntil: 0,
  });
  return useMemo(() => ({
    cardRefs: mobileStackCardRefs, stageRef: mobileStackStageRef, statusRef: mobileStackStatusRef, accountsRef: mobileStackAccountsRef,
    positionRef: mobileStackPositionRef, settledIndexRef: mobileStackSettledIndexRef, animationRef: mobileStackAnimationRef,
    animationTokenRef: mobileStackAnimationTokenRef, animatingRef: mobileStackAnimatingRef, gestureRef: mobileStackGestureRef,
  }), []);
};

const useMobileStackAnimation = (refs, setSelectedAccountId, reducedMotion) => {
  const setMobileStackWillChange = useCallback((enabled) => {
    for (const element of refs.cardRefs.current.values()) element.style.willChange = enabled ? "transform, opacity" : "";
  }, [refs.cardRefs]);
  const applyMobileStackPosition = useCallback(() => {
    const stackAccounts = refs.accountsRef.current;
    const count = stackAccounts.length;
    if (!count) return;
    const moving = refs.animatingRef.current || refs.gestureRef.current.dragging;
    stackAccounts.forEach((account, index) => {
      const element = refs.cardRefs.current.get(account.account_id);
      if (!element) return;
      const difference = shortestCircularDifference(index, refs.positionRef.current, count);
      const visual = stackStyleAtDifference(difference);
      const active = Math.abs(difference) <= 0.5;
      if (reducedMotion) {
        element.style.transform = "translate(-50%, -50%)";
        element.style.opacity = active ? "1" : "0";
        element.style.filter = "none";
        element.style.boxShadow = "none";
      } else {
        element.style.transform = [
          "translate(-50%, -50%)", `translate3d(${visual.x}px, ${visual.y}px, ${visual.z}px)`,
          `rotateX(${visual.rx}deg)`, `rotateY(${visual.ry}deg)`, `rotateZ(${visual.rz}deg)`,
        ].join(" ");
        element.style.opacity = String(visual.opacity);
        if (!moving) {
          element.style.filter = `brightness(${visual.brightness}) saturate(${visual.saturate})`;
          element.style.boxShadow = "none";
        }
      }
      element.style.zIndex = String(Math.round(1000 + visual.z));
      element.style.pointerEvents = active ? "auto" : "none";
      element.tabIndex = active ? 0 : -1;
      element.setAttribute("aria-hidden", active ? "false" : "true");
      element.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }, [reducedMotion, refs.accountsRef, refs.animatingRef, refs.cardRefs, refs.gestureRef, refs.positionRef]);
  const animateMobileStackTo = useCallback((targetIndex, { announce = true, selectAtStart = false } = {}) => {
    const stackAccounts = refs.accountsRef.current;
    const count = stackAccounts.length;
    if (!count) return;
    window.cancelAnimationFrame(refs.animationRef.current);
    const animationToken = refs.animationTokenRef.current + 1;
    refs.animationTokenRef.current = animationToken;
    refs.animatingRef.current = true;
    const normalizedTarget = modulo(targetIndex, count);
    const startPosition = refs.positionRef.current;
    let difference = normalizedTarget - startPosition;
    if (difference > count / 2) difference -= count;
    if (difference < -count / 2) difference += count;
    const finalPosition = startPosition + difference;
    if (selectAtStart) setSelectedAccountId(stackAccounts[normalizedTarget].account_id);
    const finish = () => {
      if (refs.animationTokenRef.current !== animationToken) return;
      refs.settledIndexRef.current = normalizedTarget;
      refs.positionRef.current = normalizedTarget;
      refs.animationRef.current = 0;
      refs.animatingRef.current = false;
      setMobileStackWillChange(false);
      applyMobileStackPosition();
      if (!selectAtStart) setSelectedAccountId(stackAccounts[normalizedTarget].account_id);
      if (announce && refs.statusRef.current) refs.statusRef.current.textContent = `Rekening aktif ${stackAccounts[normalizedTarget].name}`;
    };
    if (reducedMotion) {
      refs.positionRef.current = normalizedTarget;
      finish();
      return;
    }
    setMobileStackWillChange(true);
    const durationMs = semanticMotionDurationMs("emphasized");
    const startedAt = performance.now();
    const frame = (now) => {
      if (refs.animationTokenRef.current !== animationToken) return;
      const progress = clamp((now - startedAt) / durationMs, 0, 1);
      refs.positionRef.current = interpolate(startPosition, finalPosition, easeOutQuint(progress));
      applyMobileStackPosition();
      if (progress < 1) refs.animationRef.current = window.requestAnimationFrame(frame);
      else finish();
    };
    refs.animationRef.current = window.requestAnimationFrame(frame);
  }, [applyMobileStackPosition, reducedMotion, refs, setMobileStackWillChange, setSelectedAccountId]);
  const cancelMobileStackAnimation = useCallback(() => {
    refs.animationTokenRef.current += 1;
    window.cancelAnimationFrame(refs.animationRef.current);
    refs.animationRef.current = 0;
    refs.animatingRef.current = false;
    setMobileStackWillChange(false);
  }, [refs.animationRef, refs.animationTokenRef, refs.animatingRef, setMobileStackWillChange]);
  return useMemo(() => ({
    applyMobileStackPosition,
    animateMobileStackTo,
    cancelMobileStackAnimation,
    setMobileStackWillChange,
  }), [applyMobileStackPosition, animateMobileStackTo, cancelMobileStackAnimation, setMobileStackWillChange]);
};

const useMobileStackGestures = ({ refs, animation, reducedMotion }) => {
  const armMobileStackClickGuard = useCallback(() => {
    const gesture = refs.gestureRef.current;
    gesture.suppressClick = true;
    gesture.suppressClickUntil = performance.now() + MOBILE_SYNTHETIC_CLICK_GUARD_MS;
  }, [refs.gestureRef]);
  const resetMobileStackGesture = useCallback(() => {
    const gesture = refs.gestureRef.current;
    Object.assign(gesture, { tracking: false, dragging: false, rejected: false, pointerId: null, captureElement: null });
    refs.stageRef.current?.classList.remove(styles.mobileStackDragging);
    animation.setMobileStackWillChange(false);
  }, [animation, refs.gestureRef, refs.stageRef]);
  const handleMobileStackPointerDown = useCallback((event) => {
    if (refs.animatingRef.current || refs.accountsRef.current.length <= 1) return;
    const now = performance.now();
    refs.gestureRef.current = {
      tracking: true, dragging: false, rejected: false, pointerId: event.pointerId, captureElement: event.currentTarget,
      startX: event.clientX, startY: event.clientY, startTime: now, lastY: event.clientY, lastTime: now, velocityY: 0,
      suppressClick: false, suppressClickUntil: 0,
    };
  }, [refs.accountsRef, refs.animatingRef, refs.gestureRef]);
  const handleMobileStackPointerMove = useCallback((event) => {
    const gesture = refs.gestureRef.current;
    if (!gesture.tracking || gesture.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    if (gesture.rejected) return;
    if (!gesture.dragging) {
      if (Math.abs(deltaX) > 10 && Math.abs(deltaX) > Math.abs(deltaY)) { gesture.rejected = true; gesture.suppressClick = true; return; }
      if (Math.abs(deltaY) < 8 || Math.abs(deltaY) <= Math.abs(deltaX) * 1.15) return;
      gesture.dragging = true;
      gesture.suppressClick = true;
      refs.stageRef.current?.classList.add(styles.mobileStackDragging);
      gesture.captureElement?.setPointerCapture(event.pointerId);
      animation.setMobileStackWillChange(true);
    }
    const now = performance.now();
    const elapsed = Math.max(1, now - gesture.lastTime);
    gesture.velocityY = (event.clientY - gesture.lastY) / elapsed;
    gesture.lastY = event.clientY;
    gesture.lastTime = now;
    if (reducedMotion) return;
    const progress = clamp(-deltaY / 154, -0.92, 0.92);
    refs.positionRef.current = refs.settledIndexRef.current + progress;
    animation.applyMobileStackPosition();
  }, [animation, reducedMotion, refs.gestureRef, refs.positionRef, refs.settledIndexRef, refs.stageRef]);
  const finishMobileStackPointer = useCallback((event) => {
    const gesture = refs.gestureRef.current;
    if (!gesture.tracking || gesture.pointerId !== event.pointerId) return;
    if (gesture.rejected) { armMobileStackClickGuard(); resetMobileStackGesture(); return; }
    if (!gesture.dragging) { resetMobileStackGesture(); return; }
    const totalDeltaY = event.clientY - gesture.startY;
    const averageVelocity = totalDeltaY / Math.max(1, performance.now() - gesture.startTime);
    const progress = refs.positionRef.current - refs.settledIndexRef.current;
    if (gesture.captureElement?.hasPointerCapture(event.pointerId)) gesture.captureElement.releasePointerCapture(event.pointerId);
    armMobileStackClickGuard();
    resetMobileStackGesture();
    const fastSwipe = Math.abs(gesture.velocityY) > 0.48 || Math.abs(averageVelocity) > 0.42;
    const passedThreshold = reducedMotion ? Math.abs(totalDeltaY) >= 44 : Math.abs(progress) >= 0.28;
    const direction = progress !== 0 ? Math.sign(progress) : (totalDeltaY < 0 ? 1 : -1);
    animation.animateMobileStackTo(refs.settledIndexRef.current + (fastSwipe || passedThreshold ? direction : 0), { announce: fastSwipe || passedThreshold });
  }, [animation, armMobileStackClickGuard, reducedMotion, refs.gestureRef, refs.positionRef, refs.settledIndexRef, resetMobileStackGesture]);
  return { armMobileStackClickGuard, resetMobileStackGesture, handleMobileStackPointerDown, handleMobileStackPointerMove, finishMobileStackPointer };
};

const useMobileStackController = ({ accounts, selectedAccountId, setSelectedAccountId, setMobileAccountSheet }) => {
  const reducedMotion = useReducedMotion();
  const refs = useMobileStackRefs();
  const animation = useMobileStackAnimation(refs, setSelectedAccountId, reducedMotion);
  const gestures = useMobileStackGestures({ refs, animation, reducedMotion });
  const { cancelMobileStackAnimation } = animation;
  const moveMobileStack = useCallback((step) => {
    if (refs.animatingRef.current || refs.accountsRef.current.length <= 1) return;
    animation.animateMobileStackTo(refs.settledIndexRef.current + step);
  }, [animation, refs.accountsRef, refs.animatingRef, refs.settledIndexRef]);
  const handleMobileStackKeyDown = useCallback((event) => {
    if (event.key === "ArrowUp") { event.preventDefault(); moveMobileStack(-1); }
    if (event.key === "ArrowDown") { event.preventDefault(); moveMobileStack(1); }
  }, [moveMobileStack]);
  const selectMobileStackAccount = useCallback((account, index) => {
    const gesture = refs.gestureRef.current;
    if (gesture.suppressClick) {
      if (performance.now() < gesture.suppressClickUntil) return;
      gesture.suppressClick = false;
      gesture.suppressClickUntil = 0;
    }
    if (index !== refs.settledIndexRef.current) { animation.animateMobileStackTo(index, { selectAtStart: true }); return; }
    setSelectedAccountId(account.account_id);
    setMobileAccountSheet("detail");
  }, [animation, refs.gestureRef, refs.settledIndexRef, setMobileAccountSheet, setSelectedAccountId]);
  const cancelMobileStackPointer = useCallback((event) => {
    const gesture = refs.gestureRef.current;
    if (!gesture.tracking || gesture.pointerId !== event.pointerId) return;
    if (gesture.captureElement?.hasPointerCapture(event.pointerId)) gesture.captureElement.releasePointerCapture(event.pointerId);
    const wasDragging = gesture.dragging;
    const shouldSuppressClick = gesture.suppressClick;
    if (shouldSuppressClick) gestures.armMobileStackClickGuard();
    gestures.resetMobileStackGesture();
    if (wasDragging) animation.animateMobileStackTo(refs.settledIndexRef.current, { announce: false });
  }, [animation, gestures, refs.gestureRef, refs.settledIndexRef]);
  useLayoutEffect(() => {
    refs.accountsRef.current = accounts;
    if (!accounts.length) return;
    const selectedIndex = Math.max(0, accounts.findIndex((account) => account.account_id === selectedAccountId));
    if (!refs.animatingRef.current && !refs.gestureRef.current.dragging) {
      refs.settledIndexRef.current = selectedIndex;
      refs.positionRef.current = selectedIndex;
      animation.applyMobileStackPosition();
    }
  }, [accounts, animation, refs.accountsRef, refs.animatingRef, refs.gestureRef, refs.positionRef, refs.settledIndexRef, selectedAccountId]);
  useEffect(() => () => cancelMobileStackAnimation(), [cancelMobileStackAnimation]);
  return { refs, ...gestures, cancelMobileStackPointer, handleMobileStackKeyDown, selectMobileStackAccount, reducedMotion };
};


const shouldRenderMobileStackOwnership = (account) => account.account_type !== "ewallet" || detectEwalletTemplate(account) === "generic";

const MobileAccountsExperience = ({ accounts, selectedAccount, selectedAccountId, ownershipFilter, onOwnershipFilterChange, ownerMode, openCreateDialog, setMobileAccountSheet, setSelectedAccountId, bootstrap, onTransferSaved }) => {
  const navigate = useNavigate();
  const stack = useMobileStackController({ accounts, selectedAccountId, setSelectedAccountId, setMobileAccountSheet });
  const {
    refs: { cardRefs: mobileStackCardRefs, stageRef: mobileStackStageRef, statusRef: mobileStackStatusRef },
    handleMobileStackPointerDown, handleMobileStackPointerMove, finishMobileStackPointer, cancelMobileStackPointer,
    handleMobileStackKeyDown, selectMobileStackAccount,
  } = stack;
  return <div className={styles.mobileAccountExperience}>
    <section className={styles.mobileStackPanel} aria-labelledby="mobile-account-stack-title">
      <header className={styles.mobileStackHeader}>
        <div className={styles.mobileStackHeaderLabel}><strong className={styles.mobileStackHeaderTitle}>Rekening</strong><PageInfoButton tone="hero" title="Tentang Rekening">{ACCOUNT_BALANCE_GUIDANCE}</PageInfoButton></div>
        <div className={styles.mobileStackHeaderActions}>
          {selectedAccount ? <Suspense fallback={null}><MobileAccountTransferAction bootstrap={bootstrap} selectedAccount={selectedAccount} onTransferSaved={onTransferSaved} onViewTransactions={(item, period) => navigate("/transaksi", { state: { accountId: item.account_id, period } })} /></Suspense> : null}
          {ownerMode ? <button type="button" className={styles.mobileStackHeaderButton} onClick={openCreateDialog} aria-label="Tambah rekening" title="Tambah rekening"><FiPlus aria-hidden="true" /><span>Tambah</span></button> : null}
        </div>
      </header>
      <div className={styles.mobileOwnershipFilters} role="group" aria-label="Filter kepemilikan rekening">
        {OWNERSHIP_FILTERS.map(([value, label]) => <button key={value} type="button" className={styles.mobileOwnershipFilter} aria-pressed={ownershipFilter === value} onClick={() => onOwnershipFilterChange(value)}>{label}</button>)}
      </div>
      <div ref={mobileStackStageRef} className={styles.mobileStackStage} tabIndex={0} aria-label="Rekening aktif. Gunakan Pilih rekening, atau geser ke atas dan bawah untuk mengganti rekening" aria-describedby="mobile-account-stack-hint" onKeyDown={handleMobileStackKeyDown}>
        <div className={styles.mobileStackAmbient} aria-hidden="true" />
        {accounts.map((account, index) => (
          <button key={`mobile-stack-${account.account_id}`} ref={(node) => { if (node) mobileStackCardRefs.current.set(account.account_id, node); else mobileStackCardRefs.current.delete(account.account_id); }}
            type="button" className={styles.mobileStackCard} aria-label={`Lihat detail rekening ${account.name}`} aria-pressed={account.account_id === selectedAccount?.account_id}
            onPointerDown={handleMobileStackPointerDown} onPointerMove={handleMobileStackPointerMove} onPointerUp={finishMobileStackPointer}
            onPointerCancel={cancelMobileStackPointer} onClick={() => selectMobileStackAccount(account, index)}>
            <AccountVisual account={account} stack />
            <span className={styles.mobileStackBalance}><small>Dana tersedia</small><strong><Money value={account.available_balance ?? account.balance ?? 0} /></strong><em className={styles.mobileStackBalanceMeta}>Saldo <Money value={account.balance || 0} /> · alokasi <Money value={account.allocated_remaining || 0} /></em></span>
            {shouldRenderMobileStackOwnership(account) ? <span className={styles.mobileStackOwnership}>{accountCardOwnershipLabel(account)}</span> : null}
          </button>
        ))}
      </div>
      {selectedAccount ? <div className={styles.mobileStackSummary}>
        <div className={styles.mobileStackIdentity}>
          <strong id="mobile-account-stack-title" className={styles.mobileStackAccountName}>{selectedAccount.name}</strong>
          <small className={styles.mobileStackAccountMeta}>{selectedAccount.account_number ? formatAccountNumber(selectedAccount.account_number, { placeholder: false }) : accountProviderLabel(selectedAccount)}</small>
        </div>
        <div className={styles.mobileStackOwner}>
          <strong className={styles.mobileStackOwnerName}>{selectedAccount.owner_scope === "shared" ? "Bersama" : accountOwnerName(selectedAccount) || "Pribadi"}</strong>
          <small className={styles.mobileStackOwnerScope}>{selectedAccount.owner_scope === "shared" ? "Rekening bersama" : accountScopeLabel(selectedAccount.owner_scope)}</small>
        </div>
      </div> : null}
      {accounts.length > 1 ? <button type="button" className={styles.mobileStackPickerButton} onClick={() => setMobileAccountSheet("picker")} aria-haspopup="dialog">Pilih rekening</button> : null}
      <p id="mobile-account-stack-hint" className="sr-only">Gunakan tombol Pilih rekening untuk mengganti rekening tanpa gesture. Anda juga dapat menggeser kartu aktif ke atas atau bawah, atau memakai tombol panah atas dan bawah. Tekan kartu aktif untuk membuka detailnya.</p>
      <p ref={mobileStackStatusRef} id="mobile-account-stack-status" className="sr-only" aria-live="polite" />
    </section>
    {selectedAccount ? <Suspense fallback={null}><MobileAccountActivity selectedAccount={selectedAccount} bootstrap={bootstrap} onViewTransactions={(item, period) => navigate("/transaksi", { state: { accountId: item.account_id, period } })} /></Suspense> : null}
  </div>;
};

export default MobileAccountsExperience;
