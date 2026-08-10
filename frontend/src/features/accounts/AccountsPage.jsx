import { lazy, Suspense, useEffect, useState } from "react";
import { FiPlus } from "react-icons/fi";
import { useNavigate } from "react-router";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import Money from "../../components/common/Money.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import LoadingScreen from "../../components/feedback/LoadingScreen.jsx";
import { useFeedback } from "../../components/feedback/feedbackContext.js";
import { useApiResource } from "../../hooks/useApiResource.js";
import {
  archiveAccount,
  createAccount as requestCreateAccount,
  deleteUnusedAccount,
  previewAccountLifecycle,
  updateAccount as requestUpdateAccount,
} from "./accounts.api.js";
import { useFinance } from "../../app/FinanceContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { todayInJakarta } from "../../domain/dates.js";
import { accountCardholderName, detectBankTemplate, detectEwalletTemplate } from "../../shared/presentation/account.js";
import styles from "./AccountsPage.module.css";

const MobileAccountSheets = lazy(() => import("./components/MobileAccountSheets.jsx"));
const MobileAccountsExperience = lazy(() => import("./components/MobileAccountsExperience.jsx"));
const DesktopAccountsWorkspace = lazy(() => import("./components/DesktopAccountsWorkspace.jsx"));
const AccountEditorDialogs = lazy(() => import("./components/AccountEditorDialogs.jsx"));

const EMPTY_ACCOUNTS = Object.freeze([]);

const emptyAccountForm = () => ({
  name: "", account_type: "bank", bank_template: "generic", ewallet_template: "generic", account_number: "", owner_scope: "shared", owner_user_id: "",
  initial_balance: "", initial_balance_date: todayInJakarta(), allow_negative: false,
});

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

const useAccountCrudActions = ({ accountForm, setAccountForm, editAccount, setEditAccount, dialogState, setDialogState, notify, reloadAccounts }) => {
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
      await requestCreateAccount({ ...accountForm, initial_balance: Number(accountForm.initial_balance || 0) }, {});
      setAccountForm(emptyAccountForm());
      setCreateDialogOpen(false);
      setDialogState({ status: "idle", error: null });
      notify({ message: "Rekening berhasil dibuat dan daftar telah diperbarui.", tone: "success", dedupeKey: "accounts:create" });
      await reloadAccounts();
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
          : "Rekening berhasil diarsipkan dan dapat dipulihkan oleh owner.",
        tone: "success", dedupeKey: preview.canDeleteUnused ? "accounts:delete-unused" : "accounts:archive",
      });
      await reloadAccounts();
    } catch (error) { setDialogState({ status: "error", error }); }
  };
  return { openAccountLifecycle, archiveSelectedAccount };
};

const AccountListSection = ({ accounts, selectedAccount, selectedAccountId, ownerMode, openCreateDialog, setMobileAccountSheet, navigate, bootstrap, setSelectedAccountId, openEditAccount, openAccountLifecycle, onTransferSaved }) => (
  <section aria-labelledby="account-list-title" className={styles.accountSection}>
    <div className={styles.sectionHeading}><div><p className="eyebrow">Rekening aktif</p><h2 id="account-list-title">Tempat uang tersimpan</h2></div><span>{accounts.length} rekening</span></div>
    {accounts.length ? <>
      <Suspense fallback={null}><MobileAccountsExperience accounts={accounts} selectedAccount={selectedAccount} selectedAccountId={selectedAccountId} ownerMode={ownerMode}
        openCreateDialog={openCreateDialog} setMobileAccountSheet={setMobileAccountSheet} setSelectedAccountId={setSelectedAccountId} bootstrap={bootstrap} onTransferSaved={onTransferSaved} /></Suspense>
      <Suspense fallback={null}><DesktopAccountsWorkspace accounts={accounts} selectedAccount={selectedAccount} ownerMode={ownerMode} bootstrap={bootstrap}
        onSelectAccount={setSelectedAccountId} onViewTransactions={(item) => navigate("/transaksi", { state: { accountId: item.account_id } })}
        onEditAccount={openEditAccount} onArchiveAccount={openAccountLifecycle} /></Suspense>
    </> : <Card className={styles.emptyPanel}><h2>Belum ada rekening</h2><p>Tambahkan rekening bank, tunai, e-wallet, atau tabungan agar saldo dapat dihitung.</p>{ownerMode ? <Button variant="primary" icon={FiPlus} onClick={openCreateDialog}>Tambah rekening</Button> : null}</Card>}
  </section>
);

const AccountSheets = ({ mobileAccountSheet, setMobileAccountSheet, accounts, selectedAccount, ownerMode, setSelectedAccountId, navigate, openEditAccount, openAccountLifecycle }) => {
  if (!mobileAccountSheet) return null;
  return <Suspense fallback={null}><MobileAccountSheets sheet={mobileAccountSheet} accounts={accounts} selectedAccount={selectedAccount} ownerMode={ownerMode}
    onClose={() => setMobileAccountSheet(null)}
    onSelectAccount={(accountId) => { setSelectedAccountId(accountId); setMobileAccountSheet(null); }}
    onViewTransactions={(item) => { if (!item) return; setMobileAccountSheet(null); navigate("/transaksi", { state: { accountId: item.account_id } }); }}
    onEditAccount={(item) => { setMobileAccountSheet(null); openEditAccount(item); }} onArchiveAccount={(item) => { setMobileAccountSheet(null); openAccountLifecycle(item); }} /></Suspense>;
};

const AccountEditors = ({ createDialogOpen, editAccount, closeCreateDialog, accountForm, setAccountForm, createAccount, setEditAccount, saveAccount, dialogState, activeUsers, currentDatabaseUser, currentOwnerLabel }) => (
  (createDialogOpen || editAccount) ? (
    <Suspense fallback={null}><AccountEditorDialogs createDialogOpen={createDialogOpen} onCloseCreate={closeCreateDialog} accountForm={accountForm} setAccountForm={setAccountForm}
      onCreateAccount={createAccount} editAccount={editAccount} setEditAccount={setEditAccount} onSaveAccount={saveAccount} dialogState={dialogState}
      activeUsers={activeUsers} currentDatabaseUser={currentDatabaseUser} currentOwnerLabel={currentOwnerLabel} /></Suspense>
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
      <div><span>Referensi kantong/tagihan/target</span><strong>{archiveTarget.preview.dependencies.envelopes + archiveTarget.preview.dependencies.recurring + archiveTarget.preview.dependencies.goals}</strong></div>
      <p>{archiveTarget.preview.canDeleteUnused ? "Data rekening sudah lolos guard server. Lengkapi alasan, frasa konfirmasi, dan pernyataan pemahaman di bawah. Backend tetap membaca ulang data tepat sebelum DELETE." : "Rekening pernah digunakan atau memiliki histori, sehingga data hanya diarsipkan dan tidak dihapus."}</p>
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
    description={<><span className={styles.mobileAccountCount}>{accounts.length} rekening aktif</span><span className={styles.desktopAccountDescription}>Pantau seluruh rekening bersama dan pribadi secara transparan. Hak tindakan tetap mengikuti pemilik dan peran pengguna.</span></>}
    actions={ownerMode ? <Button variant="primary" icon={FiPlus} onClick={openCreateDialog} aria-label="Tambah rekening desktop">Tambah rekening</Button> : null} />
  </div>
);

const AccountsPage = () => {
  const { notify } = useFeedback();
  const navigate = useNavigate();
  const accountsResource = useApiResource("accounts.list");
  const { bootstrap, refreshAll, invalidate } = useFinance();
  const { user } = useAuth();
  const ownerMode = user?.role === "owner";
  const usersResource = useApiResource("users.list", {}, { enabled: ownerMode });
  const [accountForm, setAccountForm] = useState(emptyAccountForm);
  const [message, setMessage] = useState(null);
  const [editAccount, setEditAccount] = useState(null);
  const [dialogState, setDialogState] = useState({ status: "idle", error: null });
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [mobileAccountSheet, setMobileAccountSheet] = useState(null);
  const accounts = accountsResource.data?.items ?? EMPTY_ACCOUNTS;
  const reloadAccounts = async () => {
    invalidate(["accounts.list", "transactions.list", "envelopes.list", "recurring.list", "goals.list", "reports.monthly", "reconciliations.list", "dashboard.overview", "app.initialState", "archive.list"]);
    const [accountsResult, financeResult] = await Promise.allSettled([accountsResource.reload(), refreshAll()]);
    return { accountsResult, financeResult };
  };
  const crud = useAccountCrudActions({ accountForm, setAccountForm, editAccount, setEditAccount, dialogState, setDialogState, notify, reloadAccounts });
  const lifecycle = useAccountLifecycleActions({ archiveTarget, setArchiveTarget, setDialogState, setMessage, notify, reloadAccounts });
  useEffect(() => {
    if (!accounts.length) { setSelectedAccountId(""); setMobileAccountSheet(null); return; }
    if (!accounts.some((account) => account.account_id === selectedAccountId)) setSelectedAccountId(accounts[0].account_id);
  }, [accounts, selectedAccountId]);
  if (accountsResource.status === "loading") return <LoadingScreen label="Memuat rekening..." />;
  if (accountsResource.status === "error") return <ErrorState error={accountsResource.error} onRetry={accountsResource.reload} />;
  const { activeUsers, currentDatabaseUser, currentOwnerLabel } = accountUserContext(usersResource, user);
  const selectedAccount = selectedAccountFrom(accounts, selectedAccountId);
  return <div className={`page-stack ${styles.accountsPage}`}>
    <AccountsPageFeedback accountsResource={accountsResource} usersResource={usersResource} ownerMode={ownerMode} reloadAccounts={reloadAccounts} message={message} />
    <AccountsPageHeading accounts={accounts} ownerMode={ownerMode} openCreateDialog={crud.openCreateDialog} />
    <AccountListSection accounts={accounts} selectedAccount={selectedAccount} selectedAccountId={selectedAccountId} ownerMode={ownerMode} openCreateDialog={crud.openCreateDialog} setMobileAccountSheet={setMobileAccountSheet}
      navigate={navigate} bootstrap={bootstrap} setSelectedAccountId={setSelectedAccountId} openEditAccount={crud.openEditAccount} openAccountLifecycle={lifecycle.openAccountLifecycle} onTransferSaved={reloadAccounts} />
    <AccountSheets mobileAccountSheet={mobileAccountSheet} setMobileAccountSheet={setMobileAccountSheet} accounts={accounts} selectedAccount={selectedAccount} ownerMode={ownerMode}
      setSelectedAccountId={setSelectedAccountId} navigate={navigate} openEditAccount={crud.openEditAccount} openAccountLifecycle={lifecycle.openAccountLifecycle} />
    <AccountEditors createDialogOpen={crud.createDialogOpen} editAccount={editAccount} closeCreateDialog={crud.closeCreateDialog} accountForm={accountForm} setAccountForm={setAccountForm}
      createAccount={crud.createAccount} setEditAccount={setEditAccount} saveAccount={crud.saveAccount} dialogState={dialogState} activeUsers={activeUsers}
      currentDatabaseUser={currentDatabaseUser} currentOwnerLabel={currentOwnerLabel} />
    <AccountArchiveConfirmation archiveTarget={archiveTarget} dialogState={dialogState} setArchiveTarget={setArchiveTarget} archiveSelectedAccount={lifecycle.archiveSelectedAccount} />
  </div>;
};

export default AccountsPage;
