import { useLocation } from "react-router";
import "./NativePageSkeleton.css";

const KIND_BY_PATH = Object.freeze({
  "/": "dashboard",
  "/rekening": "accounts",
  "/transaksi": "transactions",
  "/perencanaan/kantong": "planning",
  "/perencanaan/jadwal": "planning",
  "/target": "goals",
  "/laporan": "reports",
  "/investasi": "investments",
  "/rekonsiliasi": "reconciliations",
  "/notifikasi": "notifications",
  "/kategori": "categories",
  "/anggota": "members",
  "/persetujuan": "approvals",
});

const skeletonKindForPath = (pathname) => {
  if (KIND_BY_PATH[pathname]) return KIND_BY_PATH[pathname];
  if (pathname.startsWith("/pengaturan")) return "settings";
  return "generic";
};

const Block = ({ className = "" }) => <span className={`native-skeleton__block ${className}`.trim()} aria-hidden="true" />;
const Line = ({ size = "medium" }) => <Block className={`native-skeleton__line native-skeleton__line--${size}`} />;

const ListRows = ({ count = 4, amount = true }) => (
  <div className="native-skeleton__list" aria-hidden="true">
    {Array.from({ length: count }, (_, index) => (
      <div className="native-skeleton__list-row" key={index}>
        <Block className="native-skeleton__avatar" />
        <div className="native-skeleton__list-copy"><Line /><Line size="short" /></div>
        {amount ? <Line size="amount" /> : <Block className="native-skeleton__chevron" />}
      </div>
    ))}
  </div>
);

const Metric = () => <div className="native-skeleton__metric" aria-hidden="true"><Line size="short" /><Block className="native-skeleton__metric-value" /><Line size="tiny" /></div>;
const Progress = () => <div className="native-skeleton__progress" aria-hidden="true"><Block className="native-skeleton__progress-fill" /></div>;
const Toolbar = ({ count = 3 }) => <div className="native-skeleton__toolbar" aria-hidden="true">{Array.from({ length: count }, (_, index) => <Block key={index} className={`native-skeleton__pill${index === count - 1 ? " native-skeleton__pill--short" : ""}`} />)}</div>;

const DashboardSkeleton = () => <>
  <section className="native-skeleton__hero" aria-hidden="true"><div><Line size="short" /><Block className="native-skeleton__hero-amount" /><Line size="medium" /></div><div className="native-skeleton__hero-actions"><Block className="native-skeleton__round-action" /><Block className="native-skeleton__round-action" /></div></section>
  <div className="native-skeleton__metrics"><Metric /><Metric /><Metric /></div>
  <div className="native-skeleton__split"><div className="native-skeleton__panel"><Line /><ListRows count={3} /></div><div className="native-skeleton__panel"><Line /><Progress /><Progress /><Progress /></div></div>
</>;

const AccountsSkeleton = () => <>
  <Toolbar count={3} />
  <div className="native-skeleton__account-stage" aria-hidden="true"><div className="native-skeleton__account-card"><div className="native-skeleton__row"><Block className="native-skeleton__brand-mark" /><Line size="medium" /></div><Block className="native-skeleton__account-balance" /><Line size="short" /></div><div className="native-skeleton__account-side"><Line /><Metric /><Metric /></div></div>
  <ListRows count={4} />
</>;

const TransactionsSkeleton = () => <><Toolbar count={4} /><div className="native-skeleton__transaction-summary"><Metric /><Metric /></div><ListRows count={6} /></>;

const PlanningSkeleton = () => <>
  <section className="native-skeleton__planning-summary" aria-hidden="true"><div><Line size="short" /><Block className="native-skeleton__hero-amount" /><Line /></div><Progress /></section>
  <div className="native-skeleton__planning-grid" aria-hidden="true">{Array.from({ length: 3 }, (_, index) => <div className="native-skeleton__planning-card" key={index}><div className="native-skeleton__row"><Block className="native-skeleton__icon" /><Line /></div><Block className="native-skeleton__metric-value" /><Progress /><div className="native-skeleton__row"><Line size="tiny" /><Line size="tiny" /></div></div>)}</div>
</>;

const GoalsSkeleton = () => <><div className="native-skeleton__goal-summary"><Metric /><Progress /></div><div className="native-skeleton__goal-grid" aria-hidden="true">{Array.from({ length: 3 }, (_, index) => <div className="native-skeleton__goal-card" key={index}><div className="native-skeleton__row"><Block className="native-skeleton__icon" /><Line /></div><Block className="native-skeleton__metric-value" /><Progress /><div className="native-skeleton__row native-skeleton__row--spread"><Line size="short" /><Line size="tiny" /></div></div>)}</div></>;

const InvestmentsSkeleton = () => <>
  <section className="native-skeleton__portfolio" aria-hidden="true"><div className="native-skeleton__row"><Block className="native-skeleton__brand-mark" /><div className="native-skeleton__list-copy"><Line /><Line size="short" /></div></div><Block className="native-skeleton__hero-amount" /><div className="native-skeleton__metrics"><Metric /><Metric /></div></section>
  <div className="native-skeleton__holdings" aria-hidden="true">{Array.from({ length: 3 }, (_, index) => <div className="native-skeleton__holding" key={index}><Block className="native-skeleton__brand-mark" /><div className="native-skeleton__list-copy"><Line /><Line size="short" /></div><div className="native-skeleton__list-copy native-skeleton__align-end"><Line size="amount" /><Line size="tiny" /></div></div>)}</div>
</>;

const ReportsSkeleton = () => <><Toolbar count={3} /><div className="native-skeleton__metrics"><Metric /><Metric /><Metric /></div><div className="native-skeleton__chart" aria-hidden="true"><Block className="native-skeleton__chart-fill" /></div><div className="native-skeleton__split"><ListRows count={3} /><ListRows count={3} /></div></>;
const ReconciliationSkeleton = () => <><div className="native-skeleton__compare" aria-hidden="true"><Metric /><Block className="native-skeleton__compare-divider" /><Metric /></div><ListRows count={4} /></>;
const SettingsSkeleton = () => <><div className="native-skeleton__settings-grid"><ListRows count={5} amount={false} /><ListRows count={4} amount={false} /></div></>;

const SkeletonBody = ({ kind }) => {
  if (kind === "dashboard") return <DashboardSkeleton />;
  if (kind === "accounts") return <AccountsSkeleton />;
  if (kind === "transactions") return <TransactionsSkeleton />;
  if (kind === "planning") return <PlanningSkeleton />;
  if (kind === "goals") return <GoalsSkeleton />;
  if (kind === "investments") return <InvestmentsSkeleton />;
  if (kind === "reports") return <ReportsSkeleton />;
  if (kind === "reconciliations") return <ReconciliationSkeleton />;
  if (kind === "settings") return <SettingsSkeleton />;
  if (["notifications", "categories", "members", "approvals"].includes(kind)) return <><Toolbar count={3} /><ListRows count={5} amount={kind !== "members"} /></>;
  return <><div className="native-skeleton__metrics"><Metric /><Metric /></div><ListRows count={4} /></>;
};

const NativePageSkeleton = ({ kind, label = "Menyiapkan data…", variant = "content", route = false }) => {
  const location = useLocation();
  const resolvedKind = kind || skeletonKindForPath(location.pathname);
  return (
    <div className={`native-skeleton native-skeleton--${variant} native-skeleton--${resolvedKind}`} role="status" aria-live="polite" aria-busy="true">
      {route ? <div className="native-skeleton__route-progress" aria-hidden="true"><span /></div> : null}
      <span className="sr-only">{label}</span>
      <div className="native-skeleton__header" aria-hidden="true"><Block className="native-skeleton__eyebrow" /><Block className="native-skeleton__title" /><Line size="long" /></div>
      <SkeletonBody kind={resolvedKind} />
    </div>
  );
};

export default NativePageSkeleton;
