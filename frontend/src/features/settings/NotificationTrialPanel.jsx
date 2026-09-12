import { useRef, useState } from "react";
import { FiBell, FiCheck, FiImage } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import { useFeedback } from "../../components/feedback/feedbackContext.js";
import { NOTIFICATION_TRIAL_PRESETS } from "../../services/notificationTrials.js";
import { showNotificationTrial } from "../../services/notifications.js";
import styles from "./NotificationTrialPanel.module.css";

const TRIAL_THEMES = [NOTIFICATION_TRIAL_PRESETS.vacation, NOTIFICATION_TRIAL_PRESETS.future];

const TrialThemeCard = ({ item, selected, disabled, onSelect }) => (
  <button
    type="button"
    className={`${styles.themeCard}${selected ? ` ${styles.themeCardSelected}` : ""}`}
    onClick={() => onSelect(item.id)}
    disabled={disabled}
    aria-pressed={selected}
  >
    <span className={styles.assetFrame}><img src={item.image} alt="" width="1024" height="683" decoding="async" /></span>
    <span className={styles.themeCopy}><strong>{item.label}</strong><small>{item.title}</small></span>
    <span className={styles.selectedMark} aria-hidden="true">{selected ? <FiCheck /> : null}</span>
  </button>
);

const trialAvailability = (pushState) => {
  if (pushState.supported === false) return "Browser ini belum mendukung notifikasi perangkat.";
  if (pushState.secureContext === false) return "Buka aplikasi melalui HTTPS agar notifikasi perangkat dapat dicoba.";
  if (pushState.iosInstallRequired) return "iPhone/iPad: pasang Saldo Bersama ke Home Screen lalu buka dari ikon aplikasi.";
  if (pushState.permission === "denied") return "Izin notifikasi sedang diblokir di pengaturan perangkat.";
  return null;
};

const NotificationTrialPanel = ({ pushState, refreshPushState }) => {
  const [theme, setTheme] = useState("vacation");
  const [busy, setBusy] = useState(false);
  const inFlightRef = useRef(false);
  const { notify } = useFeedback();
  const unavailable = trialAvailability(pushState);

  const showTrial = async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setBusy(true);
    try {
      await showNotificationTrial(theme);
      notify({ message: "Notifikasi contoh dikirim ke perangkat ini." });
      await refreshPushState?.();
    } catch (error) {
      notify({ message: error.message || "Notifikasi contoh belum dapat ditampilkan.", tone: "danger" });
      await refreshPushState?.();
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  };

  return <section className={styles.panel} aria-labelledby="notification-trial-title">
    <div className={styles.heading}>
      <span className={styles.headingIcon}><FiBell aria-hidden="true" /></span>
      <span><h3 id="notification-trial-title">Coba notifikasi di HP ini</h3><p>Pilih tema lalu tampilkan sebagai notifikasi perangkat sungguhan.</p></span>
    </div>
    <div className={styles.themeGrid} aria-label="Tema notifikasi contoh">
      {TRIAL_THEMES.map((item) => <TrialThemeCard key={item.id} item={item} selected={theme === item.id} disabled={busy} onSelect={setTheme} />)}
    </div>
    <div className={styles.actionRow}>
      <Button type="button" disabled={busy || Boolean(unavailable)} onClick={showTrial}>{busy ? "Menampilkan..." : "Tampilkan di perangkat ini"}</Button>
      <span className={styles.platformHint}><FiImage aria-hidden="true" />Gambar besar mengikuti dukungan iOS/Android; jika OS tidak menampilkannya, judul dan isi tetap muncul.</span>
    </div>
    {unavailable ? <p className={styles.unavailable} role="status">{unavailable}</p> : null}
  </section>;
};

export default NotificationTrialPanel;
