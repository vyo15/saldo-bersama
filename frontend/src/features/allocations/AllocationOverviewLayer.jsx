import { FiArrowRight, FiPieChart, FiPlus } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import ButtonLink from "../../components/common/ButtonLink.jsx";
import Card from "../../components/common/Card.jsx";
import Money from "../../components/common/Money.jsx";
import ProgressBar from "../../components/common/ProgressBar.jsx";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import { accountDisplayLabel, accountOwnershipLabel } from "../../shared/presentation/account.js";
import { allocationAssigneeLabel, allocationSourceLabel, allocationUsage } from "./allocationPresentation.js";
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

const allocationCardPresentation = ({ item, sourceAccount, needs, scheduleItems, onFund }) => {
  const usage = allocationUsage(item);
  const decoration = allocationDecoration({ decorationKey: item.decoration_key, name: item.name, id: item.envelope_rule_id });
  const needNames = needs.slice(0, 4).map((budget) => budget.name).filter(Boolean);
  const extraNeeds = Math.max(0, needs.length - needNames.length);
  const needPreview = needNames.length ? `${needNames.join(" · ")}${extraNeeds ? ` · +${extraNeeds}` : ""}` : "Belum ada kebutuhan";
  const nextSchedule = [...scheduleItems]
    .filter((entry) => entry.due_date && !["paid", "received", "cancelled", "skipped"].includes(entry.status))
    .sort((left, right) => String(left.due_date).localeCompare(String(right.due_date)))[0] || null;
  const canFund = Boolean(item.can_adjust && item.source_account_id && allocationAvailableBalance(sourceAccount) > 0 && onFund);
  return { usage, decoration, needPreview, nextSchedule, canFund };
};

const AllocationCard = ({ item, onAddNeed, onFund, sourceAccount, attention = false, onOpenDetail, needs = [], scheduleItems = [] }) => {
  const { usage, decoration, needPreview, nextSchedule, canFund } = allocationCardPresentation({ item, sourceAccount, needs, scheduleItems, onFund });
  return <Card className={allocationClass(`allocation-card allocation-card--decoration-${decoration.key}${attention ? " allocation-card--attention" : ""}`)} data-envelope-period-id={item.envelope_period_id} data-native-enter>
    <div className={allocationClass("allocation-card__content")}>
      <div className={allocationClass("allocation-card__header")}><span className={allocationClass("allocation-card__icon")}><img src={decoration.asset} width="512" height="512" alt="" aria-hidden="true" draggable="false" decoding="async" /></span><div className={allocationClass("allocation-card__heading")}><h2>{item.name}</h2><p>{allocationAssigneeLabel(item)} · {allocationSourceLabel(item)}</p></div></div>
      <div className={allocationClass("allocation-card__balance")}><span className={allocationClass("allocation-card__balance-label")}><i aria-hidden="true" />Masih tersedia</span><Money className={allocationClass("allocation-card__remaining")} value={item.remaining_amount} tone={Number(item.remaining_amount || 0) < 0 ? "negative" : "default"} /><div className={allocationClass("allocation-card__progress-meta")}><span>Terpakai <strong><Money value={usage.used} /></strong></span><strong>dari <Money value={usage.allocated} /></strong></div><div className={allocationClass("allocation-card__progress")}><ProgressBar value={usage.committed} max={usage.allocated} label={item.name} /></div></div>
      {usage.reserved > 0 ? <div className={allocationClass("allocation-card__quick allocation-card__quick--single")}><div><span>Disiapkan untuk jadwal</span><strong><Money value={usage.reserved} /></strong></div></div> : null}
      {needs.length ? <p className={allocationClass("allocation-card__needs-preview")} title={needPreview}>{needPreview}</p> : null}
      {nextSchedule ? <p className={allocationClass("allocation-card__needs-preview")}><strong>Berikutnya:</strong> {nextSchedule.name || nextSchedule.category_name || "Pembayaran"} · {nextSchedule.due_date}</p> : null}
      {!needs.length && item.can_manage_needs ? <div className={allocationClass("allocation-card__next-step")}><p><strong>Belum ada kebutuhan.</strong> Tambahkan kebutuhan pertama agar tujuan dana jelas.</p><Button variant="primary" icon={FiPlus} onClick={() => onAddNeed(item)}>Tambah kebutuhan</Button></div> : null}
      {canFund ? <button type="button" className={allocationClass("allocation-card__fund")} onClick={() => onFund(item)}><FiPlus aria-hidden="true" />Dana ke {item.name}</button> : null}
      <button type="button" className={allocationClass("allocation-card__expand")} onClick={() => onOpenDetail(item)}>Lihat detail<FiArrowRight aria-hidden="true" /></button>
    </div>
    <img className={allocationClass("allocation-card__watermark")} src={decoration.asset} width="512" height="512" alt="" aria-hidden="true" draggable="false" decoding="async" />
  </Card>;
};

const AllocationCards = ({ items, totalItems, onAddNeed, onFund, accounts, attentionEnvelopeId, budgets, recurringItems, onOpenDetail, canCreate, linkedBudgetsForItem, relatedRecurringForItem, clearFilter }) => {
  const accountLookup = new Map((accounts || []).map((account) => [account.account_id, account]));
  return <section className={allocationClass("allocation-grid")} aria-label="Daftar Alokasi Dana aktif">{items.length ? items.map((item) => {
    const needs = linkedBudgetsForItem(budgets, item);
    const scheduleItems = relatedRecurringForItem(recurringItems, budgets, item);
    return <AllocationCard key={item.envelope_period_id} item={item} onAddNeed={onAddNeed} onFund={onFund} sourceAccount={accountLookup.get(item.source_account_id) || null} attention={item.envelope_period_id === attentionEnvelopeId} onOpenDetail={onOpenDetail} needs={needs} scheduleItems={scheduleItems} />;
  }) : <EmptyState className={allocationClass("allocation-empty")} variant="inline" icon={FiPieChart} title={totalItems ? "Tidak ada Alokasi Dana yang sesuai filter" : canCreate ? "Belum ada Alokasi Dana" : "Belum ada rekening yang dapat digunakan"} description={totalItems ? "Pilih filter lain untuk menampilkan Alokasi Dana aktif." : canCreate ? "Buat Alokasi pertama dari dana yang masih tersedia di rekening." : "Siapkan atau aktifkan rekening yang dapat Anda operasikan sebelum membuat Alokasi Dana."} action={totalItems ? <Button onClick={clearFilter}>Tampilkan semua Alokasi</Button> : canCreate ? null : <ButtonLink variant="primary" to="/rekening">Lihat Rekening</ButtonLink>} />}</section>;
};

const AllocationOverviewLayer = ({
  activeItems, filteredActiveItems, allocationFilter, setAllocationFilter, onAddNeed,
  attentionEnvelopeId, budgets, recurringItems, onOpenDetail, canCreate, canFund,
  openCreate, onOpenFunding, onFundAllocation, accounts, actor,
  linkedBudgetsForItem, relatedRecurringForItem,
}) => {
  const showFilters = shouldShowOwnershipFilters(activeItems, actor);
  const visibleItems = showFilters ? filteredActiveItems : activeItems;
  return <>
    <AllocationFundingSummary accounts={accounts} hasActiveItems={Boolean(activeItems.length)} canFund={canFund} canCreate={canCreate} onOpenFunding={onOpenFunding} openCreate={openCreate} />
    <section className={allocationClass("allocation-active")} aria-labelledby="allocation-active-title">
      <div className={allocationClass("allocation-section-heading")}><h2 id="allocation-active-title">Alokasi aktif</h2>{activeItems.length ? <span>{showFilters ? `${visibleItems.length} dari ${activeItems.length}` : `${activeItems.length} item`}</span> : null}</div>
      {showFilters ? <div className={allocationClass("allocation-filters")} role="group" aria-label="Filter Alokasi Dana aktif">{ALLOCATION_FILTERS.map((filter) => <button type="button" key={filter.value} className={allocationClass(allocationFilter === filter.value ? "is-active" : "")} aria-pressed={allocationFilter === filter.value} onClick={() => setAllocationFilter(filter.value)}>{filter.label}</button>)}</div> : null}
      <AllocationCards items={visibleItems} totalItems={activeItems.length} onAddNeed={onAddNeed} onFund={onFundAllocation} accounts={accounts} attentionEnvelopeId={attentionEnvelopeId} budgets={budgets} recurringItems={recurringItems} onOpenDetail={onOpenDetail} canCreate={canCreate} linkedBudgetsForItem={linkedBudgetsForItem} relatedRecurringForItem={relatedRecurringForItem} clearFilter={() => setAllocationFilter("all")} />
    </section>
  </>;
};

export default AllocationOverviewLayer;
