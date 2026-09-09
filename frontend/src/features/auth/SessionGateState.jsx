import { FiRefreshCw, FiWifiOff } from "react-icons/fi";
import Brand from "../../components/common/Brand.jsx";
import Button from "../../components/common/Button.jsx";
import styles from "./SessionGateState.module.css";

const SessionGateState = ({ offline = false, onRetry }) => (
  <main className={styles.root}>
    <div className={styles.card} role="status" aria-live="polite">
      <Brand />
      <span className={styles.icon} aria-hidden="true">{offline ? <FiWifiOff /> : <FiRefreshCw />}</span>
      <div className={styles.copy}>
        <h1>{offline ? "Anda sedang offline" : "Sesi belum dapat diperiksa"}</h1>
        <p>{offline ? "Saldo Bersama memerlukan koneksi untuk memverifikasi sesi dan memuat data keuangan terbaru. Tampilan aplikasi tetap siap dan akan dilanjutkan setelah koneksi tersedia." : "Koneksi ke layanan belum berhasil. Coba lagi tanpa keluar dari aplikasi."}</p>
      </div>
      <Button variant="primary" icon={FiRefreshCw} onClick={onRetry}>Coba lagi</Button>
    </div>
  </main>
);

export default SessionGateState;
