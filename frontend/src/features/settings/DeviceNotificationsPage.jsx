import { useCallback, useEffect, useState } from "react";
import {
  FiAlertCircle,
  FiBell,
  FiCalendar,
  FiCheckCircle,
  FiClock,
  FiFileText,
  FiPieChart,
  FiRefreshCw,
  FiShoppingCart,
  FiTarget,
} from "react-icons/fi";
import { useFeedback } from "../../components/feedback/feedbackContext.js";
import { NOTIFICATION_TYPES } from "../../domain/constants.js";
import Button from "../../components/common/Button.jsx";
import SelectionField from "../../components/common/SelectionField.jsx";
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
  [NOTIFICATION_TYPES.RECURRING_DUE]: {
    label: "Jatuh tempo pembayaran",
    description: "Ingatkan sebelum pembayaran rutin jatuh tempo.",
    icon: FiCalendar,
  },
  [NOTIFICATION_TYPES.RECURRING_FUNDING_SHORTAGE]: {
    label: "Dana pembayaran kurang",
    description: "Beri tahu bila dana untuk pembayaran rutin belum cukup.",
    icon: FiAlertCircle,
  },
  [NOTIFICATION_TYPES.RECURRING_COMPLETED]: {
    label: "Pembayaran selesai",
    description: "Konfirmasi setelah pembayaran rutin tercatat.",
    icon: FiCheckCircle,
  },
  [NOTIFICATION_TYPES.BUDGET_THRESHOLD]: {
    label: "Kebutuhan hampir habis",
    description: "Beri tahu saat uang kebutuhan mulai mendekati batas.",
    icon: FiShoppingCart,
  },
  [NOTIFICATION_TYPES.ENVELOPE_THRESHOLD]: {
    label: "Alokasi hampir habis",
    description: "Beri tahu saat dana Alokasi mulai menipis.",
    icon: FiPieChart,
  },
  [NOTIFICATION_TYPES.GOAL_BEHIND]: {
    label: "Target tertinggal",
    description: "Beri tahu bila progres Target tertinggal dari ritme tujuan.",
    icon: FiTarget,
  },
  [NOTIFICATION_TYPES.UNALLOCATED_EXPENSE]: {
    label: "Pengeluaran belum dialokasikan",
    description: "Ingatkan bila ada pengeluaran yang belum masuk Kebutuhan.",
    icon: FiFileText,
  },
});

const NOTIFICATION_PREFERENCE_ORDER = Object.freeze([
  NOTIFICATION_TYPES.RECURRING_DUE,
  NOTIFICATION_TYPES.RECURRING_FUNDING_SHORTAGE,
  NOTIFICATION_TYPES.RECURRING_COMPLETED,
  NOTIFICATION_TYPES.BUDGET_THRESHOLD,
  NOTIFICATION_TYPES.ENVELOPE_THRESHOLD,
  NOTIFICATION_TYPES.GOAL_BEHIND,
  NOTIFICATION_TYPES.UNALLOCATED_EXPENSE,
]);

const RECONCILIATION_OPTIONS = Object.freeze([
  { value: 0, label: "Mati" }, { value: 14, label: "14 hari" }, { value: 30, label: "30 hari" }, { value: 60, label: "60 hari" },
]);
const RECORDING_OPTIONS = Object.freeze([
  { value: 0, label: "Mati" }, { value: 3, label: "3 hari" }, { value: 5, label: "5 hari" }, { value: 7, label: "7 hari" },
]);

const initialPushState = { status: "loading", supported: true, permission: "default", enabled: false, reason: "loading", browserSubscribed: false };

const PreferenceItem = ({ item, busy, togglePreference }) => {
  const meta = NOTIFICATION_PREFERENCE_META[item.type] || { label: item.type, description: "Atur apakah pengingat ini dikirim ke perangkat aktif.", icon: FiBell };
  const Icon = meta.icon;
  const descriptionId = `notification-preference-${item.type}-description`;
  return (
    <label className={styles.preferenceItem}>
      <span className={styles.preferenceIcon}><Icon aria-hidden="true" /></span>
      <span className={styles.preferenceCopy}>
        <strong>{meta.label}</strong>
        <small id={descriptionId} className="sr-only">{meta.description}</small>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={item.enabled}
        disabled={busy}
        onChange={() => togglePreference(item)}
        aria-label={`${meta.label}: ${item.enabled ? "aktif" : "nonaktif"}`}
        aria-describedby={descriptionId}
      />
    </label>
  );
};

const PreferenceSection = ({ preferenceState, preferenceMutation, refreshPreferences, togglePreference }) => {
  const byType = new Map(preferenceState.items.map((item) => [item.type, item]));
  const knownItems = NOTIFICATION_PREFERENCE_ORDER.map((type) => byType.get(type)).filter(Boolean);
  const knownTypes = new Set(NOTIFICATION_PREFERENCE_ORDER);
  const orderedItems = [...knownItems, ...preferenceState.items.filter((item) => !knownTypes.has(item.type))];
  return (
    <section className={styles.preferenceSection} aria-labelledby="notification-preferences-title">
      <div className={styles.preferenceHeading}>
        <h3 id="notification-preferences-title">Jenis notifikasi</h3>
        {preferenceState.status === "error" ? <Button type="button" disabled={preferenceMutation.busy} onClick={refreshPreferences}>Coba lagi</Button> : null}
      </div>
      {preferenceState.status === "loading" ? <p className={styles.preferenceStatus} role="status">Memuat pengaturan...</p> : null}
      {preferenceState.status === "error" ? <div className="notice notice--warning" role="status">Pengaturan notifikasi belum dapat dimuat. Tidak ada preferensi yang berubah.</div> : null}
      {preferenceState.status === "ready" ? <div className={styles.preferenceList}>{orderedItems.map((item) => <PreferenceItem key={item.type} item={item} busy={preferenceMutation.busy} togglePreference={togglePreference} />)}</div> : null}
    </section>
  );
};

const CadenceItem = ({ icon: Icon, label, description, fieldLabel, value, disabled, options, onChange }) => {
  const descriptionId = `notification-cadence-${fieldLabel.toLowerCase().replaceAll(" ", "-")}`;
  return (
    <div className={styles.cadenceItem}>
      <span className={styles.preferenceIcon}><Icon aria-hidden="true" /></span>
      <div className={styles.preferenceCopy}>
        <strong>{label}</strong>
        <small id={descriptionId} className="sr-only">{description}</small>
      </div>
      <SelectionField label={fieldLabel} hideLabel compact value={value} disabled={disabled} options={options} onChange={onChange} describedBy={descriptionId} />
    </div>
  );
};

const CadenceSection = ({ preferenceState, settingsMutation, updateCadence }) => {
  if (preferenceState.status !== "ready") return null;
  const settings = preferenceState.settings || {};
  return (
    <section className={styles.preferenceSection} aria-labelledby="notification-cadence-title">
      <div className={styles.preferenceHeading}><h3 id="notification-cadence-title">Pengingat berkala</h3></div>
      <div className={styles.cadenceList}>
        <CadenceItem
          icon={FiRefreshCw}
          label="Cek kesesuaian saldo"
          description="Ingatkan bila saldo sudah lama belum diperiksa."
          fieldLabel="Frekuensi pemeriksaan saldo"
          value={Number(settings.reconciliation_days ?? 30)}
          disabled={settingsMutation.busy}
          options={RECONCILIATION_OPTIONS}
          onChange={(value) => updateCadence("reconciliation_days", Number(value))}
        />
        <CadenceItem
          icon={FiClock}
          label="Lama belum mencatat"
          description="Pengingat opsional saat sudah beberapa hari tidak ada pencatatan."
          fieldLabel="Frekuensi pengingat pencatatan"
          value={Number(settings.recording_consistency_days ?? 0)}
          disabled={settingsMutation.busy}
          options={RECORDING_OPTIONS}
          onChange={(value) => updateCadence("recording_consistency_days", Number(value))}
        />
      </div>
    </section>
  );
};

const DeviceStatusCard = ({ pushState, view, primaryPushAction, busy, refreshPushState, runPushAction, setDisableOpen }) => (
  <section className={styles.notificationDeviceCard} aria-labelledby="notification-device-title">
    <span className={styles.notificationDeviceIcon}><FiBell aria-hidden="true" /></span>
    <div className={styles.notificationDeviceCopy}>
      <h3 id="notification-device-title">Notifikasi di perangkat ini</h3>
      <p role="status" aria-live="polite">{view.text}</p>
      {primaryPushAction === "enable" ? <small>Saat diaktifkan, satu notifikasi uji akan dikirim otomatis.</small> : null}
      {pushState.activeDeviceCount ? <small>{pushState.activeDeviceCount} perangkat aktif</small> : null}
    </div>
    <div className={styles.notificationDeviceActions}>
      <span className={`status-badge status-badge--${view.tone}`}>{busy ? "Memproses" : view.label}</span>
      <NotificationTrialPanel pushState={pushState} refreshPushState={refreshPushState} disabled={busy} />
      {primaryPushAction ? (
        <Button type="button" disabled={busy} onClick={() => runPushAction(primaryPushAction)}>
          {primaryPushAction === "enable" ? "Aktifkan" : "Verifikasi"}
        </Button>
      ) : null}
      {pushState.browserSubscribed ? <Button type="button" variant="danger" aria-label="Nonaktifkan perangkat ini" disabled={busy} onClick={() => setDisableOpen(true)}>Nonaktifkan</Button> : null}
    </div>
  </section>
);

const DeviceNotificationView = ({ pushState, view, primaryPushAction, busy, result, preferenceState, preferenceMutation, settingsMutation, refreshPushState, refreshPreferences, togglePreference, updateCadence, runPushAction, disableOpen, setDisableOpen }) => (
  <section className={styles.pageContent} aria-labelledby="notification-settings-title">
    <div className={styles.pageHeading}><h2 id="notification-settings-title">Notifikasi perangkat</h2></div>
    <SettingsNotice result={result} />
    <DeviceStatusCard pushState={pushState} view={view} primaryPushAction={primaryPushAction} busy={busy} refreshPushState={refreshPushState} runPushAction={runPushAction} setDisableOpen={setDisableOpen} />
    <PreferenceSection preferenceState={preferenceState} preferenceMutation={preferenceMutation} refreshPreferences={refreshPreferences} togglePreference={togglePreference} />
    <CadenceSection preferenceState={preferenceState} settingsMutation={settingsMutation} updateCadence={updateCadence} />
    <ConfirmationModal open={disableOpen} title="Nonaktifkan notifikasi?" description="Notifikasi pada perangkat ini akan dinonaktifkan. Perangkat lain tetap aktif." confirmLabel="Nonaktifkan" busy={busy} onCancel={() => !busy && setDisableOpen(false)} onConfirm={() => runPushAction("disable")} />
  </section>
);

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
        ? "Notifikasi aktif dan pengiriman uji berhasil."
        : `Notifikasi aktif, tetapi ${pushFailurePresentation({ code: data.verificationError?.code }).toLowerCase()}`;
      if (verified) {
        notify({ message: text });
        setResult(null);
      } else setResult({ status: "warning", text });
    } else if (action === "verify") {
      await testPushNotification();
      notify({ message: "Notifikasi uji berhasil dikirim ke perangkat ini." });
      setResult(null);
    } else {
      await disablePushNotifications();
      setDisableOpen(false);
      notify({ message: "Notifikasi dinonaktifkan pada perangkat ini.", tone: "info" });
      setResult(null);
    }
    await Promise.allSettled([refreshPushState()]);
  }).catch(async (error) => {
    setResult({ status: "danger", text: pushFailurePresentation(error) });
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
    const label = NOTIFICATION_PREFERENCE_META[item.type]?.label || item.type;
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
    notify({ message: "Pengingat berkala diperbarui.", tone: "info", dedupeKey: `notification-setting:${field}` });
  }).catch(async (error) => {
    setResult({ status: "danger", text: error.message });
    await refreshPreferences();
  });

  const view = pushPresentation(pushState);
  const primaryPushAction = view.canEnable ? "enable" : pushState.reason === "ready_unverified" ? "verify" : null;

  return <DeviceNotificationView pushState={pushState} view={view} primaryPushAction={primaryPushAction} busy={busy} result={result} preferenceState={preferenceState} preferenceMutation={preferenceMutation} settingsMutation={settingsMutation} refreshPushState={refreshPushState} refreshPreferences={refreshPreferences} togglePreference={togglePreference} updateCadence={updateCadence} runPushAction={runPushAction} disableOpen={disableOpen} setDisableOpen={setDisableOpen} />;
};

export default DeviceNotificationsPage;
