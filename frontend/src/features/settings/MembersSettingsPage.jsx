import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import LazyActionFallback from "../../components/feedback/LazyActionFallback.jsx";
import { FiArrowLeft, FiChevronRight, FiEdit2, FiInbox, FiMoreHorizontal, FiPieChart, FiPlus, FiRotateCcw, FiSearch, FiUserMinus } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import VisualChoiceGroup from "../../components/common/VisualChoiceGroup.jsx";
import { AccountIcon, AdminIcon, PersonIcon } from "../../components/common/FinanceChoiceIcons.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import SelectionField from "../../components/common/SelectionField.jsx";
import Modal from "../../components/common/Modal.jsx";
import Money from "../../components/common/Money.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import UserAvatar from "../../components/common/UserAvatar.jsx";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import { useFinance } from "../../app/FinanceContext.jsx";
import { useApiResource } from "../../hooks/useApiResource.js";
import { invalidationActionsFor } from "../../services/api/invalidation.js";
import { accountDisplayLabel } from "../../shared/presentation/account.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { deactivateUser, reactivateUser, runSettingsAction } from "./settings.api.js";
import OwnerSettingsGuard from "./OwnerSettingsGuard.jsx";
import SettingsNotice from "./SettingsNotice.jsx";
import { roleLabel, userStatusLabel } from "./settingsPresentation.js";
import styles from "./Settings.module.css";
import memberStyles from "./MembersSettings.module.css";
import NativePageSkeleton from "../../components/feedback/NativePageSkeleton.jsx";
import useUnsavedChangesGuard from "../../hooks/useUnsavedChangesGuard.js";

const MemberActivityPanel = lazy(() => import("./components/MemberActivityPanel.jsx"));
const ApprovalCenterPage = lazy(() => import("../approvals/ApprovalCenterPage.jsx"));

const EMPTY_MEMBERS = Object.freeze([]);
const EMPTY_MEMBER_FORM = Object.freeze({ email: "", name: "", role: "member" });
const DETAIL_TABS = Object.freeze([
  { key: "summary", label: "Ringkasan" },
  { key: "finance", label: "Keuangan" },
  { key: "approvals", label: "Pengajuan" },
  { key: "activity", label: "Aktivitas" },
]);

const MemberToolbar = ({ searchQuery, setSearchQuery, roleFilter, setRoleFilter }) => <div className={memberStyles.memberToolbar}><label className={memberStyles.memberSearch}><FiSearch aria-hidden="true" /><span className="sr-only">Cari anggota</span><input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Cari nama atau email" /></label><SelectionField className="field--compact" label="Filter role anggota" hideLabel compact value={roleFilter} onChange={setRoleFilter} options={[{ value: "all", label: "Semua role" }, { value: "owner", label: "Administrator" }, { value: "member", label: "Member" }]} /></div>;

const MemberMenu = ({ member, menuOpen, activeMenuRef, menuTriggerRefs, setOpenMenuId, openAction }) => <div className={memberStyles.memberMenuWrap} ref={menuOpen ? activeMenuRef : undefined}><button ref={(node) => { if (node) menuTriggerRefs.current.set(member.user_id, node); else menuTriggerRefs.current.delete(member.user_id); }} type="button" className={memberStyles.memberMenuTrigger} aria-label={`Aksi untuk ${member.name || member.email}`} aria-haspopup="true" aria-expanded={menuOpen} onClick={(event) => { event.stopPropagation(); setOpenMenuId((current) => current === member.user_id ? "" : member.user_id); }}><FiMoreHorizontal aria-hidden="true" /></button>{menuOpen ? <div className={memberStyles.memberMenu}>{member.status === "active" ? <button type="button" onClick={() => openAction("edit", member)}><FiEdit2 aria-hidden="true" />Ubah akses</button> : null}{member.status === "active" && !member.is_current ? <button className={memberStyles.memberMenuDanger} type="button" onClick={() => openAction("deactivate", member)}><FiUserMinus aria-hidden="true" />Nonaktifkan</button> : null}{member.status === "inactive" ? <button type="button" onClick={() => openAction("reactivate", member)}><FiRotateCcw aria-hidden="true" />Aktifkan kembali</button> : null}</div> : null}</div>;

const MemberStatusBadges = ({ member }) => <div className={memberStyles.memberMeta}><span className={`status-badge status-badge--${member.status === "active" ? "active" : "warning"}`}>{userStatusLabel(member.status)}</span>{member.status === "active" && member.identity_status === "pending" ? <span className="status-badge status-badge--warning">Menunggu login</span> : null}{member.is_current ? <span className="status-badge">Akun ini</span> : null}</div>;

const memberFinance = (member, accounts, envelopes) => ({
  accounts: accounts.filter((item) => item.owner_scope === "personal" && String(item.owner_user_id || "") === String(member.user_id)),
  allocations: envelopes.filter((item) => String(item.assignee_user_id || "") === String(member.user_id)),
});

const MemberCard = ({ member, user, menuProps, accounts, envelopes, onOpen }) => {
  const finance = memberFinance(member, accounts, envelopes);
  const menuOpen = menuProps.openMenuId === member.user_id;
  const avatarUser = member.is_current ? { ...member, photoURL: user?.photoURL || user?.picture || member.photoURL || "" } : member;
  return <article className={memberStyles.compactMemberCard}>
    <div className={memberStyles.compactMemberMain}>
      <button type="button" className={memberStyles.compactMemberOpen} onClick={() => onOpen(member)} aria-label={`Buka detail ${member.name || member.email}`}>
        <UserAvatar user={avatarUser} className={memberStyles.memberAvatar} />
        <span className={memberStyles.compactMemberCopy}><span className={memberStyles.compactMemberTitle}><strong>{member.name || member.email}</strong><span className={memberStyles.memberRole}>{roleLabel(member.role)}</span></span><small>{member.email}</small><span className={memberStyles.compactMemberFacts}><span><AccountIcon aria-hidden="true" />{finance.accounts.length} rekening</span><span><FiPieChart aria-hidden="true" />{finance.allocations.length} alokasi</span></span><MemberStatusBadges member={member} /></span>
        <FiChevronRight className={memberStyles.compactMemberArrow} aria-hidden="true" />
      </button>
      <MemberMenu member={member} menuOpen={menuOpen} {...menuProps} />
    </div>
  </article>;
};

const MembersContent = ({ resource, membersCount, filteredMembers, toolbarProps, user, menuProps, accounts, envelopes, onOpen }) => {
  if (resource.status === "loading") return <NativePageSkeleton kind="members" variant="panel" label="Memuat data anggota…" />;
  if (resource.status === "error") return <ErrorState error={resource.error} onRetry={resource.reload} />;
  const filtersActive = Boolean(toolbarProps.searchQuery.trim()) || toolbarProps.roleFilter !== "all";
  const showToolbar = membersCount > 5 || filtersActive;
  return <>{showToolbar ? <MemberToolbar {...toolbarProps} /> : null}{filteredMembers.length ? <div className={memberStyles.memberCompactList}>{filteredMembers.map((member) => <MemberCard key={member.user_id} member={member} user={user} menuProps={menuProps} accounts={accounts} envelopes={envelopes} onOpen={onOpen} />)}</div> : <EmptyState title="Anggota tidak ditemukan" description="Tidak ada anggota yang cocok dengan pencarian atau filter saat ini." action={<Button onClick={() => { toolbarProps.setSearchQuery(""); toolbarProps.setRoleFilter("all"); }}>Hapus pencarian dan filter</Button>} />}</>;
};

const MemberFormModal = ({ open, close, editingMember, memberForm, setMemberForm, saveMember, saving, result }) => {
  const guard = useUnsavedChangesGuard({ open, value: memberForm, onClose: close, blocked: saving });
  return <Modal open={open} onClose={guard.requestClose} discardGuard={guard} discardSubject="akses anggota" dismissible={!saving} title={editingMember ? "Ubah akses anggota" : "Tambah anggota"} size="sm" footer={<><Button type="button" onClick={guard.discardAndClose} disabled={saving}>Batal</Button><Button variant="primary" type="submit" form="member-access-form" loading={saving} disabled={saving}>Simpan akses</Button></>}><SettingsNotice result={result} /><form id="member-access-form" className="form-grid" onSubmit={saveMember}><label className="field form-grid__full"><span>Email Gmail *</span><input required type="email" disabled={Boolean(editingMember)} value={memberForm.email} onChange={(event) => setMemberForm((current) => ({ ...current, email: event.target.value }))} /><small>{editingMember ? "Email tidak dapat diubah." : "Setelah disimpan, email ini langsung diizinkan untuk login Google."}</small></label><label className="field form-grid__full"><span>Nama</span><input maxLength="120" value={memberForm.name} onChange={(event) => setMemberForm((current) => ({ ...current, name: event.target.value }))} /></label><VisualChoiceGroup className="form-grid__full" legend="Role" name="member-role" value={memberForm.role} onChange={(role) => setMemberForm((current) => ({ ...current, role }))} options={[{ value: "member", label: "Member", icon: PersonIcon, description: "Akses pencatatan sehari-hari" }, { value: "owner", label: "Administrator", icon: AdminIcon, description: "Kelola rekening, kategori, anggota, dan pengaturan" }]} columns={2} compact disabled={Boolean(editingMember?.is_current)} helper={editingMember?.is_current ? "Role akun sendiri tidak dapat diubah. Gunakan Administrator lain." : ""} /></form></Modal>;
};

const MemberActionModals = ({ target, actionState, setTarget, confirmUserAction }) => <><ConfirmationModal open={target?.action === "deactivate"} title="Nonaktifkan anggota?" description={target ? `${target.member.email} tidak lagi dapat memakai aplikasi. Data keuangan dan audit tidak dihapus.` : ""} confirmLabel="Nonaktifkan anggota" reasonLabel="Alasan penonaktifan" requireReason acknowledgementLabel="Saya sudah memastikan anggota ini tidak memiliki data personal aktif yang perlu dipindahkan." busy={actionState.status === "submitting"} error={actionState.error} onCancel={() => actionState.status !== "submitting" && setTarget(null)} onConfirm={confirmUserAction} /><ConfirmationModal open={target?.action === "reactivate"} title="Aktifkan kembali anggota?" description={target ? `${target.member.email} akan memperoleh akses kembali dan dapat login dengan akun Google yang memakai email tersebut.` : ""} confirmLabel="Aktifkan kembali" reasonLabel="Alasan reaktivasi" requireReason tone="primary" busy={actionState.status === "submitting"} error={actionState.error} onCancel={() => actionState.status !== "submitting" && setTarget(null)} onConfirm={confirmUserAction} /></>;

const useMemberMenuDismiss = ({ openMenuId, activeMenuRef, menuTriggerRefs, setOpenMenuId }) => {
  useEffect(() => {
    if (!openMenuId) return undefined;
    const closeFromOutside = (event) => { if (!activeMenuRef.current?.contains(event.target)) setOpenMenuId(""); };
    const closeFromKeyboard = (event) => { if (event.key !== "Escape") return; const trigger = menuTriggerRefs.current.get(openMenuId); setOpenMenuId(""); window.requestAnimationFrame(() => trigger?.focus()); };
    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("keydown", closeFromKeyboard);
    return () => { document.removeEventListener("pointerdown", closeFromOutside); document.removeEventListener("keydown", closeFromKeyboard); };
  }, [activeMenuRef, menuTriggerRefs, openMenuId, setOpenMenuId]);
};

const SummaryStat = ({ value, label }) => <div className={memberStyles.memberSummaryStat}><strong>{value}</strong><span>{label}</span></div>;

const DetailSummary = ({ member, finance }) => <div className={`${memberStyles.memberDetailGrid} ${memberStyles.memberSummary}`}>
  <div className={memberStyles.memberSummaryStats} aria-label="Ringkasan anggota"><SummaryStat value={finance.accounts.length} label="Rekening pribadi" /><SummaryStat value={finance.allocations.length} label="Alokasi" /></div>
  <section className={memberStyles.memberInfoCard} aria-labelledby="member-account-info-title"><h3 id="member-account-info-title">Informasi akun</h3><dl><div><dt>Email</dt><dd>{member.email}</dd></div><div><dt>Role</dt><dd>{roleLabel(member.role)}</dd></div><div><dt>Status</dt><dd>{userStatusLabel(member.status)}</dd></div><div><dt>Google</dt><dd>{member.identity_status === "pending" ? "Menunggu login" : "Terhubung"}</dd></div></dl></section>
</div>;

const DetailFinance = ({ finance, navigate }) => <div className={memberStyles.memberFinanceGrid}>
  <section className={memberStyles.memberFinanceSection}><div className={memberStyles.detailSectionHeading}><div><p className="eyebrow">Dimiliki</p><h3>Rekening pribadi</h3></div><Button type="button" onClick={() => navigate("/rekening")}>Lihat</Button></div>{finance.accounts.length ? <div className={memberStyles.detailRows}>{finance.accounts.map((account) => <div key={account.account_id} className={memberStyles.detailRow}><span><strong>{accountDisplayLabel(account, { includeOwner: false })}</strong><small>{account.account_number || account.account_type || "Rekening pribadi"}</small></span><Money value={account.current_balance ?? account.balance ?? 0} /></div>)}</div> : <p className={memberStyles.detailEmpty}>Belum ada rekening pribadi atas nama anggota ini.</p>}</section>
  <section className={memberStyles.memberFinanceSection}><div className={memberStyles.detailSectionHeading}><div><p className="eyebrow">Ditugaskan</p><h3>Alokasi dana</h3></div><Button type="button" onClick={() => navigate("/perencanaan/kantong")}>Lihat</Button></div>{finance.allocations.length ? <div className={memberStyles.detailRows}>{finance.allocations.map((item) => <div key={item.envelope_period_id || item.envelope_rule_id} className={memberStyles.detailRow}><span><strong>{item.name || "Alokasi"}</strong><small>{item.source_account_name || "Sumber dana"}</small></span><Money value={item.remaining_amount ?? item.allocated_amount ?? 0} /></div>)}</div> : <p className={memberStyles.detailEmpty}>Belum ada alokasi yang ditugaskan kepada anggota ini.</p>}</section>
</div>;

const MemberDetail = ({ member, user, accounts, envelopes, tab, setTab, navigate, menuProps }) => {
  const finance = memberFinance(member, accounts, envelopes);
  const avatarUser = member.is_current ? { ...member, photoURL: user?.photoURL || user?.picture || member.photoURL || "" } : member;
  const menuOpen = menuProps.openMenuId === member.user_id;
  return <section className={memberStyles.memberDetail}>
    <button type="button" className={memberStyles.memberBack} aria-label="Kembali ke Keluarga" onClick={() => navigate("/anggota")}><FiArrowLeft aria-hidden="true" />Detail anggota</button>
    <div className={memberStyles.memberDetailHero}><UserAvatar user={avatarUser} className={memberStyles.memberDetailAvatar} /><div className={memberStyles.memberDetailIdentity}><h2>{member.name || member.email}</h2><p>{member.email}</p><div className={memberStyles.memberDetailBadges}><span className={memberStyles.memberRole}>{roleLabel(member.role)}</span><MemberStatusBadges member={member} /></div></div><MemberMenu member={member} menuOpen={menuOpen} {...menuProps} /></div>
    <div className={memberStyles.memberDetailTabs} role="tablist" aria-label="Detail anggota">{DETAIL_TABS.map((item) => <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} className={tab === item.key ? memberStyles.memberDetailTabActive : memberStyles.memberDetailTab} onClick={() => setTab(item.key)}>{item.label}</button>)}</div>
    <div className={memberStyles.memberDetailPanel} role="tabpanel">
      {tab === "summary" ? <DetailSummary member={member} finance={finance} /> : null}
      {tab === "finance" ? <DetailFinance finance={finance} navigate={navigate} /> : null}
      {tab === "approvals" ? <Suspense fallback={<LazyActionFallback surface="panel" title="Pengajuan anggota" label="Menyiapkan pengajuan..." />}><ApprovalCenterPage embedded requesterId={member.user_id} /></Suspense> : null}
      {tab === "activity" ? <Suspense fallback={<LazyActionFallback surface="panel" title="Aktivitas anggota" label="Menyiapkan aktivitas..." />}><MemberActivityPanel embedded member={member} currentUser={user} /></Suspense> : null}
    </div>
  </section>;
};

const MembersPageView = ({ selectedMember, user, accounts, envelopes, detailTab, setDetailTab, navigate, menuProps, section, setSearchParams, members, openMemberForm, memberFormOpen, result, resource, filteredMembers, toolbarProps }) => <section className={memberStyles.membersStandalonePage} aria-labelledby="members-settings-title">
  <RefreshWarning error={resource.refreshError} onRetry={resource.reload} />
  {selectedMember ? <MemberDetail member={selectedMember} user={user} accounts={accounts} envelopes={envelopes} tab={detailTab} setTab={setDetailTab} navigate={navigate} menuProps={menuProps} /> : <>
    <div className={memberStyles.familyTabs} role="tablist" aria-label="Keluarga"><button type="button" role="tab" aria-selected={section === "members"} className={section === "members" ? memberStyles.familyTabActive : memberStyles.familyTab} onClick={() => setSearchParams({}, { replace: true })}>Anggota</button><button type="button" role="tab" aria-selected={section === "approvals"} className={section === "approvals" ? memberStyles.familyTabActive : memberStyles.familyTab} onClick={() => setSearchParams({ tab: "pengajuan" }, { replace: true })}><FiInbox aria-hidden="true" />Pengajuan</button></div>
    {section === "members" ? <><div className={memberStyles.membersPageHeader}><div className={styles.pageHeading}><h2 id="members-settings-title"><span className={memberStyles.memberCount}>{members.length}</span> anggota</h2><p>Profil, akses, dan hubungan keuangan setiap anggota.</p></div><Button className={memberStyles.addMemberButton} variant="primary" icon={FiPlus} type="button" onClick={() => openMemberForm()}><span className={memberStyles.addMemberLabel}>Tambah anggota</span></Button></div><SettingsNotice result={memberFormOpen ? null : result} /><MembersContent resource={resource} membersCount={members.length} filteredMembers={filteredMembers} toolbarProps={toolbarProps} user={user} menuProps={menuProps} accounts={accounts} envelopes={envelopes} onOpen={(member) => navigate(`/anggota/${encodeURIComponent(member.user_id)}`)} /></> : <Suspense fallback={<LazyActionFallback surface="panel" title="Pengajuan" label="Menyiapkan pengajuan..." />}><ApprovalCenterPage embedded /></Suspense>}
  </>}
</section>;

const MembersSettingsPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { memberId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { bootstrap, overview, invalidate, refreshAll } = useFinance();
  const ownerMode = user?.role === "owner";
  const resource = useApiResource("users.list", {}, { enabled: ownerMode });
  const [detailTab, setDetailTab] = useState("summary");
  const [memberForm, setMemberForm] = useState(EMPTY_MEMBER_FORM);
  const [memberFormOpen, setMemberFormOpen] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [openMenuId, setOpenMenuId] = useState("");
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [target, setTarget] = useState(null);
  const [actionState, setActionState] = useState({ status: "idle", error: null });
  const activeMenuRef = useRef(null);
  const menuTriggerRefs = useRef(new Map());

  const members = resource.data?.items || EMPTY_MEMBERS;
  const accounts = bootstrap?.accounts || [];
  const envelopes = overview?.envelopes || [];
  const selectedMember = memberId ? members.find((item) => String(item.user_id) === String(memberId)) : null;
  const section = searchParams.get("tab") === "pengajuan" ? "approvals" : "members";
  const filteredMembers = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase("id-ID");
    return members.filter((member) => {
      const matchesRole = roleFilter === "all" || member.role === roleFilter;
      if (!matchesRole) return false;
      if (!query) return true;
      return `${member.name || ""} ${member.email || ""}`.toLocaleLowerCase("id-ID").includes(query);
    });
  }, [members, roleFilter, searchQuery]);

  useEffect(() => { setDetailTab("summary"); }, [memberId]);
  useMemberMenuDismiss({ openMenuId, activeMenuRef, menuTriggerRefs, setOpenMenuId });

  const openMemberForm = (member = null) => { setEditingMember(member); setMemberForm(member ? { email: member.email || "", name: member.name || "", role: member.role || "member" } : { ...EMPTY_MEMBER_FORM }); setResult(null); setMemberFormOpen(true); setOpenMenuId(""); };
  const closeMemberForm = () => { if (saving) return; setMemberFormOpen(false); setEditingMember(null); setMemberForm({ ...EMPTY_MEMBER_FORM }); };
  const saveMember = async (event) => {
    event.preventDefault();
    const email = memberForm.email.trim().toLowerCase();
    const existing = editingMember || members.find((item) => item.email.toLowerCase() === email) || null;
    if (existing?.status === "inactive") { setResult({ status: "warning", text: "Email tersebut adalah pengguna nonaktif. Gunakan Aktifkan kembali agar reaktivasi tercatat secara eksplisit." }); return; }
    if (saving) return;
    setSaving(true); setResult({ status: "loading", text: "Menyimpan akses..." });
    try { await runSettingsAction("users.upsert", { ...memberForm, email, row_version: existing?.row_version }, { rowVersion: existing?.row_version }); setMemberForm({ ...EMPTY_MEMBER_FORM }); setEditingMember(null); setMemberFormOpen(false); setResult({ status: "success", text: existing ? "Akses anggota berhasil diperbarui." : "Akses anggota berhasil dibuat. Anggota dapat login Google memakai email tersebut." }); invalidate(invalidationActionsFor("users")); await Promise.allSettled([resource.reload(), refreshAll()]); }
    catch (error) { setResult({ status: "danger", text: error.message }); }
    finally { setSaving(false); }
  };
  const confirmUserAction = async (reason) => {
    if (!target) return;
    setActionState({ status: "submitting", error: null });
    try { const payload = { user_id: target.member.user_id, row_version: target.member.row_version, reason }; const options = { rowVersion: target.member.row_version }; if (target.action === "deactivate") await deactivateUser(payload, options); else await reactivateUser(payload, options); setResult({ status: "success", text: target.action === "deactivate" ? "Anggota berhasil dinonaktifkan." : "Anggota berhasil diaktifkan kembali." }); setTarget(null); setActionState({ status: "idle", error: null }); invalidate(invalidationActionsFor("users")); await Promise.allSettled([resource.reload(), refreshAll()]); }
    catch (error) { setActionState({ status: "error", error }); }
  };
  const openAction = (action, member) => { setOpenMenuId(""); if (action === "edit") { openMemberForm(member); return; } setTarget({ action, member }); setActionState({ status: "idle", error: null }); };

  const toolbarProps = { searchQuery, setSearchQuery, roleFilter, setRoleFilter };
  const menuProps = { openMenuId, activeMenuRef, menuTriggerRefs, setOpenMenuId, openAction };

  if (memberId && resource.status === "ready" && !selectedMember) return <div className="page-stack"><PageHeader title="Keluarga" /><OwnerSettingsGuard returnTo="/" returnLabel="Kembali ke Beranda"><EmptyState title="Anggota tidak ditemukan" description="Anggota ini sudah tidak tersedia atau tautannya tidak lagi valid." action={<Button onClick={() => navigate("/anggota", { replace: true })}>Kembali ke Keluarga</Button>} /></OwnerSettingsGuard></div>;

  const shellClass = selectedMember ? `${memberStyles.membersPageShell} ${memberStyles.memberDetailMode}` : memberStyles.membersPageShell;
  return <div className={`page-stack ${shellClass}`}><PageHeader title={selectedMember ? "Detail anggota" : "Keluarga"} description={selectedMember ? undefined : "Kelola anggota dan pengajuan keluarga."} /><OwnerSettingsGuard returnTo="/" returnLabel="Kembali ke Beranda">
    <MembersPageView selectedMember={selectedMember} user={user} accounts={accounts} envelopes={envelopes} detailTab={detailTab} setDetailTab={setDetailTab} navigate={navigate} menuProps={menuProps} section={section} setSearchParams={setSearchParams} members={members} openMemberForm={openMemberForm} memberFormOpen={memberFormOpen} result={result} resource={resource} filteredMembers={filteredMembers} toolbarProps={toolbarProps} />
    <MemberFormModal open={memberFormOpen} close={closeMemberForm} editingMember={editingMember} memberForm={memberForm} setMemberForm={setMemberForm} saveMember={saveMember} saving={saving} result={result} />
    <MemberActionModals target={target} actionState={actionState} setTarget={setTarget} confirmUserAction={confirmUserAction} />
  </OwnerSettingsGuard></div>;
};

export default MembersSettingsPage;
