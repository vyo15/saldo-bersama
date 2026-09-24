import { Link } from "react-router";
import { dashboardClass } from "../dashboardStyles.js";

export const DashboardPlanning = ({ model }) => (
  <article className={dashboardClass("shared-panel desktop-summary-widget")}>
    <div className={dashboardClass("shared-widget__heading")}>
      <div><span>Ringkas</span><h2>Atur Dana</h2></div>
      <Link to="/perencanaan/kantong">Buka</Link>
    </div>
    <dl className={dashboardClass("desktop-summary-list")}>
      <div><dt>Kebutuhan aktif</dt><dd>{model.budgets.length}</dd></div>
      <div><dt>Jadwal mendatang</dt><dd>{model.recurringItems.length}</dd></div>
      <div><dt>Target berjalan</dt><dd>{model.goals.length}</dd></div>
    </dl>
  </article>
);
