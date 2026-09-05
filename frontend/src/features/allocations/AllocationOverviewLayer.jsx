import { FiArrowRight, FiBell, FiMoreHorizontal, FiPieChart, FiPlus, FiRefreshCw } from "react-icons/fi";
import { Link } from "react-router";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import Money from "../../components/common/Money.jsx";
import ProgressBar from "../../components/common/ProgressBar.jsx";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import { allocationAssigneeLabel, allocationSourceLabel, allocationUsage } from "./allocationPresentation.js";
import { allocationClass } from "./allocationStyles.js";

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

  if (!items.length) return null;

  const usage = allocationUsage({ allocated_amount: totals.allocated, used_amount: totals.used, reserved_amount: totals.reserved });
  return <Card className={allocationClass("allocation-summary")} aria-labelledby="allocation-summary-title"><div className={allocationClass("allocation-summary__content")}><div className={allocationClass("allocation-summary__top")}><span className={allocationClass("allocation-summary__eyebrow")} id="allocation-summary-title">Ringkasan Alokasi Dana aktif</span><span className={allocationClass(`allocation-summary__status allocation-summary__status--${usage.tone}`)}>{usage.label}</span></div><div className={allocationClass("allocation-summary__amount")}><Money value={totals.remaining} tone={totals.remaining < 0 ? "negative" : "default"} /></div><p>Sisa dari <Money value={totals.allocated} /> yang sudah dialokasikan.</p><div className={allocationClass("allocation-summary__progress")}><ProgressBar value={usage.committed} max={totals.allocated} label="Pemakaian seluruh Alokasi Dana aktif" /></div><div className={allocationClass("allocation-summary__metrics")}><div><span>Terpakai + dipesan</span><strong><Money value={usage.committed} /></strong></div><div><span>Alokasi aktif</span><strong>{items.length} alokasi</strong></div></div></div><img className={allocationClass("allocation-summary__art")} src="/login/assets/mobile/wallet.webp" width="797" height="900" alt="" aria-hidden="true" draggable="false" decoding="async" /></Card>;
};

const AllocationCard = ({ item, onOpenActions, onReminder, onAdjust, canAdjust, canRemind, attention = false, onOpenDetail, needs = [], scheduleCount = 0 }) => {
  const usage = allocationUsage(item);
  const hasActions = Boolean(item.can_close || item.can_archive_rule);
  const needNames = needs.slice(0, 4).map((budget) => budget.name).filter(Boolean);
  const extraNeeds = Math.max(0, needs.length - needNames.length);
  const needPreview = needNames.length ? `${needNames.join(" · ")}${extraNeeds ? ` · +${extraNeeds}` : ""}` : "Belum ada kebutuhan";

  return <Card className={allocationClass(`allocation-card${attention ? " allocation-card--attention" : ""}`)} data-envelope-period-id={item.envelope_period_id}>
    <div className={allocationClass("allocation-card__header")}><span className={allocationClass("allocation-card__icon")}><FiPieChart aria-hidden="true" /></span><div className={allocationClass("allocation-card__heading")}><h2>{item.name}</h2><p>{allocationAssigneeLabel(item)} · {allocationSourceLabel(item)}</p></div><div className={allocationClass("allocation-card__header-actions")}>{canAdjust ? <button type="button" className={allocationClass("allocation-card__menu")} aria-label={`Tambah dana ke alokasi ${item.name}`} onClick={() => onAdjust(item, "fund")}><FiPlus aria-hidden="true" /></button> : null}{canRemind ? <button type="button" className={allocationClass("allocation-card__menu")} aria-label={`Atur pengingat alokasi ${item.name}`} onClick={() => onReminder(item)}><FiBell aria-hidden="true" /></button> : null}{hasActions ? <button type="button" className={allocationClass("allocation-card__menu")} aria-label={`Kelola alokasi ${item.name}`} onClick={() => onOpenActions(item)}><FiMoreHorizontal aria-hidden="true" /></button> : null}</div></div>
    <div className={allocationClass("allocation-card__balance")}><span className={allocationClass("allocation-card__balance-label")}><i aria-hidden="true" />Tersisa</span><Money className={allocationClass("allocation-card__remaining")} value={item.remaining_amount} tone={Number(item.remaining_amount || 0) < 0 ? "negative" : "default"} /><div className={allocationClass("allocation-card__progress-meta")}><span>Terpakai + dipesan <strong><Money value={usage.committed} /></strong></span><strong>{usage.percentage}%</strong></div><div className={allocationClass("allocation-card__progress")}><ProgressBar value={usage.committed} max={usage.allocated} label={item.name} /></div></div>
    <div className={allocationClass("allocation-card__quick")}><div><span>Dialokasikan</span><strong><Money value={usage.allocated} /></strong></div><div><span>Struktur</span><strong>{needs.length} kebutuhan · {scheduleCount} jadwal</strong></div></div>
    <p className={allocationClass("allocation-card__needs-preview")} title={needPreview}>{needPreview}</p>
    <button type="button" className={allocationClass("allocation-card__expand")} onClick={() => onOpenDetail(item)}>Lihat detail<FiArrowRight aria-hidden="true" /></button>
  </Card>;
};

const AllocationCards = ({ items, totalItems, onOpenActions, onReminder, onAdjust, attentionEnvelopeId, budgets, recurringItems, onOpenDetail, canCreate, canAdjustItem, canRemindItem, linkedBudgetsForItem, relatedRecurringForItem, openCreate, clearFilter }) => <section className={allocationClass("allocation-grid")} aria-label="Daftar Alokasi Dana aktif">{items.length ? items.map((item) => {
  const needs = linkedBudgetsForItem(budgets, item);
  const scheduleCount = relatedRecurringForItem(recurringItems, budgets, item).length;
  return <AllocationCard key={item.envelope_period_id} item={item} onOpenActions={onOpenActions} onReminder={onReminder} onAdjust={onAdjust} canAdjust={canAdjustItem(item)} canRemind={canRemindItem(item)} attention={item.envelope_period_id === attentionEnvelopeId} onOpenDetail={onOpenDetail} needs={needs} scheduleCount={scheduleCount} />;
}) : <EmptyState className={allocationClass("allocation-empty")} variant="inline" icon={FiPieChart} title={totalItems ? "Tidak ada Alokasi Dana yang sesuai filter" : canCreate ? "Belum ada Alokasi Dana aktif" : "Belum ada rekening yang dapat digunakan"} description={totalItems ? "Pilih filter lain untuk menampilkan Alokasi Dana aktif." : canCreate ? "Pisahkan dana berdasarkan tujuan agar sisa yang benar-benar tersedia lebih mudah dipantau." : "Siapkan atau aktifkan rekening yang dapat Anda operasikan sebelum membuat Alokasi Dana."} action={totalItems ? <Button onClick={clearFilter}>Tampilkan semua Alokasi</Button> : canCreate ? <Button variant="primary" icon={FiPlus} onClick={openCreate}>Buat Alokasi Dana</Button> : <Link className="button button--primary" to="/rekening">Lihat Rekening</Link>} />}</section>;

const AllocationOverviewLayer = ({
  activeItems, filteredActiveItems, allocationFilter, setAllocationFilter, setActionTarget, onReminder, onAdjust,
  attentionEnvelopeId, budgets, recurringItems, onOpenDetail, canCreate, administratorMode, canMove,
  openCreate, openMove, reload, canAdjustItem, canRemindItem,
  linkedBudgetsForItem, relatedRecurringForItem,
}) => <>
  {activeItems.length ? <AllocationSummary items={activeItems} /> : null}
  {activeItems.length ? <div className={allocationClass(`allocation-header-actions allocation-header-actions--${administratorMode ? "administrator" : "member"}`)}>
    {canCreate ? <Button className={allocationClass("allocation-header-actions__primary")} variant="primary" icon={FiPlus} onClick={openCreate}>Buat alokasi</Button> : null}
    {canMove ? <Button icon={FiArrowRight} onClick={openMove} aria-label="Pindahkan dana antar Alokasi Dana">Pindahkan dana</Button> : null}
    <Button className={allocationClass("allocation-refresh-action")} icon={FiRefreshCw} onClick={reload} aria-label="Muat ulang Alokasi Dana">Muat ulang</Button>
  </div> : null}
  <section className={allocationClass("allocation-active")} aria-labelledby="allocation-active-title">
    <div className={allocationClass("allocation-section-heading")}><h2 id="allocation-active-title">Alokasi aktif</h2>{activeItems.length ? <span>{filteredActiveItems.length} dari {activeItems.length}</span> : null}</div>
    {activeItems.length ? <div className={allocationClass("allocation-filters")} role="group" aria-label="Filter Alokasi Dana aktif">{ALLOCATION_FILTERS.map((filter) => <button type="button" key={filter.value} className={allocationClass(allocationFilter === filter.value ? "is-active" : "")} aria-pressed={allocationFilter === filter.value} onClick={() => setAllocationFilter(filter.value)}>{filter.label}</button>)}</div> : null}
    <AllocationCards items={filteredActiveItems} totalItems={activeItems.length} onOpenActions={setActionTarget} onReminder={onReminder} onAdjust={onAdjust} attentionEnvelopeId={attentionEnvelopeId} budgets={budgets} recurringItems={recurringItems} onOpenDetail={onOpenDetail} canCreate={canCreate} canAdjustItem={canAdjustItem} canRemindItem={canRemindItem} linkedBudgetsForItem={linkedBudgetsForItem} relatedRecurringForItem={relatedRecurringForItem} openCreate={openCreate} clearFilter={() => setAllocationFilter("all")} />
  </section>
</>;

export default AllocationOverviewLayer;
