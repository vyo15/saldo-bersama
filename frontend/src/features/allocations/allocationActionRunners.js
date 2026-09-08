import { assertNonNegativeRupiah, assertPositiveRupiah } from "../../domain/money.js";
import {
  adjustEnvelopeAllocation,
  archiveEnvelopeRule,
  closeEnvelope,
  createEnvelope,
  deleteUnusedEnvelopeRule,
  moveEnvelope,
  previewEnvelopeRuleLifecycle,
  reverseEnvelopeMovement,
} from "./allocations.api.js";

export const runCreateAllocation = async ({ createForm, resetForm, setCreateForm, onCreated, notify, refreshAfterMutation }) => {
  const name = String(createForm.name || "").trim();
  if (!name) throw new Error("Nama alokasi wajib diisi.");
  const amount = assertNonNegativeRupiah(createForm.default_amount);
  if (!createForm.source_account_id) throw new Error("Rekening sumber wajib dipilih.");
  const created = await createEnvelope({ ...createForm, name, default_amount: amount, allocated_amount: amount }, {});
  setCreateForm(resetForm());
  onCreated?.(created);
  notify({ message: "Alokasi dan periode aktif berhasil dibuat." });
  await refreshAfterMutation();
};

export const runMoveAllocation = async ({ move, lookup, setMove, onMoved, notify, refreshAfterMutation }) => {
  const amount = assertPositiveRupiah(move.amount);
  const from = lookup[move.fromEnvelopePeriodId];
  const to = lookup[move.toEnvelopePeriodId];
  if (!from || !to) throw new Error("Alokasi sumber dan tujuan wajib dipilih.");
  if (from.envelope_period_id === to.envelope_period_id) throw new Error("Alokasi sumber dan tujuan harus berbeda.");
  if (amount > Number(from.remaining_amount || 0)) throw new Error("Nominal melebihi sisa alokasi sumber.");
  await moveEnvelope({ ...move, amount, from_row_version: from.row_version, to_row_version: to.row_version }, {});
  setMove({ fromEnvelopePeriodId: "", toEnvelopePeriodId: "", amount: "", reason: "" });
  onMoved?.();
  notify({ message: "Dana berhasil dipindahkan antar alokasi tanpa mengubah total saldo." });
  await refreshAfterMutation();
};

export const runAllocationAdjustment = async ({ target, direction, rawAmount, reason = "", setAdjustTarget, setAdjustForm, onReleased, notify, refreshAfterMutation }) => {
  const amount = assertPositiveRupiah(rawAmount);
  await adjustEnvelopeAllocation({
    envelope_period_id: target.envelope_period_id,
    direction,
    amount,
    reason,
    row_version: target.row_version,
  }, { rowVersion: target.row_version });
  const funded = direction === "fund";
  setAdjustTarget(null);
  setAdjustForm({ direction: "fund", amount: "", reason: "" });
  if (!funded) onReleased?.({ amount, sourceAccountId: target.source_account_id || "" });
  notify({ message: funded ? "Dana tersedia berhasil ditambahkan ke Alokasi Dana." : "Dana Alokasi Dana berhasil dikembalikan menjadi dana tersedia." });
  await refreshAfterMutation();
  return true;
};

export const runCloseAllocation = async ({ closeTarget, closeReuseNeeds, setCloseTarget, setCloseReuseNeeds, setCloseState, onReleased, notify, refreshAfterMutation }) => {
  const result = await closeEnvelope({
    envelope_period_id: closeTarget.envelope_period_id,
    row_version: closeTarget.row_version,
    reuse_needs: closeReuseNeeds,
  }, { rowVersion: closeTarget.row_version });
  const releasedAmount = Math.max(0, Number(result?.released_amount || 0));
  const rolloverAmount = Math.max(0, Number(result?.rollover?.amount || 0));
  const copiedNeeds = Math.max(0, Number(result?.needs_continuity?.copied || 0));
  if (releasedAmount > 0) onReleased?.({ amount: releasedAmount, sourceAccountId: closeTarget.source_account_id || "" });
  setCloseTarget(null);
  setCloseReuseNeeds(false);
  setCloseState({ status: "idle", error: null });
  const continuationText = copiedNeeds > 0 ? ` ${copiedNeeds} kebutuhan disiapkan untuk periode berikutnya.` : " Periode berikutnya sudah disiapkan.";
  notify({
    message: rolloverAmount > 0
      ? `Periode berhasil ditutup. Sisa Rp ${rolloverAmount.toLocaleString("id-ID")} dibawa ke periode berikutnya.${continuationText}`
      : `Periode berhasil ditutup. Sisa dana kembali menjadi dana tersedia.${continuationText}`,
  });
  await refreshAfterMutation();
};

export const runPreviewAllocationLifecycle = async ({ item, setArchiveTarget, setArchiveState, notify }) => {
  try {
    const preview = await previewEnvelopeRuleLifecycle({ envelope_rule_id: item.envelope_rule_id, row_version: item.rule_row_version }, { force: true });
    setArchiveTarget({ item, preview });
    setArchiveState({ status: "idle", error: null });
  } catch (error) {
    setArchiveState({ status: "idle", error: null });
    notify({ message: error.message || "Status alokasi gagal diperiksa.", tone: "danger", dedupeKey: "envelopes:lifecycle-preview-error" });
  }
};

export const runApplyAllocationLifecycle = async ({ archiveTarget, reason, confirmation, setArchiveTarget, setArchiveState, notify, refreshAfterMutation }) => {
  const { item, preview } = archiveTarget;
  if (preview.canDeleteUnused) {
    await deleteUnusedEnvelopeRule({ envelope_rule_id: item.envelope_rule_id, row_version: item.rule_row_version, reason, acknowledged: confirmation.acknowledged }, { rowVersion: item.rule_row_version });
    notify({ message: "Alokasi yang belum pernah digunakan berhasil dihapus permanen." });
  } else {
    await archiveEnvelopeRule({ envelope_rule_id: item.envelope_rule_id, row_version: item.rule_row_version, reason }, { rowVersion: item.rule_row_version });
    notify({ message: "Aturan alokasi diarsipkan. Riwayat periode dan mutasi tetap tersimpan." });
  }
  setArchiveTarget(null);
  setArchiveState({ status: "idle", error: null });
  await refreshAfterMutation();
};

export const runReverseAllocationMovement = async ({ reverseTarget, reason, setReverseTarget, setReverseState, notify, refreshAfterMutation }) => {
  await reverseEnvelopeMovement({
    movement_id: reverseTarget.movement_id,
    row_version: reverseTarget.row_version,
    from_row_version: reverseTarget.from_row_version,
    to_row_version: reverseTarget.to_row_version,
    reason,
  }, { rowVersion: reverseTarget.row_version });
  setReverseTarget(null);
  setReverseState({ status: "idle", error: null });
  notify({ message: "Pemindahan dana antar alokasi berhasil dibatalkan tanpa menghapus riwayat audit." });
  await refreshAfterMutation();
};
