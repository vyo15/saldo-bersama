import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { FiCheckCircle, FiEdit2, FiMoreHorizontal, FiPlus, FiRotateCcw, FiSearch, FiShield, FiUserMinus } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import VisualChoiceGroup from "../../components/common/VisualChoiceGroup.jsx";
import { AdminIcon, PersonIcon } from "../../components/common/FinanceChoiceIcons.jsx";
import Card from "../../components/common/Card.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import SelectionField from "../../components/common/SelectionField.jsx";
import Modal from "../../components/common/Modal.jsx";
import PageHeader from "../../components/common/PageHeader.jsx";
import UserAvatar from "../../components/common/UserAvatar.jsx";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import { useFinance } from "../../app/FinanceContext.jsx";
import { useApiResource } from "../../hooks/useApiResource.js";
import { invalidationActionsFor } from "../../services/api/invalidation.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { deactivateUser, reactivateUser, runSettingsAction } from "./settings.api.js";
import OwnerSettingsGuard from "./OwnerSettingsGuard.jsx";
import SettingsNotice from "./SettingsNotice.jsx";
import { roleLabel, userStatusLabel } from "./settingsPresentation.js";
import styles from "./Settings.module.css";
import memberStyles from "./MembersSettings.module.css";

const MemberActivityPanel = lazy(() => import("./components/MemberActivityPanel.jsx"));

const EMPTY_MEMBERS = Object.freeze([]);
const EMPTY_MEMBER_FORM = Object.freeze({ email: "", name: "", role: "member" });

const MEMBERS_HERO_ART = "/login/assets/mobile/house.webp";

const MembersSummaryHero = ({ members }) => {
  const activeMembers = members.filter((member) => member.status === "active");
  const administrators = activeMembers.filter((member) => member.role === "owner").length;
  const regularMembers = activeMembers.filter((member) => member.role === "member").length;
  const inactiveMembers = members.length - activeMembers.length;
  return (
    <section className={memberStyles.membersSummary} aria-labelledby="members-summary-title">
      <div className={memberStyles.membersSummaryContent}>
        <p className={memberStyles.membersSummaryEyebrow} id="members-summary-title">Ruang bersama</p>
        <strong className={memberStyles.membersSummaryValue}>{activeMembers.length} anggota aktif</strong>
        <p className={memberStyles.membersSummaryDescription}>Akses aktif untuk pengelolaan keuangan bersama.</p>
        <div className={memberStyles.membersSummaryMeta}>
          <span>Administrator <strong>{administrators}</strong></span>
          <span>Member <strong>{regularMembers}</strong></span>
          <span>Nonaktif <strong>{inactiveMembers}</strong></span>
        </div>
      </div>
      <img className={memberStyles.membersSummaryArt} src={MEMBERS_HERO_ART} width="900" height="778" alt="" aria-hidden="true" draggable="false" decoding="async" />
    </section>
  );
};

const MemberToolbar = ({ searchQuery, setSearchQuery, roleFilter, setRoleFilter, count }) => <div className={memberStyles.memberToolbar}><label className={memberStyles.memberSearch}><FiSearch aria-hidden="true" /><span className="sr-only">Cari anggota</span><input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Cari nama atau email" /></label><SelectionField className="field--compact" label="Filter role anggota" hideLabel compact value={roleFilter} onChange={setRoleFilter} options={[{ value: "all", label: "Semua role" }, { value: "owner", label: "Administrator" }, { value: "member", label: "Member" }]} /><span className={memberStyles.memberToolbarSummary}>{count} ditampilkan</span></div>;

const MemberMenu = ({ member, menuOpen, activeMenuRef, menuTriggerRefs, setOpenMenuId, openAction }) => <div className={memberStyles.memberMenuWrap} ref={menuOpen ? activeMenuRef : undefined}><button ref={(node) => { if (node) menuTriggerRefs.current.set(member.user_id, node); else menuTriggerRefs.current.delete(member.user_id); }} type="button" className={memberStyles.memberMenuTrigger} aria-label={`Aksi untuk ${member.name || member.email}`} aria-haspopup="true" aria-expanded={menuOpen} onClick={() => setOpenMenuId((current) => current === member.user_id ? "" : member.user_id)}><FiMoreHorizontal aria-hidden="true" /></button>{menuOpen ? <div className={memberStyles.memberMenu}>{member.status === "active" ? <button type="button" onClick={() => openAction("edit", member)}><FiEdit2 aria-hidden="true" />Ubah akses</button> : null}{member.status === "active" && !member.is_current ? <button className={memberStyles.memberMenuDanger} type="button" onClick={() => openAction("deactivate", member)}><FiUserMinus aria-hidden="true" />Nonaktifkan</button> : null}{member.status === "inactive" ? <button type="button" onClick={() => openAction("reactivate", member)}><FiRotateCcw aria-hidden="true" />Aktifkan kembali</button> : null}</div> : null}</div>;

const MemberStatusBadges = ({ member }) => <div className={memberStyles.memberMeta}><span className={`status-badge status-badge--${member.status === "active" ? "active" : "warning"}`}>{userStatusLabel(member.status)}</span>{member.status === "active" && member.identity_status === "pending" ? <span className="status-badge status-badge--warning">Menunggu login</span> : null}{member.is_current ? <span className="status-badge">Akun ini</span> : null}</div>;

const CurrentMemberPhotoFact = ({ googlePhoto = false }) => <dl className={memberStyles.memberFacts}><div><dt>Foto profil</dt><dd>{googlePhoto ? "Google" : "Inisial"}</dd></div></dl>;

const CurrentMemberCard = ({ member, user, menuProps, setActivityMember }) => {
  const avatarUser = { ...member, photoURL: user?.photoURL || user?.picture || member.photoURL || "" };
  const menuOpen = menuProps.openMenuId === member.user_id;
  const hasGooglePhoto = Boolean(avatarUser.photoURL);
  return <Card className={`${memberStyles.memberCard} ${memberStyles.currentMemberCard}`}><div className={memberStyles.currentMemberCover} aria-hidden="true"><span className={memberStyles.currentMemberCoverMark}><FiShield /></span></div><div className={memberStyles.currentMemberBody}><div className={memberStyles.currentMemberAvatarRow}><UserAvatar user={avatarUser} className={`${memberStyles.memberAvatar} ${memberStyles.currentMemberAvatar}`} /><span className={memberStyles.googleIdentityBadge}>G&nbsp; Akun Google</span></div><div className={memberStyles.currentMemberIdentity}><div><strong>{member.name || member.email}</strong><small>{member.email}</small></div><MemberMenu member={member} menuOpen={menuOpen} {...menuProps} /></div><div className={memberStyles.currentMemberRoleLine}><span className={memberStyles.memberRole}>{roleLabel(member.role)}</span><MemberStatusBadges member={member} /></div><p className={memberStyles.currentMemberExplanation}>Profil ini berasal dari akun Google yang dipakai untuk login. Foto hanya membantu identifikasi visual dan tidak mengubah hak akses.</p><CurrentMemberPhotoFact googlePhoto={hasGooglePhoto} /><Button className={memberStyles.memberActivityButton} variant="primary" type="button" onClick={() => setActivityMember(member)}>Lihat aktivitas transaksi</Button></div></Card>;
};

const MemberCard = ({ member, user, menuProps, setActivityMember }) => {
  if (member.is_current) return <CurrentMemberCard member={member} user={user} menuProps={menuProps} setActivityMember={setActivityMember} />;
  const menuOpen = menuProps.openMenuId === member.user_id;
  return <Card className={memberStyles.memberCard}><div className={memberStyles.memberCardTop}><div className={memberStyles.memberHeader}><UserAvatar user={member} className={memberStyles.memberAvatar} /><span className={memberStyles.memberCopy}><strong>{member.name || member.email}</strong><small>{member.email}</small><span className={memberStyles.memberRole}>{roleLabel(member.role)}</span></span></div><MemberMenu member={member} menuOpen={menuOpen} {...menuProps} /></div><MemberStatusBadges member={member} /><Button className={memberStyles.memberActivityButton} type="button" onClick={() => setActivityMember(member)}>Lihat aktivitas transaksi</Button></Card>;
};

const MembersContent = ({ resource, filteredMembers, toolbarProps, user, menuProps, setActivityMember }) => {
  if (resource.status === "loading") return <div className={memberStyles.membersLoading} role="status">Memuat data anggota...</div>;
  if (resource.status === "error") return <ErrorState error={resource.error} onRetry={resource.reload} />;
  return <><MemberToolbar {...toolbarProps} count={filteredMembers.length} />{filteredMembers.length ? <div className={memberStyles.memberGrid}>{filteredMembers.map((member) => <MemberCard key={member.user_id} member={member} user={user} menuProps={menuProps} setActivityMember={setActivityMember} />)}</div> : <EmptyState title="Anggota tidak ditemukan" description="Tidak ada anggota yang cocok dengan pencarian atau filter saat ini." action={<button type="button" className="button button--secondary" onClick={() => { toolbarProps.setSearchQuery(""); toolbarProps.setRoleFilter("all"); }}>Hapus pencarian dan filter</button>} />}</>;
};

const MemberFormModal = ({ open, close, editingMember, memberForm, setMemberForm, saveMember, saving, result }) => <Modal open={open} onClose={close} dismissible={!saving} title={editingMember ? "Ubah akses anggota" : "Tambah anggota"} size="sm" footer={<><Button type="button" onClick={close} disabled={saving}>Batal</Button><Button variant="primary" type="submit" form="member-access-form" loading={saving} disabled={saving}>Simpan akses</Button></>}><SettingsNotice result={result} /><form id="member-access-form" className="form-grid" onSubmit={saveMember}><label className="field form-grid__full"><span>Email Gmail *</span><input required type="email" disabled={Boolean(editingMember)} value={memberForm.email} onChange={(event) => setMemberForm((current) => ({ ...current, email: event.target.value }))} /><small>{editingMember ? "Email tidak dapat diubah." : "Setelah disimpan, email ini langsung diizinkan untuk login Google."}</small></label><label className="field form-grid__full"><span>Nama</span><input maxLength="120" value={memberForm.name} onChange={(event) => setMemberForm((current) => ({ ...current, name: event.target.value }))} /></label><VisualChoiceGroup className="form-grid__full" legend="Role" name="member-role" value={memberForm.role} onChange={(role) => setMemberForm((current) => ({ ...current, role }))} options={[{ value: "member", label: "Member", icon: PersonIcon, description: "Akses pencatatan sehari-hari" }, { value: "owner", label: "Administrator", icon: AdminIcon, description: "Kelola rekening, kategori, anggota, dan pengaturan" }]} columns={2} compact disabled={Boolean(editingMember?.is_current)} helper={editingMember?.is_current ? "Role akun sendiri tidak dapat diubah. Gunakan Administrator lain." : "Role disimpan di Saldo Bersama dan diverifikasi backend."} /></form></Modal>;

const MemberActionModals = ({ target, actionState, setTarget, confirmUserAction }) => <><ConfirmationModal open={target?.action === "deactivate"} title="Nonaktifkan anggota?" description={target ? `${target.member.email} tidak lagi dapat memakai aplikasi. Data keuangan dan audit tidak dihapus.` : ""} confirmLabel="Nonaktifkan anggota" reasonLabel="Alasan penonaktifan" requireReason acknowledgementLabel="Saya sudah memastikan anggota ini tidak memiliki data personal aktif yang perlu dipindahkan." busy={actionState.status === "submitting"} error={actionState.error} onCancel={() => actionState.status !== "submitting" && setTarget(null)} onConfirm={confirmUserAction} /><ConfirmationModal open={target?.action === "reactivate"} title="Aktifkan kembali anggota?" description={target ? `${target.member.email} akan memperoleh akses kembali dan dapat login dengan akun Google yang memakai email tersebut.` : ""} confirmLabel="Aktifkan kembali" reasonLabel="Alasan reaktivasi" requireReason tone="primary" busy={actionState.status === "submitting"} error={actionState.error} onCancel={() => actionState.status !== "submitting" && setTarget(null)} onConfirm={confirmUserAction} /></>;


const useMemberMenuDismiss = ({ openMenuId, activeMenuRef, menuTriggerRefs, setOpenMenuId }) => {
  useEffect(() => {
    if (!openMenuId) return undefined;
    const closeFromOutside = (event) => { if (!activeMenuRef.current?.contains(event.target)) setOpenMenuId(""); };
    const closeFromKeyboard = (event) => {
      if (event.key !== "Escape") return;
      const trigger = menuTriggerRefs.current.get(openMenuId);
      setOpenMenuId("");
      window.requestAnimationFrame(() => trigger?.focus());
    };
    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("keydown", closeFromKeyboard);
    return () => { document.removeEventListener("pointerdown", closeFromOutside); document.removeEventListener("keydown", closeFromKeyboard); };
  }, [activeMenuRef, menuTriggerRefs, openMenuId, setOpenMenuId]);
};

const MembersSettingsPage = () => {
  const { user } = useAuth();
  const { invalidate, refreshAll } = useFinance();
  const ownerMode = user?.role === "owner";
  const resource = useApiResource("users.list", {}, { enabled: ownerMode });
  const [memberForm, setMemberForm] = useState(EMPTY_MEMBER_FORM);
  const [memberFormOpen, setMemberFormOpen] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [openMenuId, setOpenMenuId] = useState("");
  const [activityMember, setActivityMember] = useState(null);
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [target, setTarget] = useState(null);
  const [actionState, setActionState] = useState({ status: "idle", error: null });
  const activeMenuRef = useRef(null);
  const menuTriggerRefs = useRef(new Map());

  const members = resource.data?.items || EMPTY_MEMBERS;
  const filteredMembers = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase("id-ID");
    return members.filter((member) => {
      const matchesRole = roleFilter === "all" || member.role === roleFilter;
      if (!matchesRole) return false;
      if (!query) return true;
      return `${member.name || ""} ${member.email || ""}`.toLocaleLowerCase("id-ID").includes(query);
    });
  }, [members, roleFilter, searchQuery]);

  useMemberMenuDismiss({ openMenuId, activeMenuRef, menuTriggerRefs, setOpenMenuId });

  const openMemberForm = (member = null) => {
    setEditingMember(member);
    setMemberForm(member
      ? { email: member.email || "", name: member.name || "", role: member.role || "member" }
      : { ...EMPTY_MEMBER_FORM });
    setResult(null);
    setMemberFormOpen(true);
    setOpenMenuId("");
  };

  const closeMemberForm = () => {
    if (saving) return;
    setMemberFormOpen(false);
    setEditingMember(null);
    setMemberForm({ ...EMPTY_MEMBER_FORM });
  };

  const saveMember = async (event) => {
    event.preventDefault();
    const email = memberForm.email.trim().toLowerCase();
    const existing = editingMember || members.find((item) => item.email.toLowerCase() === email) || null;
    if (existing?.status === "inactive") {
      setResult({ status: "warning", text: "Email tersebut adalah pengguna nonaktif. Gunakan Aktifkan kembali agar reaktivasi tercatat secara eksplisit." });
      return;
    }
    if (saving) return;
    setSaving(true);
    setResult({ status: "loading", text: "Menyimpan akses..." });
    try {
      await runSettingsAction("users.upsert", { ...memberForm, email, row_version: existing?.row_version }, { rowVersion: existing?.row_version });
      setMemberForm({ ...EMPTY_MEMBER_FORM });
      setEditingMember(null);
      setMemberFormOpen(false);
      setResult({ status: "success", text: existing ? "Akses anggota berhasil diperbarui." : "Akses anggota berhasil dibuat. Anggota dapat login Google memakai email tersebut." });
      invalidate(invalidationActionsFor("users"));
      await Promise.allSettled([resource.reload(), refreshAll()]);
    } catch (error) {
      setResult({ status: "danger", text: error.message });
    } finally {
      setSaving(false);
    }
  };

  const confirmUserAction = async (reason) => {
    if (!target) return;
    setActionState({ status: "submitting", error: null });
    try {
      const payload = { user_id: target.member.user_id, row_version: target.member.row_version, reason };
      const options = { rowVersion: target.member.row_version };
      if (target.action === "deactivate") await deactivateUser(payload, options);
      else await reactivateUser(payload, options);
      setResult({ status: "success", text: target.action === "deactivate" ? "Anggota berhasil dinonaktifkan." : "Anggota berhasil diaktifkan kembali." });
      setTarget(null);
      setActionState({ status: "idle", error: null });
      invalidate(invalidationActionsFor("users"));
      await Promise.allSettled([resource.reload(), refreshAll()]);
    } catch (error) {
      setActionState({ status: "error", error });
    }
  };

  const openAction = (action, member) => {
    setOpenMenuId("");
    if (action === "edit") {
      openMemberForm(member);
      return;
    }
    setTarget({ action, member });
    setActionState({ status: "idle", error: null });
  };

  const toolbarProps = { searchQuery, setSearchQuery, roleFilter, setRoleFilter };
  const menuProps = { openMenuId, activeMenuRef, menuTriggerRefs, setOpenMenuId, openAction };
  return <div className="page-stack"><PageHeader eyebrow="Akses" title="Anggota" description="Kelola siapa yang dapat masuk ke Saldo Bersama dan tinjau aktivitas pencatatannya." help="Anggota mengatur siapa yang boleh memakai aplikasi. Hak akses tetap diverifikasi backend berdasarkan akun dan role yang aktif." /><OwnerSettingsGuard returnTo="/" returnLabel="Kembali ke Beranda"><section className={memberStyles.membersStandalonePage} aria-labelledby="members-settings-title"><RefreshWarning error={resource.refreshError} onRetry={resource.reload} />{resource.status === "ready" ? <MembersSummaryHero members={members} /> : null}<div className={memberStyles.membersPageHeader}><div className={styles.pageHeading}><h2 id="members-settings-title"><span className={memberStyles.memberCount}>{members.length}</span> Anggota</h2><p><FiCheckCircle aria-hidden="true" /> Hak akses tetap diverifikasi backend.</p></div><Button variant="primary" icon={FiPlus} type="button" onClick={() => openMemberForm()}>Tambah anggota</Button></div><SettingsNotice result={memberFormOpen ? null : result} /><MembersContent resource={resource} filteredMembers={filteredMembers} toolbarProps={toolbarProps} user={user} menuProps={menuProps} setActivityMember={setActivityMember} /><MemberFormModal open={memberFormOpen} close={closeMemberForm} editingMember={editingMember} memberForm={memberForm} setMemberForm={setMemberForm} saveMember={saveMember} saving={saving} result={result} />{activityMember ? <Suspense fallback={null}><MemberActivityPanel open member={activityMember} currentUser={user} onClose={() => setActivityMember(null)} /></Suspense> : null}<MemberActionModals target={target} actionState={actionState} setTarget={setTarget} confirmUserAction={confirmUserAction} /></section></OwnerSettingsGuard></div>;
};

export default MembersSettingsPage;
