import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router";
import { FiArrowRight, FiHome, FiPlus, FiRepeat, FiSearch, FiUsers } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import ButtonLink from "../../components/common/ButtonLink.jsx";
import Card from "../../components/common/Card.jsx";
import Money from "../../components/common/Money.jsx";
import ProgressBar from "../../components/common/ProgressBar.jsx";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import { accountDisplayLabel, accountOwnershipLabel } from "../../shared/presentation/account.js";
import { allocationUsage } from "./allocationPresentation.js";
import { allocationAvailableBalance, allocationSourceAccounts, planningFundingAccounts } from "./allocationFundingModel.js";
import { allocationClass } from "./allocationStyles.js";
import { allocationDecoration } from "./allocationDecorations.js";
import { buildPlanningActiveItems, filterPlanningActiveItems, filterPlanningActiveItemsByQuery, planningActiveOwnership } from "../planning/planningActiveModel.js";
import PlanningCreateLauncher from "./PlanningCreateLauncher.jsx";
import { allocationArt } from "./allocationArt.js";
import { compactPlanningDate, planningDueState } from "../../shared/presentation/dueDate.js";
import { scrollIntoViewWithMotionPreference } from "../../shared/motion.js";

const ACTIVE_FILTERS = Object.freeze([
  { value: "all", label: "Semua" },
  { value: "shared", label: "Bersama" },
  { value: "mine", label: "Saya" },
]);

const FundingSourceRow = ({ account }) => <div className={allocationClass("allocation-funding-summary__source-row")}>
  <span><strong>{accountDisplayLabel(account, { includeOwner: false })}</strong><small>{accountOwnershipLabel(account)}</small></span>
  <Money value={allocationAvailableBalance(account)} />
</div>;

const AllocationFundingSummary = ({ accounts, items, hasActiveItems, canFund, canCreate, onOpenFunding, onOpenCreateLauncher, onCreateAllocation }) => {
  const hasAllocations = items.length > 0;
  const sources = hasAllocations ? allocationSourceAccounts(accounts) : planningFundingAccounts(accounts, items);
  const total = sources.reduce((sum, account) => sum + allocationAvailableBalance(account), 0);
  if (!accounts.length) return null;

  const action = hasAllocations
    ? <>
      <Button variant="primary" icon={FiPlus} disabled={!canFund && !canCreate} onClick={() => onOpenFunding?.({ chooseDestination: true })}>Alokasikan dana</Button>
      <Button className={allocationClass("allocation-funding-summary__secondary-action")} icon={FiPlus} disabled={!canCreate} onClick={onOpenCreateLauncher}>Tambah lainnya</Button>
    </>
    : <Button variant="primary" icon={FiPlus} disabled={!canCreate} onClick={onCreateAllocation}>Buat Alokasi</Button>;

  return <Card surface="object" className={allocationClass(`allocation-funding-summary${hasActiveItems ? " allocation-funding-summary--filled" : " allocation-funding-summary--empty"}`)} aria-labelledby="allocation-funding-summary-title">
    <div className={allocationClass("allocation-funding-summary__content")}>
      <span className={allocationClass("allocation-funding-summary__count")}>{sources.length} rekening sumber</span>
      <div className={allocationClass("allocation-funding-summary__copy")}>
        <div>
          <span className={allocationClass("allocation-funding-summary__eyebrow")} id="allocation-funding-summary-title" aria-label={hasAllocations ? "Dana yang bisa dialokasikan" : "Dana tersedia untuk direncanakan"}>{hasAllocations ? "Dana siap dialokasikan" : "Dana tersedia untuk direncanakan"}</span>
          <div className={allocationClass("allocation-funding-summary__amount")}><Money value={total} /></div>
        </div>
        <p className={allocationClass("allocation-funding-summary__supporting-copy")}>{hasAllocations ? "Dana bebas dari rekening operasional dapat diarahkan ke Alokasi yang sudah ada atau Alokasi baru. Setiap Alokasi tetap memakai satu rekening sumber." : "Dana bebas pada rekening aktif ini dapat mulai direncanakan tanpa mencampur saldo antar rekening."}</p>
        {sources.length === 1 ? <div className={allocationClass("allocation-funding-summary__single-source")}><FundingSourceRow account={sources[0]} /></div> : null}
        {sources.length > 1 ? <details className={allocationClass("allocation-funding-summary__sources")}>
          <summary>Lihat {sources.length} rekening sumber<FiArrowRight aria-hidden="true" /></summary>
          <div className={allocationClass("allocation-funding-summary__source-list")}>
            {sources.map((account) => <FundingSourceRow key={account.account_id} account={account} />)}
          </div>
        </details> : null}
        {!sources.length ? <span className={allocationClass("allocation-funding-summary__hint")}>Belum ada dana bebas. Alokasi baru tetap dapat disiapkan dari rekening yang dapat digunakan.</span> : null}
        <div className={allocationClass("allocation-funding-summary__actions")}>{action}</div>
      </div>
      <div className={allocationClass("allocation-funding-summary__art")} aria-hidden="true">
        <img src={allocationArt.heroCouple} width="512" height="384" alt="" decoding="async" />
      </div>
    </div>
  </Card>;
};

const PLANNING_LINKS = Object.freeze([
  { to: "/perencanaan/jadwal", label: "Jadwal" },
  { to: "/perencanaan/komitmen", label: "Kewajiban" },
  { to: "/target", label: "Target" },
]);

const AllocationPlanningNav = () => <nav className={allocationClass("allocation-planning-nav")} aria-label="Kelola rencana">
  <span className={allocationClass("allocation-planning-nav__label")}>Kelola</span>
  {PLANNING_LINKS.map((item) => <NavLink
    key={item.to}
    to={item.to}
    className={({ isActive }) => allocationClass(`allocation-planning-nav__link${isActive ? " is-active" : ""}`)}
  >
    <span>{item.label}</span>
  </NavLink>)}
</nav>;

const allocationLinkedSignal = (row) => {
  const commitment = row.commitments?.[0] || null;
  if (commitment) {
    const due = planningDueState(commitment.next_due_date, { completed: commitment.status === "completed" });
    return {
      amount: Number(commitment.next_due_remaining || commitment.installment_amount || 0),
      date: due.state === "scheduled" ? compactPlanningDate(commitment.next_due_date) : "",
      secondary: due.warning || due.state === "today" || due.state === "tomorrow" ? due.label : Number(commitment.current_balance || 0) > 0 ? <>{commitment.commitment_type === "arisan" ? "Sisa setoran" : "Sisa kewajiban"} <Money value={commitment.current_balance} /></> : "Kewajiban selesai",
      warning: due.warning,
    };
  }
  const schedule = [...(row.recurring || [])]
    .filter((item) => !["cancelled", "paid", "received"].includes(item.status))
    .sort((left, right) => String(left.due_date || "").localeCompare(String(right.due_date || "")))[0] || null;
  if (!schedule) return null;
  const due = planningDueState(schedule.due_date);
  return {
    amount: Math.max(0, Number(schedule.expected_amount || 0) - Number(schedule.actual_amount || 0)),
    date: due.state === "scheduled" ? compactPlanningDate(schedule.due_date) : "",
    secondary: due.state === "scheduled" ? "Pembayaran rutin terhubung" : due.label,
    warning: due.warning,
  };
};

const UsageBadge = ({ item, usage }) => {
  const remaining = Number(item.remaining_amount || 0);
  const percent = usage.allocated > 0 ? Math.min(100, Math.round((usage.committed / usage.allocated) * 100)) : 0;
  if (usage.allocated > 0 && remaining <= 0) return <span className={allocationClass("planning-active-row__status planning-active-row__status--warning")}>Habis</span>;
  if (usage.allocated > 0 && percent >= 90) return <span className={allocationClass("planning-active-row__status planning-active-row__status--soft")}>Hampir habis</span>;
  return <span className={allocationClass("planning-active-row__status")}>{percent}%</span>;
};

const AllocationActiveRow = ({ row, attention, onOpen }) => {
  const item = row.allocation;
  const usage = allocationUsage(item);
  const decoration = allocationDecoration({ decorationKey: item.decoration_key, name: item.name, id: item.envelope_rule_id });
  const linked = allocationLinkedSignal(row);
  return <button type="button" className={allocationClass(`planning-active-row${attention ? " planning-active-row--attention" : ""}`)} onClick={() => onOpen(item)} aria-label={`Buka detail ${item.name}`}>
    <span className={allocationClass("planning-active-row__icon")}><img src={decoration.asset} width="512" height="512" alt="" aria-hidden="true" draggable="false" decoding="async" /></span>
    <span className={allocationClass("planning-active-row__content")}>
      <span className={allocationClass("planning-active-row__topline")}><span className={allocationClass("planning-active-row__title")}>{item.name}</span><UsageBadge item={item} usage={usage} /></span>
      {linked ? <>
        <span className={allocationClass("planning-active-row__meta")}><Money value={linked.amount} />{linked.date ? ` · ${linked.date}` : ""}</span>
        <span className={allocationClass(`planning-active-row__sub${linked.warning ? " planning-active-row__sub--warning" : ""}`)}>{linked.secondary}</span>
      </> : <>
        <span className={allocationClass("planning-active-row__meta")}><strong><Money value={usage.committed} /></strong> dipakai dari <Money value={usage.allocated} /></span>
        <span className={allocationClass("planning-active-row__sub")}>Sisa <Money value={item.remaining_amount} /></span>
        {Number(item.remaining_amount || 0) > 0 ? <span className={allocationClass("planning-active-row__progress")}><ProgressBar value={usage.committed} max={usage.allocated} label={`Pemakaian ${item.name}`} /></span> : null}
      </>}
    </span>
    <FiArrowRight className={allocationClass("planning-active-row__arrow")} aria-hidden="true" />
  </button>;
};

const CommitmentActiveRow = ({ row, onOpen, highlighted = false }) => {
  const item = row.commitment;
  const arisan = item.commitment_type === "arisan";
  const amount = Number(item.next_due_remaining || item.installment_amount || 0);
  const due = planningDueState(item.next_due_date, { completed: item.status === "completed" });
  return <button type="button" className={allocationClass(`planning-active-row${highlighted ? " planning-active-row--attention" : ""}`)} onClick={() => onOpen(item)} aria-label={`Buka detail ${item.name}`}>
    <span className={allocationClass("planning-active-row__icon planning-active-row__icon--plain")}>{arisan ? <FiUsers aria-hidden="true" /> : <FiHome aria-hidden="true" />}</span>
    <span className={allocationClass("planning-active-row__content")}>
      <span className={allocationClass("planning-active-row__topline")}><span className={allocationClass("planning-active-row__title")}>{item.name}</span></span>
      <span className={allocationClass("planning-active-row__meta")}><Money value={amount} />{item.next_due_date ? ` · ${compactPlanningDate(item.next_due_date)}` : ""}</span>
      <span className={allocationClass(`planning-active-row__sub${due.warning ? " planning-active-row__sub--warning" : ""}`)}>{due.state !== "scheduled" ? due.label : <>{arisan ? "Sisa setoran" : "Sisa kewajiban"} <Money value={item.current_balance || 0} /></>}</span>
    </span>
    <FiArrowRight className={allocationClass("planning-active-row__arrow")} aria-hidden="true" />
  </button>;
};

const recurringStatusLabel = (item) => {
  if (["paid", "received"].includes(item.status)) return "Sudah tercatat";
  if (item.status === "partial") return "Belum selesai";
  if (item.status === "cancelled") return "Dilewati";
  return planningDueState(item.due_date).label;
};

const RecurringActiveRow = ({ row, onOpen, highlighted = false }) => {
  const item = row.recurring;
  return <button type="button" className={allocationClass(`planning-active-row${highlighted ? " planning-active-row--attention" : ""}`)} onClick={() => onOpen(item)} aria-label={`Buka pembayaran rutin ${item.name}`}>
    <span className={allocationClass("planning-active-row__icon planning-active-row__icon--plain")}><FiRepeat aria-hidden="true" /></span>
    <span className={allocationClass("planning-active-row__content")}>
      <span className={allocationClass("planning-active-row__topline")}><span className={allocationClass("planning-active-row__title")}>{item.name}</span></span>
      <span className={allocationClass("planning-active-row__meta")}><Money value={item.expected_amount || 0} />{item.due_date ? ` · ${compactPlanningDate(item.due_date)}` : ""}</span>
      <span className={allocationClass(`planning-active-row__sub${planningDueState(item.due_date).warning ? " planning-active-row__sub--warning" : ""}`)}>{recurringStatusLabel(item)}</span>
    </span>
    <FiArrowRight className={allocationClass("planning-active-row__arrow")} aria-hidden="true" />
  </button>;
};

const AllocationEmptyArt = (props) => <img {...props} src={allocationArt.emptyState} width="512" height="384" alt="" decoding="async" />;

const EmptyAllocationState = ({ totalItems, canCreate, clearFilter }) => <EmptyState
  className={allocationClass("allocation-empty-state")}
  variant="compact"
  headingLevel={3}
  icon={AllocationEmptyArt}
  title={totalItems ? "Tidak ada rencana yang sesuai" : canCreate ? "Belum ada rencana aktif" : "Belum ada rekening yang dapat digunakan"}
  description={totalItems ? "Coba ubah pencarian atau filter untuk melihat rencana lain." : canCreate ? "Mulai dengan membuat Alokasi untuk memisahkan dana sesuai kebutuhan." : "Siapkan atau aktifkan rekening yang dapat Anda operasikan sebelum mengatur dana."}
  action={totalItems ? <Button onClick={clearFilter}>Tampilkan semua</Button> : canCreate ? null : <ButtonLink variant="primary" to="/rekening">Lihat Rekening</ButtonLink>}
/>;

const PlanningActiveList = ({ rows, totalItems, attentionEnvelopeId, highlightedRowId, onOpenDetail, onOpenCommitmentDetail, onOpenRecurringDetail, canCreate, clearFilter }) => {
  if (!rows.length) return <EmptyAllocationState totalItems={totalItems} canCreate={canCreate} clearFilter={clearFilter} />;
  return <div className={allocationClass("planning-active-list")} role="list">
    {rows.map((row) => <div key={row.id} id={`planning-active-${row.id}`} role="listitem">
      {row.kind === "allocation" ? <AllocationActiveRow row={row} attention={row.allocation.envelope_period_id === attentionEnvelopeId || row.id === highlightedRowId} onOpen={onOpenDetail} /> : null}
      {row.kind === "commitment" ? <CommitmentActiveRow row={row} highlighted={row.id === highlightedRowId} onOpen={onOpenCommitmentDetail} /> : null}
      {row.kind === "recurring" ? <RecurringActiveRow row={row} highlighted={row.id === highlightedRowId} onOpen={onOpenRecurringDetail} /> : null}
    </div>)}
  </div>;
};

const PlanningToolbar = ({ query, setQuery, ownership, allocationFilter, setAllocationFilter, resultCount }) => <div className={allocationClass("allocation-toolbar")}>
  <label className={allocationClass("allocation-toolbar__search")}>
    <FiSearch aria-hidden="true" />
    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari rencana, kewajiban, atau jadwal..." aria-label="Cari rencana aktif" />
  </label>
  <div className={allocationClass("allocation-toolbar__meta")}>
    {ownership.showFilter ? <div className={allocationClass("allocation-filters")} role="group" aria-label="Filter dana aktif">{ACTIVE_FILTERS.map((filter) => <button type="button" key={filter.value} className={allocationClass(allocationFilter === filter.value ? "is-active" : "")} aria-pressed={allocationFilter === filter.value} onClick={() => setAllocationFilter(filter.value)}>{filter.label}</button>)}</div> : null}
    <span className={allocationClass("allocation-toolbar__count")}>{resultCount} item</span>
  </div>
</div>;

const workflowResultRowId = (rows, workflowResult) => {
  const commitmentId = String(workflowResult?.commitmentId || "");
  const recurringRuleId = String(workflowResult?.recurringRuleId || "");
  if (!commitmentId && !recurringRuleId) return "";
  const row = rows.find((candidate) => candidate.kind === "commitment"
    ? String(candidate.commitment?.commitment_id || "") === commitmentId
    : candidate.kind === "recurring"
      ? String(candidate.recurring?.recurring_rule_id || "") === recurringRuleId
      : (candidate.commitments || []).some((item) => String(item.commitment_id || "") === commitmentId)
        || (candidate.recurring || []).some((item) => String(item.recurring_rule_id || "") === recurringRuleId));
  return row?.id || "";
};

const AllocationOverviewLayer = ({
  activeItems, allocationFilter, setAllocationFilter, attentionEnvelopeId, budgets, recurringItems, commitments,
  onOpenDetail, onOpenRecurringDetail, onOpenCommitmentDetail, canCreate, canFund, openCreate, onOpenFunding, accounts, actor,
  onCreateRecurring, onCreateCommitment, workflowResult, onWorkflowResultConsumed,
}) => {
  const [createLauncherOpen, setCreateLauncherOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rows = buildPlanningActiveItems({ allocations: activeItems, budgets, recurringItems, commitments });
  const ownership = planningActiveOwnership(rows, actor);
  const highlightedRowId = workflowResultRowId(rows, workflowResult);
  useEffect(() => {
    if (!highlightedRowId) return undefined;
    const frame = window.requestAnimationFrame(() => {
      scrollIntoViewWithMotionPreference(document.getElementById(`planning-active-${highlightedRowId}`), { block: "center" });
      onWorkflowResultConsumed?.();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [highlightedRowId, onWorkflowResultConsumed]);
  const visibleItems = ownership.showFilter ? filterPlanningActiveItems(rows, allocationFilter, actor) : rows;
  const filteredItems = useMemo(() => filterPlanningActiveItemsByQuery(visibleItems, query), [visibleItems, query]);

  return <>
    <AllocationFundingSummary accounts={accounts} items={activeItems} hasActiveItems={Boolean(rows.length)} canFund={canFund} canCreate={canCreate} onOpenFunding={onOpenFunding} onOpenCreateLauncher={() => setCreateLauncherOpen(true)} onCreateAllocation={openCreate} />
    <AllocationPlanningNav />
    <section className={allocationClass("allocation-active")} aria-labelledby="allocation-active-title">
      <div className={allocationClass("allocation-section-heading")}><h2 id="allocation-active-title">Aktif</h2>{rows.length ? <span>{filteredItems.length} dari {rows.length}</span> : null}</div>
      {rows.length ? <PlanningToolbar query={query} setQuery={setQuery} ownership={ownership} allocationFilter={allocationFilter} setAllocationFilter={setAllocationFilter} resultCount={filteredItems.length} /> : null}
      <PlanningActiveList rows={filteredItems} totalItems={visibleItems.length} attentionEnvelopeId={attentionEnvelopeId} highlightedRowId={highlightedRowId} onOpenDetail={onOpenDetail} onOpenCommitmentDetail={onOpenCommitmentDetail} onOpenRecurringDetail={onOpenRecurringDetail} canCreate={canCreate} clearFilter={() => { setAllocationFilter("all"); setQuery(""); }} />
    </section>
    <PlanningCreateLauncher open={createLauncherOpen} onClose={() => setCreateLauncherOpen(false)} onCreateAllocation={openCreate} onCreateRecurring={onCreateRecurring} onCreateCommitment={onCreateCommitment} />
  </>;
};

export default AllocationOverviewLayer;
