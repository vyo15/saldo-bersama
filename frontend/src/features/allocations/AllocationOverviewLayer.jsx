import { FiArrowRight, FiBell, FiMoreHorizontal, FiPieChart, FiPlus, FiRefreshCw } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import Money from "../../components/common/Money.jsx";
import ProgressBar from "../../components/common/ProgressBar.jsx";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import { allocationAssigneeLabel, allocationSourceLabel, allocationUsage } from "./allocationPresentation.js";

const ALLOCATION_FILTERS = Object.freeze([
  { value: "all", label: "Semua" },
  { value: "shared", label: "Bersama" },
  { value: "mine", label: "Saya" },
  { value: "unused", label: "Belum terpakai" },
]);

const AllocationSummary = ({ items }) => {
  const totals = items.reduce((sum, item) => ({
    allocated: sum.allocated + Math.max(0, Number(item.allocated_amount || 0)),
    used: sum.used + Math.max(0, Number(item.used_amount || 0)),
    reserved: sum.reserved + Math.max(0, Number(item.reserved_amount || 0)),
    remaining: sum.remaining + Number(item.remaining_amount || 0),
  }), { allocated: 0, used: 0, reserved: 0, remaining: 0 });

  if (!items.length) return <Card className="allocation-summary allocation-summary--empty" aria-labelledby="allocation-summary-title"><div className="allocation-summary__content"><span className="allocation-summary__eyebrow" id="allocation-summary-title">Ringkasan Alokasi Dana</span><div className="allocation-summary__amount"><Money value={0} /></div><p>Belum ada dana yang dialokasikan.</p></div><img className="allocation-summary__art" src="/login/assets/mobile/wallet.webp" alt="" aria-hidden="true" draggable="false" /></Card>;

  const usage = allocationUsage({ allocated_amount: totals.allocated, used_amount: totals.used, reserved_amount: totals.reserved });
  return <Card className="allocation-summary" aria-labelledby="allocation-summary-title"><div className="allocation-summary__content"><div className="allocation-summary__top"><span className="allocation-summary__eyebrow" id="allocation-summary-title">Ringkasan Alokasi Dana aktif</span><span className={`allocation-summary__status allocation-summary__status--${usage.tone}`}>{usage.label}</span></div><div className="allocation-summary__amount"><Money value={totals.remaining} tone={totals.remaining < 0 ? "negative" : "default"} /></div><p>Sisa dari <Money value={totals.allocated} /> yang sudah dialokasikan.</p><div className="allocation-summary__progress"><ProgressBar value={usage.committed} max={totals.allocated} label="Pemakaian seluruh Alokasi Dana aktif" /></div><div className="allocation-summary__metrics"><div><span>Terpakai + dipesan</span><strong><Money value={usage.committed} /></strong></div><div><span>Alokasi aktif</span><strong>{items.length} alokasi</strong></div></div></div><img className="allocation-summary__art" src="/login/assets/mobile/wallet.webp" alt="" aria-hidden="true" draggable="false" /></Card>;
};

const AllocationCard = ({ item, onOpenActions, onReminder, onAdjust, canAdjust, canRemind, attention = false, onOpenDetail, needs = [], scheduleCount = 0 }) => {
  const usage = allocationUsage(item);
  const hasActions = Boolean(item.can_close || item.can_archive_rule);
  const needNames = needs.slice(0, 4).map((budget) => budget.name).filter(Boolean);
  const extraNeeds = Math.max(0, needs.length - needNames.length);
  const needPreview = needNames.length ? `${needNames.join(" · ")}${extraNeeds ? ` · +${extraNeeds}` : ""}` : "Belum ada kebutuhan";

  return <Card className={`allocation-card${attention ? " allocation-card--attention" : ""}`} data-envelope-period-id={item.envelope_period_id}>
    <div className="allocation-card__header"><span className="allocation-card__icon"><FiPieChart aria-hidden="true" /></span><div className="allocation-card__heading"><h2>{item.name}</h2><p>{allocationAssigneeLabel(item)} · {allocationSourceLabel(item)}</p></div><div className="allocation-card__header-actions">{canAdjust ? <button type="button" className="allocation-card__menu" aria-label={`Tambah dana ke alokasi ${item.name}`} onClick={() => onAdjust(item, "fund")}><FiPlus aria-hidden="true" /></button> : null}{canRemind ? <button type="button" className="allocation-card__menu" aria-label={`Atur pengingat alokasi ${item.name}`} onClick={() => onReminder(item)}><FiBell aria-hidden="true" /></button> : null}{hasActions ? <button type="button" className="allocation-card__menu" aria-label={`Kelola alokasi ${item.name}`} onClick={() => onOpenActions(item)}><FiMoreHorizontal aria-hidden="true" /></button> : null}</div></div>
    <div className="allocation-card__balance"><span className="allocation-card__balance-label"><i aria-hidden="true" />Tersisa</span><Money className="allocation-card__remaining" value={item.remaining_amount} tone={Number(item.remaining_amount || 0) < 0 ? "negative" : "default"} /><div className="allocation-card__progress-meta"><span>Terpakai + dipesan <strong><Money value={usage.committed} /></strong></span><strong>{usage.percentage}%</strong></div><div className="allocation-card__progress"><ProgressBar value={usage.committed} max={usage.allocated} label={item.name} /></div></div>
    <div className="allocation-card__quick"><div><span>Dialokasikan</span><strong><Money value={usage.allocated} /></strong></div><div><span>Struktur</span><strong>{needs.length} kebutuhan · {scheduleCount} jadwal</strong></div></div>
    <p className="allocation-card__needs-preview" title={needPreview}>{needPreview}</p>
    <button type="button" className="allocation-card__expand" onClick={() => onOpenDetail(item)}>Lihat detail<FiArrowRight aria-hidden="true" /></button>
  </Card>;
};

const AllocationCards = ({ items, totalItems, onOpenActions, onReminder, onAdjust, actor, attentionEnvelopeId, budgets, recurringItems, onOpenDetail, canCreate, canAdjustItem, canRemindItem, linkedBudgetsForItem, relatedRecurringForItem }) => <section className="allocation-grid" aria-label="Daftar Alokasi Dana aktif">{items.length ? items.map((item) => {
  const needs = linkedBudgetsForItem(budgets, item);
  const scheduleCount = relatedRecurringForItem(recurringItems, budgets, item).length;
  return <AllocationCard key={item.envelope_period_id} item={item} onOpenActions={onOpenActions} onReminder={onReminder} onAdjust={onAdjust} canAdjust={canAdjustItem(item, actor)} canRemind={canRemindItem(item, actor)} attention={item.envelope_period_id === attentionEnvelopeId} onOpenDetail={onOpenDetail} needs={needs} scheduleCount={scheduleCount} />;
}) : <EmptyState className="allocation-empty" variant="inline" icon={FiPieChart} title={totalItems ? "Tidak ada Alokasi Dana yang sesuai filter" : "Belum ada Alokasi Dana aktif"} description={totalItems ? "Pilih filter lain untuk menampilkan Alokasi Dana aktif." : canCreate ? "Buat Alokasi Dana untuk mulai memisahkan dana berdasarkan tujuan." : "Administrator belum menyiapkan Alokasi Dana yang dapat digunakan."} />}</section>;

const AllocationOverviewLayer = ({
  activeItems, filteredActiveItems, allocationFilter, setAllocationFilter, setActionTarget, onReminder, onAdjust,
  actor, attentionEnvelopeId, budgets, recurringItems, onOpenDetail, canCreate, administratorMode, canMove,
  openCreate, openMove, reload, canAdjustItem, canRemindItem,
  linkedBudgetsForItem, relatedRecurringForItem,
}) => <>
  <AllocationSummary items={activeItems} />
  <div className={`allocation-header-actions allocation-header-actions--${administratorMode ? "administrator" : "member"}`}>
    {canCreate ? <Button className="allocation-header-actions__primary" variant="primary" icon={FiPlus} onClick={openCreate}>Buat alokasi</Button> : null}
    <Button icon={FiArrowRight} onClick={openMove} disabled={!canMove} aria-label="Pindahkan dana antar Alokasi Dana">Pindahkan dana</Button>
    <Button className="allocation-refresh-action" icon={FiRefreshCw} onClick={reload} aria-label="Muat ulang Alokasi Dana">Muat ulang</Button>
  </div>
  <section className="allocation-active" aria-labelledby="allocation-active-title">
    <div className="allocation-section-heading"><h2 id="allocation-active-title">Alokasi aktif</h2>{activeItems.length ? <span>{filteredActiveItems.length} dari {activeItems.length}</span> : null}</div>
    {activeItems.length ? <div className="allocation-filters" role="group" aria-label="Filter Alokasi Dana aktif">{ALLOCATION_FILTERS.map((filter) => <button type="button" key={filter.value} className={allocationFilter === filter.value ? "is-active" : ""} aria-pressed={allocationFilter === filter.value} onClick={() => setAllocationFilter(filter.value)}>{filter.label}</button>)}</div> : null}
    <AllocationCards items={filteredActiveItems} totalItems={activeItems.length} onOpenActions={setActionTarget} onReminder={onReminder} onAdjust={onAdjust} actor={actor} attentionEnvelopeId={attentionEnvelopeId} budgets={budgets} recurringItems={recurringItems} onOpenDetail={onOpenDetail} canCreate={canCreate} canAdjustItem={canAdjustItem} canRemindItem={canRemindItem} linkedBudgetsForItem={linkedBudgetsForItem} relatedRecurringForItem={relatedRecurringForItem} />
  </section>
</>;

export default AllocationOverviewLayer;
