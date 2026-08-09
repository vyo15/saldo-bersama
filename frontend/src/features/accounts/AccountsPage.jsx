import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  FiArrowLeft,
  FiClock,
  FiList,
  FiPlus,
} from "react-icons/fi";
import { useNavigate } from "react-router";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import Money from "../../components/common/Money.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import StatusBadge from "../../components/common/StatusBadge.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import LoadingScreen from "../../components/feedback/LoadingScreen.jsx";
import { useFeedback } from "../../components/feedback/feedbackContext.js";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useFocusTrap } from "../../hooks/useFocusTrap.js";
import {
  archiveAccount,
  createAccount as requestCreateAccount,
  deleteUnusedAccount,
  previewAccountLifecycle,
  updateAccount as requestUpdateAccount,
} from "./accounts.api.js";
import { useFinance } from "../../app/FinanceContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { currentMonthInJakarta, todayInJakarta } from "../../domain/dates.js";
import AccountFinancialCard, { AccountVisual } from "./components/AccountFinancialCard.jsx";
import { accountCardholderName, detectBankTemplate } from "./accountPresentation.js";
import styles from "./AccountsPage.module.css";

const MobileAccountSheets = lazy(() => import("./components/MobileAccountSheets.jsx"));
const AccountEditorDialogs = lazy(() => import("./components/AccountEditorDialogs.jsx"));

const emptyAccountForm = () => ({
  name: "",
  account_type: "bank",
  bank_template: "generic",
  account_number: "",
  owner_scope: "shared",
  owner_user_id: "",
  initial_balance: "",
  initial_balance_date: todayInJakarta(),
  allow_negative: false,
});

const MOBILE_STACK_SLOT_STYLES = Object.freeze({
  "-2": Object.freeze({ x: 72, y: -238, z: -285, rx: 68, ry: -10, rz: 24, opacity: 0, brightness: 0.63, saturate: 0.68, shadow: 0.1 }),
  "-1": Object.freeze({ x: 58, y: -126, z: -118, rx: 31, ry: -8, rz: 18, opacity: 0.82, brightness: 0.75, saturate: 0.76, shadow: 0.28 }),
  0: Object.freeze({ x: 0, y: 0, z: 150, rx: 0, ry: 0, rz: 0, opacity: 1, brightness: 1, saturate: 1, shadow: 0.58 }),
  1: Object.freeze({ x: 54, y: 132, z: -122, rx: -31, ry: 8, rz: -17, opacity: 0.72, brightness: 0.68, saturate: 0.72, shadow: 0.22 }),
  2: Object.freeze({ x: 70, y: 244, z: -300, rx: -68, ry: 10, rz: -24, opacity: 0, brightness: 0.6, saturate: 0.66, shadow: 0.08 }),
});

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const modulo = (value, divisor) => ((value % divisor) + divisor) % divisor;
const interpolate = (from, to, progress) => from + (to - from) * progress;
const easeOutQuint = (progress) => 1 - ((1 - progress) ** 5);

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

const AccountsPage = () => {
  const { notify } = useFeedback();
  const navigate = useNavigate();
  const accountsResource = useApiResource("accounts.list");
  const { bootstrap, refreshAll, invalidate } = useFinance();
  const { user } = useAuth();
  const ownerMode = user?.role === "owner";
  const usersResource = useApiResource("users.list", {}, { enabled: ownerMode });
  const [accountForm, setAccountForm] = useState(emptyAccountForm);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [message, setMessage] = useState(null);
  const [editAccount, setEditAccount] = useState(null);
  const [dialogState, setDialogState] = useState({ status: "idle", error: null });
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [mobileAccountSheet, setMobileAccountSheet] = useState(null);
  const [paymentHistoryPeriod, setPaymentHistoryPeriod] = useState(currentMonthInJakarta);
  const paymentHistoryResource = useApiResource("transactions.list", {
    period: paymentHistoryPeriod,
    limit: 50,
    offset: 0,
    query: "",
    transaction_type: "all",
    allocation: "all",
    account_id: selectedAccountId || "all",
    category_id: "all",
    created_by: "all",
  }, { enabled: mobileAccountSheet === "history" && Boolean(selectedAccountId) });
  const accountButtonRefs = useRef(new Map());
  const mobileStackCardRefs = useRef(new Map());
  const mobileStackStageRef = useRef(null);
  const mobileStackStatusRef = useRef(null);
  const mobileStackAccountsRef = useRef([]);
  const mobileStackPositionRef = useRef(0);
  const mobileStackSettledIndexRef = useRef(0);
  const mobileStackAnimationRef = useRef(0);
  const mobileStackGestureRef = useRef({
    tracking: false,
    dragging: false,
    rejected: false,
    pointerId: null,
    captureElement: null,
    startX: 0,
    startY: 0,
    startTime: 0,
    lastY: 0,
    lastTime: 0,
    velocityY: 0,
    suppressClick: false,
  });
  const mobileStackAnimatingRef = useRef(false);
  const detailContainerRef = useRef(null);
  const detailCloseRef = useRef(null);

  const reloadAccounts = async () => {
    invalidate([
      "accounts.list",
      "transactions.list",
      "envelopes.list",
      "recurring.list",
      "goals.list",
      "reports.monthly",
      "reconciliations.list",
      "dashboard.overview",
      "app.initialState",
      "archive.list",
    ]);
    const [accountsResult, financeResult] = await Promise.allSettled([accountsResource.reload(), refreshAll()]);
    return { accountsResult, financeResult };
  };

  const openCreateDialog = () => {
    setDialogState({ status: "idle", error: null });
    setCreateDialogOpen(true);
  };

  const closeCreateDialog = () => {
    if (dialogState.status === "submitting") return;
    setCreateDialogOpen(false);
    setDialogState({ status: "idle", error: null });
  };

  const createAccount = async (event) => {
    event.preventDefault();
    setDialogState({ status: "submitting", error: null });
    try {
      await requestCreateAccount({ ...accountForm, initial_balance: Number(accountForm.initial_balance || 0) }, {});
      setAccountForm(emptyAccountForm());
      setCreateDialogOpen(false);
      setDialogState({ status: "idle", error: null });
      notify({ message: "Rekening berhasil dibuat dan daftar telah diperbarui.", tone: "success", dedupeKey: "accounts:create" });
      await reloadAccounts();
    } catch (error) { setDialogState({ status: "error", error }); }
  };

  const saveAccount = async (event) => {
    event.preventDefault();
    if (!editAccount) return;
    setDialogState({ status: "submitting", error: null });
    try {
      await requestUpdateAccount({
        account_id: editAccount.account_id,
        name: editAccount.name,
        account_number: editAccount.account_number || "",
        bank_template: editAccount.account_type === "bank" ? editAccount.bank_template || "generic" : "generic",
        owner_scope: editAccount.owner_scope,
        owner_user_id: editAccount.owner_scope === "personal" ? editAccount.owner_user_id || "" : "",
        allow_negative: Boolean(editAccount.allow_negative),
        row_version: editAccount.row_version,
      }, { rowVersion: editAccount.row_version });
      setEditAccount(null);
      setDialogState({ status: "idle", error: null });
      notify({ message: "Rekening berhasil diperbarui.", tone: "success", dedupeKey: "accounts:update" });
      await reloadAccounts();
    } catch (error) { setDialogState({ status: "error", error }); }
  };


  const openEditAccount = (account) => {
    setEditAccount({
      ...account,
      name: accountCardholderName(account.name) || account.name,
      bank_template: detectBankTemplate(account),
    });
    setDialogState({ status: "idle", error: null });
  };

  const openAccountLifecycle = async (account) => {
    setDialogState({ status: "submitting", error: null });
    try {
      const preview = await previewAccountLifecycle(
        { account_id: account.account_id, row_version: account.row_version },
        { rowVersion: account.row_version },
      );
      if (!preview.canDeleteUnused && !preview.canArchive) {
        const blockers = [...(preview.deleteBlockers || []), ...(preview.archiveBlockers || [])];
        setMessage({ type: "warning", text: blockers[0] || "Rekening belum dapat diarsipkan atau dihapus." });
        setDialogState({ status: "idle", error: null });
        return;
      }
      setArchiveTarget({ account, preview });
      setDialogState({ status: "idle", error: null });
    } catch (error) {
      setDialogState({ status: "idle", error: null });
      setMessage({ type: "danger", text: error.message });
    }
  };

  const archiveSelectedAccount = async (reason, confirmationState = {}) => {
    if (!archiveTarget) return;
    setDialogState({ status: "submitting", error: null });
    try {
      const { account, preview } = archiveTarget;
      if (preview.canDeleteUnused) {
        await deleteUnusedAccount({
          account_id: account.account_id,
          row_version: account.row_version,
          reason,
          confirmation: confirmationState.confirmation,
          acknowledged: confirmationState.acknowledged,
        }, { rowVersion: account.row_version });
      } else {
        await archiveAccount({ account_id: account.account_id, row_version: account.row_version }, { rowVersion: account.row_version });
      }
      setArchiveTarget(null);
      setDialogState({ status: "idle", error: null });
      notify({
        message: preview.canDeleteUnused
          ? "Rekening yang belum pernah digunakan berhasil dihapus. Jejak audit tetap disimpan."
          : "Rekening berhasil diarsipkan dan dapat dipulihkan oleh owner.",
        tone: "success",
        dedupeKey: preview.canDeleteUnused ? "accounts:delete-unused" : "accounts:archive",
      });
      await reloadAccounts();
    } catch (error) { setDialogState({ status: "error", error }); }
  };

  useEffect(() => {
    const items = accountsResource.data?.items || [];
    if (!items.length) {
      setSelectedAccountId("");
      setMobileDetailOpen(false);
      setMobileAccountSheet(null);
      return;
    }
    if (!items.some((account) => account.account_id === selectedAccountId)) setSelectedAccountId(items[0].account_id);
  }, [accountsResource.data, selectedAccountId]);

  const closeMobileDetail = useCallback(() => setMobileDetailOpen(false), []);

  useFocusTrap({
    open: mobileDetailOpen,
    containerRef: detailContainerRef,
    initialFocusRef: detailCloseRef,
    onEscape: closeMobileDetail,
    bodyClassName: "modal-open",
  });

  useEffect(() => {
    if (!mobileDetailOpen) return undefined;
    const compactLayout = window.matchMedia("(min-width: 821px) and (max-width: 1280px)");
    const closeWhenDesktop = (event) => {
      if (!event.matches) closeMobileDetail();
    };
    compactLayout.addEventListener("change", closeWhenDesktop);
    return () => compactLayout.removeEventListener("change", closeWhenDesktop);
  }, [closeMobileDetail, mobileDetailOpen]);

  const setMobileStackWillChange = useCallback((enabled) => {
    for (const element of mobileStackCardRefs.current.values()) {
      element.style.willChange = enabled ? "transform, opacity, filter, box-shadow" : "";
    }
  }, []);

  const applyMobileStackPosition = useCallback(() => {
    const stackAccounts = mobileStackAccountsRef.current;
    const count = stackAccounts.length;
    if (!count) return;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    stackAccounts.forEach((account, index) => {
      const element = mobileStackCardRefs.current.get(account.account_id);
      if (!element) return;
      const difference = shortestCircularDifference(index, mobileStackPositionRef.current, count);
      const visual = stackStyleAtDifference(difference);
      const rotationFactor = reducedMotion ? 0.16 : 1;
      const tiltFactor = reducedMotion ? 0.22 : 1;

      element.style.transform = [
        "translate(-50%, -50%)",
        `translate3d(${visual.x}px, ${visual.y}px, ${visual.z}px)`,
        `rotateX(${visual.rx * rotationFactor}deg)`,
        `rotateY(${visual.ry * rotationFactor}deg)`,
        `rotateZ(${visual.rz * tiltFactor}deg)`,
      ].join(" ");
      element.style.opacity = String(visual.opacity);
      element.style.filter = `brightness(${visual.brightness}) saturate(${visual.saturate})`;
      element.style.boxShadow = `0 1.75rem 3.9rem rgb(0 0 0 / ${visual.shadow})`;
      element.style.zIndex = String(Math.round(1000 + visual.z));
      element.style.pointerEvents = Math.abs(difference) <= 0.5 ? "auto" : "none";
      element.tabIndex = Math.abs(difference) <= 0.5 ? 0 : -1;
      element.setAttribute("aria-hidden", Math.abs(difference) <= 0.5 ? "false" : "true");
      element.setAttribute("aria-pressed", Math.abs(difference) <= 0.5 ? "true" : "false");
    });
  }, []);

  const animateMobileStackTo = useCallback((targetIndex, { announce = true, selectAtStart = false } = {}) => {
    const stackAccounts = mobileStackAccountsRef.current;
    const count = stackAccounts.length;
    if (!count) return;

    window.cancelAnimationFrame(mobileStackAnimationRef.current);
    mobileStackAnimatingRef.current = true;
    setMobileStackWillChange(true);

    const normalizedTarget = modulo(targetIndex, count);
    const startPosition = mobileStackPositionRef.current;
    let difference = normalizedTarget - startPosition;
    if (difference > count / 2) difference -= count;
    if (difference < -count / 2) difference += count;
    const finalPosition = startPosition + difference;
    const duration = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 140 : 520;
    const startedAt = performance.now();

    if (selectAtStart) setSelectedAccountId(stackAccounts[normalizedTarget].account_id);

    const frame = (now) => {
      const progress = clamp((now - startedAt) / duration, 0, 1);
      mobileStackPositionRef.current = interpolate(startPosition, finalPosition, easeOutQuint(progress));
      applyMobileStackPosition();

      if (progress < 1) {
        mobileStackAnimationRef.current = window.requestAnimationFrame(frame);
        return;
      }

      mobileStackSettledIndexRef.current = normalizedTarget;
      mobileStackPositionRef.current = normalizedTarget;
      applyMobileStackPosition();
      setMobileStackWillChange(false);
      mobileStackAnimatingRef.current = false;
      if (!selectAtStart) setSelectedAccountId(stackAccounts[normalizedTarget].account_id);
      if (announce && mobileStackStatusRef.current) {
        mobileStackStatusRef.current.textContent = `Rekening aktif ${stackAccounts[normalizedTarget].name}`;
      }
    };

    mobileStackAnimationRef.current = window.requestAnimationFrame(frame);
  }, [applyMobileStackPosition, setMobileStackWillChange]);

  const moveMobileStack = useCallback((step) => {
    if (mobileStackAnimatingRef.current || mobileStackAccountsRef.current.length <= 1) return;
    animateMobileStackTo(mobileStackSettledIndexRef.current + step);
  }, [animateMobileStackTo]);

  const resetMobileStackGesture = useCallback(() => {
    const gesture = mobileStackGestureRef.current;
    gesture.tracking = false;
    gesture.dragging = false;
    gesture.rejected = false;
    gesture.pointerId = null;
    gesture.captureElement = null;
    mobileStackStageRef.current?.classList.remove(styles.mobileStackDragging);
    setMobileStackWillChange(false);
  }, [setMobileStackWillChange]);

  const handleMobileStackPointerDown = useCallback((event) => {
    if (mobileStackAnimatingRef.current || mobileStackAccountsRef.current.length <= 1) return;
    const now = performance.now();
    mobileStackGestureRef.current = {
      tracking: true,
      dragging: false,
      rejected: false,
      pointerId: event.pointerId,
      captureElement: event.currentTarget,
      startX: event.clientX,
      startY: event.clientY,
      startTime: now,
      lastY: event.clientY,
      lastTime: now,
      velocityY: 0,
      suppressClick: false,
    };
  }, []);

  const handleMobileStackPointerMove = useCallback((event) => {
    const gesture = mobileStackGestureRef.current;
    if (!gesture.tracking || gesture.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;

    if (gesture.rejected) return;

    if (!gesture.dragging) {
      if (Math.abs(deltaX) > 10 && Math.abs(deltaX) > Math.abs(deltaY)) {
        gesture.rejected = true;
        gesture.suppressClick = true;
        return;
      }
      if (Math.abs(deltaY) < 8 || Math.abs(deltaY) <= Math.abs(deltaX) * 1.15) return;
      gesture.dragging = true;
      gesture.suppressClick = true;
      mobileStackStageRef.current?.classList.add(styles.mobileStackDragging);
      gesture.captureElement?.setPointerCapture(event.pointerId);
      setMobileStackWillChange(true);
    }

    const now = performance.now();
    const elapsed = Math.max(1, now - gesture.lastTime);
    gesture.velocityY = (event.clientY - gesture.lastY) / elapsed;
    gesture.lastY = event.clientY;
    gesture.lastTime = now;

    const progress = clamp(-deltaY / 154, -0.92, 0.92);
    mobileStackPositionRef.current = mobileStackSettledIndexRef.current + progress;
    applyMobileStackPosition();
  }, [applyMobileStackPosition, setMobileStackWillChange]);

  const finishMobileStackPointer = useCallback((event) => {
    const gesture = mobileStackGestureRef.current;
    if (!gesture.tracking || gesture.pointerId !== event.pointerId) return;

    if (gesture.rejected) {
      resetMobileStackGesture();
      window.setTimeout(() => { mobileStackGestureRef.current.suppressClick = false; }, 0);
      return;
    }

    if (!gesture.dragging) {
      resetMobileStackGesture();
      return;
    }

    const totalDeltaY = event.clientY - gesture.startY;
    const totalElapsed = Math.max(1, performance.now() - gesture.startTime);
    const averageVelocity = totalDeltaY / totalElapsed;
    const progress = mobileStackPositionRef.current - mobileStackSettledIndexRef.current;

    if (gesture.captureElement?.hasPointerCapture(event.pointerId)) {
      gesture.captureElement.releasePointerCapture(event.pointerId);
    }
    resetMobileStackGesture();

    const fastSwipe = Math.abs(gesture.velocityY) > 0.48 || Math.abs(averageVelocity) > 0.42;
    const passedThreshold = Math.abs(progress) >= 0.28;
    if (fastSwipe || passedThreshold) {
      const direction = progress !== 0 ? Math.sign(progress) : (totalDeltaY < 0 ? 1 : -1);
      animateMobileStackTo(mobileStackSettledIndexRef.current + direction);
    } else {
      animateMobileStackTo(mobileStackSettledIndexRef.current, { announce: false });
    }

    window.setTimeout(() => { mobileStackGestureRef.current.suppressClick = false; }, 0);
  }, [animateMobileStackTo, resetMobileStackGesture]);

  const cancelMobileStackPointer = useCallback((event) => {
    const gesture = mobileStackGestureRef.current;
    if (!gesture.tracking || gesture.pointerId !== event.pointerId) return;
    if (gesture.captureElement?.hasPointerCapture(event.pointerId)) {
      gesture.captureElement.releasePointerCapture(event.pointerId);
    }
    const wasDragging = gesture.dragging;
    const shouldSuppressClick = gesture.suppressClick;
    resetMobileStackGesture();
    if (wasDragging) animateMobileStackTo(mobileStackSettledIndexRef.current, { announce: false });
    if (shouldSuppressClick) window.setTimeout(() => { mobileStackGestureRef.current.suppressClick = false; }, 0);
  }, [animateMobileStackTo, resetMobileStackGesture]);

  const handleMobileStackKeyDown = useCallback((event) => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveMobileStack(-1);
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveMobileStack(1);
    }
  }, [moveMobileStack]);

  const selectMobileStackAccount = useCallback((account, index) => {
    if (mobileStackGestureRef.current.suppressClick) return;
    if (index !== mobileStackSettledIndexRef.current) {
      animateMobileStackTo(index, { selectAtStart: true });
      return;
    }
    setSelectedAccountId(account.account_id);
    setMobileAccountSheet("detail");
  }, [animateMobileStackTo]);

  useLayoutEffect(() => {
    const stackAccounts = accountsResource.data?.items || [];
    mobileStackAccountsRef.current = stackAccounts;
    if (!stackAccounts.length) return;
    const selectedIndex = Math.max(0, stackAccounts.findIndex((account) => account.account_id === selectedAccountId));
    if (!mobileStackAnimatingRef.current && !mobileStackGestureRef.current.dragging) {
      mobileStackSettledIndexRef.current = selectedIndex;
      mobileStackPositionRef.current = selectedIndex;
      applyMobileStackPosition();
    }
  }, [accountsResource.data, applyMobileStackPosition, selectedAccountId]);

  useEffect(() => () => {
    window.cancelAnimationFrame(mobileStackAnimationRef.current);
    setMobileStackWillChange(false);
  }, [setMobileStackWillChange]);


  if (accountsResource.status === "loading") return <LoadingScreen label="Memuat rekening..." />;
  if (accountsResource.status === "error") return <ErrorState error={accountsResource.error} onRetry={accountsResource.reload} />;

  const accounts = accountsResource.data?.items || [];
  const activeUsers = (usersResource.data?.items || []).filter((item) => item.status === "active");
  const currentDatabaseUser = activeUsers.find((item) => item.is_current) || null;
  const currentOwnerLabel = currentDatabaseUser?.name || user?.name || "Pengguna aktif";
  const selectedAccount = accounts.find((account) => account.account_id === selectedAccountId) || accounts[0] || null;


  return (
    <div className={`page-stack ${styles.accountsPage}`}>
      <RefreshWarning error={accountsResource.refreshError} onRetry={reloadAccounts} />
      {ownerMode && (usersResource.refreshError || usersResource.status === "error") ? <RefreshWarning error={usersResource.refreshError || usersResource.error} onRetry={usersResource.reload} /> : null}
      <div className={styles.desktopPageHeader}>
        <PageHeader
          title="Rekening"
          description={<><span className={styles.mobileAccountCount}>{accounts.length} rekening aktif</span><span className={styles.desktopAccountDescription}>Pantau seluruh rekening bersama dan pribadi secara transparan. Hak tindakan tetap mengikuti pemilik dan peran pengguna.</span></>}
          actions={ownerMode ? <Button variant="primary" icon={FiPlus} onClick={openCreateDialog} aria-label="Tambah rekening desktop">Tambah rekening</Button> : null}
        />
      </div>
      {message ? <div className={`notice notice--${message.type}`} role="status">{message.text}</div> : null}

      <section aria-labelledby="account-list-title" className={styles.accountSection}>
        <div className={styles.sectionHeading}>
          <div><p className="eyebrow">Rekening aktif</p><h2 id="account-list-title">Tempat uang tersimpan</h2></div>
          <span>{accounts.length} rekening</span>
        </div>
        {accounts.length ? (
          <>
            <div className={styles.mobileAccountExperience}>
              <section className={styles.mobileStackPanel} aria-labelledby="mobile-account-stack-title">
                <header className={styles.mobileStackHeader}>
                  <button type="button" className={styles.mobileStackHeaderButton} onClick={() => navigate("/")}>
                    <FiArrowLeft aria-hidden="true" /><span>Beranda</span>
                  </button>
                  <div className={styles.mobileStackHeaderActions}>
                    {ownerMode ? (
                      <button type="button" className={styles.mobileStackAddButton} onClick={openCreateDialog} aria-label="Tambah rekening" title="Tambah rekening">
                        <FiPlus aria-hidden="true" />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={styles.mobileStackHeaderButton}
                      onClick={() => setMobileAccountSheet("accounts")}
                      aria-label={`Buka daftar ${accounts.length} rekening aktif`}
                    >
                      <span>Daftar rekening</span><FiList aria-hidden="true" />
                    </button>
                  </div>
                </header>

                <div
                  ref={mobileStackStageRef}
                  className={styles.mobileStackStage}
                  tabIndex={0}
                  aria-label="Geser ke atas atau bawah untuk mengganti rekening"
                  aria-describedby="mobile-account-stack-hint"
                  onKeyDown={handleMobileStackKeyDown}
                >
                  <div className={styles.mobileStackAmbient} aria-hidden="true" />
                  {accounts.map((account, index) => (
                    <button
                      key={`mobile-stack-${account.account_id}`}
                      ref={(node) => {
                        if (node) mobileStackCardRefs.current.set(account.account_id, node);
                        else mobileStackCardRefs.current.delete(account.account_id);
                      }}
                      type="button"
                      className={styles.mobileStackCard}
                      aria-label={`Lihat detail rekening ${account.name}`}
                      aria-pressed={account.account_id === selectedAccount?.account_id}
                      onPointerDown={handleMobileStackPointerDown}
                      onPointerMove={handleMobileStackPointerMove}
                      onPointerUp={finishMobileStackPointer}
                      onPointerCancel={cancelMobileStackPointer}
                      onClick={() => selectMobileStackAccount(account, index)}
                    >
                      <AccountVisual account={account} stack />
                      <span className={styles.mobileStackBalance}>
                        <small>Saldo rekening</small>
                        <strong><Money value={account.balance || 0} /></strong>
                      </span>
                      <span className={styles.mobileStackOwnership}>{account.owner_scope === "shared" ? "Bersama" : "Pribadi"}</span>
                    </button>
                  ))}
                </div>

                {selectedAccount ? (
                  <div className={styles.mobileStackSummary}>
                    <div>
                      <small>Rekening aktif</small>
                      <h2 id="mobile-account-stack-title">{selectedAccount.name}</h2>
                    </div>
                    <span>{Math.max(1, accounts.findIndex((account) => account.account_id === selectedAccount.account_id) + 1)} dari {accounts.length}</span>
                  </div>
                ) : null}
                <p id="mobile-account-stack-hint" className={styles.mobileStackHint}>Geser kartu aktif ke atas atau bawah untuk mengganti rekening. Tekan kartu aktif untuk membuka detailnya.</p>
                <p ref={mobileStackStatusRef} id="mobile-account-stack-status" className="sr-only" aria-live="polite" />
              </section>

              {selectedAccount ? (
                <div className={styles.mobileQuickActions} aria-label={`Aksi cepat rekening ${selectedAccount.name}`}>
                  <button type="button" className={styles.mobileQuickAction} onClick={() => navigate("/transaksi", { state: { accountId: selectedAccount.account_id } })}>
                    <span><FiList aria-hidden="true" /></span>
                    <strong>Transaksi</strong>
                  </button>
                  <button type="button" className={styles.mobileQuickAction} onClick={() => setMobileAccountSheet("history")}>
                    <span><FiClock aria-hidden="true" /></span>
                    <strong>Pembayaran keluar</strong>
                  </button>
                </div>
              ) : null}
            </div>

            <div className={`${styles.accountWorkspace} ${styles.desktopAccountWorkspace}`}>
              <div className={styles.accountGrid} aria-label="Daftar rekening">
                {accounts.map((account) => (
                  <AccountFinancialCard
                    key={account.account_id}
                    account={account}
                    selected={account.account_id === selectedAccount?.account_id}
                    buttonRef={(node) => {
                      if (node) accountButtonRefs.current.set(account.account_id, node);
                      else accountButtonRefs.current.delete(account.account_id);
                    }}
                    onSelect={(item) => {
                      setSelectedAccountId(item.account_id);
                      if (window.matchMedia("(min-width: 821px) and (max-width: 1280px)").matches) setMobileDetailOpen(true);
                    }}
                  />
                ))}
              </div>
              {selectedAccount ? (
                <div
                  ref={detailContainerRef}
                  className={`${styles.detailColumn} ${mobileDetailOpen ? styles.detailColumnOpen : ""}`}
                  role={mobileDetailOpen ? "dialog" : undefined}
                  tabIndex={mobileDetailOpen ? -1 : undefined}
                  aria-modal={mobileDetailOpen || undefined}
                  aria-label={mobileDetailOpen ? `Detail rekening ${selectedAccount.name}` : undefined}
                >
                  <AccountFinancialCard
                    account={selectedAccount}
                    variant="detail"
                    ownerMode={ownerMode}
                    closeButtonRef={detailCloseRef}
                    onClose={closeMobileDetail}
                    onViewTransactions={(item) => navigate("/transaksi", { state: { accountId: item.account_id } })}
                    onEdit={openEditAccount}
                    onArchive={openAccountLifecycle}
                  />
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <Card className={styles.emptyPanel}>
            <h2>Belum ada rekening</h2>
            <p>Tambahkan rekening bank, tunai, e-wallet, atau tabungan agar saldo dapat dihitung.</p>
            {ownerMode ? <Button variant="primary" icon={FiPlus} onClick={openCreateDialog}>Tambah rekening</Button> : null}
          </Card>
        )}
      </section>


      {mobileAccountSheet ? (
        <Suspense fallback={null}>
          <MobileAccountSheets
            sheet={mobileAccountSheet}
            accounts={accounts}
            bootstrap={bootstrap}
            selectedAccount={selectedAccount}
            ownerMode={ownerMode}
            paymentHistoryPeriod={paymentHistoryPeriod}
            paymentHistoryResource={paymentHistoryResource}
            onClose={() => setMobileAccountSheet(null)}
            onSelectAccount={(accountId) => {
              setSelectedAccountId(accountId);
              setMobileAccountSheet(null);
            }}
            onViewTransactions={(item) => {
              if (!item) return;
              setMobileAccountSheet(null);
              navigate("/transaksi", { state: { accountId: item.account_id } });
            }}
            onEditAccount={(item) => {
              setMobileAccountSheet(null);
              openEditAccount(item);
            }}
            onArchiveAccount={(item) => {
              setMobileAccountSheet(null);
              openAccountLifecycle(item);
            }}
            onPaymentHistoryPeriodChange={setPaymentHistoryPeriod}
          />
        </Suspense>
      ) : null}

      {(createDialogOpen || editAccount) ? (
        <Suspense fallback={null}>
          <AccountEditorDialogs
            createDialogOpen={createDialogOpen}
            onCloseCreate={closeCreateDialog}
            accountForm={accountForm}
            setAccountForm={setAccountForm}
            onCreateAccount={createAccount}
            editAccount={editAccount}
            setEditAccount={setEditAccount}
            onSaveAccount={saveAccount}
            dialogState={dialogState}
            activeUsers={activeUsers}
            currentDatabaseUser={currentDatabaseUser}
            currentOwnerLabel={currentOwnerLabel}
          />
        </Suspense>
      ) : null}


      <ConfirmationModal
        open={Boolean(archiveTarget)}
        title={archiveTarget?.preview.canDeleteUnused ? "Hapus rekening belum dipakai?" : "Arsipkan rekening?"}
        description={archiveTarget ? `${archiveTarget.account.name} telah diperiksa ulang oleh server.` : ""}
        confirmLabel={archiveTarget?.preview.canDeleteUnused ? `Hapus permanen ${archiveTarget.account.name}` : "Arsipkan rekening"}
        reasonLabel={archiveTarget?.preview.canDeleteUnused ? "Alasan penghapusan" : null}
        requireReason={Boolean(archiveTarget?.preview.canDeleteUnused)}
        expectedConfirmation={archiveTarget?.preview.canDeleteUnused ? archiveTarget.preview.deleteConfirmation : ""}
        acknowledgementLabel={archiveTarget?.preview.canDeleteUnused ? "Saya memahami rekening ini akan dihapus permanen dan hanya audit yang tetap disimpan." : ""}
        countdownSeconds={archiveTarget?.preview.canDeleteUnused ? 5 : 0}
        busy={dialogState.status === "submitting"}
        error={dialogState.error}
        onCancel={() => dialogState.status !== "submitting" && setArchiveTarget(null)}
        onConfirm={archiveSelectedAccount}
      >
        {archiveTarget ? (
          <div className={styles.impactSummary}>
            <div><span>Saldo awal</span><strong><Money value={archiveTarget.preview.initialBalance} /></strong></div>
            <div><span>Saldo saat ini</span><strong><Money value={archiveTarget.preview.currentBalance} /></strong></div>
            <div><span>Seluruh transaksi</span><strong>{archiveTarget.preview.dependencies.transactions}</strong></div>
            <div><span>Rekonsiliasi</span><strong>{archiveTarget.preview.dependencies.reconciliations}</strong></div>
            <div><span>Referensi kantong/tagihan/target</span><strong>{archiveTarget.preview.dependencies.envelopes + archiveTarget.preview.dependencies.recurring + archiveTarget.preview.dependencies.goals}</strong></div>
            <p>{archiveTarget.preview.canDeleteUnused ? "Semua pemeriksaan bernilai nol. Backend akan membaca ulang data tepat sebelum DELETE." : "Rekening pernah digunakan atau memiliki histori, sehingga data hanya diarsipkan dan tidak dihapus."}</p>
          </div>
        ) : null}
      </ConfirmationModal>
    </div>
  );
};

export default AccountsPage;
