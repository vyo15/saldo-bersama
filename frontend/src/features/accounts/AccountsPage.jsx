import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  FiArrowLeft,
  FiClock,
  FiEye,
  FiFileText,
  FiInfo,
  FiList,
  FiPlus,
  FiRefreshCw,
} from "react-icons/fi";
import { useNavigate } from "react-router";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import Modal from "../../components/common/Modal.jsx";
import Money from "../../components/common/Money.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import StatusBadge from "../../components/common/StatusBadge.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import LoadingScreen from "../../components/feedback/LoadingScreen.jsx";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useFocusTrap } from "../../hooks/useFocusTrap.js";
import {
  archiveAccount,
  createAccount as requestCreateAccount,
  createReconciliation,
  deleteUnusedAccount,
  previewAccountLifecycle,
  updateAccount as requestUpdateAccount,
} from "./accounts.api.js";
import { useFinance } from "../../app/FinanceContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { createIdempotencyKey } from "../../domain/security.js";
import { currentMonthInJakarta, todayInJakarta } from "../../domain/dates.js";
import { parseRupiah } from "../../domain/money.js";
import {
  formatTransactionDate,
  TRANSACTION_LABELS,
  transactionCategoryIcon,
  transactionTone,
} from "../transactions/transactionPresentation.js";
import AccountFinancialCard, { AccountVisual } from "./components/AccountFinancialCard.jsx";
import { accountCardholderName, BANK_TEMPLATE_OPTIONS, detectBankTemplate } from "./accountPresentation.js";
import styles from "./AccountsPage.module.css";

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

const previewBalance = (value) => {
  try { return parseRupiah(value || "0"); } catch { return 0; }
};

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
  const navigate = useNavigate();
  const accountsResource = useApiResource("accounts.list");
  const [showReconciliations, setShowReconciliations] = useState(false);
  const [reconciliationInfoOpen, setReconciliationInfoOpen] = useState(false);
  const reconciliationsResource = useApiResource("reconciliations.list", { limit: 30 }, { enabled: showReconciliations });
  const { bootstrap, refreshAll, invalidate } = useFinance();
  const { user } = useAuth();
  const ownerMode = user?.role === "owner";
  const usersResource = useApiResource("users.list", {}, { enabled: ownerMode });
  const [accountForm, setAccountForm] = useState(emptyAccountForm);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [message, setMessage] = useState(null);
  const [editAccount, setEditAccount] = useState(null);
  const [reconciliation, setReconciliation] = useState({ account: null, actual_balance: "", notes: "Cocokkan dengan mutasi bank/tunai" });
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
  const mobileStackGestureRef = useRef({ dragging: false, startY: 0, startTime: 0, lastY: 0, lastTime: 0, velocityY: 0, suppressClick: false });
  const mobileStackAnimatingRef = useRef(false);
  const mobileStackWheelLockedRef = useRef(false);
  const detailContainerRef = useRef(null);
  const detailCloseRef = useRef(null);
  const createNameInputRef = useRef(null);

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
      await requestCreateAccount({ ...accountForm, initial_balance: Number(accountForm.initial_balance || 0) }, { idempotencyKey: createIdempotencyKey() });
      setAccountForm(emptyAccountForm());
      setCreateDialogOpen(false);
      setDialogState({ status: "idle", error: null });
      setMessage({ type: "success", text: "Rekening berhasil dibuat dan daftar telah diperbarui." });
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
      }, { rowVersion: editAccount.row_version, idempotencyKey: createIdempotencyKey() });
      setEditAccount(null);
      setDialogState({ status: "idle", error: null });
      setMessage({ type: "success", text: "Rekening berhasil diperbarui." });
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

  const saveReconciliation = async (event) => {
    event.preventDefault();
    if (!reconciliation.account) return;
    setDialogState({ status: "submitting", error: null });
    try {
      const result = await createReconciliation({
        account_id: reconciliation.account.account_id,
        actual_balance: parseRupiah(reconciliation.actual_balance),
        notes: reconciliation.notes,
      }, { idempotencyKey: createIdempotencyKey() });
      setReconciliation({ account: null, actual_balance: "", notes: "Cocokkan dengan mutasi bank/tunai" });
      setDialogState({ status: "idle", error: null });
      setMessage({ type: result.difference === 0 ? "success" : "warning", text: result.difference === 0 ? "Saldo cocok dan rekonsiliasi tercatat." : `Ada selisih ${result.difference}. Cari transaksi tertinggal atau buat penyesuaian beralasan.` });
      invalidate(["reconciliations.list", "dashboard.overview", "app.initialState"]);
      await Promise.allSettled([showReconciliations ? reconciliationsResource.reload() : Promise.resolve(), refreshAll()]);
    } catch (error) { setDialogState({ status: "error", error }); }
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
        }, { rowVersion: account.row_version, idempotencyKey: createIdempotencyKey() });
      } else {
        await archiveAccount({ account_id: account.account_id, row_version: account.row_version }, { rowVersion: account.row_version, idempotencyKey: createIdempotencyKey() });
      }
      setArchiveTarget(null);
      setDialogState({ status: "idle", error: null });
      setMessage({
        type: "success",
        text: preview.canDeleteUnused
          ? "Rekening yang belum pernah digunakan berhasil dihapus. Jejak audit tetap disimpan."
          : "Rekening berhasil diarsipkan dan dapat dipulihkan oleh owner.",
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

  const handleMobileStackPointerDown = useCallback((event) => {
    if (mobileStackAnimatingRef.current || mobileStackAccountsRef.current.length <= 1) return;
    const now = performance.now();
    mobileStackGestureRef.current = {
      dragging: true,
      startY: event.clientY,
      startTime: now,
      lastY: event.clientY,
      lastTime: now,
      velocityY: 0,
      suppressClick: false,
    };
    mobileStackStageRef.current?.classList.add(styles.mobileStackDragging);
    mobileStackStageRef.current?.setPointerCapture(event.pointerId);
    setMobileStackWillChange(true);
  }, [setMobileStackWillChange]);

  const handleMobileStackPointerMove = useCallback((event) => {
    const gesture = mobileStackGestureRef.current;
    if (!gesture.dragging) return;
    const now = performance.now();
    const elapsed = Math.max(1, now - gesture.lastTime);
    gesture.velocityY = (event.clientY - gesture.lastY) / elapsed;
    gesture.lastY = event.clientY;
    gesture.lastTime = now;

    const deltaY = event.clientY - gesture.startY;
    if (Math.abs(deltaY) > 5) gesture.suppressClick = true;
    const progress = clamp(-deltaY / 154, -0.92, 0.92);
    mobileStackPositionRef.current = mobileStackSettledIndexRef.current + progress;
    applyMobileStackPosition();
  }, [applyMobileStackPosition]);

  const finishMobileStackPointer = useCallback((event) => {
    const gesture = mobileStackGestureRef.current;
    if (!gesture.dragging) return;
    const totalDeltaY = event.clientY - gesture.startY;
    const totalElapsed = Math.max(1, performance.now() - gesture.startTime);
    const averageVelocity = totalDeltaY / totalElapsed;
    const progress = mobileStackPositionRef.current - mobileStackSettledIndexRef.current;

    gesture.dragging = false;
    mobileStackStageRef.current?.classList.remove(styles.mobileStackDragging);

    const fastSwipe = Math.abs(gesture.velocityY) > 0.48 || Math.abs(averageVelocity) > 0.42;
    const passedThreshold = Math.abs(progress) >= 0.28;
    if (fastSwipe || passedThreshold) {
      const direction = progress !== 0 ? Math.sign(progress) : (totalDeltaY < 0 ? 1 : -1);
      animateMobileStackTo(mobileStackSettledIndexRef.current + direction);
    } else {
      animateMobileStackTo(mobileStackSettledIndexRef.current, { announce: false });
    }

    window.setTimeout(() => { mobileStackGestureRef.current.suppressClick = false; }, 0);
  }, [animateMobileStackTo]);

  const handleMobileStackWheel = useCallback((event) => {
    if (mobileStackWheelLockedRef.current || mobileStackAnimatingRef.current || mobileStackAccountsRef.current.length <= 1) return;
    event.preventDefault();
    mobileStackWheelLockedRef.current = true;
    moveMobileStack(event.deltaY > 0 ? 1 : -1);
    window.setTimeout(() => { mobileStackWheelLockedRef.current = false; }, 560);
  }, [moveMobileStack]);

  const handleMobileStackKeyDown = useCallback((event) => {
    if (["ArrowUp", "ArrowLeft"].includes(event.key)) {
      event.preventDefault();
      moveMobileStack(-1);
    }
    if (["ArrowDown", "ArrowRight"].includes(event.key)) {
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
  const accountLookup = Object.fromEntries((bootstrap?.accounts?.length ? bootstrap.accounts : accounts).map((account) => [account.account_id, account.name]));
  const categoryLookup = Object.fromEntries((bootstrap?.categories || []).map((category) => [category.category_id, category]));
  const paymentHistoryItems = (paymentHistoryResource.data?.items || []).filter((item) => (
    item.source_account_id === selectedAccount?.account_id
    && ["expense", "transfer"].includes(item.transaction_type)
  ));
  const canReconcileSelectedAccount = Boolean(selectedAccount?.can_reconcile ?? ownerMode);
  const accountPreview = {
    name: accountForm.name || "Nama rekening",
    account_type: accountForm.account_type,
    account_number: accountForm.account_number,
    bank_template: accountForm.account_type === "bank" ? accountForm.bank_template : "generic",
    owner_scope: accountForm.owner_scope,
    owner_user_id: accountForm.owner_scope === "personal" ? accountForm.owner_user_id || currentDatabaseUser?.user_id || "" : "",
    owner_name: accountForm.owner_scope === "personal"
      ? activeUsers.find((item) => item.user_id === (accountForm.owner_user_id || currentDatabaseUser?.user_id))?.name || currentOwnerLabel
      : "",
    balance: previewBalance(accountForm.initial_balance),
    status: "active",
  };

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
                  <button type="button" className={styles.mobileStackHeaderButton} onClick={() => navigate(-1)}>
                    <FiArrowLeft aria-hidden="true" /><span>Kembali</span>
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
                      onClick={() => mobileStackStageRef.current?.focus()}
                      aria-label={`Semua kartu, ${accounts.length} rekening aktif`}
                    >
                      <span>Semua kartu</span><FiEye aria-hidden="true" />
                    </button>
                  </div>
                </header>

                <div
                  ref={mobileStackStageRef}
                  className={styles.mobileStackStage}
                  tabIndex={0}
                  aria-label="Geser ke atas atau bawah untuk mengganti rekening"
                  aria-describedby="mobile-account-stack-hint"
                  onPointerDown={handleMobileStackPointerDown}
                  onPointerMove={handleMobileStackPointerMove}
                  onPointerUp={finishMobileStackPointer}
                  onPointerCancel={finishMobileStackPointer}
                  onWheel={handleMobileStackWheel}
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
                <p id="mobile-account-stack-hint" className={styles.mobileStackHint}>Geser vertikal untuk mengganti rekening. Tekan kartu aktif untuk membuka detailnya.</p>
                <p ref={mobileStackStatusRef} id="mobile-account-stack-status" className="sr-only" aria-live="polite" />
              </section>

              {selectedAccount ? (
                <div className={styles.mobileQuickActions} aria-label={`Aksi cepat rekening ${selectedAccount.name}`}>
                  <button type="button" className={styles.mobileQuickAction} onClick={() => navigate("/transaksi")}>
                    <span><FiList aria-hidden="true" /></span>
                    <strong>Transaksi</strong>
                  </button>
                  {canReconcileSelectedAccount ? (
                    <button
                      type="button"
                      className={styles.mobileQuickAction}
                      onClick={() => {
                        setReconciliation({ account: selectedAccount, actual_balance: String(selectedAccount.balance || 0), notes: "Cocokkan dengan mutasi bank/tunai" });
                        setDialogState({ status: "idle", error: null });
                      }}
                    >
                      <span><FiRefreshCw aria-hidden="true" /></span>
                      <strong>Rekonsiliasi</strong>
                    </button>
                  ) : null}
                  <button type="button" className={styles.mobileQuickAction} onClick={() => navigate("/tagihan")}>
                    <span><FiFileText aria-hidden="true" /></span>
                    <strong>Bayar tagihan</strong>
                  </button>
                  <button type="button" className={styles.mobileQuickAction} onClick={() => setMobileAccountSheet("history")}>
                    <span><FiClock aria-hidden="true" /></span>
                    <strong>Riwayat</strong>
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
                    onReconcile={(item) => { setReconciliation({ account: item, actual_balance: String(item.balance || 0), notes: "Cocokkan dengan mutasi bank/tunai" }); setDialogState({ status: "idle", error: null }); }}
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

      <Card className={`panel ${styles.reconciliationPanel}`}>
        <div className={`panel__header ${styles.reconciliationHeader}`}>
          <div className={styles.reconciliationHeading}>
            <div className={styles.reconciliationEyebrowRow}>
              <p className="eyebrow">Riwayat rekonsiliasi</p>
              <button
                type="button"
                className={styles.reconciliationInfoButton}
                aria-label="Baca penjelasan rekonsiliasi"
                title="Tentang rekonsiliasi"
                onClick={() => setReconciliationInfoOpen(true)}
              >
                <FiInfo aria-hidden="true" />
              </button>
            </div>
            <h2>Perbandingan saldo sistem dan saldo aktual</h2>
            <p className={styles.reconciliationSummary}>Buka riwayat untuk melihat hasil pencocokan terakhir.</p>
          </div>
          <Button className={styles.reconciliationToggle} icon={FiClock} onClick={() => setShowReconciliations((current) => !current)}>{showReconciliations ? "Tutup riwayat" : "Muat riwayat"}</Button>
        </div>
        {showReconciliations ? (
          reconciliationsResource.status === "loading"
            ? <p>Memuat riwayat rekonsiliasi...</p>
            : reconciliationsResource.status === "error"
              ? <ErrorState error={reconciliationsResource.error} onRetry={reconciliationsResource.reload} />
              : (reconciliationsResource.data?.items || []).length ? (
                <>
                  <div className="data-table-wrap desktop-data-table"><table className="data-table"><thead><tr><th>Waktu</th><th>Rekening</th><th className="align-right">Sistem</th><th className="align-right">Aktual</th><th className="align-right">Selisih</th><th>Status</th></tr></thead><tbody>{(reconciliationsResource.data?.items || []).map((item) => <tr key={item.reconciliation_id}><td>{item.reconciled_at}</td><td>{item.account_name || item.account_id}</td><td className="align-right"><Money value={item.system_balance} /></td><td className="align-right"><Money value={item.actual_balance} /></td><td className="align-right"><Money value={item.difference} tone={item.difference === 0 ? "positive" : "negative"} /></td><td><StatusBadge status={item.status} /></td></tr>)}</tbody></table></div>
                  <div className="mobile-data-list reconciliation-mobile-list" aria-label="Riwayat rekonsiliasi">{(reconciliationsResource.data?.items || []).map((item) => <article className="mobile-data-card reconciliation-mobile-card" key={item.reconciliation_id}><div className="reconciliation-mobile-card__header"><div><strong>{item.account_name || item.account_id}</strong><small>{item.reconciled_at}</small></div><StatusBadge status={item.status} /></div><dl><div><dt>Saldo sistem</dt><dd><Money value={item.system_balance} /></dd></div><div><dt>Saldo aktual</dt><dd><Money value={item.actual_balance} /></dd></div><div><dt>Selisih</dt><dd><Money value={item.difference} tone={item.difference === 0 ? "positive" : "negative"} /></dd></div></dl></article>)}</div>
                </>
              ) : <p className="empty-inline-message">Belum ada rekonsiliasi.</p>
        ) : null}
      </Card>

      <Modal
        open={mobileAccountSheet === "detail" && Boolean(selectedAccount)}
        onClose={() => setMobileAccountSheet(null)}
        title={selectedAccount?.name || "Detail rekening"}
        description="Detail rekening hanya ditampilkan setelah kartu aktif ditekan."
        size="sm"
      >
        {selectedAccount ? (
          <AccountFinancialCard
            account={selectedAccount}
            variant="mobileDetail"
            embedded
            ownerMode={ownerMode}
            onViewTransactions={() => { setMobileAccountSheet(null); navigate("/transaksi"); }}
            onReconcile={(item) => {
              setMobileAccountSheet(null);
              setReconciliation({ account: item, actual_balance: String(item.balance || 0), notes: "Cocokkan dengan mutasi bank/tunai" });
              setDialogState({ status: "idle", error: null });
            }}
            onEdit={(item) => { setMobileAccountSheet(null); openEditAccount(item); }}
            onArchive={(item) => { setMobileAccountSheet(null); openAccountLifecycle(item); }}
          />
        ) : null}
      </Modal>

      <Modal
        open={mobileAccountSheet === "history" && Boolean(selectedAccount)}
        onClose={() => setMobileAccountSheet(null)}
        title="Riwayat pembayaran"
        description={selectedAccount ? `Pembayaran keluar yang menggunakan ${selectedAccount.name}.` : "Riwayat pembayaran rekening."}
        size="sm"
        footer={<Button onClick={() => { setMobileAccountSheet(null); navigate("/transaksi"); }}>Lihat semua transaksi</Button>}
      >
        <div className={styles.paymentHistoryToolbar}>
          <label>
            <span>Periode</span>
            <input
              type="month"
              max={currentMonthInJakarta()}
              value={paymentHistoryPeriod}
              onChange={(event) => setPaymentHistoryPeriod(event.target.value)}
              aria-label="Periode riwayat pembayaran"
            />
          </label>
          <p>Riwayat dimuat saat dibuka dan difilter berdasarkan rekening aktif.</p>
        </div>

        {paymentHistoryResource.refreshError ? <RefreshWarning error={paymentHistoryResource.refreshError} onRetry={paymentHistoryResource.reload} /> : null}
        {["loading", "refreshing"].includes(paymentHistoryResource.status) ? (
          <p className={styles.paymentHistoryState}>Memuat riwayat pembayaran...</p>
        ) : paymentHistoryResource.status === "error" ? (
          <ErrorState error={paymentHistoryResource.error} onRetry={paymentHistoryResource.reload} />
        ) : paymentHistoryItems.length ? (
          <div className={styles.paymentHistoryList} aria-label={`Riwayat pembayaran ${selectedAccount?.name || "rekening"}`}>
            {paymentHistoryItems.map((item) => {
              const category = categoryLookup[item.category_id];
              const HistoryIcon = transactionCategoryIcon(category, item.transaction_type);
              const tone = transactionTone(item.transaction_type);
              const destination = item.transaction_type === "transfer"
                ? accountLookup[item.destination_account_id] || "Rekening tujuan"
                : category?.name || TRANSACTION_LABELS[item.transaction_type] || "Pembayaran";
              const title = item.description || item.merchant || TRANSACTION_LABELS[item.transaction_type] || "Pembayaran";
              return (
                <article className={styles.paymentHistoryItem} key={item.transaction_id}>
                  <span className={styles.paymentHistoryIcon} data-tone={tone}><HistoryIcon aria-hidden="true" /></span>
                  <div className={styles.paymentHistoryCopy}>
                    <strong>{title}</strong>
                    <small>{item.transaction_type === "transfer" ? `Transfer ke ${destination}` : destination}</small>
                    <span>{formatTransactionDate(item.transaction_date)}</span>
                  </div>
                  <div className={styles.paymentHistoryMeta}>
                    <strong data-tone={tone}>− <Money value={item.amount || 0} /></strong>
                    {item.status && item.status !== "active" ? <StatusBadge status={item.status} /> : <small>Tercatat</small>}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className={styles.paymentHistoryEmpty}>
            <FiClock aria-hidden="true" />
            <strong>Belum ada pembayaran pada periode ini</strong>
            <p>Pilih periode lain atau buka seluruh transaksi untuk melihat aktivitas rekening.</p>
          </div>
        )}
      </Modal>

      <Modal
        open={reconciliationInfoOpen}
        onClose={() => setReconciliationInfoOpen(false)}
        title="Tentang rekonsiliasi"
        description="Panduan singkat untuk menjaga saldo aplikasi tetap sesuai kondisi nyata."
        size="sm"
        footer={<Button variant="primary" onClick={() => setReconciliationInfoOpen(false)}>Mengerti</Button>}
      >
        <div className={styles.reconciliationInfo}>
          <p>Cocokkan saldo aplikasi dengan saldo bank atau uang tunai secara berkala, disarankan satu kali setiap bulan.</p>
          <ul>
            <li>Rekening pribadi pasangan tetap terlihat untuk transparansi bersama.</li>
            <li>Aksi rekonsiliasi, edit, dan arsip hanya tersedia bila izin akun Anda telah dikonfirmasi oleh server.</li>
            <li>Selisih tidak mengubah saldo secara otomatis; periksa transaksi yang tertinggal sebelum membuat penyesuaian.</li>
          </ul>
        </div>
      </Modal>

      <Modal open={createDialogOpen} onClose={closeCreateDialog} title="Tambah rekening" description="Isi identitas rekening dan saldo awal. Nomor rekening tidak pernah diperlakukan sebagai nomor kartu debit." size="lg" initialFocusRef={createNameInputRef} footer={<><Button onClick={closeCreateDialog} disabled={dialogState.status === "submitting"}>Batal</Button><Button variant="primary" type="submit" form="create-account-form" loading={dialogState.status === "submitting"}>Simpan rekening</Button></>}>
        <div className={styles.createAccountLayout}>
          <AccountFinancialCard account={accountPreview} variant="preview" templateOverride={accountForm.account_type === "bank" ? accountForm.bank_template : "generic"} />
          <form id="create-account-form" className="form-grid" onSubmit={createAccount}>
            <label className="field form-grid__full"><span>Nama rekening *</span><input ref={createNameInputRef} required maxLength="100" placeholder="Contoh: Tabungan nikah" value={accountForm.name} onChange={(event) => setAccountForm((current) => ({ ...current, name: event.target.value }))} /><small>Gunakan nama sesuai tujuan rekening. Nama bank dipilih terpisah melalui template kartu.</small></label>
            {accountForm.account_type === "bank" ? <label className="field form-grid__full"><span>No rekening *</span><input required inputMode="numeric" autoComplete="off" maxLength="34" pattern="[0-9 ]{6,34}" placeholder="Contoh: 1234567890123456" value={accountForm.account_number} onChange={(event) => setAccountForm((current) => ({ ...current, account_number: event.target.value.replace(/\D/g, "").slice(0, 34) }))} /><small>Disimpan sebagai digit saja dan hanya ditampilkan kepada pengguna yang terotorisasi.</small></label> : null}
            <label className="field"><span>Jenis</span><select value={accountForm.account_type} onChange={(event) => setAccountForm((current) => ({ ...current, account_type: event.target.value, account_number: event.target.value === "bank" ? current.account_number : "", bank_template: event.target.value === "bank" ? current.bank_template : "generic" }))}><option value="bank">Bank</option><option value="cash">Tunai</option><option value="ewallet">E-wallet</option><option value="savings">Tabungan</option><option value="emergency_fund">Dana darurat</option><option value="sinking_fund">Dana berkala</option><option value="investment">Investasi</option><option value="other">Lainnya</option></select></label>
            <label className="field"><span>Kepemilikan</span><select value={accountForm.owner_scope} onChange={(event) => setAccountForm((current) => ({ ...current, owner_scope: event.target.value, owner_user_id: event.target.value === "personal" ? current.owner_user_id || currentDatabaseUser?.user_id || "" : "" }))}><option value="shared">Bersama</option><option value="personal">Pribadi</option></select></label>
            {accountForm.owner_scope === "personal" ? (
              <label className="field">
                <span>Pemilik rekening *</span>
                {activeUsers.length ? (
                  <select required value={accountForm.owner_user_id || currentDatabaseUser?.user_id || ""} onChange={(event) => setAccountForm((current) => ({ ...current, owner_user_id: event.target.value }))}>
                    {activeUsers.map((member) => <option key={member.user_id} value={member.user_id}>{member.name || "Pengguna"}{member.is_current ? " · saya" : ""}</option>)}
                  </select>
                ) : <input value={currentOwnerLabel} disabled aria-label="Pemilik rekening aktif" />}
                <small>{activeUsers.length ? "Nama pemilik ditampilkan kepada pasangan. Hak transaksi rekening personal tetap mengikuti pemilik." : "Daftar anggota belum dapat dimuat. Rekening pribadi baru akan dimiliki pengguna aktif dan tetap divalidasi oleh server."}</small>
              </label>
            ) : null}
            {accountForm.account_type === "bank" ? <label className="field form-grid__full"><span>Template kartu bank</span><select value={accountForm.bank_template} onChange={(event) => setAccountForm((current) => ({ ...current, bank_template: event.target.value }))}>{BANK_TEMPLATE_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select><small>Template hanya mengubah tampilan kartu dan tidak menambahkan nama bank ke nama rekening. PIN, CVV, nomor kartu debit, dan masa berlaku tidak disimpan.</small></label> : null}
            <MoneyInput id="initial-balance" label="Saldo awal" value={accountForm.initial_balance} onChange={(value) => setAccountForm((current) => ({ ...current, initial_balance: value }))} />
            <label className="field"><span>Tanggal saldo awal</span><input type="date" value={accountForm.initial_balance_date} onChange={(event) => setAccountForm((current) => ({ ...current, initial_balance_date: event.target.value }))} /></label>
            <label className="checkbox-field form-grid__full"><input type="checkbox" checked={accountForm.allow_negative} onChange={(event) => setAccountForm((current) => ({ ...current, allow_negative: event.target.checked }))} /><span>Izinkan saldo negatif</span></label>
            {dialogState.error ? <div className="notice notice--danger form-grid__full" role="alert">{dialogState.error.message}</div> : null}
          </form>
        </div>
      </Modal>

      <Modal open={Boolean(reconciliation.account)} onClose={() => dialogState.status !== "submitting" && setReconciliation((current) => ({ ...current, account: null }))} title="Rekonsiliasi rekening" description={reconciliation.account ? `${reconciliation.account.name} · saldo sistem ${reconciliation.account.balance}` : ""} footer={<><Button onClick={() => setReconciliation((current) => ({ ...current, account: null }))} disabled={dialogState.status === "submitting"}>Batal</Button><Button variant="primary" type="submit" form="reconciliation-form" disabled={dialogState.status === "submitting"}>{dialogState.status === "submitting" ? "Menyimpan..." : "Simpan rekonsiliasi"}</Button></>}>
        <form id="reconciliation-form" className="form-grid" onSubmit={saveReconciliation}>
          <MoneyInput id="actual-balance" label="Saldo aktual" value={reconciliation.actual_balance} onChange={(value) => setReconciliation((current) => ({ ...current, actual_balance: value }))} />
          <label className="field form-grid__full"><span>Catatan</span><textarea rows="3" maxLength="250" value={reconciliation.notes} onChange={(event) => setReconciliation((current) => ({ ...current, notes: event.target.value }))} /></label>
          {dialogState.error ? <div className="notice notice--danger form-grid__full" role="alert">{dialogState.error.message}</div> : null}
        </form>
      </Modal>

      <Modal open={Boolean(editAccount)} onClose={() => dialogState.status !== "submitting" && setEditAccount(null)} title="Edit rekening" description="Saldo awal dan jenis rekening tidak dapat diubah melalui form ini." footer={<><Button onClick={() => setEditAccount(null)} disabled={dialogState.status === "submitting"}>Batal</Button><Button variant="primary" type="submit" form="edit-account-form" disabled={dialogState.status === "submitting"}>{dialogState.status === "submitting" ? "Menyimpan..." : "Simpan perubahan"}</Button></>}>
        <form id="edit-account-form" className="form-grid" onSubmit={saveAccount}>
          <label className="field form-grid__full"><span>Nama rekening *</span><input required maxLength="100" value={editAccount?.name || ""} onChange={(event) => setEditAccount((current) => ({ ...current, name: event.target.value }))} /></label>
          {editAccount?.account_type === "bank" ? <label className="field form-grid__full"><span>No rekening *</span><input required inputMode="numeric" autoComplete="off" maxLength="34" pattern="[0-9 ]{6,34}" value={editAccount?.account_number || ""} onChange={(event) => setEditAccount((current) => ({ ...current, account_number: event.target.value.replace(/\D/g, "").slice(0, 34) }))} /></label> : null}
          {editAccount?.account_type === "bank" ? <label className="field form-grid__full"><span>Template kartu bank</span><select value={editAccount?.bank_template || "generic"} onChange={(event) => setEditAccount((current) => ({ ...current, bank_template: event.target.value }))}>{BANK_TEMPLATE_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select><small>Template tersimpan sebagai tampilan kartu dan tidak mengubah nama rekening.</small></label> : null}
          <label className="field"><span>Kepemilikan</span><select value={editAccount?.owner_scope || "shared"} onChange={(event) => setEditAccount((current) => ({ ...current, owner_scope: event.target.value, owner_user_id: event.target.value === "personal" ? current.owner_user_id || currentDatabaseUser?.user_id || "" : "" }))}><option value="shared">Bersama</option><option value="personal">Pribadi</option></select></label>
          {editAccount?.owner_scope === "personal" ? (
            <label className="field">
              <span>Pemilik rekening *</span>
              {activeUsers.length ? (
                <select required value={editAccount?.owner_user_id || currentDatabaseUser?.user_id || ""} onChange={(event) => setEditAccount((current) => ({ ...current, owner_user_id: event.target.value }))}>
                  {activeUsers.map((member) => <option key={member.user_id} value={member.user_id}>{member.name || "Pengguna"}{member.is_current ? " · saya" : ""}</option>)}
                </select>
              ) : <input value={editAccount?.owner_name || currentOwnerLabel} disabled aria-label="Pemilik rekening saat ini" />}
              <small>{activeUsers.length ? "Kepemilikan hanya dapat dipindahkan bila rekening belum memiliki data terkait." : "Daftar anggota belum dapat dimuat. Pemilik rekening saat ini dipertahankan."}</small>
            </label>
          ) : null}
          <label className="checkbox-field"><input type="checkbox" checked={Boolean(editAccount?.allow_negative)} onChange={(event) => setEditAccount((current) => ({ ...current, allow_negative: event.target.checked }))} /><span>Izinkan saldo negatif</span></label>
          {dialogState.error ? <div className="notice notice--danger form-grid__full" role="alert">{dialogState.error.message}</div> : null}
        </form>
      </Modal>

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
