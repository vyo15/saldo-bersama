import { FiCalendar, FiPlus, FiTarget } from "react-icons/fi";
import { Link } from "react-router";
import { AccountIcon } from "../../../components/common/FinanceChoiceIcons.jsx";
import ProgressBar from "../../../components/common/ProgressBar.jsx";
import { dashboardDueLabel, dashboardGoalEmptyAction, dashboardNeedEmptyAction, dashboardRecurringEmptyAction } from "../dashboardPresentation.js";
import { dashboardClass } from "../dashboardStyles.js";
import SensitiveMoney from "./SensitiveMoney.jsx";
import { compactDate } from "./desktopDashboardModel.js";

const DesktopEmptyAction = ({ action }) => {
  const ActionIcon = action.to === "/rekening" ? AccountIcon : FiPlus;
  return <Link className={dashboardClass("shared-widget-empty-action")} to={action.to} state={action.state || undefined}>
    <span className={dashboardClass("shared-widget-empty-action__icon")}><ActionIcon aria-hidden="true" /></span>
    <span className={dashboardClass("shared-widget-empty-action__copy")}><strong>{action.label}</strong><small>{action.description}</small></span>
  </Link>;
};

const BudgetWidget = ({ budgets, overview, balanceVisible }) => (
  <article className={dashboardClass("shared-panel shared-widget")}>
    <div className={dashboardClass("shared-widget__heading")}>
      <div><h2>Kebutuhan</h2><span>{budgets.length} kebutuhan aktif</span></div>
      <Link to="/perencanaan/kantong">Lihat</Link>
    </div>
    <ul className={dashboardClass("shared-progress-list")}>
      {budgets.length ? budgets.slice(0, 3).map((item) => (
        <li key={item.budget_id}>
          <div>
            <strong>{item.name || item.display_name || "Kebutuhan"}</strong>
            <span><SensitiveMoney visible={balanceVisible} value={item.used_amount || 0} /> / <SensitiveMoney visible={balanceVisible} value={item.amount || 0} /></span>
          </div>
          <ProgressBar value={item.used_amount || 0} max={item.amount || 0} label={`Pemakaian ${item.name || "kebutuhan"}`} />
        </li>
      )) : (
        <li className={dashboardClass("shared-widget-empty")}>
          <DesktopEmptyAction action={dashboardNeedEmptyAction(overview)} />
        </li>
      )}
    </ul>
  </article>
);

const RecurringWidget = ({ items, overview, balanceVisible }) => (
  <article className={dashboardClass("shared-panel shared-widget")}>
    <div className={dashboardClass("shared-widget__heading")}>
      <div><h2>Jadwal rutin</h2><span>{items.length} jadwal mendatang</span></div>
      <Link to="/perencanaan/jadwal">Lihat</Link>
    </div>
    <ul className={dashboardClass("shared-due-list")}>
      {items.length ? items.map((item) => (
        <li key={item.occurrence_id || item.recurring_rule_id}>
          <span className={dashboardClass("shared-due-icon")}><FiCalendar aria-hidden="true" /></span>
          <span>
            <strong>{item.name}</strong>
            <small>{compactDate(item.due_date)} · <SensitiveMoney visible={balanceVisible} value={item.expected_amount || item.amount || 0} /></small>
          </span>
          <em>{dashboardDueLabel(item.due_date)}</em>
        </li>
      )) : (
        <li className={dashboardClass("shared-widget-empty")}>
          <DesktopEmptyAction action={dashboardRecurringEmptyAction(overview)} />
        </li>
      )}
    </ul>
  </article>
);

const GoalsWidget = ({ goals, overview, balanceVisible }) => (
  <article className={dashboardClass("shared-panel shared-widget")}>
    <div className={dashboardClass("shared-widget__heading")}>
      <div><h2>Target tabungan</h2><span>{goals.length} target aktif</span></div>
      <Link to="/target">Lihat</Link>
    </div>
    <ul className={dashboardClass("shared-progress-list shared-goal-list")}>
      {goals.length ? goals.map((item) => (
        <li key={item.goal_id}>
          <div>
            <strong><FiTarget aria-hidden="true" />{item.name}</strong>
            <span><SensitiveMoney visible={balanceVisible} value={item.current_amount || 0} /> / <SensitiveMoney visible={balanceVisible} value={item.target_amount || 0} /></span>
          </div>
          <ProgressBar value={item.current_amount || 0} max={item.target_amount || 0} label={`Kemajuan ${item.name}`} />
        </li>
      )) : (
        <li className={dashboardClass("shared-widget-empty")}>
          <DesktopEmptyAction action={dashboardGoalEmptyAction(overview)} />
        </li>
      )}
    </ul>
  </article>
);

export const DashboardPlanning = ({ model, balanceVisible }) => (
  <section className={dashboardClass("desktop-planning-section")} aria-labelledby="desktop-planning-title">
    <div className={dashboardClass("desktop-planning-section__heading")}>
      <div>
        <span>Rencana & komitmen</span>
        <h2 id="desktop-planning-title">Perencanaan keuangan</h2>
      </div>
    </div>
    <div className={dashboardClass("shared-dashboard-widgets")}>
      <BudgetWidget budgets={model.budgets} overview={model.overview} balanceVisible={balanceVisible} />
      <RecurringWidget items={model.recurringItems} overview={model.overview} balanceVisible={balanceVisible} />
      <GoalsWidget goals={model.goals} overview={model.overview} balanceVisible={balanceVisible} />
    </div>
  </section>
);

