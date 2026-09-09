const freezeLabels = (items) => Object.freeze(items.map(([key, label]) => Object.freeze([key, label])));

export const RESET_DOMAIN_LABELS = freezeLabels([
  ["transactions", "Transaksi"],
  ["reconciliations", "Pencocokan saldo"],
  ["investmentTrades", "Transaksi saham"],
  ["investmentCorrections", "Koreksi investasi"],
  ["investmentValuations", "Harga investasi"],
  ["investmentReconciliations", "Pencocokan portfolio"],
  ["goals", "Target"],
  ["goalMovements", "Mutasi target"],
  ["budgets", "Kebutuhan"],
  ["allocationRules", "Aturan alokasi"],
  ["allocationPeriods", "Periode alokasi"],
  ["allocationMovements", "Mutasi alokasi"],
  ["recurringRules", "Jadwal rutin"],
  ["recurringOccurrences", "Kejadian rutin"],
  ["periodClosures", "Tutup buku"],
]);

export const RESET_MASTER_LABELS = freezeLabels([
  ["accounts", "Rekening"],
  ["categories", "Kategori"],
  ["investmentPortfolios", "Portfolio investasi"],
  ["investmentInstruments", "Instrumen investasi"],
]);

export const RESET_OPERATIONAL_LABELS = freezeLabels([
  ["masterDataRequests", "Pengajuan master data"],
  ["transferRequests", "Pengajuan transfer"],
  ["notificationDeliveries", "Delivery notifikasi"],
  ["manualReminders", "Pengingat manual"],
  ["notificationQueue", "Queue notifikasi"],
  ["integrationLinks", "Link integrasi"],
  ["integrationOutbox", "Queue sinkronisasi"],
  ["notificationPreferences", "Preferensi notifikasi"],
  ["pushSubscriptions", "Perangkat notifikasi"],
  ["importPreviews", "Preview import"],
  ["restorePreviews", "Preview restore"],
]);

const TRIAL_OPERATIONAL_KEYS = new Set([
  "masterDataRequests", "transferRequests", "notificationDeliveries", "manualReminders",
  "notificationQueue", "integrationLinks", "integrationOutbox", "importPreviews",
]);

export const RESET_TRIAL_OPERATIONAL_LABELS = Object.freeze(
  RESET_OPERATIONAL_LABELS.filter(([key]) => TRIAL_OPERATIONAL_KEYS.has(key)),
);

export const RESET_TRIAL_PRESERVED_LABELS = freezeLabels([
  ...RESET_MASTER_LABELS,
  ["users", "Pengguna"],
  ["audit", "Audit log"],
  ["backups", "Riwayat backup"],
  ["pushSubscriptions", "Perangkat notifikasi"],
  ["notificationPreferences", "Preferensi notifikasi"],
]);
