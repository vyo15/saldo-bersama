import { lazy, Suspense, useMemo, useState } from "react";
import { FiInbox } from "react-icons/fi";
import Money from "../../components/common/Money.jsx";
import UserAvatar from "../../components/common/UserAvatar.jsx";
import LazyActionFallback from "../../components/feedback/LazyActionFallback.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import { useFinance } from "../../app/FinanceContext.jsx";
import { useApiResource } from "../../hooks/useApiResource.js";
import { accountDisplayLabel } from "../../shared/presentation/account.js";
import { AccountIcon } from "../../components/common/FinanceChoiceIcons.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import MasterDataRequestsPanel from "../masterData/MasterDataRequestsPanel.jsx";
import TransferRequestsPanel from "../transactions/TransferRequestsPanel.jsx";
import { roleLabel } from "./settingsPresentation.js";
import memberStyles from "./MembersSettings.module.css";

const MemberActivityPanel = lazy(() => import("./components/MemberActivityPanel.jsx"));
const EMPTY_ACCOUNT = Object.freeze({});

const TABS = Object.freeze([
  { key: "summary", label: "Ringkasan" },
  { key: "finance", label: "Keuangan Saya" },
  { key: "requests", label: "Pengajuan Saya" },
  { key: "activity", label: "Aktivitas Saya" },
]);

const resolveActor = (bootstrap, user) => bootstrap?.user ?? user ?? EMPTY_ACCOUNT;
const resolveProfile = (actor, user) => ({ ...actor, photoURL: user?.photoURL ?? user?.picture ?? actor.photoURL ?? "" });
const accountDisplayName = (actor) => actor.name || actor.email || "Akun Saya";
const requestCountFor = (enabled, masterRequests, transferRequests) => enabled ? (masterRequests.data?.items?.length ?? 0) + (transferRequests.data?.items?.length ?? 0) : 0;

const financeForUser = (user, bootstrap, overview) => ({
  accounts: (bootstrap?.accounts ?? []).filter((item) => item.owner_scope === "personal" && String(item.owner_user_id ?? "") === String(user?.user_id ?? "")),
  allocations: (overview?.envelopes ?? []).filter((item) => String(item.assignee_user_id ?? "") === String(user?.user_id ?? "")),
});

const SummaryStat = ({ value, label }) => <div className={memberStyles.memberSummaryStat}><strong>{value}</strong><span>{label}</span></div>;

const MySummary = ({ user, finance, requestCount }) => <div className={`${memberStyles.memberDetailGrid} ${memberStyles.memberSummary}`}>
  <div className={memberStyles.memberSummaryStats} aria-label="Ringkasan akun">
    <SummaryStat value={finance.accounts.length} label="Rekening pribadi" />
    <SummaryStat value={finance.allocations.length} label="Alokasi" />
    <SummaryStat value={requestCount} label="Pengajuan" />
  </div>
  <section className={memberStyles.memberInfoCard} aria-labelledby="my-account-info-title"><h3 id="my-account-info-title">Informasi akun</h3><dl><div><dt>Email</dt><dd>{user?.email || "—"}</dd></div><div><dt>Akses</dt><dd>{roleLabel(user?.role)}</dd></div><div><dt>Status</dt><dd>Aktif</dd></div><div><dt>Google</dt><dd>Terhubung</dd></div></dl></section>
</div>;

const MyFinance = ({ finance }) => <div className={memberStyles.memberFinanceGrid}>
  <section className={memberStyles.memberFinanceSection}><div className={memberStyles.detailSectionHeading}><div><p className="eyebrow">Dimiliki</p><h3>Rekening pribadi</h3></div><span className={memberStyles.detailCount}><AccountIcon aria-hidden="true" />{finance.accounts.length}</span></div>{finance.accounts.length ? <div className={memberStyles.detailRows}>{finance.accounts.map((account) => <div className={memberStyles.detailRow} key={account.account_id}><span><strong>{accountDisplayLabel(account, { includeOwner: false })}</strong><small>{account.account_number || account.account_type || "Rekening pribadi"}</small></span><Money value={account.current_balance ?? account.balance ?? 0} /></div>)}</div> : <p className={memberStyles.detailEmpty}>Belum ada rekening pribadi atas nama Anda.</p>}</section>
  <section className={memberStyles.memberFinanceSection}><div className={memberStyles.detailSectionHeading}><div><p className="eyebrow">Ditugaskan</p><h3>Alokasi saya</h3></div><span className={memberStyles.detailCount}>{finance.allocations.length}</span></div>{finance.allocations.length ? <div className={memberStyles.detailRows}>{finance.allocations.map((item) => <div className={memberStyles.detailRow} key={item.envelope_period_id || item.envelope_rule_id}><span><strong>{item.name || "Alokasi"}</strong><small>{item.source_account_name || "Sumber dana"}</small></span><Money value={item.remaining_amount ?? item.allocated_amount ?? 0} /></div>)}</div> : <p className={memberStyles.detailEmpty}>Belum ada alokasi yang ditugaskan kepada Anda.</p>}</section>
</div>;

const MyRequests = ({ masterRequests, transferRequests, accounts }) => {
  if (masterRequests.status === "error") return <ErrorState error={masterRequests.error} onRetry={masterRequests.reload} />;
  if (transferRequests.status === "error") return <ErrorState error={transferRequests.error} onRetry={transferRequests.reload} />;
  const loading = [masterRequests.status, transferRequests.status].some((status) => status === "loading");
  if (loading) return <LazyActionFallback surface="panel" title="Pengajuan Saya" label="Memuat pengajuan..." />;
  const masterItems = masterRequests.data?.items ?? [];
  const transferItems = transferRequests.data?.items ?? [];
  return <div className={memberStyles.myRequestStack}>
    <RefreshWarning error={masterRequests.refreshError || transferRequests.refreshError} onRetry={() => Promise.allSettled([masterRequests.reload(), transferRequests.reload()])} />
    {!masterItems.length && !transferItems.length ? <div className={memberStyles.myRequestEmpty}><FiInbox aria-hidden="true" /><strong>Belum ada pengajuan</strong><span>Pengajuan rekening, kategori, atau transfer yang Anda buat akan terkumpul di sini.</span></div> : null}
    <MasterDataRequestsPanel items={masterItems} title="Rekening dan kategori saya" />
    <TransferRequestsPanel items={transferItems} accounts={accounts} />
  </div>;
};

const AdminRequestMessage = () => <div className={memberStyles.myRequestEmpty}><FiInbox aria-hidden="true" /><strong>Administrator tidak memerlukan pengajuan</strong><span>Administrator membuat rekening, kategori, dan transfer langsung dari menu terkait.</span></div>;

const MyAccountTabPanel = ({ tab, actor, finance, requestCount, memberMode, masterRequests, transferRequests, accounts, activityMember, profile }) => {
  if (tab === "summary") return <MySummary user={actor} finance={finance} requestCount={requestCount} />;
  if (tab === "finance") return <MyFinance finance={finance} />;
  if (tab === "requests") return memberMode ? <MyRequests masterRequests={masterRequests} transferRequests={transferRequests} accounts={accounts} /> : <AdminRequestMessage />;
  if (tab === "activity") return <Suspense fallback={<LazyActionFallback surface="panel" title="Aktivitas Saya" label="Menyiapkan aktivitas..." />}><MemberActivityPanel embedded member={activityMember} currentUser={profile} /></Suspense>;
  return null;
};

const MyAccountPage = () => {
  const { user } = useAuth();
  const { bootstrap, overview } = useFinance();
  const [tab, setTab] = useState("summary");
  const actor = useMemo(() => resolveActor(bootstrap, user), [bootstrap, user]);
  const profile = useMemo(() => resolveProfile(actor, user), [actor, user]);
  const memberMode = actor.role === "member";
  const masterRequests = useApiResource("masterDataRequests.list", {}, { enabled: memberMode });
  const transferRequests = useApiResource("transferRequests.list", {}, { enabled: memberMode });
  const finance = useMemo(() => financeForUser(actor, bootstrap, overview), [actor, bootstrap, overview]);
  const requestCount = requestCountFor(memberMode, masterRequests, transferRequests);
  const activityMember = { ...actor, is_current: true, status: "active", identity_status: "linked" };
  const accounts = bootstrap?.accounts ?? [];

  return <section className={`${memberStyles.memberDetail} ${memberStyles.myAccountDetail}`} aria-label="Akun Saya">
    <div className={memberStyles.memberDetailHero}><UserAvatar user={profile} className={memberStyles.memberDetailAvatar} /><div className={memberStyles.memberDetailIdentity}><h2>{accountDisplayName(actor)}</h2><p>{actor.email}</p><div className={memberStyles.memberDetailBadges}><span className={memberStyles.memberRole}>{roleLabel(actor.role)}</span><span className="status-badge status-badge--active">Aktif</span></div></div></div>
    <div className={memberStyles.memberDetailTabs} role="tablist" aria-label="Akun Saya">{TABS.map((item) => <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} className={tab === item.key ? memberStyles.memberDetailTabActive : memberStyles.memberDetailTab} onClick={() => setTab(item.key)}>{item.label}</button>)}</div>
    <div className={memberStyles.memberDetailPanel} role="tabpanel"><MyAccountTabPanel tab={tab} actor={actor} finance={finance} requestCount={requestCount} memberMode={memberMode} masterRequests={masterRequests} transferRequests={transferRequests} accounts={accounts} activityMember={activityMember} profile={profile} /></div>
  </section>;
};

export default MyAccountPage;
