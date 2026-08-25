import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { FiPlus } from "react-icons/fi";
import MasterDataRequestsPanel from "../masterData/MasterDataRequestsPanel.jsx";
import { useLocation, useNavigate } from "react-router";
import Button from "../../components/common/Button.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import CompactNotice from "../../components/common/CompactNotice.jsx";
import Money from "../../components/common/Money.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import LoadingScreen from "../../components/feedback/LoadingScreen.jsx";
import { useFeedback } from "../../components/feedback/feedbackContext.js";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useMediaQuery } from "../../hooks/useMediaQuery.js";
import { useMasterDataRequestReview } from "../../hooks/useMasterDataRequestReview.js";
import {
  archiveAccount,
  createAccount as requestCreateAccount,
  requestAccountCreation,
  deleteUnusedAccount,
  previewAccountLifecycle,
  updateAccount as requestUpdateAccount,
} from "./accounts.api.js";
import { useFinance } from "../../app/FinanceContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { todayInJakarta } from "../../domain/dates.js";
import { accountCardholderName, accountTypeUsesAutomaticName, defaultAccountName, detectBankTemplate, detectEwalletTemplate, filterAccountsByOwnership } from "../../shared/presentation/account.js";
import { collectionEmptyState, EMPTY_COLLECTION_STATE } from "../../shared/presentation/emptyState.js";
import styles from "./AccountsPage.module.css";

const MobileAccountSheets = lazy(() => import("./components/MobileAccountSheets.jsx"));
const MobileAccountsExperience = lazy(() => import("./components/MobileAccountsExperience.jsx"));
const DesktopAccountsWorkspace = lazy(() => import("./components/DesktopAccountsWorkspace.jsx"));
const AccountEditorDialogs = lazy(() => import("./components/AccountEditorDialogs.jsx"));

const MOBILE_ACCOUNTS_QUERY = "(max-width: 820px)";
const useMobileAccountsLayout = () => useMediaQuery(MOBILE_ACCOUNTS_QUERY);

const EMPTY_ACCOUNTS = Object.freeze([]);

const emptyAccountForm = () => ({
  name: "", account_type: "bank", bank_template: "generic", ewallet_template: "generic", account_number: "", owner_scope: "shared", owner_user_id: "",
  initial_balance: "", initial_balance_date: todayInJakarta(), allow_negative: false,
});


const accountCreatePayload = (form) => {
  const qualifier = String(form.name || "").trim();
  const automaticName = defaultAccountName(form);
  return {
    ...form,
    name: accountTypeUsesAutomaticName(form.account_type)
      ? [automaticName, qualifier].filter(Boolean).join(" · ")
      : form.name,
    initial_balance: Number(form.initial_balance || 0),
  };
};

const accountUpdatePayload = (account) => ({
  account_id: account.account_id,
  name: account.name,
  account_number: account.account_number || "",
  bank_template: account.account_type === "bank" ? account.bank_template || "generic" : "generic",
  ewallet_template: account.account_type === "ewallet" ? account.ewallet_template || "generic" : "generic",
  owner_scope: account.owner_scope,
  owner_user_id: account.owner_scope === "personal" ? account.owner_user_id || "" : "",
  allow_negative: Boolean(account.allow_negative),
  row_version: account.row_version,
});

const useAccountCrudActions = ({ accountForm, setAccountForm, editAccount, setEditAccount, dialogState, setDialogState, notify, reloadAccounts, reloadRequests, ownerMode, onCreated }) => {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const openCreateDialog = () => { setDialogState({ status: "idle", error: null }); setCreateDialogOpen(true); };
  const closeCreateDialog = () => {
    if (dialogState.status === "submitting") return;
    setCreateDialogOpen(false);
    setDialogState({ status: "idle", error: null });
  };
  const createAccount = async (event) => {
    event.preventDefault();
    setDialogState({ status: "submitting", error: null });
    try {
      const payload = accountCreatePayload(accountForm);
      if (ownerMode) await requestCreateAccount(payload, {});
      else await requestAccountCreation(payload, {});
      setAccountForm(emptyAccountForm());
      setCreateDialogOpen(false);
      setDialogState({ status: "idle", error: null });
      notify({ message: ownerMode ? "Rekening berhasil dibuat dan daftar telah diperbarui." : "Pengajuan rekening dikirim ke Administrator.", tone: "success", dedupeKey: ownerMode ? "accounts:create" : "accounts:request-create" });
      if (ownerMode) { await reloadAccounts(); onCreated?.(); }
      else await reloadRequests?.();
    } catch (error) { setDialogState({ status: "error", error }); }
  };
  const openEditAccount = (account) => {
    setEditAccount({ ...account, name: accountCardholderName(account.name) || account.name, bank_template: detectBankTemplate(account), ewallet_template: detectEwalletTemplate(account) });
    setDialogState({ status: "idle", error: null });
  };
  const saveAccount = async (event) => {
    event.preventDefault();
    if (!editAccount) return;
    setDialogState({ status: "submitting", error: null });
    try {
      await requestUpdateAccount(accountUpdatePayload(editAccount), { rowVersion: editAccount.row_version });
      setEditAccount(null);
      setDialogState({ status: "idle", error: null });
      notify({ message: "Rekening berhasil diperbarui.", tone: "success", dedupeKey: "accounts:update" });
      await reloadAccounts();
    } catch (error) { setDialogState({ status: "error", error }); }
  };
  return { createDialogOpen, openCreateDialog, closeCreateDialog, createAccount, openEditAccount, saveAccount };
};

const useAccountLifecycleActions = ({ archiveTarget, setArchiveTarget, setDialogState, setMessage, notify, reloadAccounts }) => {
  const openAccountLifecycle = async (account) => {
    setDialogState({ status: "submitting", error: null });
    try {
      const preview = await previewAccountLifecycle(
        { account_id: account.account_id, row_version: account.row_version }, { rowVersion: account.row_version },
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
          account_id: account.account_id, row_version: account.row_version, reason,
          confirmation: confirmationState.confirmation, acknowledged: confirmationState.acknowledged,
        }, { rowVersion: account.row_version });
      } else {
        await archiveAccount({ account_id: account.account_id, row_version: account.row_version, reason }, { rowVersion: account.row_version });
      }
      setArchiveTarget(null);
      setDialogState({ status: "idle", error: null });
      notify({
        message: preview.canDeleteUnused
          ? "Rekening yang belum pernah digunakan berhasil dihapus. Jejak audit tetap disimpan."
          : "Rekening berhasil diarsipkan dan dapat dipulihkan oleh Administrator.",
        tone: "success", dedupeKey: preview.canDeleteUnused ? "accounts:delete-unused" : "accounts:archive",
      });
      await reloadAccounts();
    } catch (error) { setDialogState({ status: "error", error }); }
  };
  return { openAccountLifecycle, archiveSelectedAccount };
};

const AccountListSection = ({ mobileLayout, accounts, allAccounts, selectedAccount, selectedAccountId, ownershipFilter, setOwnershipFilter, ownerMode, openCreateDialog, setMobileAccountSheet, navigate, bootstrap, setSelectedAccountId, openEditAccount, openAccountLifecycle, onTransferSaved }) => {
  const emptyState = collectionEmptyState({ visibleCount: accounts.length, totalCount: allAccounts.length, filtersActive: ownershipFilter !== "all" });
  const initialEmpty = emptyState === EMPTY_COLLECTION_STATE.INITIAL;
  return (
    <section aria-labelledby="account-list-title" className={`${styles.accountSection}${initialEmpty ? ` ${styles.accountSectionInitialEmpty}` : ""}`}>
      <h2 id="account-list-title" className="sr-only">Rekening aktif</h2>
      {accounts.length ? (mobileLayout
        ? <Suspense fallback={null}><MobileAccountsExperience accounts={accounts} selectedAccount={selectedAccount} selectedAccountId={selectedAccountId} ownershipFilter={ownershipFilter} onOwnershipFilterChange={setOwnershipFilter} ownerMode={ownerMode}
            openCreateDialog={openCreateDialog} setMobileAccountSheet={setMobileAccountSheet} setSelectedAccountId={setSelectedAccountId} bootstrap={bootstrap} onTransferSaved={onTransferSaved} /></Suspense>
        : <Suspense fallback={null}><DesktopAccountsWorkspace accounts={accounts} allAccounts={allAccounts} selectedAccount={selectedAccount} ownershipFilter={ownershipFilter} onOwnershipFilterChange={setOwnershipFilter} ownerMode={ownerMode} bootstrap={bootstrap}
            onSelectAccount={setSelectedAccountId} onViewTransactions={(item) => navigate("/transaksi", { state: { accountId: item.account_id } })}
            onEditAccount={openEditAccount} onArchiveAccount={openAccountLifecycle} /></Suspense>)
        : <EmptyState className={`${styles.emptyPanel}${initialEmpty ? ` ${styles.emptyPanelInitial}` : ""}`}
            title={emptyState === EMPTY_COLLECTION_STATE.FILTERED ? "Tidak ada rekening di filter ini" : "Belum ada rekening"}
            description={emptyState === EMPTY_COLLECTION_STATE.FILTERED ? "Pilih filter lain untuk menampilkan rekening yang tersedia." : ownerMode ? "Tambahkan rekening pertama untuk mulai mencatat saldo dan transaksi." : "Ajukan rekening baru kepada Administrator untuk mulai menggunakannya setelah disetujui."}
            action={emptyState === EMPTY_COLLECTION_STATE.FILTERED ? <Button onClick={() => setOwnershipFilter("all")}>Tampilkan semua</Button> : <Button variant="primary" icon={FiPlus} onClick={openCreateDialog}>{ownerMode ? "Tambah rekening" : "Ajukan rekening"}</Button>} />}
    </section>
  );
};

const AccountSheets = ({ mobileAccountSheet, setMobileAccountSheet, selectedAccount, ownerMode, navigate, openEditAccount, openAccountLifecycle }) => {
  if (!mobileAccountSheet) return null;
  return <Suspense fallback={null}><MobileAccountSheets sheet={mobileAccountSheet} selectedAccount={selectedAccount} ownerMode={ownerMode}
    onClose={() => setMobileAccountSheet(null)}
    onViewTransactions={(item) => { if (!item) return; setMobileAccountSheet(null); navigate("/transaksi", { state: { accountId: item.account_id } }); }}
    onEditAccount={(item) => { setMobileAccountSheet(null); openEditAccount(item); }} onArchiveAccount={(item) => { setMobileAccountSheet(null); openAccountLifecycle(item); }} /></Suspense>;
};

const AccountEditors = ({ createDialogOpen, editAccount, closeCreateDialog, accountForm, setAccountForm, createAccount, setEditAccount, saveAccount, dialogState, activeUsers, currentDatabaseUser, currentOwnerLabel, requestMode }) => (
  (createDialogOpen || editAccount) ? (
    <Suspense fallback={null}><AccountEditorDialogs createDialogOpen={createDialogOpen} onCloseCreate={closeCreateDialog} accountForm={accountForm} setAccountForm={setAccountForm}
      onCreateAccount={createAccount} editAccount={editAccount} setEditAccount={setEditAccount} onSaveAccount={saveAccount} dialogState={dialogState}
      activeUsers={activeUsers} currentDatabaseUser={currentDatabaseUser} currentOwnerLabel={currentOwnerLabel} requestMode={requestMode} /></Suspense>
  ) : null
);

const AccountArchiveConfirmation = ({ archiveTarget, dialogState, setArchiveTarget, archiveSelectedAccount }) => (
  <ConfirmationModal open={Boolean(archiveTarget)} title={archiveTarget?.preview.canDeleteUnused ? "Hapus rekening belum dipakai?" : "Arsipkan rekening?"}
    description={archiveTarget ? `${archiveTarget.account.name} telah diperiksa ulang oleh server.` : ""}
    confirmLabel={archiveTarget?.preview.canDeleteUnused ? `Hapus permanen ${archiveTarget.account.name}` : "Arsipkan rekening"}
    reasonLabel={archiveTarget?.preview.canDeleteUnused ? "Alasan penghapusan" : "Alasan pengarsipan"} requireReason
    expectedConfirmation={archiveTarget?.preview.canDeleteUnused ? archiveTarget.preview.deleteConfirmation : ""}
    acknowledgementLabel={archiveTarget?.preview.canDeleteUnused ? "Saya memahami rekening ini akan dihapus permanen dan hanya audit yang tetap disimpan." : ""}
    countdownSeconds={archiveTarget?.preview.canDeleteUnused ? 5 : 0} busy={dialogState.status === "submitting"} error={dialogState.error}
    onCancel={() => dialogState.status !== "submitting" && setArchiveTarget(null)} onConfirm={archiveSelectedAccount}>
    {archiveTarget ? <div className={styles.impactSummary}>
      <div><span>Saldo awal</span><strong><Money value={archiveTarget.preview.initialBalance} /></strong></div>
      <div><span>Saldo saat ini</span><strong><Money value={archiveTarget.preview.currentBalance} /></strong></div>
      <div><span>Seluruh transaksi</span><strong>{archiveTarget.preview.dependencies.transactions}</strong></div>
      <div><span>Rekonsiliasi</span><strong>{archiveTarget.preview.dependencies.reconciliations}</strong></div>
      <div><span>Referensi alokasi/tagihan/target</span><strong>{archiveTarget.preview.dependencies.envelopes + archiveTarget.preview.dependencies.recurring + archiveTarget.preview.dependencies.goals}</strong></div>
      <p>{archiveTarget.preview.canDeleteUnused ? "Rekening dapat dihapus permanen. Lengkapi alasan, frasa konfirmasi, dan pernyataan pemahaman di bawah." : "Rekening pernah digunakan atau memiliki histori, sehingga data hanya diarsipkan dan tidak dihapus."}</p>
    </div> : null}
  </ConfirmationModal>
);


const accountUserContext = (usersResource, user) => {
  const activeUsers = (usersResource.data?.items || []).filter((item) => item.status === "active");
  const currentDatabaseUser = activeUsers.find((item) => item.is_current) || null;
  const currentOwnerLabel = currentDatabaseUser?.name || user?.name || "Pengguna aktif";
  return { activeUsers, currentDatabaseUser, currentOwnerLabel };
};

const selectedAccountFrom = (accounts, selectedAccountId) => accounts.find((account) => account.account_id === selectedAccountId) || accounts[0] || null;

const AccountsPageFeedback = ({ accountsResource, usersResource, ownerMode, reloadAccounts, message }) => (
  <>
    <RefreshWarning error={accountsResource.refreshError} onRetry={reloadAccounts} />
    {ownerMode && (usersResource.refreshError || usersResource.status === "error") ? <RefreshWarning error={usersResource.refreshError || usersResource.error} onRetry={usersResource.reload} /> : null}
    {message ? <div className={`notice notice--${message.type}`} role="status">{message.text}</div> : null}
  </>
);

const AccountsPageHeading = ({ accounts, ownerMode, openCreateDialog }) => (
  <div className={styles.desktopPageHeader}><PageHeader title="Rekening"
    description={null}
    help="Rekening menampilkan saldo, dana yang dialokasikan, dan dana yang masih tersedia. Gunakan Transfer untuk memindahkan dana antar rekening yang valid."
    actions={accounts.length ? <Button variant="primary" icon={FiPlus} onClick={openCreateDialog} aria-label={ownerMode ? "Tambah rekening desktop" : "Ajukan rekening desktop"}>{ownerMode ? "Tambah rekening" : "Ajukan rekening"}</Button> : null} />
  </div>
);


const resolvedAccountUsers = ({ ownerMode, ownerUserContext, bootstrapUser, authUser }) => {
  const currentDatabaseUser = ownerMode ? ownerUserContext.currentDatabaseUser : bootstrapUser || null;
  return {
    currentDatabaseUser,
    activeUsers: ownerMode ? ownerUserContext.activeUsers : currentDatabaseUser ? [currentDatabaseUser] : [],
    currentOwnerLabel: currentDatabaseUser?.name || authUser?.name || ownerUserContext.currentOwnerLabel,
  };
};

const accountUserIdentity = (bootstrapUser, databaseUser, authUser) => ({
  user_id: bootstrapUser?.user_id || databaseUser?.user_id || "",
  name: bootstrapUser?.name || databaseUser?.name || authUser?.name || "",
});

const AccountsPageContent = ({ page }) => {
  const {
    accountsResource, usersResource, ownerMode, reloadAccounts, message, setupCreated, setSetupCreated, navigate, accounts, requestsResource, requestReview,
    mobileLayout, visibleAccounts, selectedAccount, selectedAccountId, ownershipFilter, setOwnershipFilter, crud, lifecycle, setMobileAccountSheet,
    mobileAccountSheet, bootstrap, editAccount, setEditAccount, accountForm, setAccountForm, dialogState, activeUsers, currentDatabaseUser, currentOwnerLabel,
    archiveTarget, setArchiveTarget,
  } = page;
  return <div className={`page-stack ${styles.accountsPage}`}>
    <AccountsPageFeedback accountsResource={accountsResource} usersResource={usersResource} ownerMode={ownerMode} reloadAccounts={reloadAccounts} message={message} />
    {setupCreated ? <div><CompactNotice tone="success" title="Rekening siap." role="status">Lanjutkan penyiapan agar transaksi harian langsung siap digunakan.</CompactNotice><div className="form-actions"><Button type="button" onClick={() => setSetupCreated(false)}>Selesai</Button><Button type="button" variant="primary" onClick={() => navigate("/kategori", { state: { setupFlow: true } })}>Lanjut siapkan kategori</Button></div></div> : null}
    <AccountsPageHeading accounts={accounts} ownerMode={ownerMode} openCreateDialog={crud.openCreateDialog} />
    {requestsResource.status === "error" ? <RefreshWarning error={requestsResource.error} onRetry={requestsResource.reload} /> : <MasterDataRequestsPanel items={requestsResource.data?.items || []} ownerMode={ownerMode} title={ownerMode ? "Pengajuan rekening" : "Pengajuan rekening saya"} busyId={requestReview.busyId} onApprove={(request) => requestReview.reviewRequest(request, "approve")} onReject={(request, reason) => requestReview.reviewRequest(request, "reject", reason)} />}
    <AccountListSection mobileLayout={mobileLayout} accounts={visibleAccounts} allAccounts={accounts} selectedAccount={selectedAccount} selectedAccountId={selectedAccountId} ownershipFilter={ownershipFilter} setOwnershipFilter={setOwnershipFilter} ownerMode={ownerMode} openCreateDialog={crud.openCreateDialog} setMobileAccountSheet={setMobileAccountSheet}
      navigate={navigate} bootstrap={bootstrap} setSelectedAccountId={page.setSelectedAccountId} openEditAccount={crud.openEditAccount} openAccountLifecycle={lifecycle.openAccountLifecycle} onTransferSaved={reloadAccounts} />
    {mobileLayout ? <AccountSheets mobileAccountSheet={mobileAccountSheet} setMobileAccountSheet={setMobileAccountSheet} selectedAccount={selectedAccount} ownerMode={ownerMode}
      navigate={navigate} openEditAccount={crud.openEditAccount} openAccountLifecycle={lifecycle.openAccountLifecycle} /> : null}
    <AccountEditors createDialogOpen={crud.createDialogOpen} editAccount={editAccount} closeCreateDialog={crud.closeCreateDialog} accountForm={accountForm} setAccountForm={setAccountForm}
      createAccount={crud.createAccount} setEditAccount={setEditAccount} saveAccount={crud.saveAccount} dialogState={dialogState} activeUsers={activeUsers}
      currentDatabaseUser={currentDatabaseUser} currentOwnerLabel={currentOwnerLabel} requestMode={!ownerMode} />
    <AccountArchiveConfirmation archiveTarget={archiveTarget} dialogState={dialogState} setArchiveTarget={setArchiveTarget} archiveSelectedAccount={lifecycle.archiveSelectedAccount} />
  </div>;
};

const AccountsPage = () => {
  const { notify } = useFeedback();
  const navigate = useNavigate();
  const location = useLocation();
  const accountsResource = useApiResource("accounts.list");
  const { bootstrap, refreshAll, invalidate } = useFinance();
  const { user } = useAuth();
  const ownerMode = user?.role === "owner";
  const mobileLayout = useMobileAccountsLayout();
  const usersResource = useApiResource("users.list", {}, { enabled: ownerMode });
  const requestsResource = useApiResource("masterDataRequests.list", { request_type: "account" });
  const [accountForm, setAccountForm] = useState(emptyAccountForm);
  const [message, setMessage] = useState(null);
  const [editAccount, setEditAccount] = useState(null);
  const [dialogState, setDialogState] = useState({ status: "idle", error: null });
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [mobileAccountSheet, setMobileAccountSheet] = useState(null);
  const [ownershipFilter, setOwnershipFilter] = useState("all");
  const [setupCreated, setSetupCreated] = useState(false);
  const accounts = accountsResource.data?.items ?? EMPTY_ACCOUNTS;
  const reloadAccounts = async () => {
    invalidate(["accounts.list", "transactions.list", "envelopes.list", "recurring.list", "goals.list", "reports.monthly", "reconciliations.list", "dashboard.overview", "app.initialState", "archive.list"]);
    const [accountsResult, financeResult] = await Promise.allSettled([accountsResource.reload(), refreshAll()]);
    return { accountsResult, financeResult };
  };
  const crud = useAccountCrudActions({ accountForm, setAccountForm, editAccount, setEditAccount, dialogState, setDialogState, notify, reloadAccounts, reloadRequests: requestsResource.reload, ownerMode, onCreated: () => { if (location.state?.setupFlow) setSetupCreated(true); } });
  const lifecycle = useAccountLifecycleActions({ archiveTarget, setArchiveTarget, setDialogState, setMessage, notify, reloadAccounts });
  const ownerUserContext = accountUserContext(usersResource, user);
  const { currentDatabaseUser, activeUsers, currentOwnerLabel } = resolvedAccountUsers({
    ownerMode, ownerUserContext, bootstrapUser: bootstrap?.user, authUser: user,
  });
  const requestReview = useMasterDataRequestReview({
    requestsResource, reloadApproved: reloadAccounts, notify, entityLabel: "rekening", dedupePrefix: "accounts:request",
  });
  const currentAccountUser = useMemo(
    () => accountUserIdentity(bootstrap?.user, currentDatabaseUser, user),
    [bootstrap?.user, currentDatabaseUser, user],
  );
  const visibleAccounts = useMemo(() => filterAccountsByOwnership(accounts, ownershipFilter, currentAccountUser), [accounts, currentAccountUser, ownershipFilter]);
  useEffect(() => {
    if (!visibleAccounts.length) { setSelectedAccountId(""); setMobileAccountSheet(null); return; }
    if (!visibleAccounts.some((account) => account.account_id === selectedAccountId)) setSelectedAccountId(visibleAccounts[0].account_id);
  }, [selectedAccountId, visibleAccounts]);
  if (accountsResource.status === "loading") return <LoadingScreen variant="content" label="Memuat rekening..." />;
  if (accountsResource.status === "error") return <ErrorState error={accountsResource.error} onRetry={accountsResource.reload} />;
  const selectedAccount = selectedAccountFrom(visibleAccounts, selectedAccountId);
  return <AccountsPageContent page={{
    accountsResource, usersResource, ownerMode, reloadAccounts, message, setupCreated, setSetupCreated, navigate, accounts, requestsResource, requestReview,
    mobileLayout, visibleAccounts, selectedAccount, selectedAccountId, ownershipFilter, setOwnershipFilter, crud, lifecycle, setMobileAccountSheet,
    mobileAccountSheet, bootstrap, setSelectedAccountId, editAccount, setEditAccount, accountForm, setAccountForm, dialogState, activeUsers, currentDatabaseUser,
    currentOwnerLabel, archiveTarget, setArchiveTarget,
  }} />;
};

export default AccountsPage;
