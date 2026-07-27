import { useState } from "react";
import { FiArrowDown, FiArrowUp, FiPlus, FiShield, FiTarget } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import Modal from "../../components/common/Modal.jsx";
import Money from "../../components/common/Money.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import ProgressBar from "../../components/common/ProgressBar.jsx";
import ErrorState from "../../components/feedback/ErrorState.jsx";
import LoadingScreen from "../../components/feedback/LoadingScreen.jsx";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useFinance } from "../../app/FinanceContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { apiClient } from "../../services/api/client.js";
import { assertPositiveRupiah } from "../../domain/money.js";
import { createIdempotencyKey } from "../../domain/security.js";

const today = () => new Date().toISOString().slice(0, 10);

const GoalsPage = () => {
  const resource = useApiResource("goals.list");
  const { bootstrap, refresh } = useFinance();
  const { user } = useAuth();
  const [message, setMessage] = useState(null);
  const [form, setForm] = useState({ name: "", goal_type: "savings", target_amount: "", target_date: "", account_id: "", priority: "normal" });
  const [movement, setMovement] = useState({ goal: null, movement_type: "contribution", amount: "", source_account_id: "", destination_account_id: "", transaction_date: today(), reason: "" });
  const [movementState, setMovementState] = useState({ status: "idle", error: null });
  const accounts = bootstrap?.accounts?.filter((item) => item.status === "active") || [];

  const createGoal = async (event) => {
    event.preventDefault();
    try {
      await apiClient.request("goals.create", { ...form, target_amount: assertPositiveRupiah(form.target_amount) }, { idempotencyKey: createIdempotencyKey() });
      setForm({ name: "", goal_type: "savings", target_amount: "", target_date: "", account_id: "", priority: "normal" });
      setMessage({ type: "success", text: "Target keuangan berhasil dibuat." });
      await Promise.all([resource.reload(), refresh()]);
    } catch (error) { setMessage({ type: "danger", text: error.message }); }
  };

  const openMovement = (goal, movementType) => {
    setMovement({
      goal,
      movement_type: movementType,
      amount: "",
      source_account_id: movementType === "withdraw" ? goal.account_id || "" : "",
      destination_account_id: movementType === "withdraw" ? "" : goal.account_id || "",
      transaction_date: today(),
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
      await Promise.all([resource.reload(), refresh()]);
    } catch (error) { setMovementState({ status: "error", error }); }
  };

  if (resource.status === "loading") return <LoadingScreen label="Memuat target keuangan..." />;
  if (resource.status === "error") return <ErrorState error={resource.error} onRetry={resource.reload} />;

  return (
    <div className="page-stack">
      <PageHeader title="Tabungan & target" description="Kontribusi target dicatat sebagai transfer, bukan pengeluaran." />
      {message ? <div className={`notice notice--${message.type}`} role="status">{message.text}</div> : null}
      <section className="goal-grid">
        {(resource.data?.items || []).map((goal) => (
          <Card className="goal-card" key={goal.goal_id}>
            <div className="goal-card__icon">{goal.goal_type === "emergency_fund" ? <FiShield /> : <FiTarget />}</div>
            <div><p className="eyebrow">{goal.goal_type === "emergency_fund" ? "Dana darurat" : goal.goal_type === "sinking_fund" ? "Dana berkala" : "Tujuan tabungan"}</p><h2>{goal.name}</h2></div>
            <Money value={goal.current_amount} />
            <ProgressBar value={goal.current_amount} max={goal.target_amount} label={goal.name} />
            <div className="goal-card__footer"><span>Target <Money value={goal.target_amount} /></span><span>{goal.target_date}</span></div>
            <div className="goal-card__actions"><Button icon={FiArrowUp} onClick={() => openMovement(goal, "contribution")}>Kontribusi</Button><Button icon={FiArrowDown} onClick={() => openMovement(goal, "withdraw")}>Tarik</Button></div>
          </Card>
        ))}
      </section>

      {user?.role === "owner" ? (
        <Card className="panel">
          <div className="panel__header"><div><p className="eyebrow">Target baru</p><h2>Buat tabungan atau dana darurat</h2></div></div>
          <form className="form-grid" onSubmit={createGoal}>
            <label className="field form-grid__full"><span>Nama target *</span><input required maxLength="100" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
            <label className="field"><span>Jenis</span><select value={form.goal_type} onChange={(event) => setForm((current) => ({ ...current, goal_type: event.target.value }))}><option value="savings">Tabungan tujuan</option><option value="emergency_fund">Dana darurat</option><option value="sinking_fund">Dana berkala</option></select></label>
            <MoneyInput id="goal-target" label="Target nominal" value={form.target_amount} onChange={(value) => setForm((current) => ({ ...current, target_amount: value }))} />
            <label className="field"><span>Tanggal target</span><input required type="date" value={form.target_date} onChange={(event) => setForm((current) => ({ ...current, target_date: event.target.value }))} /></label>
            <label className="field"><span>Rekening tujuan</span><select required value={form.account_id} onChange={(event) => setForm((current) => ({ ...current, account_id: event.target.value }))}><option value="">Pilih rekening</option>{accounts.map((account) => <option key={account.account_id} value={account.account_id}>{account.name}</option>)}</select></label>
            <div className="form-grid__full form-actions"><Button variant="primary" icon={FiPlus} type="submit">Buat target</Button></div>
          </form>
        </Card>
      ) : null}

      <Modal
        open={Boolean(movement.goal)}
        onClose={() => movementState.status !== "submitting" && setMovement((current) => ({ ...current, goal: null }))}
        title={movement.movement_type === "withdraw" ? "Tarik dana target" : "Tambah kontribusi"}
        description={movement.goal ? `${movement.goal.name} · saldo target saat ini tercatat ${movement.goal.current_amount}` : ""}
        footer={<><Button type="button" disabled={movementState.status === "submitting"} onClick={() => setMovement((current) => ({ ...current, goal: null }))}>Batal</Button><Button type="submit" form="goal-movement-form" variant="primary" disabled={movementState.status === "submitting"}>{movementState.status === "submitting" ? "Menyimpan..." : "Simpan transfer"}</Button></>}
      >
        <form id="goal-movement-form" className="form-grid" onSubmit={submitMovement}>
          <MoneyInput id="goal-movement-amount" label="Nominal" value={movement.amount} onChange={(value) => setMovement((current) => ({ ...current, amount: value }))} />
          <label className="field"><span>Rekening sumber *</span><select required value={movement.source_account_id} onChange={(event) => setMovement((current) => ({ ...current, source_account_id: event.target.value }))}><option value="">Pilih rekening</option>{accounts.map((account) => <option key={account.account_id} value={account.account_id}>{account.name}</option>)}</select></label>
          <label className="field"><span>Rekening tujuan *</span><select required value={movement.destination_account_id} onChange={(event) => setMovement((current) => ({ ...current, destination_account_id: event.target.value }))}><option value="">Pilih rekening</option>{accounts.map((account) => <option key={account.account_id} value={account.account_id}>{account.name}</option>)}</select></label>
          <label className="field"><span>Tanggal *</span><input required type="date" value={movement.transaction_date} onChange={(event) => setMovement((current) => ({ ...current, transaction_date: event.target.value }))} /></label>
          <label className="field form-grid__full"><span>Alasan *</span><input required maxLength="180" value={movement.reason} onChange={(event) => setMovement((current) => ({ ...current, reason: event.target.value }))} /></label>
          {movementState.error ? <div className="notice notice--danger form-grid__full" role="alert">{movementState.error.message}</div> : null}
        </form>
      </Modal>
    </div>
  );
};

export default GoalsPage;
