import { useState } from "react";
import { FiArchive, FiArrowDown, FiArrowUp, FiEdit2, FiPlus, FiRotateCcw, FiShield, FiTarget } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import Modal from "../../components/common/Modal.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import Money from "../../components/common/Money.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import ProgressBar from "../../components/common/ProgressBar.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import LoadingScreen from "../../components/feedback/LoadingScreen.jsx";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useFinance } from "../../app/FinanceContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { apiClient } from "../../services/api/client.js";
import { assertPositiveRupiah } from "../../domain/money.js";
import { createIdempotencyKey } from "../../domain/security.js";
import { todayInJakarta } from "../../domain/dates.js";
import { filterByOwnership, ownershipLabel } from "../../domain/ownership.js";


const GoalsPage = () => {
  const resource = useApiResource("goals.list");
  const { bootstrap, refreshOverview, invalidate } = useFinance();
  const { user } = useAuth();
  const [message, setMessage] = useState(null);
  const [form, setForm] = useState({ name: "", goal_type: "savings", target_amount: "", target_date: "", account_id: "", priority: "normal" });
  const [movement, setMovement] = useState({ goal: null, movement_type: "contribution", amount: "", source_account_id: "", destination_account_id: "", transaction_date: todayInJakarta(), reason: "" });
  const [movementState, setMovementState] = useState({ status: "idle", error: null });
  const [reverseTarget, setReverseTarget] = useState(null);
  const [reverseState, setReverseState] = useState({ status: "idle", error: null });
  const [editGoal, setEditGoal] = useState(null);
  const [editState, setEditState] = useState({ status: "idle", error: null });
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiveState, setArchiveState] = useState({ status: "idle", error: null });
  const accounts = bootstrap?.accounts?.filter((item) => item.status === "active") || [];
  const goalAccount = movement.goal ? accounts.find((account) => account.account_id === movement.goal.account_id) || null : null;
  const compatibleMovementAccounts = filterByOwnership(accounts, goalAccount);

  const createGoal = async (event) => {
    event.preventDefault();
    try {
      await apiClient.request("goals.create", { ...form, target_amount: assertPositiveRupiah(form.target_amount) }, { idempotencyKey: createIdempotencyKey() });
      setForm({ name: "", goal_type: "savings", target_amount: "", target_date: "", account_id: "", priority: "normal" });
      setMessage({ type: "success", text: "Target keuangan berhasil dibuat." });
      invalidate(["goals.list", "transactions.list", "reports.monthly", "app.initialState"]);
      await Promise.all([resource.reload(), refreshOverview()]);
    } catch (error) { setMessage({ type: "danger", text: error.message }); }
  };

  const openMovement = (goal, movementType) => {
    setMovement({
      goal,
      movement_type: movementType,
      amount: "",
      source_account_id: movementType === "withdraw" ? goal.account_id || "" : "",
      destination_account_id: movementType === "withdraw" ? "" : goal.account_id || "",
      transaction_date: todayInJakarta(),
      reason: movementType === "withdraw" ? "Penggunaan dana target" : "Kontribusi target",
    });
    setMovementState({ status: "idle", error: null });
  };

  const submitMovement = async (event) => {
    event.preventDefault();
    if (!movement.goal) return;
    if (!movement.source_account_id || !movement.destination_account_id) {
      setMovementState({ status: "error", error: new Error("Rekening sumber dan tujuan wajib dipilih.") });
      return;
    }
    if (movement.source_account_id === movement.destination_account_id) {
      setMovementState({ status: "error", error: new Error("Rekening sumber dan tujuan harus berbeda.") });
      return;
    }
    setMovementState({ status: "submitting", error: null });
    try {
      await apiClient.request("goals.move", {
        goal_id: movement.goal.goal_id,
        movement_type: movement.movement_type,
        amount: assertPositiveRupiah(movement.amount),
        source_account_id: movement.source_account_id,
        destination_account_id: movement.destination_account_id,
        transaction_date: movement.transaction_date,
        reason: movement.reason,
      }, { idempotencyKey: createIdempotencyKey() });
      setMovement((current) => ({ ...current, goal: null }));
      setMovementState({ status: "idle", error: null });
      setMessage({ type: "success", text: "Mutasi target dan transfer rekening berhasil dicatat." });
      invalidate(["goals.list", "transactions.list", "reports.monthly", "app.initialState"]);
      await Promise.all([resource.reload(), refreshOverview()]);
    } catch (error) { setMovementState({ status: "error", error }); }
  };

  const saveGoal = async (event) => {
    event.preventDefault();
    if (!editGoal) return;
    setEditState({ status: "submitting", error: null });
    try {
      await apiClient.request("goals.update", {
        goal_id: editGoal.goal_id,
        row_version: editGoal.row_version,
        name: editGoal.name,
        target_amount: assertPositiveRupiah(editGoal.target_amount),
        target_date: editGoal.target_date,
        priority: editGoal.priority || "normal",
        status: editGoal.status || "active",
      }, { idempotencyKey: createIdempotencyKey(), rowVersion: editGoal.row_version });
      setEditGoal(null);
      setEditState({ status: "idle", error: null });
      setMessage({ type: "success", text: "Target berhasil diperbarui." });
      invalidate(["goals.list", "reports.monthly", "app.initialState"]);
      await Promise.all([resource.reload(), refreshOverview()]);
    } catch (error) {
      setEditState({ status: "error", error });
    }
  };

  const archiveGoal = async () => {
    if (!archiveTarget) return;
    setArchiveState({ status: "submitting", error: null });
    try {
      await apiClient.request("goals.update", {
        goal_id: archiveTarget.goal_id,
        row_version: archiveTarget.row_version,
        status: "archived",
      }, { idempotencyKey: createIdempotencyKey(), rowVersion: archiveTarget.row_version });
      setArchiveTarget(null);
      setArchiveState({ status: "idle", error: null });
      setMessage({ type: "success", text: "Target berhasil diarsipkan. Riwayat mutasi dan transaksi tetap tersimpan." });
      invalidate(["goals.list", "reports.monthly", "app.initialState"]);
      await Promise.all([resource.reload(), refreshOverview()]);
    } catch (error) {
      setArchiveState({ status: "error", error });
    }
  };

  const reverseLastMovement = async (reason) => {
    if (!reverseTarget?.last_movement_id) return;
    setReverseState({ status: "submitting", error: null });
    try {
      await apiClient.request("goals.reverseMovement", { goal_movement_id: reverseTarget.last_movement_id, reason }, { idempotencyKey: createIdempotencyKey() });
      setReverseTarget(null);
      setReverseState({ status: "idle", error: null });
      setMessage({ type: "success", text: "Mutasi target terakhir dan transfer terkait berhasil dibatalkan." });
      invalidate(["goals.list", "transactions.list", "reports.monthly", "app.initialState"]);
      await Promise.all([resource.reload(), refreshOverview()]);
    } catch (error) { setReverseState({ status: "error", error }); }
  };

  if (resource.status === "loading") return <LoadingScreen label="Memuat target keuangan..." />;
  if (resource.status === "error") return <ErrorState error={resource.error} onRetry={resource.reload} />;

  return (
    <div className="page-stack">
      <RefreshWarning error={resource.refreshError} onRetry={resource.reload} />
      <PageHeader title="Tabungan & target" description="Kontribusi target dicatat sebagai transfer, bukan pengeluaran." />
      {message ? <div className={`notice notice--${message.type}`} role="status">{message.text}</div> : null}
      <section className="goal-grid">
        {(resource.data?.items || []).length ? (resource.data.items.map((goal) => (
          <Card className="goal-card" key={goal.goal_id}>
            <div className="goal-card__icon">{goal.goal_type === "emergency_fund" ? <FiShield /> : <FiTarget />}</div>
            <div><p className="eyebrow">{goal.goal_type === "emergency_fund" ? "Dana darurat" : goal.goal_type === "sinking_fund" ? "Dana berkala" : "Tujuan tabungan"}</p><h2>{goal.name}</h2></div>
            <Money value={goal.current_amount} />
            <ProgressBar value={goal.current_amount} max={goal.target_amount} label={goal.name} />
            <div className="goal-card__footer"><span>Target <Money value={goal.target_amount} /></span><span>{goal.target_date}</span></div>
            <div className="goal-card__actions">
              {goal.can_move ? <><Button icon={FiArrowUp} onClick={() => openMovement(goal, "contribution")}>Kontribusi</Button><Button icon={FiArrowDown} onClick={() => openMovement(goal, "withdraw")}>Tarik</Button></> : null}
              {goal.can_reverse ? <Button icon={FiRotateCcw} onClick={() => { setReverseTarget(goal); setReverseState({ status: "idle", error: null }); }}>Batalkan terakhir</Button> : null}
              {goal.can_update ? <Button icon={FiEdit2} onClick={() => { setEditGoal({ ...goal }); setEditState({ status: "idle", error: null }); }}>Edit</Button> : null}
              {goal.can_archive ? <Button icon={FiArchive} onClick={() => { setArchiveTarget(goal); setArchiveState({ status: "idle", error: null }); }}>Arsipkan</Button> : null}
            </div>
          </Card>
        ))) : <Card className="panel"><p>Belum ada target keuangan. Buat target setelah rekening tujuan tersedia.</p></Card>}
      </section>

      {user?.role === "owner" ? (
        <Card className="panel">
          <div className="panel__header"><div><p className="eyebrow">Target baru</p><h2>Buat tabungan atau dana darurat</h2></div></div>
          <form className="form-grid" onSubmit={createGoal}>
            <label className="field form-grid__full"><span>Nama target *</span><input required maxLength="100" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
            <label className="field"><span>Jenis</span><select value={form.goal_type} onChange={(event) => setForm((current) => ({ ...current, goal_type: event.target.value }))}><option value="savings">Tabungan tujuan</option><option value="emergency_fund">Dana darurat</option><option value="sinking_fund">Dana berkala</option></select></label>
            <MoneyInput id="goal-target" label="Target nominal" value={form.target_amount} onChange={(value) => setForm((current) => ({ ...current, target_amount: value }))} />
            <label className="field"><span>Tanggal target</span><input required type="date" value={form.target_date} onChange={(event) => setForm((current) => ({ ...current, target_date: event.target.value }))} /></label>
            <label className="field"><span>Rekening tujuan</span><select required value={form.account_id} onChange={(event) => setForm((current) => ({ ...current, account_id: event.target.value }))}><option value="">Pilih rekening</option>{accounts.map((account) => <option key={account.account_id} value={account.account_id}>{account.name} · {ownershipLabel(account)}</option>)}</select></label>
            <div className="form-grid__full form-actions"><Button variant="primary" icon={FiPlus} type="submit">Buat target</Button></div>
          </form>
        </Card>
      ) : null}

      <Modal
        open={Boolean(editGoal)}
        onClose={() => editState.status !== "submitting" && setEditGoal(null)}
        title="Edit target"
        description="Rekening dan jenis target dipertahankan agar riwayat tetap konsisten."
        footer={<><Button type="button" disabled={editState.status === "submitting"} onClick={() => setEditGoal(null)}>Batal</Button><Button type="submit" form="goal-edit-form" variant="primary" disabled={editState.status === "submitting"}>{editState.status === "submitting" ? "Menyimpan..." : "Simpan perubahan"}</Button></>}
      >
        <form id="goal-edit-form" className="form-grid" onSubmit={saveGoal}>
          <label className="field form-grid__full"><span>Nama target *</span><input required maxLength="100" value={editGoal?.name || ""} onChange={(event) => setEditGoal((current) => ({ ...current, name: event.target.value }))} /></label>
          <MoneyInput id="goal-edit-target" label="Target nominal" value={editGoal?.target_amount || ""} onChange={(value) => setEditGoal((current) => ({ ...current, target_amount: value }))} />
          <label className="field"><span>Tanggal target</span><input required type="date" value={editGoal?.target_date || ""} onChange={(event) => setEditGoal((current) => ({ ...current, target_date: event.target.value }))} /></label>
          <label className="field"><span>Prioritas</span><select value={editGoal?.priority || "normal"} onChange={(event) => setEditGoal((current) => ({ ...current, priority: event.target.value }))}><option value="low">Rendah</option><option value="normal">Normal</option><option value="high">Tinggi</option></select></label>
          <label className="field"><span>Status</span><select value={editGoal?.status || "active"} onChange={(event) => setEditGoal((current) => ({ ...current, status: event.target.value }))}><option value="active">Aktif</option><option value="completed">Selesai</option></select><small>Status selesai hanya diterima jika nominal target sudah tercapai.</small></label>
          {editState.error ? <div className="notice notice--danger form-grid__full" role="alert">{editState.error.message}</div> : null}
        </form>
      </Modal>

      <Modal
        open={Boolean(movement.goal)}
        onClose={() => movementState.status !== "submitting" && setMovement((current) => ({ ...current, goal: null }))}
        title={movement.movement_type === "withdraw" ? "Tarik dana target" : "Tambah kontribusi"}
        description={movement.goal ? `${movement.goal.name} · saldo target saat ini tercatat ${movement.goal.current_amount}` : ""}
        footer={<><Button type="button" disabled={movementState.status === "submitting"} onClick={() => setMovement((current) => ({ ...current, goal: null }))}>Batal</Button><Button type="submit" form="goal-movement-form" variant="primary" disabled={movementState.status === "submitting"}>{movementState.status === "submitting" ? "Menyimpan..." : "Simpan transfer"}</Button></>}
      >
        <form id="goal-movement-form" className="form-grid" onSubmit={submitMovement}>
          <MoneyInput id="goal-movement-amount" label="Nominal" value={movement.amount} onChange={(value) => setMovement((current) => ({ ...current, amount: value }))} />
          <label className="field"><span>Rekening sumber *</span><select required value={movement.source_account_id} onChange={(event) => setMovement((current) => ({ ...current, source_account_id: event.target.value }))}><option value="">Pilih rekening</option>{compatibleMovementAccounts.map((account) => <option key={account.account_id} value={account.account_id}>{account.name} · {ownershipLabel(account)}</option>)}</select></label>
          <label className="field"><span>Rekening tujuan *</span><select required value={movement.destination_account_id} onChange={(event) => setMovement((current) => ({ ...current, destination_account_id: event.target.value }))}><option value="">Pilih rekening</option>{compatibleMovementAccounts.map((account) => <option key={account.account_id} value={account.account_id}>{account.name} · {ownershipLabel(account)}</option>)}</select></label>
          <label className="field"><span>Tanggal *</span><input required type="date" value={movement.transaction_date} onChange={(event) => setMovement((current) => ({ ...current, transaction_date: event.target.value }))} /></label>
          <label className="field form-grid__full"><span>Alasan *</span><input required maxLength="180" value={movement.reason} onChange={(event) => setMovement((current) => ({ ...current, reason: event.target.value }))} /></label>
          {movementState.error ? <div className="notice notice--danger form-grid__full" role="alert">{movementState.error.message}</div> : null}
        </form>
      </Modal>

      <ConfirmationModal
        open={Boolean(reverseTarget)}
        title="Batalkan mutasi target terakhir?"
        description={reverseTarget ? `${reverseTarget.name} · transfer terkait juga akan dibatalkan tanpa menghapus audit.` : ""}
        confirmLabel="Batalkan mutasi"
        reasonLabel="Alasan pembatalan"
        requireReason
        busy={reverseState.status === "submitting"}
        error={reverseState.error}
        onCancel={() => reverseState.status !== "submitting" && setReverseTarget(null)}
        onConfirm={reverseLastMovement}
      />

      <ConfirmationModal
        open={Boolean(archiveTarget)}
        title="Arsipkan target?"
        description={archiveTarget ? `${archiveTarget.name} tidak lagi menerima mutasi baru. Riwayat dan transaksi tidak dihapus.` : ""}
        confirmLabel="Arsipkan target"
        busy={archiveState.status === "submitting"}
        error={archiveState.error}
        onCancel={() => archiveState.status !== "submitting" && setArchiveTarget(null)}
        onConfirm={archiveGoal}
      />
    </div>
  );
};

export default GoalsPage;
