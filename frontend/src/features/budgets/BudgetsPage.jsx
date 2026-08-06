import { useMemo, useState } from "react";
import { FiArchive, FiEdit2, FiPlus } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import Money from "../../components/common/Money.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import ProgressBar from "../../components/common/ProgressBar.jsx";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import LoadingScreen from "../../components/feedback/LoadingScreen.jsx";
import { useFinance } from "../../app/FinanceContext.jsx";
import { currentMonthInJakarta } from "../../domain/dates.js";
import { assertPositiveRupiah } from "../../domain/money.js";
import { createIdempotencyKey } from "../../domain/security.js";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { archiveBudget as requestArchiveBudget, upsertBudget } from "./budgets.api.js";
import styles from "./BudgetsPage.module.css";

const emptyForm = () => ({ category_id: "", amount: "", warning_threshold: 80 });

const BudgetsPage = () => {
  const currentPeriod = currentMonthInJakarta();
  const [period, setPeriod] = useState(currentPeriod);
  const resource = useApiResource("budgets.list", { period });
  const { bootstrap, invalidate, refreshOverview } = useFinance();
  const { user } = useAuth();
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState(null);
  const [saveState, setSaveState] = useState({ status: "idle", error: null });
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiveState, setArchiveState] = useState({ status: "idle", error: null });

  const items = resource.data?.items || [];
  const categories = useMemo(
    () => (bootstrap?.categories || []).filter((item) => item.status === "active" && item.transaction_type === "expense"),
    [bootstrap?.categories],
  );
  const existingBudget = items.find((item) => item.category_id === form.category_id && item.scope === "shared") || null;
  const canManage = user?.role === "owner" && period === currentPeriod;
  const totals = items.reduce((result, item) => ({
    amount: result.amount + Number(item.amount || 0),
    used: result.used + Number(item.used_amount || 0),
  }), { amount: 0, used: 0 });
  const remaining = totals.amount - totals.used;

  const selectCategory = (categoryId) => {
    const current = items.find((item) => item.category_id === categoryId && item.scope === "shared") || null;
    setMessage(null);
    setSaveState({ status: "idle", error: null });
    setForm(current ? {
      category_id: current.category_id,
      amount: String(current.amount || ""),
      warning_threshold: Number(current.warning_threshold || 80),
    } : { ...emptyForm(), category_id: categoryId });
  };

  const editBudget = (item) => {
    setForm({
      category_id: item.category_id,
      amount: String(item.amount || ""),
      warning_threshold: Number(item.warning_threshold || 80),
    });
    setMessage(null);
    window.requestAnimationFrame(() => document.getElementById("budget-form")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const saveBudget = async (event) => {
    event.preventDefault();
    setSaveState({ status: "submitting", error: null });
    setMessage(null);
    try {
      await upsertBudget({
        ...form,
        period_key: period,
        amount: assertPositiveRupiah(form.amount),
        scope: "shared",
        row_version: existingBudget?.row_version,
      }, { idempotencyKey: createIdempotencyKey(), rowVersion: existingBudget?.row_version });
      setForm(emptyForm());
      setSaveState({ status: "idle", error: null });
      setMessage({ type: "success", text: existingBudget ? "Anggaran berhasil diperbarui." : "Anggaran berhasil dibuat." });
      invalidate(["budgets.list", "reports.monthly", "dashboard.overview", "app.initialState"]);
      await Promise.allSettled([resource.reload(), refreshOverview()]);
    } catch (error) {
      setSaveState({ status: "error", error });
    }
  };

  const archiveBudget = async () => {
    if (!archiveTarget) return;
    const target = archiveTarget;
    setArchiveState({ status: "submitting", error: null });
    try {
      await requestArchiveBudget({
        budget_id: target.budget_id,
        row_version: target.row_version,
      }, { idempotencyKey: createIdempotencyKey(), rowVersion: target.row_version });
      setArchiveTarget(null);
      setArchiveState({ status: "idle", error: null });
      setForm((current) => current.category_id === target.category_id ? emptyForm() : current);
      setMessage({ type: "success", text: "Anggaran berhasil diarsipkan. Transaksi dan laporan historis tetap tersimpan." });
      invalidate(["budgets.list", "reports.monthly", "dashboard.overview", "app.initialState"]);
      await Promise.allSettled([resource.reload(), refreshOverview()]);
    } catch (error) {
      setArchiveState({ status: "error", error });
    }
  };

  if (resource.status === "loading") return <LoadingScreen label="Memuat anggaran..." />;
  if (resource.status === "error") return <ErrorState error={resource.error} onRetry={resource.reload} />;

  return (
    <div className="page-stack budgets-page">
      <RefreshWarning error={resource.refreshError} onRetry={resource.reload} />
      <PageHeader
        title="Anggaran"
        description="Tetapkan batas pengeluaran per kategori. Nilai aktual dihitung dari transaksi aktif dan tidak dapat diedit dari halaman ini."
        actions={(
          <label className={`field field--compact ${styles.periodControl}`}>
            <span>Periode</span>
            <input type="month" max={currentPeriod} value={period} onChange={(event) => { setPeriod(event.target.value); setForm(emptyForm()); setMessage(null); }} />
          </label>
        )}
      />

      {message ? <div className={`notice notice--${message.type}`} role="status">{message.text}</div> : null}
      {!canManage ? (
        <div className={`notice notice--info ${styles.readOnlyNote}`} role="status">
          {user?.role !== "owner" ? "Anggota dapat memantau anggaran. Pembuatan dan perubahan anggaran hanya dapat dilakukan owner." : "Periode historis ditampilkan hanya-baca. Kelola anggaran pada periode aktif."}
        </div>
      ) : null}

      <section className={styles.summaryGrid} aria-label="Ringkasan anggaran">
        <Card className="metric-card"><span>Anggaran aktif</span><strong>{items.length}</strong></Card>
        <Card className="metric-card"><span>Total rencana</span><Money value={totals.amount} /></Card>
        <Card className="metric-card"><span>Total aktual</span><Money value={totals.used} /></Card>
        <Card className="metric-card"><span>Total sisa</span><Money value={remaining} tone={remaining < 0 ? "negative" : "default"} /></Card>
      </section>

      <Card className={`panel ${styles.listPanel}`}>
        <div className={styles.listHeading}>
          <div>
            <p className="eyebrow">Pemantauan kategori</p>
            <h2>Anggaran dan pengeluaran aktual</h2>
            <p>Transfer internal tidak dihitung sebagai pemasukan atau pengeluaran.</p>
          </div>
        </div>

        {items.length ? (
          <div className={styles.cardGrid}>
            {items.map((item) => {
              const itemRemaining = Number(item.amount || 0) - Number(item.used_amount || 0);
              const percentage = Number(item.amount || 0) > 0 ? Math.round((Number(item.used_amount || 0) / Number(item.amount || 0)) * 100) : 0;
              return (
                <article className={styles.budgetCard} key={item.budget_id}>
                  <div className={styles.budgetHeader}>
                    <div><strong>{item.name || item.category_id}</strong><small>{percentage}% terpakai · peringatan {item.warning_threshold || 80}%</small></div>
                    <span className={`status-badge status-badge--${percentage >= 100 ? "danger" : percentage >= Number(item.warning_threshold || 80) ? "warning" : "active"}`}>{percentage >= 100 ? "Melewati batas" : "Aktif"}</span>
                  </div>
                  <ProgressBar value={Number(item.used_amount || 0)} max={Number(item.amount || 0)} label={`Pemakaian anggaran ${item.name || item.category_id}`} />
                  <dl className={styles.metrics}>
                    <div><dt>Rencana</dt><dd><Money value={item.amount} /></dd></div>
                    <div><dt>Aktual</dt><dd><Money value={item.used_amount} /></dd></div>
                    <div><dt>Sisa</dt><dd><Money value={itemRemaining} tone={itemRemaining < 0 ? "negative" : "default"} /></dd></div>
                  </dl>
                  {canManage ? (
                    <div className={styles.actions}>
                      <Button type="button" icon={FiEdit2} onClick={() => editBudget(item)}>Edit</Button>
                      <Button type="button" variant="danger" icon={FiArchive} onClick={() => { setArchiveTarget(item); setArchiveState({ status: "idle", error: null }); }}>Arsipkan</Button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : <EmptyState title="Belum ada anggaran" description={canManage ? "Tetapkan batas kategori untuk membandingkan rencana dan pengeluaran aktual." : "Owner belum menetapkan anggaran untuk periode ini."} />}
      </Card>

      {canManage ? (
        <Card id="budget-form" className={`panel ${styles.formPanel}`}>
          <div className="panel__header">
            <div><p className="eyebrow">Kelola anggaran</p><h2>{existingBudget ? "Perbarui batas kategori" : "Tetapkan batas kategori"}</h2><p>Memilih kategori yang sudah memiliki anggaran akan memperbarui record yang sama dengan row version terbaru.</p></div>
          </div>
          {saveState.status === "error" ? <div className="notice notice--danger" role="alert">{saveState.error?.message || "Anggaran belum dapat disimpan."}</div> : null}
          <form className="form-grid" onSubmit={saveBudget}>
            <label className="field">
              <span>Kategori pengeluaran *</span>
              <select required value={form.category_id} onChange={(event) => selectCategory(event.target.value)}>
                <option value="">Pilih kategori</option>
                {categories.map((item) => <option key={item.category_id} value={item.category_id}>{item.name}</option>)}
              </select>
            </label>
            <MoneyInput id="budget-amount" label="Nominal anggaran" value={form.amount} onChange={(value) => setForm((current) => ({ ...current, amount: value }))} required />
            <label className="field">
              <span>Ambang peringatan (%)</span>
              <input type="number" min="50" max="100" value={form.warning_threshold} onChange={(event) => setForm((current) => ({ ...current, warning_threshold: Number(event.target.value) }))} />
            </label>
            <div className="form-actions form-grid__full">
              {existingBudget ? <Button type="button" onClick={() => setForm(emptyForm())}>Batal edit</Button> : null}
              <Button variant="primary" icon={FiPlus} type="submit" loading={saveState.status === "submitting"}>{existingBudget ? "Simpan perubahan" : "Simpan anggaran"}</Button>
            </div>
          </form>
        </Card>
      ) : null}

      <ConfirmationModal
        open={Boolean(archiveTarget)}
        title="Arsipkan anggaran?"
        description={archiveTarget ? `${archiveTarget.name || archiveTarget.category_id} tidak lagi menjadi batas aktif periode ini.` : ""}
        confirmLabel="Arsipkan anggaran"
        busy={archiveState.status === "submitting"}
        error={archiveState.error}
        onCancel={() => archiveState.status !== "submitting" && setArchiveTarget(null)}
        onConfirm={archiveBudget}
      />
    </div>
  );
};

export default BudgetsPage;
