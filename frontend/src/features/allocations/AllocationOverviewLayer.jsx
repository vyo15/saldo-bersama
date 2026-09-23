import { FiArrowRight, FiHome, FiPieChart, FiPlus, FiRepeat, FiUsers } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import ButtonLink from "../../components/common/ButtonLink.jsx";
import Card from "../../components/common/Card.jsx";
import Money from "../../components/common/Money.jsx";
import ProgressBar from "../../components/common/ProgressBar.jsx";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import { accountDisplayLabel, accountOwnershipLabel } from "../../shared/presentation/account.js";
import { allocationUsage } from "./allocationPresentation.js";
import { allocationAvailableBalance } from "./allocationFundingModel.js";
import { allocationClass } from "./allocationStyles.js";
import { allocationDecoration } from "./allocationDecorations.js";
import { buildPlanningActiveItems, filterPlanningActiveItems, planningActiveOwnership } from "../planning/planningActiveModel.js";

const ACTIVE_FILTERS = Object.freeze([
  { value: "all", label: "Semua" },
  { value: "shared", label: "Bersama" },
  { value: "mine", label: "Saya" },
]);

const availableAccounts = (accounts = []) => accounts
  .map((account) => ({ account, available: allocationAvailableBalance(account) }))
  .filter((entry) => entry.available > 0);

const FundingSourceRow = ({ account, available }) => <div className={allocationClass("allocation-funding-summary__source-row")}>
  <span><strong>{accountDisplayLabel(account, { includeOwner: false })}</strong><small>{accountOwnershipLabel(account)}</small></span>
  <Money value={available} />
</div>;

const AllocationFundingSummary = ({ accounts, hasActiveItems, canFund, canCreate, onOpenFunding, openCreate }) => {
  const sources = availableAccounts(accounts);
  const total = sources.reduce((sum, entry) => sum + entry.available, 0);
  if (!accounts.length) return null;
  return <Card className={allocationClass("allocation-funding-summary")} aria-labelledby="allocation-funding-summary-title">
    <div className={allocationClass("allocation-funding-summary__top")}>
      <div>
        <span className={allocationClass("allocation-funding-summary__eyebrow")} id="allocation-funding-summary-title">Dana yang bisa dialokasikan</span>
        <div className={allocationClass("allocation-funding-summary__amount")}><Money value={total} /></div>
      </div>
      <span className={allocationClass("allocation-funding-summary__count")}>{sources.length} rekening</span>
    </div>
    <p>Total dana bebas lintas rekening. Setiap Alokasi tetap terikat ke satu rekening sumber.</p>
    {sources.length === 1 ? <FundingSourceRow {...sources[0]} /> : sources.length > 1 ? <details className={allocationClass("allocation-funding-summary__sources")}>
      <summary>Lihat {sources.length} rekening sumber<FiArrowRight aria-hidden="true" /></summary>
      <div className={allocationClass("allocation-funding-summary__source-list")}>
        {sources.map(({ account, available }) => <FundingSourceRow key={account.account_id} account={account} available={available} />)}
      </div>
    </details> : <div className={allocationClass("allocation-funding-summary__empty")} role="status">Belum ada dana bebas yang dapat dialokasikan.</div>}
    <div className={allocationClass("allocation-funding-summary__actions")}>
      {hasActiveItems ? <>
        <Button variant="primary" disabled={!canFund} onClick={() => onOpenFunding?.()}>Alokasikan dana</Button>
        <Button icon={FiPlus} disabled={!canCreate} onClick={openCreate}>Alokasi baru</Button>
      </> : <Button variant="primary" icon={FiPlus} disabled={!canCreate} onClick={openCreate}>Buat Alokasi pertama</Button>}
    </div>
  </Card>;
};

const compactDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return "";
  const date = new Date(`${value}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" }).format(date);
};

const allocationLinkedSignal = (row) => {
  const commitment = row.commitments?.[0] || null;
  if (commitment) {
    return {
      amount: Number(commitment.next_due_remaining || commitment.installment_amount || 0),
      date: compactDate(commitment.next_due_date),
      secondary: Number(commitment.current_balance || 0) > 0 ? <>{commitment.commitment_type === "arisan" ? "Sisa setoran" : "Sisa kewajiban"} <Money value={commitment.current_balance} /></> : "Kewajiban selesai",
      warning: false,
    };
  }
  const schedule = [...(row.recurring || [])]
    .filter((item) => !["cancelled", "paid", "received"].includes(item.status))
    .sort((left, right) => String(left.due_date || "").localeCompare(String(right.due_date || "")))[0] || null;
  if (!schedule) return null;
  return {
    amount: Math.max(0, Number(schedule.expected_amount || 0) - Number(schedule.actual_amount || 0)),
    date: compactDate(schedule.due_date),
    secondary: schedule.status === "overdue" ? "Pembayaran melewati jatuh tempo" : "Pembayaran rutin terhubung",
    warning: schedule.status === "overdue",
  };
};

const AllocationActiveRow = ({ row, attention, onOpen }) => {
  const item = row.allocation;
  const usage = allocationUsage(item);
  const decoration = allocationDecoration({ decorationKey: item.decoration_key, name: item.name, id: item.envelope_rule_id });
  const linked = allocationLinkedSignal(row);
  const progress = usage.allocated > 0 ? Math.max(0, Math.round((usage.committed / usage.allocated) * 100)) : 0;
  return <button type="button" className={allocationClass(`planning-active-row${attention ? " planning-active-row--attention" : ""}`)} onClick={() => onOpen(item)} aria-label={`Buka detail ${item.name}`}>
    <span className={allocationClass("planning-active-row__icon")}><img src={decoration.asset} width="512" height="512" alt="" aria-hidden="true" draggable="false" decoding="async" /></span>
    <span className={allocationClass("planning-active-row__content")}>
      <span className={allocationClass("planning-active-row__title")}>{item.name}</span>
      {linked ? <>
        <span className={allocationClass("planning-active-row__meta")}><Money value={linked.amount} />{linked.date ? ` · ${linked.date}` : ""}</span>
        <span className={allocationClass(`planning-active-row__sub${linked.warning ? " planning-active-row__sub--warning" : ""}`)}>{linked.secondary}</span>
      </> : <>
        <span className={allocationClass("planning-active-row__meta")}>Sisa <Money value={item.remaining_amount} /> dari <Money value={usage.allocated} /></span>
        <span className={allocationClass("planning-active-row__progress")}><ProgressBar value={usage.committed} max={usage.allocated} label={`Pemakaian ${item.name}`} /><small>{progress}%</small></span>
      </>}
    </span>
    <FiArrowRight className={allocationClass("planning-active-row__arrow")} aria-hidden="true" />
  </button>;
};

const CommitmentActiveRow = ({ row, onOpen }) => {
  const item = row.commitment;
  const arisan = item.commitment_type === "arisan";
  const amount = Number(item.next_due_remaining || item.installment_amount || 0);
  return <button type="button" className={allocationClass("planning-active-row")} onClick={() => onOpen(item)} aria-label={`Buka detail ${item.name}`}>
    <span className={allocationClass("planning-active-row__icon planning-active-row__icon--plain")}>{arisan ? <FiUsers aria-hidden="true" /> : <FiHome aria-hidden="true" />}</span>
    <span className={allocationClass("planning-active-row__content")}>
      <span className={allocationClass("planning-active-row__title")}>{item.name}</span>
      <span className={allocationClass("planning-active-row__meta")}><Money value={amount} />{item.next_due_date ? ` · ${compactDate(item.next_due_date)}` : ""}</span>
      <span className={allocationClass("planning-active-row__sub")}>{arisan ? "Sisa setoran" : "Sisa kewajiban"} <Money value={item.current_balance || 0} /></span>
    </span>
    <FiArrowRight className={allocationClass("planning-active-row__arrow")} aria-hidden="true" />
  </button>;
};

const recurringStatusLabel = (item) => {
  if (["paid", "received"].includes(item.status)) return "Sudah tercatat";
  if (item.status === "overdue") return "Melewati jatuh tempo";
  if (item.status === "partial") return "Belum selesai";
  if (item.status === "cancelled") return "Dilewati";
  return "Terjadwal";
};

const RecurringActiveRow = ({ row, onOpen }) => {
  const item = row.recurring;
  return <button type="button" className={allocationClass("planning-active-row")} onClick={() => onOpen(item)} aria-label={`Buka pembayaran rutin ${item.name}`}>
    <span className={allocationClass("planning-active-row__icon planning-active-row__icon--plain")}><FiRepeat aria-hidden="true" /></span>
    <span className={allocationClass("planning-active-row__content")}>
      <span className={allocationClass("planning-active-row__title")}>{item.name}</span>
      <span className={allocationClass("planning-active-row__meta")}><Money value={item.expected_amount || 0} />{item.due_date ? ` · ${compactDate(item.due_date)}` : ""}</span>
      <span className={allocationClass(`planning-active-row__sub${item.status === "overdue" ? " planning-active-row__sub--warning" : ""}`)}>{recurringStatusLabel(item)}</span>
    </span>
    <FiArrowRight className={allocationClass("planning-active-row__arrow")} aria-hidden="true" />
  </button>;
};

const PlanningActiveList = ({ rows, totalItems, attentionEnvelopeId, onOpenDetail, onOpenCommitmentDetail, onOpenRecurringDetail, canCreate, clearFilter }) => {
  if (!rows.length) return <EmptyState className={allocationClass("allocation-empty")} variant="inline" icon={FiPieChart} title={totalItems ? "Tidak ada rencana yang sesuai filter" : canCreate ? "Belum ada dana yang diatur" : "Belum ada rekening yang dapat digunakan"} description={totalItems ? "Pilih filter lain untuk melihat rencana aktif." : canCreate ? "Buat Alokasi pertama untuk mulai menyiapkan dana pengeluaran." : "Siapkan atau aktifkan rekening yang dapat Anda operasikan sebelum membuat Alokasi Dana."} action={totalItems ? <Button onClick={clearFilter}>Tampilkan semua</Button> : canCreate ? null : <ButtonLink variant="primary" to="/rekening">Lihat Rekening</ButtonLink>} />;
  return <div className={allocationClass("planning-active-list")} role="list">
    {rows.map((row) => <div key={row.id} role="listitem">
      {row.kind === "allocation" ? <AllocationActiveRow row={row} attention={row.allocation.envelope_period_id === attentionEnvelopeId} onOpen={onOpenDetail} /> : null}
      {row.kind === "commitment" ? <CommitmentActiveRow row={row} onOpen={onOpenCommitmentDetail} /> : null}
      {row.kind === "recurring" ? <RecurringActiveRow row={row} onOpen={onOpenRecurringDetail} /> : null}
    </div>)}
  </div>;
};

const AllocationOverviewLayer = ({
  activeItems, allocationFilter, setAllocationFilter, attentionEnvelopeId, budgets, recurringItems, commitments,
  onOpenDetail, onOpenRecurringDetail, onOpenCommitmentDetail, canCreate, canFund, openCreate, onOpenFunding, accounts, actor,
}) => {
  const rows = buildPlanningActiveItems({ allocations: activeItems, budgets, recurringItems, commitments });
  const ownership = planningActiveOwnership(rows, actor);
  const visibleItems = ownership.showFilter ? filterPlanningActiveItems(rows, allocationFilter, actor) : rows;
  return <>
    <AllocationFundingSummary accounts={accounts} hasActiveItems={Boolean(rows.length)} canFund={canFund} canCreate={canCreate} onOpenFunding={onOpenFunding} openCreate={openCreate} />
    <section className={allocationClass("allocation-active")} aria-labelledby="allocation-active-title">
      <div className={allocationClass("allocation-section-heading")}><h2 id="allocation-active-title">Aktif</h2>{rows.length ? <span>{ownership.showFilter ? `${visibleItems.length} dari ${rows.length}` : `${rows.length} item`}</span> : null}</div>
      {ownership.showFilter ? <div className={allocationClass("allocation-filters")} role="group" aria-label="Filter dana aktif">{ACTIVE_FILTERS.map((filter) => <button type="button" key={filter.value} className={allocationClass(allocationFilter === filter.value ? "is-active" : "")} aria-pressed={allocationFilter === filter.value} onClick={() => setAllocationFilter(filter.value)}>{filter.label}</button>)}</div> : null}
      <PlanningActiveList rows={visibleItems} totalItems={rows.length} attentionEnvelopeId={attentionEnvelopeId} onOpenDetail={onOpenDetail} onOpenCommitmentDetail={onOpenCommitmentDetail} onOpenRecurringDetail={onOpenRecurringDetail} canCreate={canCreate} clearFilter={() => setAllocationFilter("all")} />
    </section>
  </>;
};

export default AllocationOverviewLayer;
