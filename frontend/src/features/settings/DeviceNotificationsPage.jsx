import { useCallback, useEffect, useState } from "react";
import { FiBell } from "react-icons/fi";
import { useFeedback } from "../../components/feedback/feedbackContext.js";
import { NOTIFICATION_TYPES } from "../../domain/constants.js";
import Button from "../../components/common/Button.jsx";
import SelectionField from "../../components/common/SelectionField.jsx";
import CompactNotice from "../../components/common/CompactNotice.jsx";
import useGuardedMutation from "../../hooks/useGuardedMutation.js";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import {
  disablePushNotifications,
  enablePushNotifications,
  getNotificationPreferences,
  getPushNotificationState,
  testPushNotification,
  updateNotificationPreference,
  updateNotificationSettings,
} from "../../services/notifications.js";
import SettingsNotice from "./SettingsNotice.jsx";
import NotificationTrialPanel from "./NotificationTrialPanel.jsx";
import { pushFailurePresentation, pushPresentation } from "./settingsPresentation.js";
import styles from "./Settings.module.css";


const NOTIFICATION_PREFERENCE_META = Object.freeze({
  [NOTIFICATION_TYPES.RECURRING_DUE]: ["Jatuh tempo pembayaran", "Ingatkan sebelum pembayaran rutin jatuh tempo."],
  [NOTIFICATION_TYPES.RECURRING_FUNDING_SHORTAGE]: ["Dana belum cukup", "Beri tahu bila rekening pembayaran belum mempunyai dana yang cukup."],
  [NOTIFICATION_TYPES.RECURRING_COMPLETED]: ["Pembayaran selesai", "Konfirmasi perangkat setelah pembayaran rutin tercatat. Default-nya mati agar tidak berisik."],
  [NOTIFICATION_TYPES.BUDGET_THRESHOLD]: ["Kebutuhan mulai habis", "Beri tahu ketika uang kebutuhan mulai mendekati batas."],
  [NOTIFICATION_TYPES.ENVELOPE_THRESHOLD]: ["Dana Alokasi menipis", "Beri tahu ketika dana yang disiapkan hampir habis."],
  [NOTIFICATION_TYPES.GOAL_BEHIND]: ["Target tertinggal", "Beri tahu bila progres target tidak sesuai ritme tujuan."],
  [NOTIFICATION_TYPES.UNALLOCATED_EXPENSE]: ["Pengeluaran belum dirapikan", "Ingatkan bila ada pengeluaran yang belum masuk Kebutuhan."],
});

const NOTIFICATION_PREFERENCE_GROUPS = Object.freeze([
  { title: "Tagihan & pembayaran", types: [NOTIFICATION_TYPES.RECURRING_DUE, NOTIFICATION_TYPES.RECURRING_FUNDING_SHORTAGE, NOTIFICATION_TYPES.RECURRING_COMPLETED] },
  { title: "Pengaturan uang", types: [NOTIFICATION_TYPES.BUDGET_THRESHOLD, NOTIFICATION_TYPES.ENVELOPE_THRESHOLD, NOTIFICATION_TYPES.UNALLOCATED_EXPENSE] },
  { title: "Target", types: [NOTIFICATION_TYPES.GOAL_BEHIND] },
]);

const RECONCILIATION_OPTIONS = Object.freeze([
  { value: 0, label: "Mati" }, { value: 14, label: "14 hari" }, { value: 30, label: "30 hari" }, { value: 60, label: "60 hari" },
]);
const RECORDING_OPTIONS = Object.freeze([
  { value: 0, label: "Mati" }, { value: 3, label: "3 hari" }, { value: 5, label: "5 hari" }, { value: 7, label: "7 hari" },
]);

const initialPushState = { status: "loading", supported: true, permission: "default", enabled: false, reason: "loading", browserSubscribed: false };

const PreferenceItem = ({ item, busy, togglePreference }) => {
  const [label, description = "Atur apakah jenis pengingat ini dikirim ke perangkat aktif."] = NOTIFICATION_PREFERENCE_META[item.type] || [item.type];
  const descriptionId = `notification-preference-${item.type}-description`;
  return <label className={styles.preferenceItem}><span className={styles.preferenceCopy}><strong>{label}</strong><small id={descriptionId}>{description}</small></span><input type="checkbox" role="switch" checked={item.enabled} disabled={busy} onChange={() => togglePreference(item)} aria-label={`${label}: ${item.enabled ? "aktif" : "nonaktif"}`} aria-describedby={descriptionId} /></label>;
};

const PreferenceSection = ({ preferenceState, preferenceMutation, refreshPreferences, togglePreference }) => {
  const byType = new Map(preferenceState.items.map((item) => [item.type, item]));
  return <section className={styles.preferenceSection} aria-labelledby="notification-preferences-title">
    <div className={styles.preferenceHeading}><div><h3 id="notification-preferences-title">Jenis pengingat</h3><p>Pilih hal yang memang layak mengganggu perangkat Anda. Semua kejadian tetap dapat dilihat di pusat notifikasi.</p></div>{preferenceState.status === "error" ? <Button type="button" disabled={preferenceMutation.busy} onClick={refreshPreferences}>Coba lagi</Button> : null}</div>
    {preferenceState.status === "loading" ? <p role="status">Memuat preferensi notifikasi...</p> : null}
    {preferenceState.status === "error" ? <div className="notice notice--warning" role="status">Preferensi belum dapat dimuat. Pengaturan perangkat tetap aman dan tidak berubah.</div> : null}
    {preferenceState.status === "ready" ? <div className={styles.preferenceGroups}>{NOTIFICATION_PREFERENCE_GROUPS.map((group) => <section className={styles.preferenceGroup} key={group.title} aria-label={group.title}><h4>{group.title}</h4><div className={styles.preferenceList}>{group.types.map((type) => byType.get(type)).filter(Boolean).map((item) => <PreferenceItem key={item.type} item={item} busy={preferenceMutation.busy} togglePreference={togglePreference} />)}</div></section>)}</div> : null}
  </section>;
};

const CadenceSection = ({ preferenceState, settingsMutation, updateCadence }) => {
  if (preferenceState.status !== "ready") return null;
  const settings = preferenceState.settings || {};
  return <section className={styles.preferenceSection} aria-labelledby="notification-cadence-title">
    <div className={styles.preferenceHeading}><div><h3 id="notification-cadence-title">Pengingat tambahan</h3><p>Pengingat ini mengikuti ritme Anda dan dapat dimatikan kapan saja.</p></div></div>
    <div className={styles.cadenceList}>
      <div className={styles.cadenceItem}><div className={styles.preferenceCopy}><strong>Cocokkan saldo</strong><small>Ingatkan bila saldo sudah lama belum diperiksa. Default 30 hari.</small></div><SelectionField label="Frekuensi cocokkan saldo" hideLabel compact value={Number(settings.reconciliation_days ?? 30)} disabled={settingsMutation.busy} options={RECONCILIATION_OPTIONS} onChange={(value) => updateCadence("reconciliation_days", Number(value))} /></div>
      <div className={styles.cadenceItem}><div className={styles.preferenceCopy}><strong>Ingatkan kalau lama belum mencatat</strong><small>Opsional. Tidak menganggap hari tanpa transaksi sebagai kesalahan.</small></div><SelectionField label="Frekuensi pengingat pencatatan" hideLabel compact value={Number(settings.recording_consistency_days ?? 0)} disabled={settingsMutation.busy} options={RECORDING_OPTIONS} onChange={(value) => updateCadence("recording_consistency_days", Number(value))} /></div>
    </div>
  </section>;
};

const DeviceNotificationView = ({ pushState, view, tileAction, tileInteractive, busy, result, preferenceState, preferenceMutation, settingsMutation, refreshPushState, refreshPreferences, togglePreference, updateCadence, runPushAction, disableOpen, setDisableOpen }) => <section className={styles.pageContent} aria-labelledby="notification-settings-title">
  <div className={styles.pageHeading}><h2 id="notification-settings-title">Notifikasi perangkat</h2></div>
  <SettingsNotice result={result} />
  {tileAction === "enable" ? <CompactNotice tone="info">Saat diaktifkan, satu notifikasi uji akan dikirim otomatis untuk memastikan perangkat ini siap menerima pengingat.</CompactNotice> : null}
  <button type="button" className={styles.serviceTile} disabled={!tileInteractive} onClick={() => tileAction && runPushAction(tileAction)} aria-label={tileAction === "enable" ? "Aktifkan notifikasi pada perangkat ini" : tileAction === "verify" ? "Verifikasi ulang notifikasi pada perangkat ini" : "Status notifikasi perangkat"}><span className={styles.serviceIcon}><FiBell aria-hidden="true" /></span><span className={styles.serviceCopy}><h3>Notifikasi perangkat</h3><p role="status" aria-live="polite">{view.text}</p>{pushState.activeDeviceCount ? <small>{pushState.activeDeviceCount} perangkat aktif</small> : null}</span><span className={`status-badge status-badge--${view.tone}`}>{busy ? "Memproses" : view.label}</span></button>
  {pushState.browserSubscribed ? <div className={styles.serviceActions}><Button type="button" disabled={busy} onClick={() => setDisableOpen(true)}>Nonaktifkan perangkat ini</Button></div> : null}
  <NotificationTrialPanel pushState={pushState} refreshPushState={refreshPushState} />
  <PreferenceSection preferenceState={preferenceState} preferenceMutation={preferenceMutation} refreshPreferences={refreshPreferences} togglePreference={togglePreference} />
  <CadenceSection preferenceState={preferenceState} settingsMutation={settingsMutation} updateCadence={updateCadence} />
  <CompactNotice tone="info">iPhone/iPad: buka Saldo Bersama dari Home Screen agar Web Push tersedia.</CompactNotice>
  <ConfirmationModal open={disableOpen} title="Nonaktifkan notifikasi?" description="Notifikasi pada perangkat ini akan dinonaktifkan. Perangkat lain tetap aktif." confirmLabel="Nonaktifkan" busy={busy} onCancel={() => !busy && setDisableOpen(false)} onConfirm={() => runPushAction("disable")} />
</section>;

const DeviceNotificationsPage = () => {
  const [pushState, setPushState] = useState(initialPushState);
  const pushMutation = useGuardedMutation();
  const preferenceMutation = useGuardedMutation();
  const settingsMutation = useGuardedMutation();
  const { notify } = useFeedback();
  const busy = pushMutation.busy;
  const [result, setResult] = useState(null);
  const [disableOpen, setDisableOpen] = useState(false);
  const [preferenceState, setPreferenceState] = useState({ status: "loading", items: [], settings: null, error: null });

  const refreshPushState = useCallback(async () => {
    try {
      const next = await getPushNotificationState();
      setPushState({ status: "ready", ...next });
      return next;
    } catch (error) {
      setPushState({ status: "error", supported: true, permission: "unknown", enabled: false, reason: "server_status_unavailable", browserSubscribed: false, error });
      return null;
    }
  }, []);

  const refreshPreferences = useCallback(async () => {
    try {
      const data = await getNotificationPreferences();
      setPreferenceState({ status: "ready", items: data.items || [], settings: data.settings || null, error: null });
      return data;
    } catch (error) {
      setPreferenceState({ status: "error", items: [], settings: null, error });
      return null;
    }
  }, []);

  useEffect(() => {
    refreshPushState();
    refreshPreferences();
  }, [refreshPreferences, refreshPushState]);

  const runPushAction = (action) => pushMutation.run(async () => {
    setResult({ status: "loading", text: "Memproses perangkat..." });
    if (action === "enable") {
      const data = await enablePushNotifications();
      const verified = data.verification?.accepted === true;
      const text = verified
        ? "Notifikasi aktif dan verifikasi otomatis berhasil dikirim ke perangkat ini."
        : `Perangkat berhasil didaftarkan, tetapi ${pushFailurePresentation({ code: data.verificationError?.code }).toLowerCase()}`;
      if (verified) {
        notify({ message: text });
        setResult(null);
      } else setResult({ status: "warning", text });
    } else if (action === "verify") {
      await testPushNotification();
      notify({ message: "Verifikasi notifikasi berhasil dikirim ke perangkat ini." });
      setResult(null);
    } else {
      await disablePushNotifications();
      setDisableOpen(false);
      notify({ message: "Notifikasi dinonaktifkan pada perangkat ini.", tone: "info" });
      setResult(null);
    }
    await Promise.allSettled([refreshPushState()]);
  }).catch(async (error) => {
    setResult({ status: "danger", text: error.message });
    await Promise.allSettled([refreshPushState()]);
  });

  const togglePreference = (item) => preferenceMutation.run(async () => {
    const next = await updateNotificationPreference({ type: item.type, enabled: !item.enabled, rowVersion: item.row_version });
    setPreferenceState((current) => ({
      ...current,
      items: current.items.map((entry) => entry.type === item.type
        ? { ...entry, enabled: next.enabled, row_version: next.row_version, updated_at: next.updated_at, source: "stored" }
        : entry),
    }));
    const label = NOTIFICATION_PREFERENCE_META[item.type]?.[0] || item.type;
    setResult(null);
    notify({ message: `${label} ${next.enabled ? "diaktifkan" : "dimatikan"}.`, tone: "info", dedupeKey: `notification-preference:${item.type}` });
  }).catch(async (error) => {
    setResult({ status: "danger", text: error.message });
    await refreshPreferences();
  });

  const updateCadence = (field, value) => settingsMutation.run(async () => {
    const settings = preferenceState.settings || { reconciliation_days: 30, recording_consistency_days: 0, row_version: null };
    const next = await updateNotificationSettings({
      reconciliationDays: field === "reconciliation_days" ? value : Number(settings.reconciliation_days ?? 30),
      recordingConsistencyDays: field === "recording_consistency_days" ? value : Number(settings.recording_consistency_days ?? 0),
      rowVersion: settings.row_version,
    });
    setPreferenceState((current) => ({ ...current, settings: next }));
    notify({ message: "Pengingat tambahan diperbarui.", tone: "info", dedupeKey: `notification-setting:${field}` });
  }).catch(async (error) => {
    setResult({ status: "danger", text: error.message });
    await refreshPreferences();
  });

  const view = pushPresentation(pushState);
  const tileAction = view.canEnable ? "enable" : pushState.reason === "ready_unverified" ? "verify" : null;
  const tileInteractive = Boolean(tileAction) && !busy;

  return <DeviceNotificationView pushState={pushState} view={view} tileAction={tileAction} tileInteractive={tileInteractive} busy={busy} result={result} preferenceState={preferenceState} preferenceMutation={preferenceMutation} settingsMutation={settingsMutation} refreshPushState={refreshPushState} refreshPreferences={refreshPreferences} togglePreference={togglePreference} updateCadence={updateCadence} runPushAction={runPushAction} disableOpen={disableOpen} setDisableOpen={setDisableOpen} />;
};

export default DeviceNotificationsPage;
