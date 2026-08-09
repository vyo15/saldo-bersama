import { useMemo, useState } from "react";
import { FiArchive, FiArrowRight, FiPlus, FiRefreshCw, FiRotateCcw } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import Money from "../../components/common/Money.jsx";
import MoneyInput from "../../components/common/MoneyInput.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import ProgressBar from "../../components/common/ProgressBar.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import LoadingScreen from "../../components/feedback/LoadingScreen.jsx";
import { useFeedback } from "../../components/feedback/feedbackContext.js";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useGuardedMutation } from "../../hooks/useGuardedMutation.js";
import {
  archiveEnvelopeRule as requestArchiveEnvelopeRule,
  closeEnvelope as requestCloseEnvelope,
  createEnvelope as requestCreateEnvelope,
  moveEnvelope as requestMoveEnvelope,
  restoreEnvelopeRule as requestRestoreEnvelopeRule,
  reverseEnvelopeMovement as requestReverseEnvelopeMovement,
} from "./allocations.api.js";
import { assertPositiveRupiah } from "../../domain/money.js";
import { useFinance } from "../../app/FinanceContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { accountDisplayLabel } from "../../shared/presentation/account.js";
import { currentMonthBoundsInJakarta } from "../../domain/dates.js";
import { filterByOwnership } from "../../domain/ownership.js";

const AllocationsPage = () => {
  const resource = useApiResource("envelopes.list");
  const { refreshOverview, invalidate, bootstrap } = useFinance();
  const { user } = useAuth();
  const { notify } = useFeedback();
  const createMutation = useGuardedMutation();
  const moveMutation = useGuardedMutation();
  const [move, setMove] = useState({ fromEnvelopePeriodId: "", toEnvelopePeriodId: "", amount: "", reason: "" });
  const [message, setMessage] = useState(null);
  const [closeTarget, setCloseTarget] = useState(null);
  const [closeState, setCloseState] = useState({ status: "idle", error: null });
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiveState, setArchiveState] = useState({ status: "idle", error: null });
  const [restoreTarget, setRestoreTarget] = useState(null);
  const [restoreState, setRestoreState] = useState({ status: "idle", error: null });
  const [reverseTarget, setReverseTarget] = useState(null);
  const [reverseState, setReverseState] = useState({ status: "idle", error: null });
  const { start: periodStart, end: periodEnd } = currentMonthBoundsInJakarta();
  const [createForm, setCreateForm] = useState({ name: "", default_amount: "", source_account_id: "", period_type: "monthly", period_start: periodStart, period_end: periodEnd, rollover_policy: "unallocated", overspend_policy: "confirm" });
  const accounts = bootstrap?.accounts?.filter((item) => item.status === "active") || [];
  const items = useMemo(() => resource.data?.items || [], [resource.data?.items]);
  const archivedRules = resource.data?.archivedRules || [];
  const recentMovements = resource.data?.recentMovements || [];
  const lookup = useMemo(() => Object.fromEntries(items.map((item) => [item.envelope_period_id, item])), [items]);
  const selectedSourceEnvelope = lookup[move.fromEnvelopePeriodId] || null;
  const compatibleDestinationEnvelopes = filterByOwnership(items, selectedSourceEnvelope).filter((item) => item.envelope_period_id !== move.fromEnvelopePeriodId);

  const refreshAfterMutation = async () => {
    invalidate(["envelopes.list", "reports.monthly", "app.initialState"]);
    await Promise.allSettled([resource.reload(), refreshOverview()]);
  };

  const createEnvelope = (event) => {
    event.preventDefault();
    setMessage(null);
    return createMutation.run(async () => {
      const amount = assertPositiveRupiah(createForm.default_amount);
      await requestCreateEnvelope({ ...createForm, default_amount: amount, allocated_amount: amount }, {});
      setCreateForm((current) => ({ ...current, name: "", default_amount: "" }));
      notify({ message: "Kantong dan periode aktif berhasil dibuat." });
      await refreshAfterMutation();
    }).catch((error) => setMessage({ type: "danger", text: error.message }));
  };

  const closeEnvelope = async () => {
    if (!closeTarget) return;
    setCloseState({ status: "submitting", error: null });
    try {
      const result = await requestCloseEnvelope({
        envelope_period_id: closeTarget.envelope_period_id,
        row_version: closeTarget.row_version,
      }, { rowVersion: closeTarget.row_version });
      setCloseTarget(null);
      setCloseState({ status: "idle", error: null });
      const rolloverAmount = Number(result?.rollover?.amount || 0);
      notify({
        message: rolloverAmount > 0
          ? `Periode berhasil ditutup. Sisa Rp ${rolloverAmount.toLocaleString("id-ID")} dibawa ke periode berikutnya.`
          : "Periode kantong berhasil ditutup. Sisa alokasi kembali menjadi dana belum dialokasikan.",
      });
      await refreshAfterMutation();
    } catch (error) {
      setCloseState({ status: "error", error });
    }
  };

  const submitMove = (event) => {
    event.preventDefault();
    setMessage(null);
    return moveMutation.run(async () => {
      const amount = assertPositiveRupiah(move.amount);
      const from = lookup[move.fromEnvelopePeriodId];
      const to = lookup[move.toEnvelopePeriodId];
      if (!from || !to) throw new Error("Kantong sumber dan tujuan wajib dipilih.");
      if (from.envelope_period_id === to.envelope_period_id) throw new Error("Kantong sumber dan tujuan harus berbeda.");
      if (amount > Number(from.remaining_amount || 0)) throw new Error("Nominal melebihi sisa kantong sumber.");
      await requestMoveEnvelope({
        ...move,
        amount,
        from_row_version: from.row_version,
        to_row_version: to.row_version,
      }, {});
      setMove({ fromEnvelopePeriodId: "", toEnvelopePeriodId: "", amount: "", reason: "" });
      notify({ message: "Alokasi berhasil dipindahkan tanpa mengubah total saldo." });
      await refreshAfterMutation();
    }).catch((error) => setMessage({ type: "danger", text: error.message }));
  };

  const archiveRule = async (reason) => {
    if (!archiveTarget) return;
    setArchiveState({ status: "submitting", error: null });
    try {
      await requestArchiveEnvelopeRule({
        envelope_rule_id: archiveTarget.envelope_rule_id,
        row_version: archiveTarget.rule_row_version,
        reason,
      }, { rowVersion: archiveTarget.rule_row_version });
      setArchiveTarget(null);
      setArchiveState({ status: "idle", error: null });
      notify({ message: "Aturan kantong diarsipkan. Riwayat periode dan mutasi tetap tersimpan." });
      await refreshAfterMutation();
    } catch (error) { setArchiveState({ status: "error", error }); }
  };

  const restoreRule = async (reason) => {
    if (!restoreTarget) return;
    setRestoreState({ status: "submitting", error: null });
    try {
      await requestRestoreEnvelopeRule({
        envelope_rule_id: restoreTarget.envelope_rule_id,
        row_version: restoreTarget.row_version,
        reason,
      }, { rowVersion: restoreTarget.row_version });
      setRestoreTarget(null);
      setRestoreState({ status: "idle", error: null });
      notify({ message: "Aturan kantong berhasil dipulihkan." });
      await refreshAfterMutation();
    } catch (error) { setRestoreState({ status: "error", error }); }
  };

  const reverseMovement = async (reason) => {
    if (!reverseTarget) return;
    setReverseState({ status: "submitting", error: null });
    try {
      await requestReverseEnvelopeMovement({
        movement_id: reverseTarget.movement_id,
        row_version: reverseTarget.row_version,
        from_row_version: reverseTarget.from_row_version,
        to_row_version: reverseTarget.to_row_version,
        reason,
      }, { rowVersion: reverseTarget.row_version });
      setReverseTarget(null);
      setReverseState({ status: "idle", error: null });
      notify({ message: "Mutasi alokasi berhasil dibatalkan tanpa menghapus riwayat audit." });
      await refreshAfterMutation();
    } catch (error) { setReverseState({ status: "error", error }); }
  };

  if (resource.status === "loading") return <LoadingScreen label="Memuat alokasi dana..." />;
  if (resource.status === "error") return <ErrorState error={resource.error} onRetry={resource.reload} />;

  return (
    <div className="page-stack">
      <RefreshWarning error={resource.refreshError} onRetry={resource.reload} />
      <PageHeader title="Alokasi dana" description="Setiap rupiah diberi tujuan. Alokasi tidak mengubah saldo sampai terjadi pengeluaran atau transfer nyata." actions={<Button icon={FiRefreshCw} onClick={resource.reload}>Muat ulang</Button>} />
      {message ? <div className={`notice notice--${message.type}`} role="status">{message.text}</div> : null}

      <section className="allocation-grid">
        {items.length ? items.map((item) => (
          <Card className="allocation-card" key={item.envelope_period_id}>
            <div className="allocation-card__header"><div><h2>{item.name}</h2><small>{item.period_start} – {item.period_end}</small></div><Money value={item.remaining_amount} /></div>
            <ProgressBar value={item.used_amount + Number(item.reserved_amount || 0)} max={item.allocated_amount} label={item.name} />
            <dl><div><dt>Alokasi</dt><dd><Money value={item.allocated_amount} /></dd></div><div><dt>Terpakai</dt><dd><Money value={item.used_amount} /></dd></div><div><dt>Dipesan</dt><dd><Money value={item.reserved_amount} /></dd></div></dl>
            {item.can_close || item.can_archive_rule ? <div className="form-actions">
              {item.can_close ? <Button icon={FiArchive} onClick={() => { setCloseTarget(item); setCloseState({ status: "idle", error: null }); }}>Tutup periode</Button> : null}
              {item.can_archive_rule ? <Button icon={FiArchive} onClick={() => { setArchiveTarget(item); setArchiveState({ status: "idle", error: null }); }}>Arsipkan aturan</Button> : null}
            </div> : null}
          </Card>
        )) : <Card className="panel"><p>Belum ada kantong aktif untuk periode ini.</p></Card>}
      </section>

      {user?.role === "owner" ? (
        <Card className="panel">
          <div className="panel__header"><div><p className="eyebrow">Kantong baru</p><h2>Buat alokasi periode</h2><p>Alokasi memberi tujuan pada dana; tidak mengubah saldo rekening.</p></div></div>
          <form className="form-grid" onSubmit={createEnvelope}>
            <label className="field form-grid__full"><span>Nama kantong *</span><input required maxLength="100" value={createForm.name} onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))} placeholder="Contoh: Jatah makan bulanan" /></label>
            <MoneyInput id="envelope-default" label="Nominal alokasi" value={createForm.default_amount} onChange={(value) => setCreateForm((current) => ({ ...current, default_amount: value }))} />
            <label className="field"><span>Rekening sumber</span><select value={createForm.source_account_id} onChange={(event) => setCreateForm((current) => ({ ...current, source_account_id: event.target.value }))}><option value="">Gabungan rekening bersama</option>{accounts.map((account) => <option key={account.account_id} value={account.account_id}>{accountDisplayLabel(account)}</option>)}</select><small>Rekening pribadi otomatis membuat kantong pribadi.</small></label>
            <label className="field"><span>Periode jatah</span><select value={createForm.period_type} onChange={(event) => setCreateForm((current) => ({ ...current, period_type: event.target.value }))}><option value="daily">Harian</option><option value="weekly">Mingguan</option><option value="biweekly">Dua mingguan</option><option value="monthly">Bulanan</option><option value="paycycle">Periode gajian</option><option value="custom">Khusus</option></select></label>
            <label className="field"><span>Rollover</span><select value={createForm.rollover_policy} onChange={(event) => setCreateForm((current) => ({ ...current, rollover_policy: event.target.value }))}><option value="unallocated">Kembali ke belum dialokasikan</option><option value="carry">Bawa sisa ke periode berikutnya</option></select><small>Rollover hanya memindahkan sisa alokasi dan tidak dihitung sebagai pemasukan.</small></label>
            <label className="field"><span>Mulai periode</span><input type="date" value={createForm.period_start} onChange={(event) => setCreateForm((current) => ({ ...current, period_start: event.target.value }))} /></label>
            <label className="field"><span>Akhir periode</span><input type="date" value={createForm.period_end} onChange={(event) => setCreateForm((current) => ({ ...current, period_end: event.target.value }))} /></label>
            <div className="form-grid__full form-actions"><Button variant="primary" icon={FiPlus} type="submit" loading={createMutation.busy}>Buat kantong</Button></div>
          </form>
        </Card>
      ) : null}

      <Card className="panel">
        <div className="panel__header"><div><p className="eyebrow">Mutasi alokasi</p><h2>Pindahkan sisa ke kantong lain</h2><p>Mutasi ini bukan pemasukan atau pengeluaran dan wajib masuk audit.</p></div></div>
        <form className="form-grid" onSubmit={submitMove}>
          <label className="field"><span>Dari kantong</span><select value={move.fromEnvelopePeriodId} onChange={(event) => setMove((current) => ({ ...current, fromEnvelopePeriodId: event.target.value, toEnvelopePeriodId: "" }))}><option value="">Pilih sumber</option>{items.map((item) => <option key={item.envelope_period_id} value={item.envelope_period_id}>{item.name} — sisa {item.remaining_amount}</option>)}</select></label>
          <label className="field"><span>Ke kantong</span><select value={move.toEnvelopePeriodId} onChange={(event) => setMove((current) => ({ ...current, toEnvelopePeriodId: event.target.value }))}><option value="">Pilih tujuan</option>{compatibleDestinationEnvelopes.map((item) => <option key={item.envelope_period_id} value={item.envelope_period_id}>{item.name}</option>)}</select></label>
          <MoneyInput id="move-amount" label="Nominal dipindahkan" value={move.amount} onChange={(amount) => setMove((current) => ({ ...current, amount }))} />
          <label className="field"><span>Alasan</span><input value={move.reason} maxLength="160" onChange={(event) => setMove((current) => ({ ...current, reason: event.target.value }))} placeholder="Contoh: sisa jatah mingguan" /></label>
          <div className="form-grid__full form-actions"><Button variant="primary" icon={FiArrowRight} type="submit" loading={moveMutation.busy}>Pindahkan alokasi</Button></div>
        </form>
      </Card>

      {recentMovements.length ? <Card className="panel">
        <div className="panel__header"><div><p className="eyebrow">Recovery</p><h2>Mutasi alokasi terakhir</h2><p>Mutasi yang salah dapat dibatalkan selama dana hasil realokasi belum terpakai.</p></div></div>
        <div className="compact-list compact-list--stacked">
          {recentMovements.map((movementItem) => <div key={movementItem.movement_id}>
            <span><strong>{movementItem.from_name} → {movementItem.to_name}</strong><small><Money value={movementItem.amount} /> · {movementItem.reason}</small></span>
            {movementItem.can_reverse ? <Button icon={FiRotateCcw} onClick={() => { setReverseTarget(movementItem); setReverseState({ status: "idle", error: null }); }}>Batalkan</Button> : null}
          </div>)}
        </div>
      </Card> : null}

      {user?.role === "owner" && archivedRules.length ? <Card className="panel">
        <div className="panel__header"><div><p className="eyebrow">Arsip</p><h2>Aturan kantong diarsipkan</h2><p>Pulihkan aturan tanpa menghapus audit atau riwayat periode.</p></div></div>
        <div className="compact-list compact-list--stacked">
          {archivedRules.map((rule) => <div key={rule.envelope_rule_id}>
            <span><strong>{rule.name}</strong><small>Status arsip · versi {rule.row_version}</small></span>
            <Button icon={FiRotateCcw} onClick={() => { setRestoreTarget(rule); setRestoreState({ status: "idle", error: null }); }}>Pulihkan</Button>
          </div>)}
        </div>
      </Card> : null}

      <ConfirmationModal
        open={Boolean(closeTarget)}
        title="Tutup periode kantong?"
        description={closeTarget ? `${closeTarget.name} (${closeTarget.period_start}–${closeTarget.period_end}) akan dikunci. ${closeTarget.rollover_policy === "carry" ? "Sisa alokasi akan dibawa ke periode berikutnya." : "Sisa alokasi akan kembali menjadi dana belum dialokasikan."}` : ""}
        confirmLabel="Tutup periode"
        busy={closeState.status === "submitting"}
        error={closeState.error}
        onCancel={() => closeState.status !== "submitting" && setCloseTarget(null)}
        onConfirm={closeEnvelope}
      />
      <ConfirmationModal
        open={Boolean(archiveTarget)}
        title="Arsipkan aturan kantong?"
        description={archiveTarget ? `${archiveTarget.rule_name || archiveTarget.name} tidak akan menerima alokasi baru. Periode dan riwayat mutasi tidak dihapus.` : ""}
        confirmLabel="Arsipkan aturan"
        reasonLabel="Alasan arsip"
        requireReason
        busy={archiveState.status === "submitting"}
        error={archiveState.error}
        onCancel={() => archiveState.status !== "submitting" && setArchiveTarget(null)}
        onConfirm={archiveRule}
      />
      <ConfirmationModal
        open={Boolean(restoreTarget)}
        title="Pulihkan aturan kantong?"
        description={restoreTarget ? `${restoreTarget.name} akan diaktifkan kembali beserta periode yang masih dapat dipakai.` : ""}
        confirmLabel="Pulihkan aturan"
        reasonLabel="Alasan pemulihan"
        requireReason
        busy={restoreState.status === "submitting"}
        error={restoreState.error}
        onCancel={() => restoreState.status !== "submitting" && setRestoreTarget(null)}
        onConfirm={restoreRule}
      />
      <ConfirmationModal
        open={Boolean(reverseTarget)}
        title="Batalkan mutasi alokasi?"
        description={reverseTarget ? `${reverseTarget.from_name} → ${reverseTarget.to_name}. Dana akan dikembalikan hanya jika belum terpakai atau dipesan.` : ""}
        confirmLabel="Batalkan mutasi"
        reasonLabel="Alasan pembatalan"
        requireReason
        busy={reverseState.status === "submitting"}
        error={reverseState.error}
        onCancel={() => reverseState.status !== "submitting" && setReverseTarget(null)}
        onConfirm={reverseMovement}
      />
    </div>
  );
};

export default AllocationsPage;
