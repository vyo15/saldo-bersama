import { useCallback, useEffect, useState } from "react";
import { FiBell } from "react-icons/fi";
import { useFeedback } from "../../components/feedback/feedbackContext.js";
import Button from "../../components/common/Button.jsx";
import useGuardedMutation from "../../hooks/useGuardedMutation.js";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import {
  disablePushNotifications,
  enablePushNotifications,
  getNotificationPreferences,
  getPushNotificationState,
  testPushNotification,
  updateNotificationPreference,
} from "../../services/notifications.js";
import SettingsNotice from "./SettingsNotice.jsx";
import { pushFailurePresentation, pushPresentation } from "./settingsPresentation.js";
import styles from "./Settings.module.css";


const NOTIFICATION_PREFERENCE_META = Object.freeze({
  recurring_due: ["Jatuh tempo rutin", "Pengingat jadwal rutin yang segera jatuh tempo."],
  recurring_funding_shortage: ["Dana tagihan kurang", "Peringatan H-2 bila saldo rekening default belum cukup."],
  recurring_completed: ["Jadwal selesai", "Konfirmasi saat pembayaran atau penerimaan rutin sudah tercatat selesai."],
  budget_threshold: ["Batas anggaran", "Peringatan saat pemakaian anggaran melewati ambang."],
  envelope_threshold: ["Kantong menipis", "Peringatan saat pemakaian kantong alokasi mendekati batas."],
  goal_behind: ["Target tertinggal", "Peringatan saat progres target tertinggal dari rencana."],
  unallocated_expense: ["Pengeluaran belum dialokasikan", "Pengingat transaksi pengeluaran yang belum masuk kantong."],
});

const initialPushState = { status: "loading", supported: true, permission: "default", enabled: false, reason: "loading", browserSubscribed: false };

const PreferenceSection = ({ preferenceState, preferenceMutation, refreshPreferences, togglePreference }) => <section className={styles.preferenceSection} aria-labelledby="notification-preferences-title">
  <div className={styles.preferenceHeading}><div><h3 id="notification-preferences-title">Jenis pengingat</h3><p>Preferensi berlaku untuk akun ini di semua perangkat. Perubahan memengaruhi notifikasi baru; antrean yang sudah diproses dapat tetap terkirim sekali.</p></div>{preferenceState.status === "error" ? <Button type="button" disabled={preferenceMutation.busy} onClick={refreshPreferences}>Coba lagi</Button> : null}</div>
  {preferenceState.status === "loading" ? <p role="status">Memuat preferensi notifikasi...</p> : null}
  {preferenceState.status === "error" ? <div className="notice notice--warning" role="status">Preferensi belum dapat dimuat. Pengaturan perangkat tetap aman dan tidak berubah.</div> : null}
  {preferenceState.status === "ready" ? <div className={styles.preferenceList}>{preferenceState.items.map((item) => {
    const [label, description] = NOTIFICATION_PREFERENCE_META[item.type] || [item.type, "Pengingat aplikasi."];
    return <label className={styles.preferenceItem} key={item.type}><span className={styles.preferenceCopy}><strong>{label}</strong><small>{description}</small></span><input type="checkbox" role="switch" checked={item.enabled} disabled={preferenceMutation.busy} onChange={() => togglePreference(item)} aria-label={`${label}: ${item.enabled ? "aktif" : "nonaktif"}`} /></label>;
  })}</div> : null}
</section>;

const DeviceNotificationView = ({ pushState, view, tileAction, tileInteractive, busy, result, preferenceState, preferenceMutation, refreshPreferences, togglePreference, runPushAction, disableOpen, setDisableOpen }) => <section className={styles.pageContent} aria-labelledby="notification-settings-title">
  <div className={styles.pageHeading}><p className="eyebrow">Perangkat dan notifikasi</p><h2 id="notification-settings-title">Notifikasi pada browser atau ponsel ini</h2><p>Setiap pengguna mendaftarkan perangkatnya sendiri. Izin hanya diminta setelah ketukan pengguna dan backend hanya mengirim ke subscription milik akun yang aktif.</p></div>
  <SettingsNotice result={result} />
  <button type="button" className={styles.serviceTile} disabled={!tileInteractive} onClick={() => tileAction && runPushAction(tileAction)} aria-label={tileAction === "enable" ? "Aktifkan notifikasi pada perangkat ini" : tileAction === "verify" ? "Verifikasi ulang notifikasi pada perangkat ini" : "Status notifikasi perangkat"}><span className={styles.serviceIcon}><FiBell aria-hidden="true" /></span><span className={styles.serviceCopy}><h3>Notifikasi perangkat</h3><p role="status" aria-live="polite">{view.text}</p><small>{pushState.activeDeviceCount ? `${pushState.activeDeviceCount} perangkat aktif pada akun ini.` : "Ketuk tile saat status belum aktif atau belum terverifikasi."}</small></span><span className={`status-badge status-badge--${view.tone}`}>{busy ? "Memproses" : view.label}</span></button>
  {pushState.browserSubscribed ? <div className={styles.serviceActions}><Button type="button" disabled={busy} onClick={() => setDisableOpen(true)}>Nonaktifkan perangkat ini</Button></div> : null}
  <PreferenceSection preferenceState={preferenceState} preferenceMutation={preferenceMutation} refreshPreferences={refreshPreferences} togglePreference={togglePreference} />
  <div className="notice notice--info"><span>iPhone dan iPad harus membuka aplikasi dari Home Screen. Detail finansial tidak ditampilkan pada lock screen.</span></div>
  <ConfirmationModal open={disableOpen} title="Nonaktifkan notifikasi?" description="Subscription browser ini akan dinonaktifkan pada server dan perangkat. Perangkat lain pada akun yang sama tidak berubah." confirmLabel="Nonaktifkan" busy={busy} onCancel={() => !busy && setDisableOpen(false)} onConfirm={() => runPushAction("disable")} />
</section>;

const DeviceNotificationsPage = () => {
  const [pushState, setPushState] = useState(initialPushState);
  const pushMutation = useGuardedMutation();
  const preferenceMutation = useGuardedMutation();
  const { notify } = useFeedback();
  const busy = pushMutation.busy;
  const [result, setResult] = useState(null);
  const [disableOpen, setDisableOpen] = useState(false);
  const [preferenceState, setPreferenceState] = useState({ status: "loading", items: [], error: null });

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
      setPreferenceState({ status: "ready", items: data.items || [], error: null });
      return data;
    } catch (error) {
      setPreferenceState({ status: "error", items: [], error });
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

  const view = pushPresentation(pushState);
  const tileAction = view.canEnable ? "enable" : pushState.reason === "ready_unverified" ? "verify" : null;
  const tileInteractive = Boolean(tileAction) && !busy;

  return <DeviceNotificationView pushState={pushState} view={view} tileAction={tileAction} tileInteractive={tileInteractive} busy={busy} result={result} preferenceState={preferenceState} preferenceMutation={preferenceMutation} refreshPreferences={refreshPreferences} togglePreference={togglePreference} runPushAction={runPushAction} disableOpen={disableOpen} setDisableOpen={setDisableOpen} />;
};

export default DeviceNotificationsPage;
