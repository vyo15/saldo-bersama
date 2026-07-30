import { useState } from "react";
import { FiArchive, FiCheckCircle, FiCreditCard, FiDollarSign, FiEdit2, FiPlus, FiShield, FiSmartphone } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import Modal from "../../components/common/Modal.jsx";
import Money from "../../components/common/Money.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import StatusBadge from "../../components/common/StatusBadge.jsx";
import ErrorState from "../../components/feedback/ErrorState.jsx";
import LoadingScreen from "../../components/feedback/LoadingScreen.jsx";
import { useApiResource } from "../../hooks/useApiResource.js";
import { apiClient } from "../../services/api/client.js";
import { useFinance } from "../../app/FinanceContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { createIdempotencyKey } from "../../domain/security.js";
import { todayInJakarta } from "../../domain/dates.js";
import { parseRupiah } from "../../domain/money.js";

const ICONS = { bank: FiCreditCard, cash: FiDollarSign, ewallet: FiSmartphone, emergency_fund: FiShield };
const emptyAccountForm = () => ({ name: "", account_type: "bank", owner_scope: "shared", initial_balance: "", initial_balance_date: todayInJakarta(), allow_negative: false });
const emptyCategoryForm = { name: "", transaction_type: "expense", nature: "variable" };

const AccountsPage = () => {
  const accountsResource = useApiResource("accounts.list");
  const categoriesResource = useApiResource("categories.list");
  const { refresh } = useFinance();
  const { user } = useAuth();
  const ownerMode = user?.role === "owner";
  const [accountForm, setAccountForm] = useState(emptyAccountForm);
  const [categoryForm, setCategoryForm] = useState(emptyCategoryForm);
  const [message, setMessage] = useState(null);
  const [editAccount, setEditAccount] = useState(null);
  const [editCategory, setEditCategory] = useState(null);
  const [reconciliation, setReconciliation] = useState({ account: null, actual_balance: "", notes: "Cocokkan dengan mutasi bank/tunai" });
  const [dialogState, setDialogState] = useState({ status: "idle", error: null });
  const [archiveTarget, setArchiveTarget] = useState(null);

  const reloadMasters = async () => Promise.all([accountsResource.reload(), categoriesResource.reload(), refresh()]);

  const createAccount = async (event) => {
    event.preventDefault();
    try {
      await apiClient.request("accounts.create", { ...accountForm, initial_balance: Number(accountForm.initial_balance || 0) }, { idempotencyKey: createIdempotencyKey() });
      setAccountForm(emptyAccountForm());
      setMessage({ type: "success", text: "Rekening berhasil dibuat." });
      await reloadMasters();
    } catch (error) { setMessage({ type: "danger", text: error.message }); }
  };

  const saveAccount = async (event) => {
    event.preventDefault();
    if (!editAccount) return;
    setDialogState({ status: "submitting", error: null });
    try {
      await apiClient.request("accounts.update", {
        account_id: editAccount.account_id,
        name: editAccount.name,
        owner_scope: editAccount.owner_scope,
        allow_negative: Boolean(editAccount.allow_negative),
        row_version: editAccount.row_version,
      }, { rowVersion: editAccount.row_version, idempotencyKey: createIdempotencyKey() });
      setEditAccount(null);
      setDialogState({ status: "idle", error: null });
      setMessage({ type: "success", text: "Rekening berhasil diperbarui." });
      await reloadMasters();
    } catch (error) { setDialogState({ status: "error", error }); }
  };

  const saveReconciliation = async (event) => {
    event.preventDefault();
    if (!reconciliation.account) return;
    setDialogState({ status: "submitting", error: null });
    try {
      const result = await apiClient.request("reconciliations.create", {
        account_id: reconciliation.account.account_id,
        actual_balance: parseRupiah(reconciliation.actual_balance),
        notes: reconciliation.notes,
      }, { idempotencyKey: createIdempotencyKey() });
      setReconciliation({ account: null, actual_balance: "", notes: "Cocokkan dengan mutasi bank/tunai" });
      setDialogState({ status: "idle", error: null });
      setMessage({ type: result.difference === 0 ? "success" : "warning", text: result.difference === 0 ? "Saldo cocok dan rekonsiliasi tercatat." : `Ada selisih ${result.difference}. Cari transaksi tertinggal atau buat penyesuaian beralasan.` });
    } catch (error) { setDialogState({ status: "error", error }); }
  };

  const createCategory = async (event) => {
    event.preventDefault();
    try {
      await apiClient.request("categories.create", categoryForm, { idempotencyKey: createIdempotencyKey() });
      setCategoryForm(emptyCategoryForm);
      setMessage({ type: "success", text: "Kategori berhasil dibuat." });
      await reloadMasters();
    } catch (error) { setMessage({ type: "danger", text: error.message }); }
  };

  const saveCategory = async (event) => {
    event.preventDefault();
    if (!editCategory) return;
    setDialogState({ status: "submitting", error: null });
    try {
      await apiClient.request("categories.update", {
        category_id: editCategory.category_id,
        name: editCategory.name,
        nature: editCategory.nature,
        row_version: editCategory.row_version,
      }, { rowVersion: editCategory.row_version, idempotencyKey: createIdempotencyKey() });
      setEditCategory(null);
      setDialogState({ status: "idle", error: null });
      setMessage({ type: "success", text: "Kategori berhasil diperbarui." });
      await reloadMasters();
    } catch (error) { setDialogState({ status: "error", error }); }
  };

  const archiveMaster = async () => {
    if (!archiveTarget) return;
    setDialogState({ status: "submitting", error: null });
    const account = archiveTarget.kind === "account";
    try {
      await apiClient.request(account ? "accounts.archive" : "categories.archive", account ? {
        account_id: archiveTarget.item.account_id,
        row_version: archiveTarget.item.row_version,
      } : {
        category_id: archiveTarget.item.category_id,
        row_version: archiveTarget.item.row_version,
      }, { rowVersion: archiveTarget.item.row_version, idempotencyKey: createIdempotencyKey() });
      setArchiveTarget(null);
      setDialogState({ status: "idle", error: null });
      setMessage({ type: "success", text: `${account ? "Rekening" : "Kategori"} berhasil diarsipkan.` });
      await reloadMasters();
    } catch (error) { setDialogState({ status: "error", error }); }
  };

  if (accountsResource.status === "loading" || categoriesResource.status === "loading") return <LoadingScreen label="Memuat rekening dan kategori..." />;
  if (accountsResource.status === "error") return <ErrorState error={accountsResource.error} onRetry={accountsResource.reload} />;
  if (categoriesResource.status === "error") return <ErrorState error={categoriesResource.error} onRetry={categoriesResource.reload} />;

  const accounts = accountsResource.data?.items || [];
  const categories = categoriesResource.data?.items || [];

  return (
    <div className="page-stack">
      <PageHeader title="Rekening & kategori" description="Saldo berjalan dihitung dari saldo awal dan transaksi aktif; tidak dapat diedit bebas." />
      {message ? <div className={`notice notice--${message.type}`} role="status">{message.text}</div> : null}
      <section className="account-grid">
        {accounts.map((account) => {
          const Icon = ICONS[account.account_type] || FiCreditCard;
          return (
            <Card className="account-card" key={account.account_id}>
              <Icon />
              <div><h2>{account.name}</h2><small>{account.account_type} · {account.owner_scope}</small></div>
              <Money value={account.balance} />
              <StatusBadge status={account.status} />
              <div className="button-group">
                {account.status === "active" ? <Button icon={FiCheckCircle} onClick={() => { setReconciliation({ account, actual_balance: String(account.balance || 0), notes: "Cocokkan dengan mutasi bank/tunai" }); setDialogState({ status: "idle", error: null }); }}>Rekonsiliasi</Button> : null}
                {ownerMode && account.status === "active" ? <button type="button" className="icon-button" onClick={() => { setEditAccount({ ...account }); setDialogState({ status: "idle", error: null }); }} aria-label={`Edit rekening ${account.name}`}><FiEdit2 /></button> : null}
                {ownerMode && account.status === "active" ? <button type="button" className="icon-button icon-button--danger" onClick={() => { setArchiveTarget({ kind: "account", item: account }); setDialogState({ status: "idle", error: null }); }} aria-label={`Arsipkan rekening ${account.name}`}><FiArchive /></button> : null}
              </div>
            </Card>
          );
        })}
      </section>

      {ownerMode ? (
        <section className="two-column-grid">
          <Card className="panel">
            <div className="panel__header"><div><p className="eyebrow">Master rekening</p><h2>Tambah rekening</h2></div></div>
            <form className="form-grid" onSubmit={createAccount}>
              <label className="field form-grid__full"><span>Nama rekening *</span><input required maxLength="100" value={accountForm.name} onChange={(event) => setAccountForm((current) => ({ ...current, name: event.target.value }))} /></label>
              <label className="field"><span>Jenis</span><select value={accountForm.account_type} onChange={(event) => setAccountForm((current) => ({ ...current, account_type: event.target.value }))}><option value="bank">Bank</option><option value="cash">Tunai</option><option value="ewallet">E-wallet</option><option value="savings">Tabungan</option><option value="emergency_fund">Dana darurat</option><option value="sinking_fund">Dana berkala</option></select></label>
              <label className="field"><span>Kepemilikan</span><select value={accountForm.owner_scope} onChange={(event) => setAccountForm((current) => ({ ...current, owner_scope: event.target.value }))}><option value="shared">Bersama</option><option value="personal">Pribadi saya</option></select></label>
              <MoneyInput id="initial-balance" label="Saldo awal" value={accountForm.initial_balance} onChange={(value) => setAccountForm((current) => ({ ...current, initial_balance: value }))} />
              <label className="field"><span>Tanggal saldo awal</span><input type="date" value={accountForm.initial_balance_date} onChange={(event) => setAccountForm((current) => ({ ...current, initial_balance_date: event.target.value }))} /></label>
              <label className="checkbox-field form-grid__full"><input type="checkbox" checked={accountForm.allow_negative} onChange={(event) => setAccountForm((current) => ({ ...current, allow_negative: event.target.checked }))} /><span>Izinkan saldo negatif</span></label>
              <div className="form-grid__full form-actions"><Button variant="primary" icon={FiPlus} type="submit">Tambah rekening</Button></div>
            </form>
          </Card>

          <Card className="panel">
            <div className="panel__header"><div><p className="eyebrow">Master kategori</p><h2>Tambah kategori</h2></div></div>
            <form className="form-grid" onSubmit={createCategory}>
              <label className="field form-grid__full"><span>Nama kategori *</span><input required maxLength="80" value={categoryForm.name} onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))} /></label>
              <label className="field"><span>Jenis</span><select value={categoryForm.transaction_type} onChange={(event) => setCategoryForm((current) => ({ ...current, transaction_type: event.target.value }))}><option value="expense">Pengeluaran</option><option value="income">Pemasukan</option></select></label>
              <label className="field"><span>Sifat</span><select value={categoryForm.nature} onChange={(event) => setCategoryForm((current) => ({ ...current, nature: event.target.value }))}><option value="fixed">Tetap</option><option value="variable">Variabel</option><option value="unexpected">Tidak terduga</option><option value="discretionary">Keinginan</option><option value="emergency">Darurat</option></select></label>
              <div className="form-grid__full form-actions"><Button variant="primary" icon={FiPlus} type="submit">Tambah kategori</Button></div>
            </form>
            <div className="compact-list compact-list--stacked">{categories.map((category) => <div key={category.category_id}><span><strong>{category.name}</strong><small>{category.transaction_type} · {category.nature}</small></span><span><StatusBadge status={category.status} />{category.status === "active" ? <span className="button-group"><button type="button" className="icon-button" onClick={() => { setEditCategory({ ...category }); setDialogState({ status: "idle", error: null }); }} aria-label={`Edit kategori ${category.name}`}><FiEdit2 /></button><button type="button" className="icon-button icon-button--danger" onClick={() => { setArchiveTarget({ kind: "category", item: category }); setDialogState({ status: "idle", error: null }); }} aria-label={`Arsipkan kategori ${category.name}`}><FiArchive /></button></span> : null}</span></div>)}</div>
          </Card>
        </section>
      ) : null}

      <div className="notice notice--info"><strong>Rekonsiliasi disarankan setiap bulan.</strong><span>Jika saldo bank berbeda, cari transaksi yang tertinggal atau buat penyesuaian dengan alasan dan audit.</span></div>

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
          <label className="field"><span>Kepemilikan</span><select value={editAccount?.owner_scope || "shared"} onChange={(event) => setEditAccount((current) => ({ ...current, owner_scope: event.target.value }))}><option value="shared">Bersama</option><option value="personal">Pribadi saya</option></select></label>
          <label className="checkbox-field"><input type="checkbox" checked={Boolean(editAccount?.allow_negative)} onChange={(event) => setEditAccount((current) => ({ ...current, allow_negative: event.target.checked }))} /><span>Izinkan saldo negatif</span></label>
          {dialogState.error ? <div className="notice notice--danger form-grid__full" role="alert">{dialogState.error.message}</div> : null}
        </form>
      </Modal>

      <Modal open={Boolean(editCategory)} onClose={() => dialogState.status !== "submitting" && setEditCategory(null)} title="Edit kategori" description={editCategory ? `Jenis ${editCategory.transaction_type} tetap dipertahankan untuk menjaga konsistensi transaksi.` : ""} footer={<><Button onClick={() => setEditCategory(null)} disabled={dialogState.status === "submitting"}>Batal</Button><Button variant="primary" type="submit" form="edit-category-form" disabled={dialogState.status === "submitting"}>{dialogState.status === "submitting" ? "Menyimpan..." : "Simpan perubahan"}</Button></>}>
        <form id="edit-category-form" className="form-grid" onSubmit={saveCategory}>
          <label className="field form-grid__full"><span>Nama kategori *</span><input required maxLength="80" value={editCategory?.name || ""} onChange={(event) => setEditCategory((current) => ({ ...current, name: event.target.value }))} /></label>
          <label className="field"><span>Sifat</span><select value={editCategory?.nature || "variable"} onChange={(event) => setEditCategory((current) => ({ ...current, nature: event.target.value }))}><option value="fixed">Tetap</option><option value="variable">Variabel</option><option value="unexpected">Tidak terduga</option><option value="discretionary">Keinginan</option><option value="emergency">Darurat</option></select></label>
          {dialogState.error ? <div className="notice notice--danger form-grid__full" role="alert">{dialogState.error.message}</div> : null}
        </form>
      </Modal>

      <ConfirmationModal open={Boolean(archiveTarget)} title={`Arsipkan ${archiveTarget?.kind === "account" ? "rekening" : "kategori"}?`} description={archiveTarget ? `${archiveTarget.item.name} hanya dapat diarsipkan bila tidak memiliki saldo atau referensi aktif.` : ""} confirmLabel="Arsipkan" busy={dialogState.status === "submitting"} error={dialogState.error} onCancel={() => dialogState.status !== "submitting" && setArchiveTarget(null)} onConfirm={archiveMaster} />
    </div>
  );
};

export default AccountsPage;
