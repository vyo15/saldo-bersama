import { FiArrowRight, FiPieChart, FiPlus } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import ButtonLink from "../../components/common/ButtonLink.jsx";
import Card from "../../components/common/Card.jsx";
import Money from "../../components/common/Money.jsx";
import ProgressBar from "../../components/common/ProgressBar.jsx";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import { accountDisplayLabel, accountOwnershipLabel } from "../../shared/presentation/account.js";
import { allocationAssigneeLabel, allocationUsage } from "./allocationPresentation.js";
import { allocationAvailableBalance } from "./allocationFundingModel.js";
import { allocationClass } from "./allocationStyles.js";
import { allocationDecoration } from "./allocationDecorations.js";

const ALLOCATION_FILTERS = Object.freeze([
  { value: "all", label: "Semua" },
  { value: "shared", label: "Bersama" },
  { value: "mine", label: "Saya" },
]);

const availableAccounts = (accounts = []) => accounts
  .map((account) => ({ account, available: allocationAvailableBalance(account) }))
  .filter((entry) => entry.available > 0);

const shouldShowOwnershipFilters = (items, actor) => {
  const actorId = String(actor?.user_id || "");
  if (!actorId) return false;
  return items.some((item) => !item.assignee_user_id)
    && items.some((item) => String(item.assignee_user_id || "") === actorId);
};

const AllocationFundingSummary = ({ accounts, hasActiveItems, canFund, canCreate, onOpenFunding, openCreate }) => {
  const sources = availableAccounts(accounts);
  const total = sources.reduce((sum, entry) => sum + entry.available, 0);
  if (!accounts.length) return null;
  const primaryCreate = !hasActiveItems || !canFund;
  return <Card className={allocationClass("allocation-funding-summary")} aria-labelledby="allocation-funding-summary-title">
    <div className={allocationClass("allocation-funding-summary__top")}>
      <div>
        <span className={allocationClass("allocation-funding-summary__eyebrow")} id="allocation-funding-summary-title">Dana yang bisa dialokasikan</span>
        <div className={allocationClass("allocation-funding-summary__amount")}><Money value={total} /></div>
      </div>
      <span className={allocationClass("allocation-funding-summary__count")}>{sources.length} rekening</span>
    </div>
    <p>Total dana bebas lintas rekening. Setiap Alokasi tetap terikat ke satu rekening sumber.</p>
    {sources.length ? <details className={allocationClass("allocation-funding-summary__sources")}>
      <summary>{sources.length === 1 ? accountDisplayLabel(sources[0].account) : `Lihat ${sources.length} rekening sumber`}<FiArrowRight aria-hidden="true" /></summary>
      <div className={allocationClass("allocation-funding-summary__source-list")}>
        {sources.map(({ account, available }) => <div key={account.account_id}>
          <span><strong>{accountDisplayLabel(account, { includeOwner: false })}</strong><small>{accountOwnershipLabel(account)}</small></span>
          <Money value={available} />
        </div>)}
      </div>
    </details> : <div className={allocationClass("allocation-funding-summary__empty")} role="status">Belum ada dana bebas yang dapat dialokasikan.</div>}
    <div className={allocationClass("allocation-funding-summary__actions")}>
      {primaryCreate
        ? <Button variant="primary" icon={FiPlus} disabled={!canCreate} onClick={openCreate}>{hasActiveItems ? "Alokasi baru" : "Buat Alokasi pertama"}</Button>
        : <Button variant="primary" onClick={() => onOpenFunding?.()}>Alokasikan dana</Button>}
      {!primaryCreate && canCreate ? <Button icon={FiPlus} onClick={openCreate}>Alokasi baru</Button> : null}
      {primaryCreate && hasActiveItems && canFund ? <Button onClick={() => onOpenFunding?.()}>Alokasikan dana</Button> : null}
    </div>
  </Card>;
};

const allocationCardPresentation = ({ item, needs, scheduleItems }) => {
  const usage = allocationUsage(item);
  const decoration = allocationDecoration({ decorationKey: item.decoration_key, name: item.name, id: item.envelope_rule_id });
  const overBudget = needs.find((budget) => Number(budget.used_amount || 0) > Number(budget.amount || 0)) || null;
  const nextSchedule = [...scheduleItems]
    .filter((entry) => entry.due_date && !["paid", "received", "cancelled", "skipped"].includes(entry.status))
    .sort((left, right) => String(left.due_date).localeCompare(String(right.due_date)))[0] || null;
  return { usage, decoration, overBudget, nextSchedule };
};

const AllocationCard = ({ item, attention = false, onOpenDetail, needs = [], scheduleItems = [] }) => {
  const { usage, decoration, overBudget, nextSchedule } = allocationCardPresentation({ item, needs, scheduleItems });
  const remainingTone = Number(item.remaining_amount || 0) < 0 ? "negative" : "default";
  const openDetail = () => onOpenDetail(item);
  const onKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openDetail(); }
  };
  return <Card
    as="article"
    interactive
    role="button"
    tabIndex={0}
    aria-label={`Buka detail Alokasi ${item.name}`}
    className={allocationClass(`allocation-card allocation-card--decoration-${decoration.key}${attention ? " allocation-card--attention" : ""}`)}
    data-envelope-period-id={item.envelope_period_id}
    data-native-enter
    onClick={openDetail}
    onKeyDown={onKeyDown}
  >
    <div className={allocationClass("allocation-card__content")}>
      <div className={allocationClass("allocation-card__header")}><span className={allocationClass("allocation-card__icon")}><img src={decoration.asset} width="512" height="512" alt="" aria-hidden="true" draggable="false" decoding="async" /></span><div className={allocationClass("allocation-card__heading")}><h2>{item.name}</h2><p>{allocationAssigneeLabel(item)}</p></div></div>
      <div className={allocationClass("allocation-card__balance")}>
        <div className={allocationClass("allocation-card__balance-line")}><span><Money className={allocationClass("allocation-card__remaining")} value={item.remaining_amount} tone={remainingTone} /> <small>tersisa</small></span><strong>{usage.allocated > 0 ? `${Math.max(0, Math.round((usage.committed / usage.allocated) * 100))}%` : "0%"}</strong></div>
        <div className={allocationClass("allocation-card__progress")}><ProgressBar value={usage.committed} max={usage.allocated} label={item.name} /></div>
        <div className={allocationClass("allocation-card__progress-meta")}><span><Money value={usage.used} /> terpakai</span><strong>dari <Money value={usage.allocated} /></strong></div>
      </div>
      {overBudget ? <p className={allocationClass("allocation-card__signal allocation-card__signal--warning")}><strong>{overBudget.name}</strong> melewati rencana <Money value={Number(overBudget.used_amount || 0) - Number(overBudget.amount || 0)} /></p>
        : nextSchedule ? <p className={allocationClass("allocation-card__signal")}><strong>Berikutnya</strong> {nextSchedule.name || nextSchedule.category_name || "Pembayaran"} · {nextSchedule.due_date}</p>
          : usage.reserved > 0 ? <p className={allocationClass("allocation-card__signal")}><strong>Disiapkan untuk jadwal</strong> <Money value={usage.reserved} /></p>
            : !needs.length ? <p className={allocationClass("allocation-card__signal")}><strong>Belum ada kebutuhan</strong> · buka detail untuk menambahkan</p> : null}
    </div>
    <img className={allocationClass("allocation-card__watermark")} src={decoration.asset} width="512" height="512" alt="" aria-hidden="true" draggable="false" decoding="async" />
  </Card>;
};

const AllocationCards = ({ items, totalItems, attentionEnvelopeId, budgets, recurringItems, onOpenDetail, canCreate, linkedBudgetsForItem, relatedRecurringForItem, clearFilter }) => {
  return <section className={allocationClass("allocation-grid")} aria-label="Daftar Alokasi Dana aktif">{items.length ? items.map((item) => {
    const needs = linkedBudgetsForItem(budgets, item);
    const scheduleItems = relatedRecurringForItem(recurringItems, budgets, item);
    return <AllocationCard key={item.envelope_period_id} item={item} attention={item.envelope_period_id === attentionEnvelopeId} onOpenDetail={onOpenDetail} needs={needs} scheduleItems={scheduleItems} />;
  }) : <EmptyState className={allocationClass("allocation-empty")} variant="inline" icon={FiPieChart} title={totalItems ? "Tidak ada Alokasi Dana yang sesuai filter" : canCreate ? "Belum ada Alokasi Dana" : "Belum ada rekening yang dapat digunakan"} description={totalItems ? "Pilih filter lain untuk menampilkan Alokasi Dana aktif." : canCreate ? "Buat Alokasi pertama dari dana yang masih tersedia di rekening." : "Siapkan atau aktifkan rekening yang dapat Anda operasikan sebelum membuat Alokasi Dana."} action={totalItems ? <Button onClick={clearFilter}>Tampilkan semua Alokasi</Button> : canCreate ? null : <ButtonLink variant="primary" to="/rekening">Lihat Rekening</ButtonLink>} />}</section>;
};

const AllocationOverviewLayer = ({
  activeItems, filteredActiveItems, allocationFilter, setAllocationFilter,
  attentionEnvelopeId, budgets, recurringItems, onOpenDetail, canCreate, canFund,
  openCreate, onOpenFunding, accounts, actor,
  linkedBudgetsForItem, relatedRecurringForItem,
}) => {
  const showFilters = shouldShowOwnershipFilters(activeItems, actor);
  const visibleItems = showFilters ? filteredActiveItems : activeItems;
  return <>
    <AllocationFundingSummary accounts={accounts} hasActiveItems={Boolean(activeItems.length)} canFund={canFund} canCreate={canCreate} onOpenFunding={onOpenFunding} openCreate={openCreate} />
    <section className={allocationClass("allocation-active")} aria-labelledby="allocation-active-title">
      <div className={allocationClass("allocation-section-heading")}><h2 id="allocation-active-title">Alokasi aktif</h2>{activeItems.length ? <span>{showFilters ? `${visibleItems.length} dari ${activeItems.length}` : `${activeItems.length} item`}</span> : null}</div>
      {showFilters ? <div className={allocationClass("allocation-filters")} role="group" aria-label="Filter Alokasi Dana aktif">{ALLOCATION_FILTERS.map((filter) => <button type="button" key={filter.value} className={allocationClass(allocationFilter === filter.value ? "is-active" : "")} aria-pressed={allocationFilter === filter.value} onClick={() => setAllocationFilter(filter.value)}>{filter.label}</button>)}</div> : null}
      <AllocationCards items={visibleItems} totalItems={activeItems.length} attentionEnvelopeId={attentionEnvelopeId} budgets={budgets} recurringItems={recurringItems} onOpenDetail={onOpenDetail} canCreate={canCreate} linkedBudgetsForItem={linkedBudgetsForItem} relatedRecurringForItem={relatedRecurringForItem} clearFilter={() => setAllocationFilter("all")} />
    </section>
  </>;
};

export default AllocationOverviewLayer;
