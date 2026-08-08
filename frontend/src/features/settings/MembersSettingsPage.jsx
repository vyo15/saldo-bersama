import { useEffect, useMemo, useRef, useState } from "react";
import { FiEdit2, FiMoreHorizontal, FiPlus, FiRotateCcw, FiSearch, FiUserMinus } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import Modal from "../../components/common/Modal.jsx";
import UserAvatar from "../../components/common/UserAvatar.jsx";
import EmptyState from "../../components/feedback/EmptyState.jsx";
import ErrorState, { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import { createIdempotencyKey } from "../../domain/security.js";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useAuth } from "../auth/AuthContext.jsx";
import MemberActivityPanel from "./components/MemberActivityPanel.jsx";
import { deactivateUser, reactivateUser, runSettingsAction } from "./settings.api.js";
import OwnerSettingsGuard from "./OwnerSettingsGuard.jsx";
import SettingsNotice from "./SettingsNotice.jsx";
import { roleLabel, userStatusLabel } from "./settingsPresentation.js";
import styles from "./Settings.module.css";

const EMPTY_MEMBER_FORM = Object.freeze({ email: "", name: "", role: "member" });

const MembersSettingsPage = () => {
  const { user } = useAuth();
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

  const members = resource.data?.items || [];
  const filteredMembers = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase("id-ID");
    return members.filter((member) => {
      const matchesRole = roleFilter === "all" || member.role === roleFilter;
      if (!matchesRole) return false;
      if (!query) return true;
      return `${member.name || ""} ${member.email || ""}`.toLocaleLowerCase("id-ID").includes(query);
    });
  }, [members, roleFilter, searchQuery]);

  useEffect(() => {
    if (!openMenuId) return undefined;
    const closeFromOutside = (event) => {
      if (!activeMenuRef.current?.contains(event.target)) setOpenMenuId("");
    };
    const closeFromKeyboard = (event) => {
      if (event.key !== "Escape") return;
      const trigger = menuTriggerRefs.current.get(openMenuId);
      setOpenMenuId("");
      window.requestAnimationFrame(() => trigger?.focus());
    };
    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("keydown", closeFromKeyboard);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("keydown", closeFromKeyboard);
    };
  }, [openMenuId]);

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
      await runSettingsAction("users.upsert", { ...memberForm, email, row_version: existing?.row_version }, { rowVersion: existing?.row_version, idempotencyKey: createIdempotencyKey() });
      setMemberForm({ ...EMPTY_MEMBER_FORM });
      setEditingMember(null);
      setMemberFormOpen(false);
      setResult({ status: "success", text: "Akses pengguna berhasil disimpan dan diverifikasi backend." });
      await resource.reload();
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
      const options = { rowVersion: target.member.row_version, idempotencyKey: createIdempotencyKey() };
      if (target.action === "deactivate") await deactivateUser(payload, options);
      else await reactivateUser(payload, options);
      setResult({ status: "success", text: target.action === "deactivate" ? "Pengguna dinonaktifkan. Selaraskan ALLOWED_USERS_JSON sebelum deployment berikutnya." : "Pengguna diaktifkan kembali setelah allowlist diverifikasi backend." });
      setTarget(null);
      setActionState({ status: "idle", error: null });
      await resource.reload();
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

  return (
    <OwnerSettingsGuard>
      <section className={styles.pageContent} aria-labelledby="members-settings-title">
        <RefreshWarning error={resource.refreshError} onRetry={resource.reload} />
        <div className={styles.membersPageHeader}>
          <div className={styles.pageHeading}>
            <p className="eyebrow">Akses dan anggota</p>
            <h2 id="members-settings-title"><span className={styles.memberCount}>{members.length}</span> Anggota</h2>
            <p>Kelola akun yang diizinkan dan lihat aktivitas transaksi berdasarkan pencatat.</p>
          </div>
          <Button variant="primary" icon={FiPlus} type="button" onClick={() => openMemberForm()}>Tambah anggota</Button>
        </div>

        <SettingsNotice result={memberFormOpen ? null : result} />

        {resource.status === "loading" ? <div className={styles.membersLoading} role="status">Memuat data anggota...</div> : null}
        {resource.status === "error" ? <ErrorState error={resource.error} onRetry={resource.reload} /> : null}

        {resource.status !== "loading" && resource.status !== "error" ? (
          <>
            <div className={styles.memberToolbar}>
              <label className={styles.memberSearch}>
                <FiSearch aria-hidden="true" />
                <span className="sr-only">Cari anggota</span>
                <input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Cari nama atau email" />
              </label>
              <label className="field field--compact">
                <span className="sr-only">Filter role anggota</span>
                <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} aria-label="Filter role anggota">
                  <option value="all">Semua role</option>
                  <option value="owner">Pemilik</option>
                  <option value="member">Anggota</option>
                </select>
              </label>
              <span className={styles.memberToolbarSummary}>{filteredMembers.length} ditampilkan</span>
            </div>

            {filteredMembers.length ? (
              <div className={styles.memberGrid}>
                {filteredMembers.map((member) => {
                  const avatarUser = member.is_current ? { ...member, photoURL: user?.photoURL || user?.picture || "" } : member;
                  const menuOpen = openMenuId === member.user_id;
                  return (
                    <Card className={styles.memberCard} key={member.user_id}>
                      <div className={styles.memberCardTop}>
                        <div className={styles.memberHeader}>
                          <UserAvatar user={avatarUser} className={styles.memberAvatar} />
                          <span className={styles.memberCopy}>
                            <strong>{member.name || member.email}</strong>
                            <small>{member.email}</small>
                            <span className={styles.memberRole}>{roleLabel(member.role)}</span>
                          </span>
                        </div>

                        <div className={styles.memberMenuWrap} ref={menuOpen ? activeMenuRef : undefined}>
                          <button
                            ref={(node) => {
                              if (node) menuTriggerRefs.current.set(member.user_id, node);
                              else menuTriggerRefs.current.delete(member.user_id);
                            }}
                            type="button"
                            className={styles.memberMenuTrigger}
                            aria-label={`Aksi untuk ${member.name || member.email}`}
                            aria-haspopup="true"
                            aria-expanded={menuOpen}
                            onClick={() => setOpenMenuId((current) => current === member.user_id ? "" : member.user_id)}
                          >
                            <FiMoreHorizontal aria-hidden="true" />
                          </button>
                          {menuOpen ? (
                            <div className={styles.memberMenu}>

                              {member.status === "active" ? <button type="button" onClick={() => openAction("edit", member)}><FiEdit2 aria-hidden="true" />Ubah akses</button> : null}
                              {member.status === "active" && !member.is_current ? <button className={styles.memberMenuDanger} type="button" onClick={() => openAction("deactivate", member)}><FiUserMinus aria-hidden="true" />Nonaktifkan</button> : null}
                              {member.status === "inactive" ? <button type="button" onClick={() => openAction("reactivate", member)}><FiRotateCcw aria-hidden="true" />Aktifkan kembali</button> : null}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className={styles.memberMeta}>
                        <span className={`status-badge status-badge--${member.status === "active" ? "active" : "warning"}`}>{userStatusLabel(member.status)}</span>
                        {member.is_current ? <span className="status-badge">Akun ini</span> : null}
                      </div>

                      <dl className={styles.memberFacts}>
                        <div><dt>Status akses</dt><dd>{userStatusLabel(member.status)}</dd></div>
                        <div><dt>Role</dt><dd>{roleLabel(member.role)}</dd></div>
                      </dl>

                      <Button className={styles.memberActivityButton} type="button" onClick={() => setActivityMember(member)}>Lihat aktivitas transaksi</Button>
                    </Card>
                  );
                })}
              </div>
            ) : <EmptyState title="Anggota tidak ditemukan" description="Ubah kata pencarian atau filter role untuk menampilkan anggota lain." />}
          </>
        ) : null}

        <Modal
          open={memberFormOpen}
          onClose={closeMemberForm}
          title={editingMember ? "Ubah akses anggota" : "Tambah anggota"}
          description="Email dan role harus sama dengan ALLOWED_USERS_JSON. Backend tetap menjadi sumber keputusan akhir."
          size="sm"
          footer={<><Button type="button" onClick={closeMemberForm} disabled={saving}>Batal</Button><Button variant="primary" type="submit" form="member-access-form" loading={saving} disabled={saving}>Simpan akses</Button></>}
        >
          <SettingsNotice result={result} />
          <form id="member-access-form" className="form-grid" onSubmit={saveMember}>
            <label className="field form-grid__full"><span>Email Gmail *</span><input required type="email" disabled={Boolean(editingMember)} value={memberForm.email} onChange={(event) => setMemberForm((current) => ({ ...current, email: event.target.value }))} /><small>{editingMember ? "Email tidak dapat diganti saat edit. Tambahkan akun baru jika alamat Gmail berubah." : "Akun harus sudah tersedia pada allowlist deployment."}</small></label>
            <label className="field form-grid__full"><span>Nama</span><input maxLength="120" value={memberForm.name} onChange={(event) => setMemberForm((current) => ({ ...current, name: event.target.value }))} /></label>
            <label className="field form-grid__full"><span>Role</span><select value={memberForm.role} onChange={(event) => setMemberForm((current) => ({ ...current, role: event.target.value }))}><option value="member">Anggota</option><option value="owner">Pemilik</option></select><small>Backend menolak role yang berbeda dari allowlist.</small></label>
          </form>
        </Modal>

        <MemberActivityPanel open={Boolean(activityMember)} member={activityMember} currentUser={user} onClose={() => setActivityMember(null)} />

        <ConfirmationModal
          open={target?.action === "deactivate"}
          title="Nonaktifkan pengguna?"
          description={target ? `${target.member.email} tidak lagi dapat memakai aplikasi. Data keuangan dan audit tidak dihapus.` : ""}
          confirmLabel="Nonaktifkan pengguna"
          reasonLabel="Alasan penonaktifan"
          requireReason
          acknowledgementLabel="Saya sudah memastikan pengguna ini tidak memiliki data personal aktif yang perlu dipindahkan."
          busy={actionState.status === "submitting"}
          error={actionState.error}
          onCancel={() => actionState.status !== "submitting" && setTarget(null)}
          onConfirm={confirmUserAction}
        />
        <ConfirmationModal
          open={target?.action === "reactivate"}
          title="Aktifkan kembali pengguna?"
          description={target ? `${target.member.email} memperoleh akses kembali hanya jika email dan role cocok dengan ALLOWED_USERS_JSON.` : ""}
          confirmLabel="Aktifkan kembali"
          reasonLabel="Alasan reaktivasi"
          requireReason
          tone="primary"
          busy={actionState.status === "submitting"}
          error={actionState.error}
          onCancel={() => actionState.status !== "submitting" && setTarget(null)}
          onConfirm={confirmUserAction}
        />
      </section>
    </OwnerSettingsGuard>
  );
};

export default MembersSettingsPage;
