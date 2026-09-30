import { useRef, useState } from "react";
import { FiBell, FiCheck, FiImage } from "react-icons/fi";
import Button from "../../components/common/Button.jsx";
import Modal from "../../components/common/Modal.jsx";
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
  if (pushState.iosInstallRequired) return "Pada iPhone atau iPad, pasang Saldo Bersama ke Home Screen lalu buka dari ikon aplikasi.";
  if (pushState.permission === "denied") return "Izin notifikasi sedang diblokir di pengaturan perangkat.";
  return null;
};

const NotificationTrialPanel = ({ pushState, refreshPushState, disabled = false }) => {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState("vacation");
  const [busy, setBusy] = useState(false);
  const inFlightRef = useRef(false);
  const { notify } = useFeedback();
  const unavailable = trialAvailability(pushState);

  const showTrial = async () => {
    if (inFlightRef.current || unavailable) return;
    inFlightRef.current = true;
    setBusy(true);
    try {
      await showNotificationTrial(theme);
      setOpen(false);
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

  return (
    <>
      <Button type="button" icon={FiBell} disabled={busy || disabled} onClick={() => setOpen(true)}>Kirim uji</Button>
      <Modal
        open={open}
        title="Kirim notifikasi uji"
        description="Pilih contoh yang ingin ditampilkan di perangkat ini."
        onClose={() => !busy && setOpen(false)}
        size="sm"
        dismissible={!busy}
        footer={<Button type="button" loading={busy} disabled={Boolean(unavailable)} onClick={showTrial}>Kirim notifikasi uji</Button>}
      >
        <div className={styles.modalBody}>
          <div className={styles.themeGrid} aria-label="Tema notifikasi contoh">
            {TRIAL_THEMES.map((item) => <TrialThemeCard key={item.id} item={item} selected={theme === item.id} disabled={busy} onSelect={setTheme} />)}
          </div>
          <p className={styles.platformHint}><FiImage aria-hidden="true" />Gambar besar bergantung dukungan perangkat; judul dan isi tetap menjadi informasi utama.</p>
          {unavailable ? <p className={styles.unavailable} role="status">{unavailable}</p> : null}
        </div>
      </Modal>
    </>
  );
};

export default NotificationTrialPanel;
