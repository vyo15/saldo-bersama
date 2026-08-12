import { userRoleLabel } from "../../shared/presentation/user.js";
export const providerSummary = (integration, provider) => {
  const item = integration?.providers?.[provider] || {};
  return {
    pending: Number(item.pending || 0),
    processing: Number(item.processing || 0),
    failed: Number(item.failed || 0),
    deadLetter: Number(item.dead_letter || 0),
    completed: Number(item.completed || 0),
    lastUpdatedAt: item.lastUpdatedAt || null,
    lastCompletedAt: item.lastCompletedAt || null,
    lastFailureAt: item.lastFailureAt || null,
  };
};

const unavailableIntegration = (configured) => configured
  ? { ready: true, label: "Siap", tone: "active", text: "Integrasi siap digunakan." }
  : { ready: false, label: "Belum siap", tone: "warning", text: "Integrasi Google belum aktif pada runtime ini." };

const providerResourceDescriptor = (provider) => {
  const descriptors = {
    sheets: { healthKey: "mirrorConfigured", label: "Spreadsheet mirror", needsScheduler: true },
    calendar: { healthKey: "calendarConfigured", label: "Google Calendar", needsScheduler: true },
    drive: { healthKey: "backupConfigured", label: "folder Google Drive", needsScheduler: false },
  };
  return descriptors[provider] || descriptors.drive;
};

const checkedBridgePresentation = (bridge, provider) => {
  const descriptor = providerResourceDescriptor(provider);
  const health = bridge.health || {};
  if (!health[descriptor.healthKey]) {
    return { ready: false, label: "Belum siap", tone: "warning", text: `${descriptor.label} belum dikonfigurasi pada Apps Script Properties.` };
  }
  if (descriptor.needsScheduler && !health.jobsConfigured) {
    return { ready: false, label: "Scheduler belum siap", tone: "warning", text: "Endpoint scheduled jobs atau shared secret scheduler pada Apps Script belum lengkap." };
  }
  if (descriptor.needsScheduler && !health.triggerReady) {
    return { ready: false, label: "Trigger belum siap", tone: "warning", text: "Scheduled trigger Apps Script belum siap. Pastikan hanya satu trigger runScheduledJobs yang aktif." };
  }
  return null;
};

export const integrationProviderPresentation = (integration, provider) => {
  const configured = integration?.configured?.[provider] === true;
  const bridge = integration?.bridge;
  if (!bridge) return unavailableIntegration(configured);
  if (!bridge.configured) {
    return { ready: false, label: "Belum siap", tone: "warning", text: "Bridge Google belum dikonfigurasi pada environment server." };
  }
  if (bridge.checked && !bridge.reachable) {
    return { ready: false, label: "Gangguan", tone: "danger", text: "Bridge Google sudah dikonfigurasi, tetapi health check belum dapat dijangkau. Periksa deployment Apps Script dan koneksi server." };
  }
  if (bridge.checked) {
    const blocked = checkedBridgePresentation(bridge, provider);
    if (blocked) return blocked;
  }
  return configured
    ? { ready: true, label: "Siap", tone: "active", text: "Resource Google dan scheduler sudah terverifikasi." }
    : { ready: false, label: "Belum terverifikasi", tone: "warning", text: "Kesiapan integrasi Google belum dapat diverifikasi." };
};

export const backendPresentation = (resource) => {
  if (resource.status === "error") return { label: "Tidak tersedia", tone: "danger", summary: "Status backend tidak dapat dimuat." };
  if (resource.status !== "ready") return { label: "Memeriksa", tone: "info", summary: "Memeriksa database dan schema..." };
  const data = resource.data || {};
  if (data.maintenanceMode || data.status === "maintenance") {
    return { label: "Maintenance", tone: "danger", summary: `Mode maintenance · schema v${data.schemaVersion || "-"}` };
  }
  if (data.status === "ok" && Number(data.schemaVersion || 0) > 0) {
    return { label: "Siap", tone: "active", summary: `Database tersambung · schema v${data.schemaVersion}` };
  }
  return { label: "Tidak terverifikasi", tone: "warning", summary: `Status backend tidak diketahui · schema v${data.schemaVersion || "-"}` };
};

export const pushFailurePresentation = (failure = {}) => {
  const code = String(failure?.code || "");
  const messages = {
    PUSH_AUTH_REJECTED: "Identitas VAPID ditolak push service. Periksa VAPID_SUBJECT dan pasangan key, lalu daftar ulang perangkat.",
    PUSH_REQUEST_REJECTED: "Subscription atau payload ditolak push service. Nonaktifkan lalu aktifkan kembali notifikasi perangkat.",
    PUSH_DNS_FAILED: "DNS push service gagal diakses dari server. Periksa koneksi atau DNS lalu coba lagi.",
    PUSH_TIMEOUT: "Push service tidak merespons sebelum batas waktu. Coba lagi setelah koneksi stabil.",
    PUSH_TLS_FAILED: "Koneksi TLS ke push service gagal diverifikasi. Periksa waktu sistem dan jaringan.",
    PUSH_NETWORK_FAILED: "Server belum dapat menjangkau push service. Periksa jaringan lalu coba lagi.",
    SUBSCRIPTION_EXPIRED: "Subscription perangkat sudah kedaluwarsa. Aktifkan ulang notifikasi.",
    PUSH_ENDPOINT_PRIVATE_ADDRESS: "Alamat push service perangkat diblokir oleh pemeriksaan keamanan.",
  };
  return messages[code] || "Verifikasi otomatis belum berhasil. Ketuk tile untuk mencoba lagi.";
};

export const pushPresentation = (state) => {
  if (state.status === "loading") return { text: "Memeriksa kesiapan perangkat dan server...", tone: "info", label: "Memeriksa", canEnable: false };
  if (state.reason === "ready_unverified" && state.lastTestFailure) {
    return { text: pushFailurePresentation(state.lastTestFailure), tone: "warning", label: "Belum terverifikasi", canEnable: false };
  }
  const presentations = {
    ready_tested: { text: "Perangkat terdaftar dan jalur pengiriman sudah terverifikasi.", tone: "active", label: "Aktif", canEnable: false },
    ready_unverified: { text: "Perangkat terdaftar, tetapi verifikasi otomatis belum berhasil. Ketuk tile untuk mencoba verifikasi ulang.", tone: "warning", label: "Belum terverifikasi", canEnable: false },
    not_subscribed: { text: "Belum aktif pada perangkat ini. Ketuk tile untuk mengaktifkan.", tone: "neutral", label: "Belum aktif", canEnable: true },
    registration_required: { text: "Subscription browser perlu didaftarkan ulang ke server. Ketuk tile untuk melanjutkan.", tone: "warning", label: "Daftar ulang", canEnable: true },
    vapid_key_changed: { text: "Kunci Web Push berubah. Ketuk tile untuk mendaftarkan ulang perangkat.", tone: "warning", label: "Daftar ulang", canEnable: true },
    account_conflict: { text: "Subscription browser masih terkait akun lain. Ketuk tile untuk mendaftarkan ulang.", tone: "warning", label: "Daftar ulang", canEnable: true },
    unsupported: { text: "Browser ini belum mendukung Web Push.", tone: "danger", label: "Tidak didukung", canEnable: false },
    insecure_context: { text: "Notifikasi memerlukan HTTPS. Pengujian lokal dapat memakai localhost, bukan alamat IP jaringan.", tone: "danger", label: "Perlu HTTPS", canEnable: false },
    ios_install_required: { text: "Pada iPhone atau iPad, tambahkan aplikasi ke Home Screen lalu buka dari ikon aplikasi.", tone: "warning", label: "Pasang aplikasi", canEnable: false },
    permission_denied: { text: "Izin notifikasi diblokir. Aktifkan kembali melalui pengaturan browser atau perangkat.", tone: "danger", label: "Izin diblokir", canEnable: false },
    client_not_configured: { text: "Web Push belum tersedia pada runtime ini. Sinkronkan environment terpusat, lalu restart development atau deploy ulang Production.", tone: "danger", label: "Belum siap", canEnable: false },
    client_configuration_invalid: { text: "VAPID public key pada frontend tidak valid.", tone: "danger", label: "Konfigurasi salah", canEnable: false },
    server_not_configured: { text: "Konfigurasi Web Push belum tersedia pada server Production.", tone: "danger", label: "Server belum siap", canEnable: false },
    server_configuration_invalid: { text: "Konfigurasi Web Push pada server belum lengkap atau tidak valid.", tone: "danger", label: "Konfigurasi salah", canEnable: false },
    server_status_unavailable: { text: "Status Web Push pada server belum dapat diverifikasi.", tone: "danger", label: "Tidak terverifikasi", canEnable: false },
  };
  return presentations[state.reason] || { text: "Status notifikasi belum dapat ditentukan.", tone: "danger", label: "Tidak diketahui", canEnable: false };
};

export const roleLabel = userRoleLabel;
export const userStatusLabel = (status) => status === "active" ? "Aktif" : status === "inactive" ? "Nonaktif" : status || "Tidak diketahui";
export const auditResultLabel = (result) => result === "success" ? "Berhasil" : result === "failed" ? "Gagal" : result || "Tidak diketahui";

export const auditDetailLabel = (code) => {
  const labels = {
    PUSH_AUTH_REJECTED: "Identitas VAPID ditolak",
    PUSH_REQUEST_REJECTED: "Subscription atau payload ditolak",
    PUSH_DNS_FAILED: "DNS push service gagal",
    PUSH_TIMEOUT: "Push service timeout",
    PUSH_TLS_FAILED: "TLS push service gagal",
    PUSH_NETWORK_FAILED: "Jaringan push service gagal",
    SUBSCRIPTION_EXPIRED: "Subscription kedaluwarsa",
    PUSH_ENDPOINT_PRIVATE_ADDRESS: "Alamat push service diblokir",
    PUSH_DELIVERY_FAILED: "Pengiriman push gagal",
  };
  return labels[String(code || "")] || String(code || "");
};
