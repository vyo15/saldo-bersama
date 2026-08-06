import { useState } from "react";
import { FiRotateCcw, FiUserMinus, FiUsers } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Card from "../../components/common/Card.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import { RefreshWarning } from "../../components/feedback/ErrorState.jsx";
import { createIdempotencyKey } from "../../domain/security.js";
import { useApiResource } from "../../hooks/useApiResource.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { deactivateUser, reactivateUser, runSettingsAction } from "./settings.api.js";
import OwnerSettingsGuard from "./OwnerSettingsGuard.jsx";
import SettingsNotice from "./SettingsNotice.jsx";
import { roleLabel, userStatusLabel } from "./settingsPresentation.js";
import styles from "./Settings.module.css";

const MembersSettingsPage = () => {
  const { user } = useAuth();
  const ownerMode = user?.role === "owner";
  const resource = useApiResource("users.list", {}, { enabled: ownerMode });
  const [memberForm, setMemberForm] = useState({ email: "", name: "", role: "member" });
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [target, setTarget] = useState(null);
  const [actionState, setActionState] = useState({ status: "idle", error: null });

  const saveMember = async (event) => {
    event.preventDefault();
    const email = memberForm.email.trim().toLowerCase();
    const existing = (resource.data?.items || []).find((item) => item.email.toLowerCase() === email) || null;
    if (existing?.status === "inactive") {
      setResult({ status: "warning", text: "Email tersebut adalah pengguna nonaktif. Gunakan Aktifkan kembali agar reaktivasi tercatat secara eksplisit." });
      return;
    }
    if (saving) return;
    setSaving(true);
    setResult({ status: "loading", text: "Menyimpan akses..." });
    try {
      await runSettingsAction("users.upsert", { ...memberForm, email, row_version: existing?.row_version }, { rowVersion: existing?.row_version, idempotencyKey: createIdempotencyKey() });
      setMemberForm({ email: "", name: "", role: "member" });
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

  return (
    <OwnerSettingsGuard>
      <section className={styles.pageContent} aria-labelledby="members-settings-title">
        <RefreshWarning error={resource.refreshError} onRetry={resource.reload} />
        <div className={styles.pageHeading}>
          <p className="eyebrow">Akses dan anggota</p>
          <h2 id="members-settings-title">Pemilik dan pasangan</h2>
          <p>Email dan role harus sama dengan ALLOWED_USERS_JSON. Backend tetap memverifikasi UID, email, email_verified, status, role, dan allowlist pada setiap request.</p>
        </div>
        <SettingsNotice result={result} />
        <Card className="panel">
          <div className="panel__header"><div><p className="eyebrow">Tambah atau ubah akses</p><h2>Data pengguna</h2><p>Role yang dipilih harus sama dengan konfigurasi allowlist deployment.</p></div><FiUsers aria-hidden="true" /></div>
          <form className="form-grid" onSubmit={saveMember}>
            <label className="field form-grid__full"><span>Email Gmail *</span><input required type="email" value={memberForm.email} onChange={(event) => setMemberForm((current) => ({ ...current, email: event.target.value }))} /></label>
            <label className="field"><span>Nama</span><input maxLength="120" value={memberForm.name} onChange={(event) => setMemberForm((current) => ({ ...current, name: event.target.value }))} /></label>
            <label className="field"><span>Role</span><select value={memberForm.role} onChange={(event) => setMemberForm((current) => ({ ...current, role: event.target.value }))}><option value="member">Anggota</option><option value="owner">Pemilik</option></select><small>Backend menolak role yang berbeda dari allowlist.</small></label>
            <div className="form-grid__full form-actions"><Button variant="primary" type="submit" loading={saving} disabled={saving}>Simpan akses</Button></div>
          </form>
        </Card>
        <div className={styles.pageHeading}><h2>Pengguna aplikasi</h2><p>Setiap akun ditampilkan terpisah agar status dan tindakan tidak tercampur dengan form.</p></div>
        <div className={styles.memberGrid}>
          {(resource.data?.items || []).map((member) => (
            <Card className={styles.memberCard} key={member.user_id}>
              <div className={styles.memberHeader}>
                <span className={styles.memberAvatar}>{(member.name || member.email || "U").slice(0, 1).toUpperCase()}</span>
                <span className={styles.memberCopy}><strong>{member.name || member.email}</strong><small>{member.email}</small></span>
              </div>
              <div className={styles.memberMeta}>
                <span className="status-badge status-badge--info">{roleLabel(member.role)}</span>
                <span className={`status-badge status-badge--${member.status === "active" ? "active" : "warning"}`}>{userStatusLabel(member.status)}</span>
                {member.is_current ? <span className="status-badge">Akun ini</span> : null}
              </div>
              <div className={styles.memberActions}>
                {member.status === "active" && !member.is_current ? <Button variant="danger" icon={FiUserMinus} type="button" onClick={() => { setTarget({ action: "deactivate", member }); setActionState({ status: "idle", error: null }); }}>Nonaktifkan</Button> : null}
                {member.status === "inactive" ? <Button icon={FiRotateCcw} type="button" onClick={() => { setTarget({ action: "reactivate", member }); setActionState({ status: "idle", error: null }); }}>Aktifkan kembali</Button> : null}
              </div>
            </Card>
          ))}
        </div>
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
