import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FiEye, FiEyeOff, FiList, FiPlus } from "react-icons/fi";
import { useNavigate } from "react-router";
import Money from "../../../components/common/Money.jsx";
import PageInfoButton from "../../../components/common/PageInfoButton.jsx";
import { useReducedMotion } from "../../../hooks/useReducedMotion.js";
import { semanticMotionDurationMs } from "../../../shared/motion.js";
import {
  ACCOUNT_BALANCE_GUIDANCE,
  detectBankTemplate,
  detectEwalletTemplate,
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

const carouselStyleAtDifference = (difference, stageWidth) => {
  const distance = Math.abs(difference);
  const visibleDistance = Math.min(distance, 2);
  const viewportWidth = clamp(Number(stageWidth || 390), 320, 520);
  const step = clamp(viewportWidth * 0.76, 244, 368);
  return {
    x: difference * step,
    y: Math.min(distance, 1.5) * 8,
    z: -visibleDistance * 56,
    ry: clamp(-difference * 4.8, -7, 7),
    scale: clamp(1 - distance * 0.085, 0.84, 1),
    opacity: clamp(1 - distance * 0.34, 0, 1),
    brightness: clamp(1 - distance * 0.06, 0.86, 1),
    saturate: clamp(1 - distance * 0.08, 0.8, 1),
  };
};

const accountAmbientTone = (account) => {
  if (!account) return "green";
  if (account.account_type === "bank") {
    const template = detectBankTemplate(account);
    if (["bni", "btn"].includes(template)) return "warm";
    if (template === "bca") return "blue";
  }
  if (account.account_type === "ewallet" && ["dana", "gopay"].includes(detectEwalletTemplate(account))) return "blue";
  return "green";
};

const applyCardCarouselVisual = ({ active, element, moving, reducedMotion, visual }) => {
  if (reducedMotion) {
    element.style.transform = "translate(-50%, -50%)";
    element.style.opacity = active ? "1" : "0";
    element.style.filter = "none";
  } else {
    element.style.transform = [
      "translate(-50%, -50%)",
      `translate3d(${visual.x}px, ${visual.y}px, ${visual.z}px)`,
      `scale(${visual.scale})`,
      `rotateY(${visual.ry}deg)`,
    ].join(" ");
    element.style.opacity = String(visual.opacity);
    if (!moving) element.style.filter = `brightness(${visual.brightness}) saturate(${visual.saturate})`;
  }
  element.style.zIndex = String(Math.round(1000 + visual.z));
  element.style.pointerEvents = visual.opacity > 0 ? "auto" : "none";
  element.tabIndex = active ? 0 : -1;
  element.setAttribute("aria-hidden", active ? "false" : "true");
  element.setAttribute("aria-pressed", active ? "true" : "false");
};

const triggerMobileStackSettledEffect = (stage) => {
  if (!stage) return;
  const settleToken = String(Number(stage.dataset.mobileStackSettleToken || 0) + 1);
  stage.dataset.mobileStackSettleToken = settleToken;
  stage.classList.remove(styles.mobileStackSettling);
  window.requestAnimationFrame(() => stage.classList.add(styles.mobileStackSettling));
  window.setTimeout(() => {
    if (stage.dataset.mobileStackSettleToken !== settleToken) return;
    stage.classList.remove(styles.mobileStackSettling);
  }, semanticMotionDurationMs("emphasized"));
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
    startX: 0, startY: 0, startTime: 0, lastX: 0, lastTime: 0, velocityX: 0, suppressClick: false, suppressClickUntil: 0,
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
    const stageWidth = refs.stageRef.current?.clientWidth || 390;
    stackAccounts.forEach((account, index) => {
      const element = refs.cardRefs.current.get(account.account_id);
      if (!element) return;
      const difference = shortestCircularDifference(index, refs.positionRef.current, count);
      const visual = carouselStyleAtDifference(difference, stageWidth);
      const active = Math.abs(difference) <= 0.5;
      applyCardCarouselVisual({ active, element, moving, reducedMotion, visual });
    });
  }, [reducedMotion, refs.accountsRef, refs.animatingRef, refs.cardRefs, refs.gestureRef, refs.positionRef, refs.stageRef]);

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
      if (!reducedMotion) triggerMobileStackSettledEffect(refs.stageRef.current);
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
      startX: event.clientX, startY: event.clientY, startTime: now, lastX: event.clientX, lastTime: now, velocityX: 0,
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
      if (Math.abs(deltaY) > 10 && Math.abs(deltaY) > Math.abs(deltaX)) { gesture.rejected = true; return; }
      if (Math.abs(deltaX) < 8 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.15) return;
      gesture.dragging = true;
      gesture.suppressClick = true;
      refs.stageRef.current?.classList.add(styles.mobileStackDragging);
      gesture.captureElement?.setPointerCapture(event.pointerId);
      animation.setMobileStackWillChange(true);
    }
    const now = performance.now();
    const elapsed = Math.max(1, now - gesture.lastTime);
    gesture.velocityX = (event.clientX - gesture.lastX) / elapsed;
    gesture.lastX = event.clientX;
    gesture.lastTime = now;
    if (reducedMotion) return;
    const swipeDistance = clamp((refs.stageRef.current?.clientWidth || 390) * 0.46, 150, 210);
    const progress = clamp(-deltaX / swipeDistance, -0.94, 0.94);
    refs.positionRef.current = refs.settledIndexRef.current + progress;
    animation.applyMobileStackPosition();
  }, [animation, reducedMotion, refs.gestureRef, refs.positionRef, refs.settledIndexRef, refs.stageRef]);

  const finishMobileStackPointer = useCallback((event) => {
    const gesture = refs.gestureRef.current;
    if (!gesture.tracking || gesture.pointerId !== event.pointerId) return;
    if (gesture.rejected) { resetMobileStackGesture(); return; }
    if (!gesture.dragging) { resetMobileStackGesture(); return; }
    const totalDeltaX = event.clientX - gesture.startX;
    const averageVelocity = totalDeltaX / Math.max(1, performance.now() - gesture.startTime);
    const progress = refs.positionRef.current - refs.settledIndexRef.current;
    if (gesture.captureElement?.hasPointerCapture(event.pointerId)) gesture.captureElement.releasePointerCapture(event.pointerId);
    armMobileStackClickGuard();
    resetMobileStackGesture();
    const fastSwipe = Math.abs(gesture.velocityX) > 0.46 || Math.abs(averageVelocity) > 0.4;
    const passedThreshold = reducedMotion ? Math.abs(totalDeltaX) >= 44 : Math.abs(progress) >= 0.24;
    const direction = progress !== 0 ? Math.sign(progress) : (totalDeltaX < 0 ? 1 : -1);
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
    if (event.key === "ArrowLeft") { event.preventDefault(); moveMobileStack(-1); }
    if (event.key === "ArrowRight") { event.preventDefault(); moveMobileStack(1); }
  }, [moveMobileStack]);

  const selectMobileStackIndex = useCallback((index) => {
    if (refs.animatingRef.current || index === refs.settledIndexRef.current) return;
    animation.animateMobileStackTo(index);
  }, [animation, refs.animatingRef, refs.settledIndexRef]);

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

  useEffect(() => {
    const handleResize = () => animation.applyMobileStackPosition();
    window.addEventListener("resize", handleResize, { passive: true });
    return () => window.removeEventListener("resize", handleResize);
  }, [animation]);
  useEffect(() => () => cancelMobileStackAnimation(), [cancelMobileStackAnimation]);

  return {
    refs,
    ...gestures,
    cancelMobileStackPointer,
    handleMobileStackKeyDown,
    selectMobileStackAccount,
    selectMobileStackIndex,
    reducedMotion,
  };
};

const PrivateMoney = ({ hidden, value }) => hidden
  ? <span className={styles.mobilePrivateMoney} aria-label="Nominal disembunyikan">••••••</span>
  : <Money value={value || 0} />;

const MobileBalanceSummary = ({ account }) => {
  const [hidden, setHidden] = useState(false);
  const investment = account.account_type === "investment";
  const available = account.available_balance ?? account.balance ?? 0;
  return (
    <section key={account.account_id} className={styles.mobileBalanceSummary} aria-label={`Ringkasan saldo ${account.name}`}>
      <div className={styles.mobileBalanceHeading}>
        <div className={styles.mobileBalanceLabel}>
          <span>{investment ? "Saldo RDN" : "Dana tersedia"}</span>
        </div>
        <button type="button" className={styles.mobilePrivacyButton} onClick={() => setHidden((value) => !value)} aria-label={hidden ? "Tampilkan nominal rekening" : "Sembunyikan nominal rekening"} aria-pressed={hidden}>
          {hidden ? <FiEyeOff aria-hidden="true" /> : <FiEye aria-hidden="true" />}
        </button>
      </div>
      <strong className={styles.mobileAvailableValue}><PrivateMoney hidden={hidden} value={investment ? account.balance : available} /></strong>
      <div className={styles.mobileBalanceStats}>
        {investment ? <div><strong>Investasi</strong><span>Tujuan dana</span></div> : <>
          <div><strong><PrivateMoney hidden={hidden} value={account.balance || 0} /></strong><span>Saldo</span></div>
          <div><strong><PrivateMoney hidden={hidden} value={account.allocated_remaining || 0} /></strong><span>Dialokasikan</span></div>
        </>}
      </div>
    </section>
  );
};

const MobileQuickActions = ({ account, bootstrap, onTransferSaved, onViewTransactions }) => (
  <div key={account.account_id} className={styles.mobileQuickActions} aria-label={`Aksi cepat rekening ${account.name}`}>
    <button type="button" className={styles.mobileQuickAction} onClick={() => onViewTransactions(account)}><FiList aria-hidden="true" /><span>Riwayat</span></button>
    <Suspense fallback={<span className={styles.mobileQuickActionPlaceholder} aria-hidden="true" />}>
      <MobileAccountTransferAction bootstrap={bootstrap} selectedAccount={account} onTransferSaved={onTransferSaved} onViewTransactions={onViewTransactions} />
    </Suspense>
  </div>
);

const MobileAccountsExperience = ({ accounts, selectedAccount, selectedAccountId, ownershipFilter, onOwnershipFilterChange, ownerMode, openCreateDialog, setMobileAccountSheet, setSelectedAccountId, bootstrap, onTransferSaved }) => {
  const navigate = useNavigate();
  const stack = useMobileStackController({ accounts, selectedAccountId, setSelectedAccountId, setMobileAccountSheet });
  const {
    refs: { cardRefs: mobileStackCardRefs, stageRef: mobileStackStageRef, statusRef: mobileStackStatusRef },
    handleMobileStackPointerDown, handleMobileStackPointerMove, finishMobileStackPointer, cancelMobileStackPointer,
    handleMobileStackKeyDown, selectMobileStackAccount, selectMobileStackIndex,
  } = stack;
  const onViewTransactions = useCallback((item, period) => navigate("/transaksi", { state: { accountId: item.account_id, period } }), [navigate]);
  const ambientTone = accountAmbientTone(selectedAccount);

  return <div className={styles.mobileAccountExperience}>
    <section className={styles.mobileStackPanel} data-account-tone={ambientTone} aria-labelledby="mobile-account-stack-title">
      <header className={styles.mobileStackHeader}>
        <div className={styles.mobileStackHeaderCopy}>
          <strong id="mobile-account-stack-title" className={styles.mobileStackHeaderTitle}>Rekening</strong>
          <PageInfoButton title="Tentang Rekening" label="Tentang Rekening" className={styles.mobileStackHeaderInfoButton}>Kelola rekening pribadi, pasangan, dan bersama. {ACCOUNT_BALANCE_GUIDANCE}</PageInfoButton>
        </div>
        <div className={styles.mobileStackHeaderActions}>
          {ownerMode ? <button type="button" className={`${styles.mobileStackHeaderButton} ${styles.mobileStackHeaderButtonPrimary}`} onClick={openCreateDialog} aria-label="Tambah rekening" title="Tambah rekening"><FiPlus aria-hidden="true" /><span>Tambah</span></button> : null}
        </div>
      </header>

      <div className={styles.mobileOwnershipFilters} role="group" aria-label="Filter kepemilikan rekening">
        {OWNERSHIP_FILTERS.map(([value, label]) => <button key={value} type="button" className={styles.mobileOwnershipFilter} aria-pressed={ownershipFilter === value} onClick={() => onOwnershipFilterChange(value)}>{label}</button>)}
      </div>

      <div ref={mobileStackStageRef} className={styles.mobileStackStage} tabIndex={0} aria-label="Rekening aktif. Geser kartu ke kiri atau kanan untuk mengganti rekening" aria-describedby="mobile-account-stack-hint" onKeyDown={handleMobileStackKeyDown}>
        <div className={styles.mobileStackAmbient} aria-hidden="true" />
        {accounts.map((account, index) => (
          <button key={`mobile-stack-${account.account_id}`} ref={(node) => { if (node) mobileStackCardRefs.current.set(account.account_id, node); else mobileStackCardRefs.current.delete(account.account_id); }}
            type="button" className={styles.mobileStackCard} aria-label={`Lihat detail rekening ${account.name}`} aria-pressed={account.account_id === selectedAccount?.account_id}
            onPointerDown={handleMobileStackPointerDown} onPointerMove={handleMobileStackPointerMove} onPointerUp={finishMobileStackPointer}
            onPointerCancel={cancelMobileStackPointer} onClick={() => selectMobileStackAccount(account, index)}>
            <AccountVisual account={account} carousel stack />
          </button>
        ))}
      </div>

      {accounts.length > 1 ? <div className={styles.mobileCarouselDots} aria-label="Pilih rekening">
        {accounts.map((account, index) => <button key={`mobile-dot-${account.account_id}`} type="button" className={styles.mobileCarouselDot} aria-label={`Pilih rekening ${account.name}`} aria-current={account.account_id === selectedAccount?.account_id ? "true" : undefined} onClick={() => selectMobileStackIndex(index)} />)}
      </div> : null}

      {selectedAccount ? <>
        <MobileBalanceSummary account={selectedAccount} />
        <MobileQuickActions account={selectedAccount} bootstrap={bootstrap} onTransferSaved={onTransferSaved} onViewTransactions={onViewTransactions} />
      </> : null}

      <p id="mobile-account-stack-hint" className="sr-only">Geser kartu aktif ke kiri atau kanan, gunakan tombol panah kiri dan kanan, atau indikator posisi. Tekan kartu aktif untuk membuka detail.</p>
      <p ref={mobileStackStatusRef} id="mobile-account-stack-status" className="sr-only" aria-live="polite" />
    </section>
    {selectedAccount ? <Suspense fallback={null}><MobileAccountActivity key={selectedAccount.account_id} selectedAccount={selectedAccount} bootstrap={bootstrap} onViewTransactions={onViewTransactions} /></Suspense> : null}
  </div>;
};

export default MobileAccountsExperience;
