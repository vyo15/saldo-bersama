import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState } from "react";
import { FiArchive, FiArrowRight, FiChevronDown, FiMoreHorizontal, FiPieChart, FiPlus, FiRefreshCw, FiRotateCcw } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import Money from "../../components/common/Money.jsx";
import Modal from "../../components/common/Modal.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import ProgressBar from "../../components/common/ProgressBar.jsx";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import LoadingScreen from "../../components/feedback/LoadingScreen.jsx";
import { useFeedback } from "../../components/feedback/feedbackContext.js";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useDashboardAttentionState } from "../../hooks/useDashboardAttentionState.js";
import { useGuardedMutation } from "../../hooks/useGuardedMutation.js";
import { archiveEnvelopeRule as requestArchiveEnvelopeRule, closeEnvelope as requestCloseEnvelope, createEnvelope as requestCreateEnvelope, deleteUnusedEnvelopeRule as requestDeleteUnusedEnvelopeRule, moveEnvelope as requestMoveEnvelope, previewEnvelopeRuleLifecycle, reverseEnvelopeMovement as requestReverseEnvelopeMovement } from "./allocations.api.js";
import { assertPositiveRupiah } from "../../domain/money.js";
import { useFinance } from "../../app/FinanceContext.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { currentMonthBoundsInJakarta } from "../../domain/dates.js";
import { filterByAssigneeAccess, filterByOwnership, hasSameAssignee } from "../../domain/ownership.js";
import { userRoleLabel } from "../../shared/presentation/user.js";

const AllocationDialogLayer = lazy(() => import("./AllocationDialogLayer.jsx"));

const defaultCreateForm = () => {
  const { start, end } = currentMonthBoundsInJakarta();
  return { name: "", default_amount: "", source_account_id: "", assignee_user_id: "", period_type: "monthly", period_start: start, period_end: end, rollover_policy: "unallocated", overspend_policy: "confirm" };
};

const useAllocationCreateMove = ({ resource, refreshOverview, invalidate, createMutation, moveMutation, createForm, setCreateForm, move, setMove, lookup, notify, setMessage, onCreated, onMoved }) => {
  const refreshAfterMutation = async () => { invalidate(["envelopes.list", "reports.monthly", "app.initialState"]); await Promise.allSettled([resource.reload(), refreshOverview()]); };
  const createEnvelope = (event) => {
    event.preventDefault(); setMessage(null);
    return createMutation.run(async () => {
      const amount = assertPositiveRupiah(createForm.default_amount);
      await requestCreateEnvelope({ ...createForm, default_amount: amount, allocated_amount: amount }, {});
      setCreateForm(defaultCreateForm());
      onCreated?.();
      notify({ message: "Kantong dan periode aktif berhasil dibuat." });
      await refreshAfterMutation();
    }).catch((error) => setMessage({ type: "danger", text: error.message }));
  };
  const submitMove = (event) => {
    event.preventDefault(); setMessage(null);
    return moveMutation.run(async () => {
      const amount = assertPositiveRupiah(move.amount);
      const from = lookup[move.fromEnvelopePeriodId]; const to = lookup[move.toEnvelopePeriodId];
      if (!from || !to) throw new Error("Kantong sumber dan tujuan wajib dipilih.");
      if (from.envelope_period_id === to.envelope_period_id) throw new Error("Kantong sumber dan tujuan harus berbeda.");
      if (amount > Number(from.remaining_amount || 0)) throw new Error("Nominal melebihi sisa kantong sumber.");
      await requestMoveEnvelope({ ...move, amount, from_row_version: from.row_version, to_row_version: to.row_version }, {});
      setMove({ fromEnvelopePeriodId: "", toEnvelopePeriodId: "", amount: "", reason: "" });
      onMoved?.();
      notify({ message: "Alokasi berhasil dipindahkan tanpa mengubah total saldo." });
      await refreshAfterMutation();
    }).catch((error) => setMessage({ type: "danger", text: error.message }));
  };
  return { refreshAfterMutation, createEnvelope, submitMove };
};

const useAllocationLifecycle = ({ closeTarget, setCloseTarget, setCloseState, archiveTarget, setArchiveTarget, setArchiveState, reverseTarget, setReverseTarget, setReverseState, refreshAfterMutation, notify }) => {
  const closeEnvelope = async () => {
    if (!closeTarget) return; setCloseState({ status: "submitting", error: null });
    try { const result = await requestCloseEnvelope({ envelope_period_id: closeTarget.envelope_period_id, row_version: closeTarget.row_version }, { rowVersion: closeTarget.row_version }); setCloseTarget(null); setCloseState({ status: "idle", error: null }); const rolloverAmount = Number(result?.rollover?.amount || 0); notify({ message: rolloverAmount > 0 ? `Periode berhasil ditutup. Sisa Rp ${rolloverAmount.toLocaleString("id-ID")} dibawa ke periode berikutnya.` : "Periode kantong berhasil ditutup. Sisa alokasi kembali menjadi dana belum dialokasikan." }); await refreshAfterMutation(); } catch (error) { setCloseState({ status: "error", error }); }
  };
  const openRuleLifecycle = async (item) => { setArchiveState({ status: "submitting", error: null }); try { const preview = await previewEnvelopeRuleLifecycle({ envelope_rule_id: item.envelope_rule_id, row_version: item.rule_row_version }, { force: true }); setArchiveTarget({ item, preview }); setArchiveState({ status: "idle", error: null }); } catch (error) { setArchiveState({ status: "idle", error: null }); notify({ message: error.message || "Status kantong gagal diperiksa.", tone: "danger", dedupeKey: "envelopes:lifecycle-preview-error" }); } };
  const applyRuleLifecycle = async (reason, confirmation) => { if (!archiveTarget) return; const { item, preview } = archiveTarget; setArchiveState({ status: "submitting", error: null }); try { if (preview.canDeleteUnused) { await requestDeleteUnusedEnvelopeRule({ envelope_rule_id: item.envelope_rule_id, row_version: item.rule_row_version, reason, acknowledged: confirmation.acknowledged }, { rowVersion: item.rule_row_version }); notify({ message: "Kantong yang belum pernah digunakan berhasil dihapus permanen." }); } else { await requestArchiveEnvelopeRule({ envelope_rule_id: item.envelope_rule_id, row_version: item.rule_row_version, reason }, { rowVersion: item.rule_row_version }); notify({ message: "Aturan kantong diarsipkan. Riwayat periode dan mutasi tetap tersimpan." }); } setArchiveTarget(null); setArchiveState({ status: "idle", error: null }); await refreshAfterMutation(); } catch (error) { setArchiveState({ status: "error", error }); } };
  const reverseMovement = async (reason) => { if (!reverseTarget) return; setReverseState({ status: "submitting", error: null }); try { await requestReverseEnvelopeMovement({ movement_id: reverseTarget.movement_id, row_version: reverseTarget.row_version, from_row_version: reverseTarget.from_row_version, to_row_version: reverseTarget.to_row_version, reason }, { rowVersion: reverseTarget.row_version }); setReverseTarget(null); setReverseState({ status: "idle", error: null }); notify({ message: "Mutasi alokasi berhasil dibatalkan tanpa menghapus riwayat audit." }); await refreshAfterMutation(); } catch (error) { setReverseState({ status: "error", error }); } };
  return { closeEnvelope, openRuleLifecycle, applyRuleLifecycle, reverseMovement };
};

const allocationAssigneeLabel = (item) => {
  if (!item?.assignee_user_id) return "Bersama";
  const name = String(item.assignee_name || "Pengguna").trim();
  return `${name} · ${userRoleLabel(item.assignee_role)}`;
};

const MONTH_LABELS = Object.freeze(["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]);

const parseDateParts = (value) => {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
};

const allocationPeriodLabel = (startValue, endValue) => {
  const start = parseDateParts(startValue); const end = parseDateParts(endValue);
  if (!start || !end) return `${startValue || "?"} – ${endValue || "?"}`;
  if (start.year === end.year && start.month === end.month) return `${start.day}–${end.day} ${MONTH_LABELS[start.month - 1]} ${start.year}`;
  if (start.year === end.year) return `${start.day} ${MONTH_LABELS[start.month - 1]} – ${end.day} ${MONTH_LABELS[end.month - 1]} ${start.year}`;
  return `${start.day} ${MONTH_LABELS[start.month - 1]} ${start.year} – ${end.day} ${MONTH_LABELS[end.month - 1]} ${end.year}`;
};

const allocationUsage = (item) => {
  const allocated = Math.max(0, Number(item?.allocated_amount || 0));
  const used = Math.max(0, Number(item?.used_amount || 0));
  const reserved = Math.max(0, Number(item?.reserved_amount || 0));
  const committed = used + reserved;
  const percentage = allocated > 0 ? Math.max(0, Math.round((committed / allocated) * 100)) : 0;
  if (committed <= 0) return { allocated, used, reserved, committed, percentage, label: "Belum terpakai", tone: "idle" };
  if (allocated <= 0 || committed > allocated) return { allocated, used, reserved, committed, percentage, label: "Melebihi alokasi", tone: "danger" };
  if (percentage >= 100) return { allocated, used, reserved, committed, percentage, label: "Alokasi penuh", tone: "danger" };
  if (percentage >= 80) return { allocated, used, reserved, committed, percentage, label: "Menipis", tone: "warning" };
  return { allocated, used, reserved, committed, percentage, label: "Sedang digunakan", tone: "active" };
};

const allocationRolloverLabel = (policy) => {
  if (policy === "carry") return "Bawa sisa ke periode berikutnya";
  if (policy === "unallocated") return "Kembali ke dana belum dialokasikan";
  return "Mengikuti aturan kantong";
};

const AllocationSummary = ({ items }) => {
  const totals = items.reduce((sum, item) => ({
    allocated: sum.allocated + Math.max(0, Number(item.allocated_amount || 0)),
    used: sum.used + Math.max(0, Number(item.used_amount || 0)),
    reserved: sum.reserved + Math.max(0, Number(item.reserved_amount || 0)),
    remaining: sum.remaining + Number(item.remaining_amount || 0),
  }), { allocated: 0, used: 0, reserved: 0, remaining: 0 });
  const usage = allocationUsage({ allocated_amount: totals.allocated, used_amount: totals.used, reserved_amount: totals.reserved });
  return <Card className="allocation-summary" aria-labelledby="allocation-summary-title"><div className="allocation-summary__content"><div className="allocation-summary__top"><span className="allocation-summary__eyebrow" id="allocation-summary-title">Ringkasan alokasi aktif</span><span className={`allocation-summary__status allocation-summary__status--${items.length ? usage.tone : "idle"}`}>{items.length ? usage.label : "Belum ada kantong"}</span></div><div className="allocation-summary__amount"><Money value={totals.remaining} tone={totals.remaining < 0 ? "negative" : "default"} /></div><p>Sisa dari <Money value={totals.allocated} /> yang dialokasikan.</p><div className="allocation-summary__progress"><ProgressBar value={usage.committed} max={totals.allocated} label="Pemakaian seluruh alokasi aktif" /></div><div className="allocation-summary__metrics"><div><span>Terpakai + dipesan</span><strong><Money value={usage.committed} /></strong></div><div><span>Kantong aktif</span><strong>{items.length} kantong</strong></div></div></div><img className="allocation-summary__art" src="/login/assets/mobile/wallet.webp" alt="" aria-hidden="true" draggable="false" /></Card>;
};

const AllocationCard = ({ item, onOpenActions, attention = false }) => {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const usage = allocationUsage(item);
  const hasActions = Boolean(item.can_close || item.can_archive_rule);
  return <Card className={`allocation-card${expanded ? " is-expanded" : ""}${attention ? " allocation-card--attention" : ""}`} data-envelope-period-id={item.envelope_period_id}><div className="allocation-card__header"><span className="allocation-card__icon"><FiPieChart aria-hidden="true" /></span><div className="allocation-card__heading"><h2>{item.name}</h2><p>{allocationAssigneeLabel(item)} · {allocationPeriodLabel(item.period_start, item.period_end)}</p></div>{hasActions ? <button type="button" className="allocation-card__menu" aria-label={`Kelola kantong ${item.name}`} onClick={() => onOpenActions(item)}><FiMoreHorizontal aria-hidden="true" /></button> : null}</div><div className="allocation-card__balance"><span className="allocation-card__balance-label"><i aria-hidden="true" />Sisa alokasi</span><Money className="allocation-card__remaining" value={item.remaining_amount} tone={Number(item.remaining_amount || 0) < 0 ? "negative" : "default"} /><div className="allocation-card__progress-meta"><span>Terpakai + dipesan <strong><Money value={usage.committed} /></strong></span><strong>{usage.percentage}%</strong></div><div className="allocation-card__progress"><ProgressBar value={usage.committed} max={usage.allocated} label={item.name} /></div></div><div className="allocation-card__quick"><div><span>Total alokasi</span><strong><Money value={usage.allocated} /></strong></div><div><span>Status</span><strong className={`allocation-card__status allocation-card__status--${usage.tone}`}>{usage.label}</strong></div></div><button type="button" className="allocation-card__expand" aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded((current) => !current)}>{expanded ? "Tutup detail" : "Lihat detail"}<FiChevronDown aria-hidden="true" /></button><div className="allocation-card__details" id={detailsId} aria-hidden={!expanded}><div><dl><div><dt>Jatah untuk</dt><dd>{allocationAssigneeLabel(item)}</dd></div><div><dt>Periode</dt><dd>{allocationPeriodLabel(item.period_start, item.period_end)}</dd></div><div><dt>Terpakai</dt><dd><Money value={usage.used} /></dd></div><div><dt>Dipesan</dt><dd><Money value={usage.reserved} /></dd></div><div><dt>Rollover</dt><dd>{allocationRolloverLabel(item.rollover_policy)}</dd></div></dl></div></div></Card>;
};

const AllocationCards = ({ items, totalItems, onOpenActions, attentionEnvelopeId }) => <section className="allocation-grid" aria-label="Daftar kantong aktif">{items.length ? items.map((item) => <AllocationCard key={item.envelope_period_id} item={item} onOpenActions={onOpenActions} attention={item.envelope_period_id === attentionEnvelopeId} />) : <Card className="allocation-empty panel"><EmptyState variant="inline" icon={FiPieChart} title={totalItems ? "Tidak ada kantong yang sesuai filter" : "Belum ada kantong aktif"} description={totalItems ? "Pilih filter lain untuk menampilkan kantong aktif." : "Buat kantong untuk mulai membagi dana yang tersedia."} /></Card>}</section>;

const AllocationHistory = ({ items }) => items.length ? <Card className="panel"><div className="panel__header"><h2>Riwayat periode</h2></div><div className="compact-list compact-list--stacked">{items.map((item) => <div key={item.envelope_period_id}><span><strong>{item.name}</strong><small>{item.period_start} – {item.period_end} · Jatah untuk {allocationAssigneeLabel(item)} · {item.status === "closed" ? "Ditutup" : item.status === "archived" ? "Diarsipkan" : item.status}</small></span><span><Money value={item.allocated_amount} /><small>Terpakai <Money value={item.used_amount} /></small></span></div>)}</div></Card> : null;


const RecoveryPanels = ({ recentMovements, setReverseTarget, setReverseState }) => recentMovements.length ? <Card className="panel"><div className="panel__header"><h2>Mutasi terakhir</h2></div><div className="compact-list compact-list--stacked">{recentMovements.map((item) => <div key={item.movement_id}><span><strong>{item.from_name} → {item.to_name}</strong><small><Money value={item.amount} /> · {item.reason}</small></span>{item.can_reverse ? <Button icon={FiRotateCcw} onClick={() => { setReverseTarget(item); setReverseState({ status: "idle", error: null }); }}>Batalkan</Button> : null}</div>)}</div></Card> : null;

const AllocationActionModal = ({ target, onClose, onClosePeriod, onLifecycle }) => <Modal open={Boolean(target)} onClose={onClose} title={target?.name || "Kelola kantong"} description={target ? `${allocationAssigneeLabel(target)} · ${allocationPeriodLabel(target.period_start, target.period_end)}` : ""} size="sm" mobileSwipeToClose><div className="allocation-action-sheet"><div className="allocation-action-sheet__balance"><span>Sisa alokasi</span><Money value={target?.remaining_amount || 0} tone={Number(target?.remaining_amount || 0) < 0 ? "negative" : "default"} /></div><div className="allocation-action-sheet__actions">{target?.can_close ? <Button icon={FiArchive} onClick={() => onClosePeriod(target)}>Tutup periode</Button> : null}{target?.can_archive_rule ? <Button className="allocation-action-sheet__danger" icon={FiArchive} onClick={() => onLifecycle(target)}>Hapus / Arsipkan</Button> : null}</div><p>Aksi penutupan dan arsip tetap memakai validasi serta konfirmasi yang sama seperti sebelumnya.</p></div></Modal>;



const ALLOCATION_FILTERS = Object.freeze([
  { value: "all", label: "Semua" },
  { value: "shared", label: "Bersama" },
  { value: "mine", label: "Saya" },
  { value: "unused", label: "Belum terpakai" },
]);

const isAllocationAdministrator = (user) => user?.role === "owner";
const activeAllocationAccounts = (bootstrap) => (bootstrap?.accounts || []).filter((item) => item.status === "active");
const activeAllocationUsers = (resource) => (resource.data?.items || []).filter((item) => item.status === "active");

const filterActiveAllocations = (items, allocationFilter, actor) => items.filter((item) => {
  if (allocationFilter === "shared") return !item.assignee_user_id;
  if (allocationFilter === "mine") return Boolean(actor?.user_id) && item.assignee_user_id === actor.user_id;
  if (allocationFilter === "unused") return Number(item.used_amount || 0) + Number(item.reserved_amount || 0) === 0;
  return true;
});

const allocationMoveDestinations = ({ movableItems, selectedSourceEnvelope, sourceId, administratorMode }) => filterByOwnership(movableItems, selectedSourceEnvelope)
  .filter((item) => item.envelope_period_id !== sourceId)
  .filter((item) => administratorMode || hasSameAssignee(item, selectedSourceEnvelope));

const hasAllocationMovePair = (movableItems, administratorMode) => movableItems.some((source) => filterByOwnership(movableItems, source)
  .some((target) => target.envelope_period_id !== source.envelope_period_id && (administratorMode || hasSameAssignee(source, target))));

const AllocationAttentionNotice = ({ envelopeId }) => envelopeId ? <div className="notice notice--info attention-guidance" role="status"><strong>Periksa kantong yang disorot.</strong><span>Lihat sisa jatah dan transaksi terkait sebelum membuat pengeluaran berikutnya. Jangan pindahkan dana hanya untuk menutup pemakaian yang belum diperiksa.</span></div> : null;

const AllocationHeaderActions = ({ administratorMode, canMove, openCreate, openMove, reload }) => <div className={`allocation-header-actions allocation-header-actions--${administratorMode ? "administrator" : "member"}`}>
  {administratorMode ? <Button className="allocation-header-actions__primary" variant="primary" icon={FiPlus} onClick={openCreate}>Buat kantong</Button> : null}
  <Button icon={FiArrowRight} onClick={openMove} disabled={!canMove} aria-label="Pindahkan alokasi">Pindahkan</Button>
  <Button className="allocation-refresh-action" icon={FiRefreshCw} onClick={reload} aria-label="Muat ulang alokasi">Muat ulang</Button>
</div>;

const AllocationActiveSection = ({ activeItems, filteredActiveItems, allocationFilter, setAllocationFilter, setActionTarget, attentionEnvelopeId }) => <section className="allocation-active" aria-labelledby="allocation-active-title">
  <div className="allocation-section-heading"><h2 id="allocation-active-title">Kantong aktif</h2><span>{filteredActiveItems.length} dari {activeItems.length}</span></div>
  {activeItems.length ? <div className="allocation-filters" role="group" aria-label="Filter kantong aktif">{ALLOCATION_FILTERS.map((filter) => <button type="button" key={filter.value} className={allocationFilter === filter.value ? "is-active" : ""} aria-pressed={allocationFilter === filter.value} onClick={() => setAllocationFilter(filter.value)}>{filter.label}</button>)}</div> : null}
  <AllocationCards items={filteredActiveItems} totalItems={activeItems.length} onOpenActions={setActionTarget} attentionEnvelopeId={attentionEnvelopeId} />
</section>;

const AllocationsPage = () => {
  const { attention, consumeAttention } = useDashboardAttentionState();
  const attentionHandled = useRef(false);
  const resource = useApiResource("envelopes.list");
  const { refreshOverview, invalidate, bootstrap } = useFinance();
  const { user } = useAuth();
  const { notify } = useFeedback();
  const administratorMode = isAllocationAdministrator(user);
  const usersResource = useApiResource("users.list", {}, { enabled: administratorMode });
  const createMutation = useGuardedMutation();
  const moveMutation = useGuardedMutation();
  const [move, setMove] = useState({ fromEnvelopePeriodId: "", toEnvelopePeriodId: "", amount: "", reason: "" });
  const [createForm, setCreateForm] = useState(defaultCreateForm);
  const [createOpen, setCreateOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [message, setMessage] = useState(null);
  const [allocationFilter, setAllocationFilter] = useState("all");
  const [actionTarget, setActionTarget] = useState(null);
  const [closeTarget, setCloseTarget] = useState(null);
  const [closeState, setCloseState] = useState({ status: "idle", error: null });
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiveState, setArchiveState] = useState({ status: "idle", error: null });
  const [reverseTarget, setReverseTarget] = useState(null);
  const [reverseState, setReverseState] = useState({ status: "idle", error: null });
  const accounts = activeAllocationAccounts(bootstrap);
  const activeUsers = activeAllocationUsers(usersResource);
  const items = useMemo(() => resource.data?.items || [], [resource.data?.items]);
  const activeItems = useMemo(() => items.filter((item) => item.status === "active"), [items]);
  const historicalItems = useMemo(() => items.filter((item) => item.status !== "active"), [items]);
  const allocationActor = bootstrap?.user || user;
  const filteredActiveItems = useMemo(() => filterActiveAllocations(activeItems, allocationFilter, allocationActor), [activeItems, allocationActor, allocationFilter]);
  const movableItems = useMemo(() => filterByAssigneeAccess(activeItems, allocationActor), [activeItems, allocationActor]);
  const recentMovements = resource.data?.recentMovements || [];
  const lookup = useMemo(() => Object.fromEntries(activeItems.map((item) => [item.envelope_period_id, item])), [activeItems]);
  const selectedSourceEnvelope = lookup[move.fromEnvelopePeriodId] || null;
  const destinations = allocationMoveDestinations({ movableItems, selectedSourceEnvelope, sourceId: move.fromEnvelopePeriodId, administratorMode });
  const canMove = hasAllocationMovePair(movableItems, administratorMode);
  const createMove = useAllocationCreateMove({ resource, refreshOverview, invalidate, createMutation, moveMutation, createForm, setCreateForm, move, setMove, lookup, notify, setMessage, onCreated: () => setCreateOpen(false), onMoved: () => setMoveOpen(false) });
  const lifecycle = useAllocationLifecycle({ closeTarget, setCloseTarget, setCloseState, archiveTarget, setArchiveTarget, setArchiveState, reverseTarget, setReverseTarget, setReverseState, refreshAfterMutation: createMove.refreshAfterMutation, notify });
  const attentionEnvelopeId = String(attention?.attentionEnvelopeId || "");

  useEffect(() => {
    if (attentionHandled.current || !attentionEnvelopeId || resource.status !== "ready") return undefined;
    attentionHandled.current = true;
    const targetExists = activeItems.some((item) => item.envelope_period_id === attentionEnvelopeId);
    consumeAttention();
    if (!targetExists) return undefined;
    const frame = window.requestAnimationFrame(() => document.querySelector(`[data-envelope-period-id="${CSS.escape(attentionEnvelopeId)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
    return () => window.cancelAnimationFrame(frame);
  }, [activeItems, attentionEnvelopeId, consumeAttention, resource.status]);

  if (resource.status === "loading") return <LoadingScreen label="Memuat alokasi dana..." />;
  if (resource.status === "error") return <ErrorState error={resource.error} onRetry={resource.reload} />;

  const modalProps = { closeTarget, setCloseTarget, closeState, archiveTarget, setArchiveTarget, archiveState, reverseTarget, setReverseTarget, reverseState, ...lifecycle };
  const openCreate = () => { setMessage(null); setCreateOpen(true); };
  const openMove = () => { setMessage(null); setMoveOpen(true); };
  const closeCreate = () => { if (!createMutation.busy) setCreateOpen(false); };
  const closeMove = () => { if (!moveMutation.busy) setMoveOpen(false); };
  const startClosePeriod = (item) => { setActionTarget(null); setCloseTarget(item); setCloseState({ status: "idle", error: null }); };
  const startLifecycle = (item) => { setActionTarget(null); lifecycle.openRuleLifecycle(item); };

  return <div className="page-stack allocations-page">
    <RefreshWarning error={resource.refreshError} onRetry={resource.reload} />
    {administratorMode ? <RefreshWarning error={usersResource.refreshError || usersResource.error} onRetry={usersResource.reload} /> : null}
    <PageHeader title="Alokasi dana" description="Bagi dana ke kantong yang jelas, lalu pantau pemakaiannya." />
    <AllocationAttentionNotice envelopeId={attentionEnvelopeId} />
    <AllocationSummary items={activeItems} />
    <AllocationHeaderActions administratorMode={administratorMode} canMove={canMove} openCreate={openCreate} openMove={openMove} reload={resource.reload} />
    <AllocationActiveSection activeItems={activeItems} filteredActiveItems={filteredActiveItems} allocationFilter={allocationFilter} setAllocationFilter={setAllocationFilter} setActionTarget={setActionTarget} attentionEnvelopeId={attentionEnvelopeId} />
    <AllocationHistory items={historicalItems} />
    <RecoveryPanels recentMovements={recentMovements} setReverseTarget={setReverseTarget} setReverseState={setReverseState} />
    <AllocationActionModal target={actionTarget} onClose={() => setActionTarget(null)} onClosePeriod={startClosePeriod} onLifecycle={startLifecycle} />
    {createOpen || moveOpen || closeTarget || archiveTarget || reverseTarget ? (
      <Suspense fallback={null}>
        <AllocationDialogLayer
          createOpen={createOpen}
          closeCreate={closeCreate}
          createForm={createForm}
          setCreateForm={setCreateForm}
          accounts={accounts}
          activeUsers={activeUsers}
          usersStatus={usersResource.status}
          createEnvelope={createMove.createEnvelope}
          createMutation={createMutation}
          message={message}
          moveOpen={moveOpen}
          closeMove={closeMove}
          move={move}
          setMove={setMove}
          movableItems={movableItems}
          destinations={destinations}
          submitMove={createMove.submitMove}
          moveMutation={moveMutation}
          assigneeLabel={allocationAssigneeLabel}
          modalProps={modalProps}
        />
      </Suspense>
    ) : null}
  </div>;
};

export default AllocationsPage;
