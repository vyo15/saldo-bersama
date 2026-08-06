import { useCallback, useEffect, useState } from "react";
import { FiBell } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import ConfirmationModal from "../../components/common/ConfirmationModal.jsx";
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushNotificationState,
  testPushNotification,
} from "../../services/notifications.js";
import SettingsNotice from "./SettingsNotice.jsx";
import { pushFailurePresentation, pushPresentation } from "./settingsPresentation.js";
import styles from "./Settings.module.css";

const initialPushState = { status: "loading", supported: true, permission: "default", enabled: false, reason: "loading", browserSubscribed: false };

const DeviceNotificationsPage = () => {
  const [pushState, setPushState] = useState(initialPushState);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [disableOpen, setDisableOpen] = useState(false);

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

  useEffect(() => { refreshPushState(); }, [refreshPushState]);

  const runPushAction = async (action) => {
    setBusy(true);
    setResult({ status: "loading", text: "Memproses perangkat..." });
    try {
      if (action === "enable") {
        const data = await enablePushNotifications();
        const verified = data.verification?.accepted === true;
        setResult({
          status: verified ? "success" : "warning",
          text: verified
            ? "Notifikasi aktif dan verifikasi otomatis berhasil dikirim ke perangkat ini."
            : `Perangkat berhasil didaftarkan, tetapi ${pushFailurePresentation({ code: data.verificationError?.code }).toLowerCase()}`,
        });
      } else if (action === "verify") {
        await testPushNotification();
        setResult({ status: "success", text: "Verifikasi notifikasi berhasil dikirim ke perangkat ini." });
      } else {
        await disablePushNotifications();
        setDisableOpen(false);
        setResult({ status: "success", text: "Notifikasi dinonaktifkan pada perangkat ini." });
      }
      await refreshPushState();
    } catch (error) {
      setResult({ status: "danger", text: error.message });
      await refreshPushState();
    } finally {
      setBusy(false);
    }
  };

  const view = pushPresentation(pushState);
  const tileAction = view.canEnable ? "enable" : pushState.reason === "ready_unverified" ? "verify" : null;
  const tileInteractive = Boolean(tileAction) && !busy;

  return (
    <section className={styles.pageContent} aria-labelledby="notification-settings-title">
      <div className={styles.pageHeading}>
        <p className="eyebrow">Perangkat dan notifikasi</p>
        <h2 id="notification-settings-title">Notifikasi pada browser atau ponsel ini</h2>
        <p>Setiap pengguna mendaftarkan perangkatnya sendiri. Izin hanya diminta setelah ketukan pengguna dan backend hanya mengirim ke subscription milik akun yang aktif.</p>
      </div>
      <SettingsNotice result={result} />
      <button
        type="button"
        className={styles.serviceTile}
        disabled={!tileInteractive}
        onClick={() => tileAction && runPushAction(tileAction)}
        aria-label={tileAction === "enable" ? "Aktifkan notifikasi pada perangkat ini" : tileAction === "verify" ? "Verifikasi ulang notifikasi pada perangkat ini" : "Status notifikasi perangkat"}
      >
        <span className={styles.serviceIcon}><FiBell aria-hidden="true" /></span>
        <span className={styles.serviceCopy}>
          <h3>Notifikasi perangkat</h3>
          <p role="status" aria-live="polite">{view.text}</p>
          <small>{pushState.activeDeviceCount ? `${pushState.activeDeviceCount} perangkat aktif pada akun ini.` : "Ketuk tile saat status belum aktif atau belum terverifikasi."}</small>
        </span>
        <span className={`status-badge status-badge--${view.tone}`}>{busy ? "Memproses" : view.label}</span>
      </button>
      {pushState.browserSubscribed ? (
        <div className={styles.serviceActions}>
          <Button type="button" disabled={busy} onClick={() => setDisableOpen(true)}>Nonaktifkan perangkat ini</Button>
        </div>
      ) : null}
      <div className="notice notice--info">
        <span>iPhone dan iPad harus membuka aplikasi dari Home Screen. Detail finansial tidak ditampilkan pada lock screen.</span>
      </div>
      <ConfirmationModal
        open={disableOpen}
        title="Nonaktifkan notifikasi?"
        description="Subscription browser ini akan dinonaktifkan pada server dan perangkat. Perangkat lain pada akun yang sama tidak berubah."
        confirmLabel="Nonaktifkan"
        busy={busy}
        onCancel={() => !busy && setDisableOpen(false)}
        onConfirm={() => runPushAction("disable")}
      />
    </section>
  );
};

export default DeviceNotificationsPage;
