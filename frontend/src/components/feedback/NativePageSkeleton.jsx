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

const Card = ({ compact = false }) => (
  <div className={`native-skeleton__card${compact ? " native-skeleton__card--compact" : ""}`} aria-hidden="true">
    <div className="native-skeleton__row native-skeleton__row--heading"><Block className="native-skeleton__icon" /><Block className="native-skeleton__line native-skeleton__line--medium" /></div>
    <Block className="native-skeleton__amount" />
    <Block className="native-skeleton__line native-skeleton__line--short" />
  </div>
);

const ListRows = ({ count = 3 }) => (
  <div className="native-skeleton__list" aria-hidden="true">
    {Array.from({ length: count }, (_, index) => (
      <div className="native-skeleton__list-row" key={index}>
        <Block className="native-skeleton__avatar" />
        <div className="native-skeleton__list-copy"><Block className="native-skeleton__line native-skeleton__line--medium" /><Block className="native-skeleton__line native-skeleton__line--short" /></div>
        <Block className="native-skeleton__line native-skeleton__line--amount" />
      </div>
    ))}
  </div>
);

const SkeletonBody = ({ kind }) => {
  if (["dashboard", "accounts", "planning", "goals", "investments"].includes(kind)) {
    return <><div className="native-skeleton__cards"><Card /><Card compact /></div><ListRows count={3} /></>;
  }
  if (["transactions", "notifications", "categories", "members", "approvals", "reconciliations"].includes(kind)) {
    return <><div className="native-skeleton__toolbar"><Block className="native-skeleton__pill" /><Block className="native-skeleton__pill" /><Block className="native-skeleton__pill native-skeleton__pill--short" /></div><ListRows count={5} /></>;
  }
  if (kind === "reports") {
    return <><div className="native-skeleton__chart" aria-hidden="true"><Block className="native-skeleton__chart-fill" /></div><div className="native-skeleton__cards"><Card compact /><Card compact /></div></>;
  }
  return <><Card /><ListRows count={3} /></>;
};

const NativePageSkeleton = ({ kind, label = "Menyiapkan data…", variant = "content", route = false }) => {
  const location = useLocation();
  const resolvedKind = kind || skeletonKindForPath(location.pathname);
  return (
    <div className={`native-skeleton native-skeleton--${variant} native-skeleton--${resolvedKind}`} role="status" aria-live="polite" aria-busy="true">
      {route ? <div className="native-skeleton__route-progress" aria-hidden="true"><span /></div> : null}
      <span className="sr-only">{label}</span>
      <div className="native-skeleton__header" aria-hidden="true">
        <Block className="native-skeleton__eyebrow" />
        <Block className="native-skeleton__title" />
        <Block className="native-skeleton__line native-skeleton__line--long" />
      </div>
      <SkeletonBody kind={resolvedKind} />
    </div>
  );
};

export default NativePageSkeleton;
