import { GoogleLoginPanel } from "./LoginFeedback.jsx";
import styles from "./LoginDesktopFloating.module.css";

const DESKTOP_ASSET_BASE = "/login/assets/desktop";
const CONTACT_URL = "https://www.linkedin.com/in/vio-yusup-iskandar/";

const TrustShieldIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24">
    <path d="M12 2.8 19 6v5.2c0 4.4-2.4 7.9-7 10-4.6-2.1-7-5.6-7-10V6l7-3.2Z" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="m8.7 12 2.1 2.1 4.7-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
  </svg>
);

const TrustCheckIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24">
    <circle cx="12" cy="12" fill="none" r="8.25" stroke="currentColor" strokeWidth="2" />
    <path d="m8.5 12.1 2.2 2.2 4.9-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
  </svg>
);

const TrustSyncIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24">
    <path d="M20 7h-5l2-2a7 7 0 0 0-11.8 3" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    <path d="M4 17h5l-2 2a7 7 0 0 0 11.8-3" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
  </svg>
);

const GrowthMiniIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24">
    <rect x="4" y="11" width="3.5" height="7" rx="1.2" fill="currentColor" opacity=".88" />
    <rect x="10.25" y="7.5" width="3.5" height="10.5" rx="1.2" fill="currentColor" opacity=".92" />
    <rect x="16.5" y="4" width="3.5" height="14" rx="1.2" fill="currentColor" />
  </svg>
);

const WalletMiniIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24">
    <path d="M5.5 7.25h10.9a2.85 2.85 0 0 1 2.85 2.85v5.8a2.85 2.85 0 0 1-2.85 2.85H7.1a2.85 2.85 0 0 1-2.85-2.85V8.7a1.45 1.45 0 0 1 1.25-1.45Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="M7.5 7.25V6.5a2 2 0 0 1 2-2h7" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    <circle cx="16.1" cy="13" r="1.15" fill="currentColor" />
  </svg>
);

const TrustItem = ({ icon, children }) => (
  <div className={styles.trustItem}>
    <span className={styles.trustIcon} aria-hidden="true">{icon}</span>
    <span>{children}</span>
  </div>
);

const DesktopLoginLayout = ({ authProps }) => (
  <main className={styles.page}>
    <h1 className="sr-only">Saldo Bersama</h1>
    <div className={styles.background} aria-hidden="true" />

    <header className={styles.topbar}>
      <div className={styles.brand}>
        <img src="/brand/saldo-bersama-mark.png" width="320" height="320" alt="" aria-hidden="true" draggable="false" decoding="async" />
        <div className={styles.brandCopy}>
          <strong>Saldo <span>Bersama</span></strong>
          <small>Keuangan lebih teratur, bersama.</small>
        </div>
      </div>

      <div className={styles.contact}>
        <span>Belum punya akun?</span>
        <a href={CONTACT_URL} target="_blank" rel="noopener noreferrer">Hubungi kami</a>
        <strong aria-hidden="true">→</strong>
      </div>
    </header>

    <section className={styles.layout}>
      <div className={styles.visualStage} aria-hidden="true">
        <div className={styles.visualSurface} />
        <span className={styles.visualHalo} />
        <span className={styles.visualOrbit} />
        <span className={`${styles.visualSpark} ${styles.visualSparkOne}`} />
        <span className={`${styles.visualSpark} ${styles.visualSparkTwo}`} />
        <span className={`${styles.visualSpark} ${styles.visualSparkThree}`} />
        <span className={`${styles.visualSpark} ${styles.visualSparkFour}`} />

        <div className={`${styles.floatingCard} ${styles.floatingCardLead}`}>
          <span className={styles.floatingCardIcon}><GrowthMiniIcon /></span>
          <span className={styles.floatingCardCopy}>
            <strong>Langkah kecil,</strong>
            <small>masa depan besar</small>
          </span>
          <span className={styles.floatingCardArrow}>›</span>
        </div>

        <div className={`${styles.floatBubble} ${styles.floatBubbleCheck}`}>
          <TrustShieldIcon />
        </div>

        <div className={`${styles.floatBubble} ${styles.floatBubbleWallet}`}>
          <WalletMiniIcon />
        </div>

        <div className={styles.artwork}>
          <img
            className={styles.couple}
            src={`${DESKTOP_ASSET_BASE}/couple-love.webp`}
            width="1254"
            height="1254"
            alt=""
            draggable="false"
            fetchPriority="high"
            decoding="async"
          />
        </div>
      </div>

      <aside className={styles.authArea} aria-label="Masuk ke Saldo Bersama">
        <div className={styles.authBackdrop} aria-hidden="true" />
        <section className={styles.loginCard}>
          <div className={styles.cardChrome} aria-hidden="true">
            <span />
            <span />
            <span />
          </div>

          <div className={styles.cardLogo} aria-hidden="true">
            <img src="/brand/saldo-bersama-mark.png" width="320" height="320" alt="" draggable="false" decoding="async" />
          </div>

          <p className={styles.welcome}>Selamat datang kembali</p>
          <h2>Masuk ke <strong>Saldo Bersama</strong></h2>
          <p className={styles.sub}>Gunakan akun Google yang telah diberi izin untuk melanjutkan.</p>

          <div className={styles.googleSlot}>
            <GoogleLoginPanel {...authProps} />
          </div>

          <div className={styles.cardDivider} aria-hidden="true" />

          <div className={styles.trust} aria-label="Keamanan login">
            <TrustItem icon={<TrustShieldIcon />}>Privat</TrustItem>
            <TrustItem icon={<TrustCheckIcon />}>Terverifikasi</TrustItem>
            <TrustItem icon={<TrustSyncIcon />}>Tersinkron</TrustItem>
          </div>
        </section>
      </aside>
    </section>
  </main>
);

export default DesktopLoginLayout;
