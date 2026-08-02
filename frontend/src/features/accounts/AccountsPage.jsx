import { useMemo, useState } from "react";
import { FiArchive, FiEdit2, FiPlus } from "react-icons/fi";
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
import {
  archiveAccount,
  archiveCategory,
  createAccount as requestCreateAccount,
  createCategory as requestCreateCategory,
  createReconciliation,
  updateAccount as requestUpdateAccount,
  updateCategory as requestUpdateCategory,
} from "./accounts.api.js";
import { useFinance } from "../../app/FinanceContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { createIdempotencyKey } from "../../domain/security.js";
import { todayInJakarta } from "../../domain/dates.js";
import { parseRupiah } from "../../domain/money.js";
import AccountFinancialCard from "./components/AccountFinancialCard.jsx";
import { applyBankTemplateToName, BANK_TEMPLATE_OPTIONS } from "./accountPresentation.js";
import styles from "./AccountsPage.module.css";

const emptyAccountForm = () => ({
  name: "",
  account_type: "bank",
  bank_template: "generic",
  owner_scope: "shared",
  initial_balance: "",
  initial_balance_date: todayInJakarta(),
  allow_negative: false,
});

const emptyCategoryForm = () => ({ name: "", transaction_type: "expense", nature: "variable" });

const CATEGORY_TYPE_LABELS = Object.freeze({ income: "Pemasukan", expense: "Pengeluaran", refund: "Pengembalian dana" });
const CATEGORY_NATURE_LABELS = Object.freeze({
  fixed: "Tetap",
  variable: "Variabel",
  unexpected: "Tidak terduga",
  discretionary: "Keinginan",
  emergency: "Darurat",
  savings: "Tabungan",
  other: "Lainnya",
});

const previewBalance = (value) => {
  try { return parseRupiah(value || "0"); } catch { return 0; }
};

const AccountsPage = () => {
  const accountsResource = useApiResource("accounts.list");
  const categoriesResource = useApiResource("categories.list");
  const [showReconciliations, setShowReconciliations] = useState(false);
  const reconciliationsResource = useApiResource("reconciliations.list", { limit: 30 }, { enabled: showReconciliations });
  const { refreshAll, invalidate } = useFinance();
  const { user } = useAuth();
  const ownerMode = user?.role === "owner";
  const [accountForm, setAccountForm] = useState(emptyAccountForm);
  const [categoryForm, setCategoryForm] = useState(emptyCategoryForm);
  const [createDialog, setCreateDialog] = useState({ open: false, mode: "account" });
  const [message, setMessage] = useState(null);
  const [editAccount, setEditAccount] = useState(null);
  const [editCategory, setEditCategory] = useState(null);
  const [reconciliation, setReconciliation] = useState({ account: null, actual_balance: "", notes: "Cocokkan dengan mutasi bank/tunai" });
  const [dialogState, setDialogState] = useState({ status: "idle", error: null });
  const [archiveTarget, setArchiveTarget] = useState(null);

  const reloadMasters = async () => {
    invalidate([
      "accounts.list",
      "categories.list",
      "transactions.list",
      "envelopes.list",
      "recurring.list",
      "goals.list",
      "reports.monthly",
      "reconciliations.list",
      "dashboard.overview",
      "app.initialState",
    ]);
    return Promise.all([accountsResource.reload(), categoriesResource.reload(), refreshAll()]);
  };

  const openCreateDialog = (mode = "account") => {
    setDialogState({ status: "idle", error: null });
    setCreateDialog({ open: true, mode });
  };

  const closeCreateDialog = () => {
    if (dialogState.status === "submitting") return;
    setCreateDialog((current) => ({ ...current, open: false }));
    setDialogState({ status: "idle", error: null });
  };

  const createAccount = async (event) => {
    event.preventDefault();
    setDialogState({ status: "submitting", error: null });
    try {
      const { bank_template: _bankTemplate, ...payload } = accountForm;
      await requestCreateAccount({ ...payload, initial_balance: Number(accountForm.initial_balance || 0) }, { idempotencyKey: createIdempotencyKey() });
      setAccountForm(emptyAccountForm());
      setCreateDialog({ open: false, mode: "account" });
      setDialogState({ status: "idle", error: null });
      setMessage({ type: "success", text: "Rekening berhasil dibuat dan daftar telah diperbarui." });
      await reloadMasters();
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
      const result = await createReconciliation({
        account_id: reconciliation.account.account_id,
        actual_balance: parseRupiah(reconciliation.actual_balance),
        notes: reconciliation.notes,
      }, { idempotencyKey: createIdempotencyKey() });
      setReconciliation({ account: null, actual_balance: "", notes: "Cocokkan dengan mutasi bank/tunai" });
      setDialogState({ status: "idle", error: null });
      setMessage({ type: result.difference === 0 ? "success" : "warning", text: result.difference === 0 ? "Saldo cocok dan rekonsiliasi tercatat." : `Ada selisih ${result.difference}. Cari transaksi tertinggal atau buat penyesuaian beralasan.` });
      invalidate(["reconciliations.list", "dashboard.overview", "app.initialState"]);
      await Promise.all([showReconciliations ? reconciliationsResource.reload() : Promise.resolve(), refreshAll()]);
    } catch (error) { setDialogState({ status: "error", error }); }
  };

  const createCategory = async (event) => {
    event.preventDefault();
    setDialogState({ status: "submitting", error: null });
    try {
      await requestCreateCategory(categoryForm, { idempotencyKey: createIdempotencyKey() });
      setCategoryForm(emptyCategoryForm());
      setCreateDialog({ open: false, mode: "category" });
      setDialogState({ status: "idle", error: null });
      setMessage({ type: "success", text: "Kategori berhasil dibuat dan daftar telah diperbarui." });
      await reloadMasters();
    } catch (error) { setDialogState({ status: "error", error }); }
  };

  const saveCategory = async (event) => {
    event.preventDefault();
    if (!editCategory) return;
    setDialogState({ status: "submitting", error: null });
    try {
      await requestUpdateCategory({
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
      const archiveRequest = account ? archiveAccount : archiveCategory;
      await archiveRequest(account ? {
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

  const groupedCategories = useMemo(() => categoriesResource.data?.items?.reduce((groups, category) => {
    const key = category.transaction_type || "other";
    groups[key] ||= [];
    groups[key].push(category);
    return groups;
  }, {}) || {}, [categoriesResource.data]);

  if (accountsResource.status === "loading" || categoriesResource.status === "loading") return <LoadingScreen label="Memuat rekening dan kategori..." />;
  if (accountsResource.status === "error") return <ErrorState error={accountsResource.error} onRetry={accountsResource.reload} />;
  if (categoriesResource.status === "error") return <ErrorState error={categoriesResource.error} onRetry={categoriesResource.reload} />;

  const accounts = accountsResource.data?.items || [];
  const categories = categoriesResource.data?.items || [];
  const activeCreateForm = createDialog.mode === "account" ? "create-account-form" : "create-category-form";
  const accountPreview = {
    name: accountForm.name || (accountForm.bank_template !== "generic" ? BANK_TEMPLATE_OPTIONS.find((option) => option.value === accountForm.bank_template)?.label : "Nama rekening"),
    account_type: accountForm.account_type,
    owner_scope: accountForm.owner_scope,
    balance: previewBalance(accountForm.initial_balance),
    status: "active",
  };

  return (
    <div className="page-stack">
      <RefreshWarning error={accountsResource.refreshError || categoriesResource.refreshError} onRetry={reloadMasters} />
      <PageHeader
        title="Rekening & kategori"
        description="Saldo berjalan dihitung dari saldo awal dan transaksi aktif; tidak dapat diedit bebas."
        actions={ownerMode ? <Button variant="primary" icon={FiPlus} onClick={() => openCreateDialog("account")} aria-label="Tambah rekening atau kategori">Tambah</Button> : null}
      />
      {message ? <div className={`notice notice--${message.type}`} role="status">{message.text}</div> : null}

      <section aria-labelledby="account-list-title" className={styles.accountSection}>
        <div className={styles.sectionHeading}>
          <div><p className="eyebrow">Rekening aktif</p><h2 id="account-list-title">Tempat uang tersimpan</h2></div>
          <span>{accounts.length} rekening</span>
        </div>
        {accounts.length ? (
          <div className={styles.accountGrid}>
            {accounts.map((account) => (
              <AccountFinancialCard
                key={account.account_id}
                account={account}
                ownerMode={ownerMode}
                onReconcile={(item) => { setReconciliation({ account: item, actual_balance: String(item.balance || 0), notes: "Cocokkan dengan mutasi bank/tunai" }); setDialogState({ status: "idle", error: null }); }}
                onEdit={(item) => { setEditAccount({ ...item }); setDialogState({ status: "idle", error: null }); }}
                onArchive={(item) => { setArchiveTarget({ kind: "account", item }); setDialogState({ status: "idle", error: null }); }}
              />
            ))}
          </div>
        ) : (
          <Card className={styles.emptyPanel}>
            <h2>Belum ada rekening</h2>
            <p>Tambahkan rekening bank, tunai, e-wallet, atau tabungan agar saldo dapat dihitung.</p>
            {ownerMode ? <Button variant="primary" icon={FiPlus} onClick={() => openCreateDialog("account")}>Tambah rekening</Button> : null}
          </Card>
        )}
      </section>

      <Card className={`${styles.categoryPanel} panel`}>
        <div className="panel__header">
          <div><p className="eyebrow">Master kategori</p><h2>Kategori transaksi</h2><p>Gunakan kategori yang ringkas agar pencatatan tetap cepat dan laporan mudah dibaca.</p></div>
          {ownerMode ? <Button icon={FiPlus} onClick={() => openCreateDialog("category")}>Tambah kategori</Button> : null}
        </div>
        {categories.length ? (
          <div className={styles.categoryGroups}>
            {Object.entries(groupedCategories).map(([type, items]) => (
              <section className={styles.categoryGroup} key={type} aria-labelledby={`category-${type}`}>
                <h3 id={`category-${type}`}>{CATEGORY_TYPE_LABELS[type] || type}</h3>
                <div className={styles.categoryList}>
                  {items.map((category) => (
                    <article className={styles.categoryItem} key={category.category_id}>
                      <div><strong>{category.name}</strong><small>{CATEGORY_NATURE_LABELS[category.nature] || category.nature}</small></div>
                      <div className={styles.categoryActions}>
                        <StatusBadge status={category.status} />
                        {ownerMode && category.status === "active" ? <button type="button" className="icon-button" onClick={() => { setEditCategory({ ...category }); setDialogState({ status: "idle", error: null }); }} aria-label={`Edit kategori ${category.name}`}><FiEdit2 /></button> : null}
                        {ownerMode && category.status === "active" ? <button type="button" className="icon-button icon-button--danger" onClick={() => { setArchiveTarget({ kind: "category", item: category }); setDialogState({ status: "idle", error: null }); }} aria-label={`Arsipkan kategori ${category.name}`}><FiArchive /></button> : null}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : <p className="empty-inline-message">Belum ada kategori.</p>}
      </Card>

      <div className={`notice notice--info ${styles.reconciliationNotice}`}><strong>Rekonsiliasi disarankan setiap bulan.</strong><span>Jika saldo bank berbeda, cari transaksi yang tertinggal atau buat penyesuaian dengan alasan dan audit.</span></div>

      <Card className="panel">
        <div className="panel__header">
          <div><p className="eyebrow">Riwayat rekonsiliasi</p><h2>Perbandingan saldo sistem dan saldo aktual</h2><p>Riwayat dimuat hanya saat dibuka agar halaman rekening tetap ringan.</p></div>
          <Button onClick={() => setShowReconciliations((current) => !current)}>{showReconciliations ? "Tutup riwayat" : "Muat riwayat"}</Button>
        </div>
        {showReconciliations ? (
          reconciliationsResource.status === "loading"
            ? <p>Memuat riwayat rekonsiliasi...</p>
            : reconciliationsResource.status === "error"
              ? <ErrorState error={reconciliationsResource.error} onRetry={reconciliationsResource.reload} />
              : (reconciliationsResource.data?.items || []).length ? (
                <>
                  <div className="data-table-wrap desktop-data-table"><table className="data-table"><thead><tr><th>Waktu</th><th>Rekening</th><th className="align-right">Sistem</th><th className="align-right">Aktual</th><th className="align-right">Selisih</th><th>Status</th></tr></thead><tbody>{(reconciliationsResource.data?.items || []).map((item) => <tr key={item.reconciliation_id}><td>{item.reconciled_at}</td><td>{item.account_name || item.account_id}</td><td className="align-right"><Money value={item.system_balance} /></td><td className="align-right"><Money value={item.actual_balance} /></td><td className="align-right"><Money value={item.difference} tone={item.difference === 0 ? "positive" : "negative"} /></td><td><StatusBadge status={item.status} /></td></tr>)}</tbody></table></div>
                  <div className="mobile-data-list reconciliation-mobile-list" aria-label="Riwayat rekonsiliasi">
                    {(reconciliationsResource.data?.items || []).map((item) => (
                      <article className="mobile-data-card reconciliation-mobile-card" key={item.reconciliation_id}>
                        <div className="reconciliation-mobile-card__header"><div><strong>{item.account_name || item.account_id}</strong><small>{item.reconciled_at}</small></div><StatusBadge status={item.status} /></div>
                        <dl>
                          <div><dt>Saldo sistem</dt><dd><Money value={item.system_balance} /></dd></div>
                          <div><dt>Saldo aktual</dt><dd><Money value={item.actual_balance} /></dd></div>
                          <div><dt>Selisih</dt><dd><Money value={item.difference} tone={item.difference === 0 ? "positive" : "negative"} /></dd></div>
                        </dl>
                      </article>
                    ))}
                  </div>
                </>
              ) : <p className="empty-inline-message">Belum ada rekonsiliasi.</p>
        ) : null}
      </Card>

      <Modal
        open={createDialog.open}
        onClose={closeCreateDialog}
        title="Tambah data"
        description="Pilih jenis master data yang ingin ditambahkan. Form yang sama digunakan pada desktop dan mobile."
        size="lg"
        footer={<><Button onClick={closeCreateDialog} disabled={dialogState.status === "submitting"}>Batal</Button><Button variant="primary" type="submit" form={activeCreateForm} loading={dialogState.status === "submitting"}>{createDialog.mode === "account" ? "Simpan rekening" : "Simpan kategori"}</Button></>}
      >
        <div className={styles.createTabs} role="tablist" aria-label="Jenis data yang ditambahkan">
          <button type="button" role="tab" aria-selected={createDialog.mode === "account"} className={createDialog.mode === "account" ? styles.activeTab : ""} onClick={() => { setCreateDialog((current) => ({ ...current, mode: "account" })); setDialogState({ status: "idle", error: null }); }}>Rekening</button>
          <button type="button" role="tab" aria-selected={createDialog.mode === "category"} className={createDialog.mode === "category" ? styles.activeTab : ""} onClick={() => { setCreateDialog((current) => ({ ...current, mode: "category" })); setDialogState({ status: "idle", error: null }); }}>Kategori</button>
        </div>

        {createDialog.mode === "account" ? (
          <div className={styles.createAccountLayout}>
            <AccountFinancialCard account={accountPreview} preview templateOverride={accountForm.account_type === "bank" ? accountForm.bank_template : "generic"} />
            <form id="create-account-form" className="form-grid" onSubmit={createAccount}>
              <label className="field form-grid__full"><span>Nama rekening *</span><input required maxLength="100" placeholder="Contoh: Rekening gaji · BNI" value={accountForm.name} onChange={(event) => setAccountForm((current) => ({ ...current, name: event.target.value }))} /></label>
              <label className="field"><span>Jenis</span><select value={accountForm.account_type} onChange={(event) => setAccountForm((current) => ({ ...current, account_type: event.target.value, bank_template: event.target.value === "bank" ? current.bank_template : "generic" }))}><option value="bank">Bank</option><option value="cash">Tunai</option><option value="ewallet">E-wallet</option><option value="savings">Tabungan</option><option value="emergency_fund">Dana darurat</option><option value="sinking_fund">Dana berkala</option><option value="investment">Investasi</option><option value="other">Lainnya</option></select></label>
              <label className="field"><span>Kepemilikan</span><select value={accountForm.owner_scope} onChange={(event) => setAccountForm((current) => ({ ...current, owner_scope: event.target.value }))}><option value="shared">Bersama</option><option value="personal">Pribadi saya</option></select></label>
              {accountForm.account_type === "bank" ? <label className="field form-grid__full"><span>Template kartu bank</span><select value={accountForm.bank_template} onChange={(event) => setAccountForm((current) => ({ ...current, bank_template: event.target.value, name: applyBankTemplateToName(current.name, event.target.value) }))}>{BANK_TEMPLATE_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select><small>Template dikenali dari nama bank pada nama rekening; tidak menyimpan nomor kartu, PIN, CVV, atau masa berlaku.</small></label> : null}
              <MoneyInput id="initial-balance" label="Saldo awal" value={accountForm.initial_balance} onChange={(value) => setAccountForm((current) => ({ ...current, initial_balance: value }))} />
              <label className="field"><span>Tanggal saldo awal</span><input type="date" value={accountForm.initial_balance_date} onChange={(event) => setAccountForm((current) => ({ ...current, initial_balance_date: event.target.value }))} /></label>
              <label className="checkbox-field form-grid__full"><input type="checkbox" checked={accountForm.allow_negative} onChange={(event) => setAccountForm((current) => ({ ...current, allow_negative: event.target.checked }))} /><span>Izinkan saldo negatif</span></label>
              {dialogState.error ? <div className="notice notice--danger form-grid__full" role="alert">{dialogState.error.message}</div> : null}
            </form>
          </div>
        ) : (
          <form id="create-category-form" className="form-grid" onSubmit={createCategory}>
            <label className="field form-grid__full"><span>Nama kategori *</span><input required maxLength="80" placeholder="Contoh: Belanja rumah" value={categoryForm.name} onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))} /></label>
            <label className="field"><span>Jenis</span><select value={categoryForm.transaction_type} onChange={(event) => setCategoryForm((current) => ({ ...current, transaction_type: event.target.value }))}><option value="expense">Pengeluaran</option><option value="income">Pemasukan</option></select></label>
            <label className="field"><span>Sifat</span><select value={categoryForm.nature} onChange={(event) => setCategoryForm((current) => ({ ...current, nature: event.target.value }))}><option value="fixed">Tetap</option><option value="variable">Variabel</option><option value="unexpected">Tidak terduga</option><option value="discretionary">Keinginan</option><option value="emergency">Darurat</option><option value="savings">Tabungan</option><option value="other">Lainnya</option></select></label>
            {dialogState.error ? <div className="notice notice--danger form-grid__full" role="alert">{dialogState.error.message}</div> : null}
          </form>
        )}
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
          <label className="field"><span>Kepemilikan</span><select value={editAccount?.owner_scope || "shared"} onChange={(event) => setEditAccount((current) => ({ ...current, owner_scope: event.target.value }))}><option value="shared">Bersama</option><option value="personal">Pribadi saya</option></select></label>
          <label className="checkbox-field"><input type="checkbox" checked={Boolean(editAccount?.allow_negative)} onChange={(event) => setEditAccount((current) => ({ ...current, allow_negative: event.target.checked }))} /><span>Izinkan saldo negatif</span></label>
          {dialogState.error ? <div className="notice notice--danger form-grid__full" role="alert">{dialogState.error.message}</div> : null}
        </form>
      </Modal>

      <Modal open={Boolean(editCategory)} onClose={() => dialogState.status !== "submitting" && setEditCategory(null)} title="Edit kategori" description={editCategory ? `Jenis ${editCategory.transaction_type} tetap dipertahankan untuk menjaga konsistensi transaksi.` : ""} footer={<><Button onClick={() => setEditCategory(null)} disabled={dialogState.status === "submitting"}>Batal</Button><Button variant="primary" type="submit" form="edit-category-form" disabled={dialogState.status === "submitting"}>{dialogState.status === "submitting" ? "Menyimpan..." : "Simpan perubahan"}</Button></>}>
        <form id="edit-category-form" className="form-grid" onSubmit={saveCategory}>
          <label className="field form-grid__full"><span>Nama kategori *</span><input required maxLength="80" value={editCategory?.name || ""} onChange={(event) => setEditCategory((current) => ({ ...current, name: event.target.value }))} /></label>
          <label className="field"><span>Sifat</span><select value={editCategory?.nature || "variable"} onChange={(event) => setEditCategory((current) => ({ ...current, nature: event.target.value }))}><option value="fixed">Tetap</option><option value="variable">Variabel</option><option value="unexpected">Tidak terduga</option><option value="discretionary">Keinginan</option><option value="emergency">Darurat</option><option value="savings">Tabungan</option><option value="other">Lainnya</option></select></label>
          {dialogState.error ? <div className="notice notice--danger form-grid__full" role="alert">{dialogState.error.message}</div> : null}
        </form>
      </Modal>

      <ConfirmationModal open={Boolean(archiveTarget)} title={`Arsipkan ${archiveTarget?.kind === "account" ? "rekening" : "kategori"}?`} description={archiveTarget ? `${archiveTarget.item.name} hanya dapat diarsipkan bila tidak memiliki saldo atau referensi aktif.` : ""} confirmLabel="Arsipkan" busy={dialogState.status === "submitting"} error={dialogState.error} onCancel={() => dialogState.status !== "submitting" && setArchiveTarget(null)} onConfirm={archiveMaster} />
    </div>
  );
};

export default AccountsPage;
