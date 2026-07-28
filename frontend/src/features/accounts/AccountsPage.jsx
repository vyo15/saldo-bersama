import { useState } from "react";
import { FiCheckCircle, FiCreditCard, FiDollarSign, FiPlus, FiShield, FiSmartphone } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import Money from "../../components/common/Money.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
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
const today = todayInJakarta;

const AccountsPage = () => {
  const accountsResource = useApiResource("accounts.list");
  const categoriesResource = useApiResource("categories.list");
  const { refresh } = useFinance();
  const { user } = useAuth();
  const [accountForm, setAccountForm] = useState({ name: "", account_type: "bank", owner_scope: "shared", initial_balance: "", initial_balance_date: today() });
  const [categoryForm, setCategoryForm] = useState({ name: "", transaction_type: "expense", nature: "variable" });
  const [message, setMessage] = useState(null);

  const createAccount = async (event) => {
    event.preventDefault();
    try {
      await apiClient.request("accounts.create", { ...accountForm, initial_balance: Number(accountForm.initial_balance || 0) }, { idempotencyKey: createIdempotencyKey() });
      setAccountForm({ name: "", account_type: "bank", owner_scope: "shared", initial_balance: "", initial_balance_date: today() });
      setMessage({ type: "success", text: "Rekening berhasil dibuat." });
      await Promise.all([accountsResource.reload(), refresh()]);
    } catch (error) { setMessage({ type: "danger", text: error.message }); }
  };

  const reconcileAccount = async (account) => {
    const actualText = window.prompt(`Saldo aktual ${account.name}:`, String(account.balance || 0));
    if (actualText === null) return;
    const notes = window.prompt("Catatan rekonsiliasi (opsional):", "Cocokkan dengan mutasi bank/tunai") || "";
    try {
      const actualBalance = parseRupiah(actualText);
      const reconciliation = await apiClient.request("reconciliations.create", { account_id: account.account_id, actual_balance: actualBalance, notes }, { idempotencyKey: createIdempotencyKey() });
      setMessage({ type: reconciliation.difference === 0 ? "success" : "warning", text: reconciliation.difference === 0 ? "Saldo cocok dan rekonsiliasi tercatat." : `Ada selisih ${reconciliation.difference}. Cari transaksi tertinggal atau buat penyesuaian beralasan.` });
    } catch (error) { setMessage({ type: "danger", text: error.message }); }
  };

  const createCategory = async (event) => {
    event.preventDefault();
    try {
      await apiClient.request("categories.create", categoryForm, { idempotencyKey: createIdempotencyKey() });
      setCategoryForm({ name: "", transaction_type: "expense", nature: "variable" });
      setMessage({ type: "success", text: "Kategori berhasil dibuat." });
      await Promise.all([categoriesResource.reload(), refresh()]);
    } catch (error) { setMessage({ type: "danger", text: error.message }); }
  };

  if (accountsResource.status === "loading" || categoriesResource.status === "loading") return <LoadingScreen label="Memuat rekening dan kategori..." />;
  if (accountsResource.status === "error") return <ErrorState error={accountsResource.error} onRetry={accountsResource.reload} />;
  if (categoriesResource.status === "error") return <ErrorState error={categoriesResource.error} onRetry={categoriesResource.reload} />;

  return (
    <div className="page-stack">
      <PageHeader title="Rekening & kategori" description="Saldo berjalan dihitung dari saldo awal dan transaksi aktif; tidak dapat diedit bebas." />
      {message ? <div className={`notice notice--${message.type}`} role="status">{message.text}</div> : null}
      <section className="account-grid">
        {(accountsResource.data?.items || []).map((account) => {
          const Icon = ICONS[account.account_type] || FiCreditCard;
          return <Card className="account-card" key={account.account_id}><Icon /><div><h2>{account.name}</h2><small>{account.account_type} · {account.owner_scope}</small></div><Money value={account.balance} /><Button icon={FiCheckCircle} onClick={() => reconcileAccount(account)}>Rekonsiliasi</Button></Card>;
        })}
      </section>

      {user?.role === "owner" ? (
        <section className="two-column-grid">
          <Card className="panel">
            <div className="panel__header"><div><p className="eyebrow">Master rekening</p><h2>Tambah rekening</h2></div></div>
            <form className="form-grid" onSubmit={createAccount}>
              <label className="field form-grid__full"><span>Nama rekening *</span><input required maxLength="100" value={accountForm.name} onChange={(event) => setAccountForm((current) => ({ ...current, name: event.target.value }))} /></label>
              <label className="field"><span>Jenis</span><select value={accountForm.account_type} onChange={(event) => setAccountForm((current) => ({ ...current, account_type: event.target.value }))}><option value="bank">Bank</option><option value="cash">Tunai</option><option value="ewallet">E-wallet</option><option value="savings">Tabungan</option><option value="emergency_fund">Dana darurat</option><option value="sinking_fund">Dana berkala</option></select></label>
              <label className="field"><span>Kepemilikan</span><select value={accountForm.owner_scope} onChange={(event) => setAccountForm((current) => ({ ...current, owner_scope: event.target.value }))}><option value="shared">Bersama</option><option value="personal">Pribadi</option></select></label>
              <MoneyInput id="initial-balance" label="Saldo awal" value={accountForm.initial_balance} onChange={(value) => setAccountForm((current) => ({ ...current, initial_balance: value }))} />
              <label className="field"><span>Tanggal saldo awal</span><input type="date" value={accountForm.initial_balance_date} onChange={(event) => setAccountForm((current) => ({ ...current, initial_balance_date: event.target.value }))} /></label>
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
            <div className="chip-list">{(categoriesResource.data?.items || []).map((category) => <span key={category.category_id}>{category.name} · {category.transaction_type}</span>)}</div>
          </Card>
        </section>
      ) : null}

      <div className="notice notice--info"><strong>Rekonsiliasi disarankan setiap bulan.</strong><span>Jika saldo bank berbeda, cari transaksi yang tertinggal atau buat penyesuaian dengan alasan dan audit.</span></div>
    </div>
  );
};

export default AccountsPage;
