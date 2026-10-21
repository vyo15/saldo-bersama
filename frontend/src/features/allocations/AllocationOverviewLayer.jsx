import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { FiArrowRight, FiCalendar, FiCheck, FiChevronDown, FiFileText, FiInbox, FiPlus, FiSearch, FiTarget, FiX } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import ButtonLink from "../../components/common/ButtonLink.jsx";
import Modal from "../../components/common/Modal.jsx";
import Card from "../../components/common/Card.jsx";
import Money from "../../components/common/Money.jsx";
import ProgressBar from "../../components/common/ProgressBar.jsx";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import { accountDisplayLabel, accountOwnershipLabel } from "../../shared/presentation/account.js";
import { allocationUsage } from "./allocationPresentation.js";
import { allocationAvailableBalance, allocationSourceAccounts, planningFundingAccounts } from "./allocationFundingModel.js";
import { allocationClass } from "./allocationStyles.js";
import { allocationDecoration } from "./allocationDecorations.js";
import { buildPlanningActiveItems, filterPlanningActiveItems, filterPlanningActiveItemsByQuery, planningActiveOwnership, planningRowAudience } from "../planning/planningActiveModel.js";
import { allocationArt } from "./allocationArt.js";
import { compactPlanningDate, planningDueState } from "../../shared/presentation/dueDate.js";
import { scrollIntoViewWithMotionPreference } from "../../shared/motion.js";

const ACTIVE_FILTERS = Object.freeze([
  { value: "all", label: "Semua", description: "Semua alokasi" },
  { value: "mine", label: "Saya", description: "Untuk saya" },
  { value: "partner", label: "Pasangan", description: "Untuk pasangan atau anggota lain" },
  { value: "shared", label: "Bersama", description: "Untuk kebutuhan bersama" },
]);

const FundingSourceRow = ({ account }) => <div className={allocationClass("allocation-funding-summary__source-row")}>
  <span><strong>{accountDisplayLabel(account, { includeOwner: false })}</strong><small>{accountOwnershipLabel(account)}</small></span>
  <Money value={allocationAvailableBalance(account)} />
</div>;

const AllocationFundingSummary = ({ accounts, items, hasActiveItems, canFund, canCreate, onOpenFunding, onCreateAllocation }) => {
  const hasAllocations = items.length > 0;
  const sources = hasAllocations ? allocationSourceAccounts(accounts) : planningFundingAccounts(accounts, items);
  const total = sources.reduce((sum, account) => sum + allocationAvailableBalance(account), 0);
  if (!accounts.length) return <Card surface="object" className={allocationClass("allocation-funding-summary allocation-funding-summary--no-accounts")}>
    <div className={allocationClass("allocation-funding-summary__copy")}>
      <span className={allocationClass("allocation-funding-summary__eyebrow")}>Atur Dana</span>
      <h2>Belum ada rekening</h2>
      <p className={allocationClass("allocation-funding-summary__hint")}>Tambahkan rekening untuk mulai mengatur dana.</p>
      <ButtonLink variant="primary" to="/rekening">Lihat Rekening</ButtonLink>
    </div>
  </Card>;

  const action = hasAllocations
    ? <Button variant="primary" icon={FiPlus} disabled={!canFund && !canCreate} onClick={() => onOpenFunding?.({ chooseDestination: true })}>Alokasikan dana</Button>
    : <Button variant="primary" icon={FiPlus} disabled={!canCreate} onClick={onCreateAllocation}>Buat Alokasi</Button>;

  return <Card surface="object" className={allocationClass(`allocation-funding-summary${hasActiveItems ? " allocation-funding-summary--filled" : " allocation-funding-summary--empty"}`)} aria-labelledby="allocation-funding-summary-title">
    <div className={allocationClass("allocation-funding-summary__content")}>
      <div className={allocationClass("allocation-funding-summary__copy")}>
        <div>
          <span className={allocationClass("allocation-funding-summary__eyebrow")} id="allocation-funding-summary-title" aria-label="Dana bebas dari rekening sumber">Dana bebas</span>
          <div className={allocationClass("allocation-funding-summary__amount")}><Money value={total} /></div>
        </div>
        {total > 0 ? <p className={allocationClass("allocation-funding-summary__supporting-copy")}>Dari rekening yang dapat digunakan.</p> : null}
        {!sources.length ? <span className={allocationClass("allocation-funding-summary__hint")}>Belum ada dana bebas. Alokasi bisa disiapkan dulu.</span> : null}
        <div className={allocationClass("allocation-funding-summary__actions")}>{action}</div>
      </div>
      <div className={allocationClass("allocation-funding-summary__art")} aria-hidden="true">
        <img src={allocationArt.heroCouple} width="512" height="384" alt="" decoding="async" />
      </div>
    </div>
    {sources.length > 0 ? <details className={allocationClass("allocation-funding-summary__sources")}>
      <summary>{sources.length === 1 ? "Lihat rekening sumber" : `Lihat ${sources.length} rekening sumber`}<FiArrowRight aria-hidden="true" /></summary>
      <div className={allocationClass("allocation-funding-summary__source-list")}>
        {sources.map((account) => <FundingSourceRow key={account.account_id} account={account} />)}
      </div>
    </details> : null}
  </Card>;
};

// Pintasan ini adalah destinasi, bukan tab atau filter kedua.
const PLANNING_LINKS = Object.freeze([
  { to: "/perencanaan/jadwal", label: "Tagihan rutin", description: "Pembayaran berkala", icon: FiCalendar, tone: "recurring" },
  { to: "/perencanaan/komitmen", label: "Cicilan & utang", description: "Termasuk KPR dan arisan", icon: FiFileText, tone: "commitment" },
  { to: "/target", label: "Target tabungan", description: "Tujuan menabung", icon: FiTarget, tone: "goal" },
]);

const AllocationQuickLinks = () => <nav className={allocationClass("allocation-shortcuts")} aria-label="Akses cepat perencanaan">
  {PLANNING_LINKS.map(({ to, label, description, icon: Icon, tone }) => <Link key={to} to={to} state={tone === "goal" ? { fromAturDana: true } : undefined} data-tone={tone} className={allocationClass("allocation-shortcuts__link")} aria-label={`${label} — ${description}`}>
    <span className={allocationClass("allocation-shortcuts__icon")}><Icon aria-hidden="true" /></span>
    <span>{label}</span>
  </Link>)}
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

const AllocationActiveRow = ({ row, attention, onOpen, actor }) => {
  const item = row.allocation;
  const usage = allocationUsage(item);
  const decoration = allocationDecoration({ decorationKey: item.decoration_key, name: item.name, id: item.envelope_rule_id });
  const linked = allocationLinkedSignal(row);
  const audience = planningRowAudience(row, actor);
  const recipientName = String(item.assignee_name || "").trim();
  const audienceText = audience === "mine" ? "Untuk saya" : audience === "shared" ? "Untuk bersama" : `Untuk ${recipientName || "pasangan"}`;
  return <button type="button" className={allocationClass(`planning-active-row${attention ? " planning-active-row--attention" : ""}`)} onClick={() => onOpen(item)} aria-label={`Buka detail ${item.name}, ${audienceText}`}>
    <span className={allocationClass("planning-active-row__icon")}><img src={decoration.asset} width="512" height="512" alt="" aria-hidden="true" draggable="false" decoding="async" /></span>
    <span className={allocationClass("planning-active-row__content")}>
      <span className={allocationClass("planning-active-row__topline")}><span className={allocationClass("planning-active-row__name-group")}><span className={allocationClass("planning-active-row__title")}>{item.name}</span><span className={allocationClass("planning-active-row__audience")} data-audience={audience}>{audienceText}</span></span><UsageBadge item={item} usage={usage} /></span>
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

const EmptyAllocationState = ({ totalItems, clearFilter }) => <EmptyState
  className={allocationClass("allocation-empty-state")}
  variant="compact"
  headingLevel={3}
  icon={FiInbox}
  title={totalItems ? "Tidak ada hasil" : "Belum ada alokasi aktif"}
  description={totalItems ? "Coba kata lain atau hapus filter." : null}
  action={totalItems ? <Button onClick={clearFilter}>Hapus filter</Button> : null}
/>;

const PlanningActiveList = ({ rows, totalItems, attentionEnvelopeId, highlightedRowId, onOpenDetail, clearFilter, actor }) => {
  if (!rows.length) return <EmptyAllocationState totalItems={totalItems} clearFilter={clearFilter} />;
  return <div className={allocationClass("planning-active-list")} role="list">
    {rows.map((row) => <div key={row.id} id={`planning-active-${row.id}`} role="listitem">
      <AllocationActiveRow row={row} attention={row.allocation.envelope_period_id === attentionEnvelopeId || row.id === highlightedRowId} onOpen={onOpenDetail} actor={actor} />
    </div>)}
  </div>;
};

const PlanningFilterDialog = ({ open, onClose, value, onChange }) => <Modal open={open} onClose={onClose} size="sm" title="Untuk siapa?">
  <div className={allocationClass("allocation-audience-options")}>
    {ACTIVE_FILTERS.map((option) => <button key={option.value} type="button"
      className={allocationClass(`allocation-audience-options__item${value === option.value ? " is-selected" : ""}`)}
      data-audience={option.value === "all" ? undefined : option.value}
      aria-pressed={value === option.value}
      onClick={() => { onChange(option.value); onClose(); }}>
      <span>{option.description}</span>
      {value === option.value ? <FiCheck aria-hidden="true" /> : null}
    </button>)}
  </div>
</Modal>;

const PlanningToolbar = ({ query, setQuery, searchOpen, resultCount }) => !searchOpen ? null : <div className={allocationClass("allocation-toolbar")}>
  <label className={allocationClass("allocation-toolbar__search")}>
    <FiSearch aria-hidden="true" />
    <input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="Cari alokasi atau kebutuhan" aria-label="Cari alokasi dana" />
  </label>
  <span className={allocationClass("allocation-toolbar__count")} aria-live="polite">{resultCount} hasil</span>
</div>;

const AllocationListHeader = ({ showFilter, allocationFilter, onOpenFilter, searchOpen, onToggleSearch, hasItems }) => <div className={allocationClass("allocation-section-heading")}>
  <h2 id="allocation-active-title">Alokasi Dana</h2>
  <div className={allocationClass("allocation-section-heading__tools")}>
    {showFilter ? <button type="button" className={allocationClass("allocation-audience-trigger")} data-audience={allocationFilter === "all" ? undefined : allocationFilter} onClick={onOpenFilter} aria-haspopup="dialog" aria-label={`Filter alokasi, untuk ${ACTIVE_FILTERS.find((option) => option.value === allocationFilter)?.label || "Semua"}`}>
      <span>Untuk: {ACTIVE_FILTERS.find((option) => option.value === allocationFilter)?.label || "Semua"}</span><FiChevronDown aria-hidden="true" />
    </button> : null}
    {hasItems ? <button type="button" className={allocationClass("allocation-search-trigger")} onClick={onToggleSearch} aria-label={searchOpen ? "Tutup pencarian alokasi" : "Cari alokasi"} aria-expanded={searchOpen}>
      {searchOpen ? <FiX aria-hidden="true" /> : <FiSearch aria-hidden="true" />}
    </button> : null}
  </div>
</div>;

const workflowResultRowId = (rows, workflowResult) => {
  const commitmentId = String(workflowResult?.commitmentId || "");
  const recurringRuleId = String(workflowResult?.recurringRuleId || "");
  if (!commitmentId && !recurringRuleId) return "";
  const row = rows.find((candidate) => (candidate.commitments || []).some((item) => String(item.commitment_id || "") === commitmentId)
    || (candidate.recurring || []).some((item) => String(item.recurring_rule_id || "") === recurringRuleId));
  return row?.id || "";
};

const AllocationOverviewLayer = ({
  activeItems, allocationFilter, setAllocationFilter, attentionEnvelopeId, budgets, recurringItems, commitments,
  onOpenDetail, canCreate, canFund, openCreate, onOpenFunding, accounts, actor,
  workflowResult, onWorkflowResultConsumed,
}) => {
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rows = buildPlanningActiveItems({ allocations: activeItems, budgets, recurringItems, commitments });
  const allocationRows = rows.filter((row) => row.kind === "allocation");
  const ownership = planningActiveOwnership(allocationRows, actor);
  const highlightedRowId = workflowResultRowId(allocationRows, workflowResult);
  useEffect(() => {
    if (!highlightedRowId) {
      if (workflowResult?.commitmentId || workflowResult?.recurringRuleId) onWorkflowResultConsumed?.();
      return undefined;
    }
    const frame = window.requestAnimationFrame(() => {
      scrollIntoViewWithMotionPreference(document.getElementById(`planning-active-${highlightedRowId}`), { block: "center" });
      onWorkflowResultConsumed?.();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [highlightedRowId, onWorkflowResultConsumed, workflowResult?.commitmentId, workflowResult?.recurringRuleId]);
  const visibleItems = ownership.showFilter ? filterPlanningActiveItems(allocationRows, allocationFilter, actor) : allocationRows;
  const filteredItems = useMemo(() => filterPlanningActiveItemsByQuery(visibleItems, query), [visibleItems, query]);
  const toggleSearch = () => { setSearchOpen((current) => !current); setQuery(""); };

  return <>
    <AllocationFundingSummary accounts={accounts} items={activeItems} hasActiveItems={Boolean(rows.length)} canFund={canFund} canCreate={canCreate} onOpenFunding={onOpenFunding} onCreateAllocation={openCreate} />
    <AllocationQuickLinks />
    <section className={allocationClass("allocation-active")} aria-labelledby="allocation-active-title">
      <AllocationListHeader hasItems={allocationRows.length > 0} showFilter={ownership.showFilter} allocationFilter={allocationFilter} onOpenFilter={() => setFilterOpen(true)} searchOpen={searchOpen} onToggleSearch={toggleSearch} />
      {allocationRows.length ? <PlanningToolbar query={query} setQuery={setQuery} searchOpen={searchOpen} resultCount={filteredItems.length} /> : null}
      <PlanningActiveList rows={filteredItems} totalItems={allocationRows.length} attentionEnvelopeId={attentionEnvelopeId} highlightedRowId={highlightedRowId} onOpenDetail={onOpenDetail} actor={actor} clearFilter={() => { setAllocationFilter("all"); setQuery(""); }} />
    </section>
    <PlanningFilterDialog open={filterOpen} onClose={() => setFilterOpen(false)} value={allocationFilter} onChange={setAllocationFilter} />
  </>;
};

export default AllocationOverviewLayer;
