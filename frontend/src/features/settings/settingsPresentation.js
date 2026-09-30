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

const bridgeFailureText = (bridge = {}) => {
  const code = String(bridge.errorCode || bridge.liveness?.errorCode || "");
  const messages = {
    GOOGLE_BRIDGE_TIMEOUT: "Apps Script tidak merespons dalam batas waktu. Coba periksa ulang. Jika tetap gagal, cek deployment Web App dan koneksi Google.",
    GOOGLE_BRIDGE_UNAVAILABLE: "Endpoint Web App Apps Script tidak dapat dijangkau dari server. Periksa URL /exec, akses deployment, dan koneksi server.",
    GOOGLE_BRIDGE_URL_INVALID: "URL Google bridge pada environment server bukan Web App Apps Script /exec yang valid.",
    GOOGLE_BRIDGE_RESPONSE_INVALID: "Deployment Apps Script merespons dengan format yang tidak dikenali. Pastikan Web App menggunakan deployment bridge Saldo Bersama terbaru.",
    GOOGLE_BRIDGE_LIVENESS_INVALID: "Deployment Apps Script dapat dihubungi tetapi respons liveness tidak valid. Deploy ulang Web App bridge terbaru.",
    GOOGLE_BRIDGE_SERVICE_MISMATCH: "URL /exec mengarah ke Apps Script yang bukan bridge Saldo Bersama.",
    GOOGLE_BRIDGE_DEPLOYMENT_STALE: "Web App Apps Script masih memakai versi deployment lama. Buka Manage deployments, pilih New version, lalu deploy tanpa mengganti URL /exec.",
    GOOGLE_BRIDGE_TIME_INVALID: "Deployment Apps Script tidak mengembalikan waktu health yang valid. Deploy ulang bridge terbaru.",
    GOOGLE_BRIDGE_SECRET_INVALID: "Shared secret Google bridge pada environment server belum valid.",
    INVALID_SIGNATURE: "Shared secret Google bridge di Vercel dan Apps Script tidak sama. Samakan nilainya lalu redeploy server.",
    BRIDGE_NOT_CONFIGURED: "GOOGLE_BRIDGE_SHARED_SECRET belum siap pada Apps Script Properties.",
    UNKNOWN_ACTION: "Deployment Web App belum mengenali health check terbaru. Deploy New version pada deployment Apps Script yang digunakan.",
    MESSAGE_EXPIRED: "Waktu server dan Apps Script tidak sinkron. Aplikasi sudah mencoba koreksi waktu otomatis, tetapi health check masih ditolak.",
    REPLAY_DENIED: "Health check bridge ditolak sebagai replay. Coba periksa ulang agar request memakai nonce baru.",
  };
  return messages[code] || "Bridge Google sudah dikonfigurasi, tetapi signed health check gagal. Periksa deployment Apps Script, shared secret, dan koneksi server.";
};

const unavailableIntegration = (configured) => ({
  ready: false,
  label: configured ? "Belum terverifikasi" : "Belum siap",
  tone: "warning",
  text: configured
    ? "Integrasi Google sudah dikonfigurasi, tetapi status Google bridge belum dapat diverifikasi."
    : "Integrasi Google belum aktif pada runtime ini.",
});

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
  if (!bridge.checked) {
    return { ready: false, label: "Belum terverifikasi", tone: "warning", text: "Status Google bridge belum selesai diverifikasi. Periksa kembali sebelum menjalankan operasi berisiko." };
  }
  if (!bridge.reachable) {
    return { ready: false, label: "Gangguan", tone: "danger", text: bridgeFailureText(bridge), errorCode: bridge.errorCode || bridge.liveness?.errorCode || null };
  }
  const blocked = checkedBridgePresentation(bridge, provider);
  if (blocked) return blocked;
  if (!configured) return { ready: false, label: "Belum terverifikasi", tone: "warning", text: "Kesiapan integrasi Google belum dapat diverifikasi." };
  const descriptor = providerResourceDescriptor(provider);
  return {
    ready: true,
    label: "Siap",
    tone: "active",
    text: descriptor.needsScheduler
      ? "Resource Google dan scheduler sudah terverifikasi."
      : "Folder Google Drive untuk safety backup sudah terverifikasi.",
  };
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
    PUSH_AUTH_REJECTED: "Notifikasi uji belum dapat dikirim. Coba aktifkan ulang perangkat ini.",
    PUSH_REQUEST_REJECTED: "Notifikasi uji ditolak oleh layanan perangkat. Coba aktifkan ulang perangkat ini.",
    PUSH_DNS_FAILED: "Server belum dapat menghubungi layanan notifikasi. Coba lagi nanti.",
    PUSH_TIMEOUT: "Layanan notifikasi belum merespons. Coba lagi nanti.",
    PUSH_TLS_FAILED: "Koneksi aman ke layanan notifikasi belum berhasil. Coba lagi nanti.",
    PUSH_NETWORK_FAILED: "Server belum dapat menghubungi layanan notifikasi. Coba lagi nanti.",
    SUBSCRIPTION_EXPIRED: "Pendaftaran notifikasi perangkat sudah kedaluwarsa. Aktifkan ulang perangkat ini.",
    PUSH_ENDPOINT_PRIVATE_ADDRESS: "Pendaftaran notifikasi perangkat tidak dapat digunakan. Aktifkan ulang perangkat ini.",
    WEB_PUSH_NOT_READY: "Notifikasi perangkat sementara belum tersedia. Coba lagi nanti.",
  };
  return messages[code] || "Notifikasi belum dapat diproses. Coba lagi nanti.";
};

export const pushPresentation = (state) => {
  if (state.status === "loading") return { text: "Memeriksa kesiapan notifikasi...", tone: "info", label: "Memeriksa", canEnable: false };
  if (state.reason === "ready_unverified" && state.lastTestFailure) {
    return { text: "Notifikasi aktif, tetapi pengiriman uji belum terverifikasi.", tone: "warning", label: "Perlu verifikasi", canEnable: false };
  }
  const presentations = {
    ready_tested: { text: "Aktif dan siap menerima pengingat.", tone: "active", label: "Aktif", canEnable: false },
    ready_unverified: { text: "Aktif, tetapi pengiriman uji belum terverifikasi.", tone: "warning", label: "Perlu verifikasi", canEnable: false },
    not_subscribed: { text: "Belum aktif di perangkat ini.", tone: "neutral", label: "Belum aktif", canEnable: true },
    registration_required: { text: "Perangkat perlu didaftarkan ulang untuk menerima notifikasi.", tone: "warning", label: "Daftar ulang", canEnable: true },
    vapid_key_changed: { text: "Perangkat perlu didaftarkan ulang untuk menerima notifikasi.", tone: "warning", label: "Daftar ulang", canEnable: true },
    account_conflict: { text: "Notifikasi perangkat perlu diaktifkan ulang untuk akun ini.", tone: "warning", label: "Daftar ulang", canEnable: true },
    unsupported: { text: "Browser ini belum mendukung notifikasi perangkat.", tone: "danger", label: "Tidak didukung", canEnable: false },
    insecure_context: { text: "Buka aplikasi melalui HTTPS untuk memakai notifikasi perangkat.", tone: "danger", label: "Perlu HTTPS", canEnable: false },
    ios_install_required: { text: "Tambahkan aplikasi ke Home Screen, lalu buka dari ikon aplikasi.", tone: "warning", label: "Pasang aplikasi", canEnable: false },
    permission_denied: { text: "Izin notifikasi diblokir di pengaturan browser atau perangkat.", tone: "danger", label: "Izin diblokir", canEnable: false },
    client_not_configured: { text: "Notifikasi perangkat sementara belum tersedia.", tone: "danger", label: "Belum tersedia", canEnable: false },
    client_configuration_invalid: { text: "Notifikasi perangkat sementara belum tersedia.", tone: "danger", label: "Belum tersedia", canEnable: false },
    server_not_configured: { text: "Notifikasi perangkat sementara belum tersedia.", tone: "danger", label: "Belum tersedia", canEnable: false },
    server_configuration_invalid: { text: "Notifikasi perangkat sementara belum tersedia.", tone: "danger", label: "Belum tersedia", canEnable: false },
    server_status_unavailable: { text: "Status notifikasi belum dapat diperiksa. Coba lagi nanti.", tone: "danger", label: "Tidak tersedia", canEnable: false },
  };
  return presentations[state.reason] || { text: "Status notifikasi belum dapat diperiksa.", tone: "danger", label: "Tidak tersedia", canEnable: false };
};

export const roleLabel = userRoleLabel;
export const userStatusLabel = (status) => status === "active" ? "Aktif" : status === "inactive" ? "Nonaktif" : status || "Tidak diketahui";
export const auditResultLabel = (result) => result === "success" ? "Berhasil" : result === "failed" ? "Gagal" : result || "Tidak diketahui";

const AUDIT_ENTITY_LABELS = Object.freeze({
  account: "Rekening",
  allocation: "Alokasi Dana",
  archive: "Arsip",
  backup: "Cadangan data",
  budget: "Kebutuhan",
  category: "Kategori",
  commitment: "Kewajiban",
  envelope: "Alokasi Dana",
  envelope_movement: "Pergerakan Alokasi Dana",
  envelope_period: "Periode Alokasi Dana",
  envelope_rule: "Aturan Alokasi Dana",
  goal: "Target",
  goal_investment_event: "Aktivitas investasi Target",
  goal_movement: "Pergerakan dana Target",
  identity: "Identitas",
  import: "Import data",
  integration: "Integrasi",
  investment: "Investasi",
  investment_asset_position: "Posisi aset investasi",
  investment_correction: "Koreksi investasi",
  investment_instrument: "Instrumen investasi",
  investment_opening_position: "Posisi awal investasi",
  investment_portfolio: "Sumber investasi",
  investment_reconciliation: "Pencocokan investasi",
  investment_trade: "Transaksi investasi",
  investment_valuation: "Nilai investasi",
  maintenance: "Pemeliharaan",
  maintenance_reset: "Reset data",
  maintenance_full_reset: "Reset seluruh data",
  manual_reminder: "Pengingat manual",
  master_data_request: "Pengajuan data master",
  notification: "Notifikasi",
  notification_preference: "Preferensi notifikasi",
  notification_settings: "Pengaturan notifikasi",
  push_subscription: "Perangkat notifikasi",
  period: "Periode",
  period_closure: "Penutupan periode",
  reconciliation: "Pencocokan saldo",
  recurring: "Jadwal rutin",
  recurring_occurrence: "Pembayaran rutin",
  recurring_rule: "Jadwal rutin",
  session: "Sesi",
  transaction: "Transaksi",
  transfer_request: "Pengajuan transfer",
  restore: "Pemulihan data",
  system: "Sistem",
  system_config: "Konfigurasi sistem",
  user: "Anggota",
});

const AUDIT_ACTION_LABELS = Object.freeze({
  "accounts.create": "Rekening ditambahkan",
  "accounts.update": "Rekening diperbarui",
  "accounts.archive": "Rekening diarsipkan",
  "accounts.restore": "Rekening dipulihkan",
  "accounts.deleteUnused": "Rekening kosong dihapus",
  "budgets.create": "Kebutuhan dibuat",
  "budgets.update": "Kebutuhan diperbarui",
  "budgets.remove": "Kebutuhan dihapus",
  "categories.create": "Kategori dibuat",
  "categories.update": "Kategori diperbarui",
  "categories.archive": "Kategori diarsipkan",
  "categories.restore": "Kategori dipulihkan",
  "commitments.create": "Kewajiban dibuat",
  "commitments.update": "Kewajiban diperbarui",
  "commitments.stop": "Kewajiban dihentikan",
  "envelopes.create": "Alokasi Dana dibuat",
  "envelopes.update": "Alokasi Dana diperbarui",
  "envelopes.archive": "Alokasi Dana diarsipkan",
  "envelopes.restore": "Alokasi Dana dipulihkan",
  "goals.create": "Target dibuat",
  "goals.update": "Target diperbarui",
  "goals.fund": "Dana Target ditambahkan",
  "investments.assets.create": "Aset investasi ditambahkan",
  "investments.trades.buy": "Pembelian investasi dicatat",
  "investments.trades.sell": "Penjualan investasi dicatat",
  "investments.valuations.update": "Nilai investasi diperbarui",
  "notifications.test": "Uji notifikasi dijalankan",
  "periods.close": "Periode ditutup",
  "reconciliations.create": "Pencocokan saldo dicatat",
  "transactions.create": "Transaksi dicatat",
  "transactions.update": "Transaksi diperbarui",
  "transactions.cancel": "Transaksi dibatalkan",
  "transactions.restore": "Transaksi dipulihkan",
  "transferRequests.create": "Pengajuan transfer dibuat",
  "transferRequests.review": "Pengajuan transfer ditinjau",
  "users.upsert": "Akses anggota diperbarui",
  "users.deactivate": "Anggota dinonaktifkan",
  "users.reactivate": "Anggota diaktifkan kembali",
  "identity.firebase.bind": "Identitas login ditautkan",
  "sessions.revokeOwn": "Sesi perangkat dicabut",
  "sessions.revokeAllOwn": "Semua sesi perangkat dicabut",
  "session.revoke.role_change": "Sesi dicabut setelah perubahan akses",
  "session.revoke.deactivation": "Sesi dicabut setelah anggota dinonaktifkan",
  "backup.create": "Cadangan data dibuat",
  "reset.apply": "Pembersihan data testing dijalankan",
  "fullReset.apply": "Reset seluruh data dijalankan",
  "maintenance.recover": "Mode maintenance dipulihkan",
});

const auditVerbLabel = (action) => {
  const tail = String(action || "").split(".").filter(Boolean).at(-1) || "";
  const labels = {
    create: "dibuat", update: "diperbarui", remove: "dihapus", delete: "dihapus",
    archive: "diarsipkan", restore: "dipulihkan", cancel: "dibatalkan", review: "ditinjau",
    close: "ditutup", fund: "ditambahkan dananya", buy: "dibeli", sell: "dijual",
    recover: "dipulihkan", apply: "dijalankan", revoke: "dicabut", upsert: "diperbarui",
    deactivate: "dinonaktifkan", reactivate: "diaktifkan kembali", bind: "ditautkan", test: "diuji",
  };
  return labels[tail] || "diperbarui";
};

export const auditEntityLabel = (entityType) => {
  const key = String(entityType || "").trim();
  return AUDIT_ENTITY_LABELS[key] || key.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase()) || "Aktivitas";
};

export const auditActionLabel = (action, entityType) => AUDIT_ACTION_LABELS[String(action || "")]
  || `${auditEntityLabel(entityType)} ${auditVerbLabel(action)}`;

export const auditCategory = (entry = {}) => {
  const action = String(entry.action || "").toLowerCase();
  const entity = String(entry.entity_type || "").toLowerCase();
  if (/^(users|user|session|sessions|identity|bootstrap|masterdatarequests|transferrequests)/.test(action) || ["user", "session", "identity", "transfer_request"].includes(entity)) return "access";
  if (/^(notifications|integrations|backup|import|restore|reset|fullreset|maintenance|jobs)/.test(action) || ["notification", "integration", "backup", "import", "maintenance", "maintenance_reset"].includes(entity)) return "system";
  return "finance";
};

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

export const formatMaintenanceCount = (value) => Number(value || 0).toLocaleString("id-ID");

export const readMaintenanceRecoveryToken = (storageKey) => {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.sessionStorage.getItem(storageKey) || "null");
    return value?.idempotencyKey ? value : null;
  } catch {
    return null;
  }
};

export const storeMaintenanceRecoveryToken = (storageKey, value) => {
  if (typeof window === "undefined") return;
  try {
    if (value) window.sessionStorage.setItem(storageKey, JSON.stringify(value));
    else window.sessionStorage.removeItem(storageKey);
  } catch { /* Browser storage is only a recovery hint. Backend remains authoritative. */ }
};
