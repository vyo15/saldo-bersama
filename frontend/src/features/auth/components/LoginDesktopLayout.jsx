import { GoogleLoginPanel } from "./LoginFeedback.jsx";
import { DESKTOP_ARTWORK } from "../loginPresentation.js";
import styles from "./LoginDesktopReference.module.css";

const DESKTOP_ASSET_BASE = "/login/assets/desktop";
const CONTACT_URL = "https://www.linkedin.com/in/vio-yusup-iskandar/";

const FeatureChartIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24">
    <path d="M5 18V11M12 18V7M19 18V3" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
  </svg>
);

const FeatureHeartIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24">
    <path d="M12 20s-7-4.3-7-10a4.1 4.1 0 0 1 7-2.8A4.1 4.1 0 0 1 19 10c0 5.7-7 10-7 10Z" fill="currentColor" />
  </svg>
);

const FeatureUsersIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24">
    <circle cx="8" cy="8" fill="currentColor" r="3" />
    <circle cx="16.5" cy="9" fill="currentColor" opacity=".75" r="2.6" />
    <path d="M3 19c.4-4 2.3-6 5-6s4.6 2 5 6H3Zm9.8 0c.2-2.7 1.5-4.5 3.7-4.5 2.1 0 3.7 1.8 4 4.5h-7.7Z" fill="currentColor" />
  </svg>
);

const TrustShieldIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24">
    <path d="M12 2.8 19 6v5.2c0 4.4-2.4 7.9-7 10-4.6-2.1-7-5.6-7-10V6l7-3.2Z" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="m8.7 12 2.1 2.1 4.7-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
  </svg>
);

const TrustLockIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24">
    <rect fill="none" height="10" rx="2" stroke="currentColor" strokeWidth="2" width="14" x="5" y="10" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="2" />
  </svg>
);

const TrustSyncIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24">
    <path d="M20 7h-5l2-2a7 7 0 0 0-11.8 3" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    <path d="M4 17h5l-2 2a7 7 0 0 0 11.8-3" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
  </svg>
);

const Feature = ({ icon, children }) => (
  <div className={styles.feature}>
    <span className={styles.featureIcon} aria-hidden="true">{icon}</span>
    <span>{children}</span>
  </div>
);

const TrustItem = ({ icon, children }) => (
  <div className={styles.trustItem}>
    <span className={styles.trustIcon} aria-hidden="true">{icon}</span>
    <span>{children}</span>
  </div>
);

const DesktopLoginLayout = ({ theme, authProps }) => (
  <main
    className={styles.page}
    data-fallback-artwork={DESKTOP_ARTWORK[theme] || DESKTOP_ARTWORK.light}
  >
    <h1 className="sr-only">Saldo Bersama</h1>
    <div className={styles.bgHero} aria-hidden="true" />

    <header className={styles.topbar}>
      <div className={styles.brand}>
        <img src="/brand/saldo-bersama-mark.png" width="320" height="320" alt="" aria-hidden="true" draggable="false" decoding="async" />
        <div className={styles.brandMain}>
          <strong>Saldo <span>Bersama</span></strong>
          <small>Catatan keuangan pribadi dan bersama</small>
        </div>
      </div>

      <div className={styles.contact}>
        <span>Belum punya akun?</span>
        <a href={CONTACT_URL} target="_blank" rel="noopener noreferrer">Hubungi kami</a>
        <strong aria-hidden="true">→</strong>
      </div>
    </header>

    <section className={styles.layout}>
      <aside className={styles.left} aria-label="Manfaat Saldo Bersama">
        <h2>Catat keuangan,<strong>tanpa ribet.</strong></h2>
        <p>Kelola pemasukan, pengeluaran, dan tujuan bersama dalam satu tempat. Lebih mudah, lebih terarah, lebih dekat.</p>

        <div className={styles.features}>
          <Feature icon={<FeatureChartIcon />}>Pantau keuangan secara real-time</Feature>
          <Feature icon={<FeatureHeartIcon />}>Capai tujuan bersama</Feature>
          <Feature icon={<FeatureUsersIcon />}>Bangun masa depan yang lebih baik</Feature>
        </div>

        <div className={styles.scriptLeft} aria-hidden="true">Keuangan lebih<br />berarti, bersama.</div>
      </aside>

      <section className={styles.center} aria-label="Ilustrasi keuangan bersama">
        <div className={styles.art}>
          <div className={styles.flightPath} aria-hidden="true" />
          <img className={styles.plane} src={`${DESKTOP_ASSET_BASE}/paper-plane.webp`} width="1254" height="1254" alt="" aria-hidden="true" draggable="false" decoding="async" />
          <img className={styles.chartBubble} src={`${DESKTOP_ASSET_BASE}/growth-bubble.webp`} width="1254" height="1254" alt="" aria-hidden="true" draggable="false" decoding="async" />
          <img className={styles.checkBadge} src={`${DESKTOP_ASSET_BASE}/goal-badge.svg`} width="180" height="72" alt="Badge Tujuan Bersama" draggable="false" decoding="async" />
          <img className={styles.profileGreen} src={`${DESKTOP_ASSET_BASE}/profile-green.webp`} width="1254" height="1254" alt="" aria-hidden="true" draggable="false" decoding="async" />
          <img className={styles.profileRed} src={`${DESKTOP_ASSET_BASE}/profile-red.webp`} width="1254" height="1254" alt="" aria-hidden="true" draggable="false" decoding="async" />
          <img className={styles.heartA} src={`${DESKTOP_ASSET_BASE}/heart.webp`} width="1254" height="1254" alt="" aria-hidden="true" draggable="false" decoding="async" />
          <img className={styles.heartB} src={`${DESKTOP_ASSET_BASE}/heart.webp`} width="1254" height="1254" alt="" aria-hidden="true" draggable="false" decoding="async" />
          <span className={`${styles.spark} ${styles.sparkLeft}`} aria-hidden="true" />
          <span className={`${styles.spark} ${styles.sparkRight}`} aria-hidden="true" />
          <span className={`${styles.spark} ${styles.sparkRight2}`} aria-hidden="true" />
          <img
            className={styles.couple}
            src={`${DESKTOP_ASSET_BASE}/couple-love.webp`}
            width="1254"
            height="1254"
            alt="Pasangan mengelola tujuan keuangan bersama"
            draggable="false"
            fetchPriority="high"
            decoding="async"
          />
        </div>
      </section>

      <aside className={styles.right} aria-label="Masuk ke Saldo Bersama">
        <section className={styles.loginCard}>
          <h2>Masuk ke Saldo Bersama</h2>
          <p className={styles.sub}>Lanjutkan perjalanan finansial kamu bersama orang tersayang.</p>

          <div className={styles.googleSlot}>
            <GoogleLoginPanel {...authProps} />
          </div>

          <div className={styles.divider}>atau masuk dengan email</div>

          <div className={styles.trust} aria-label="Keamanan login">
            <TrustItem icon={<TrustShieldIcon />}>Akun<br />terverifikasi</TrustItem>
            <TrustItem icon={<TrustLockIcon />}>Data<br />privat</TrustItem>
            <TrustItem icon={<TrustSyncIcon />}>Sinkron<br />perangkat</TrustItem>
          </div>
        </section>

        <div className={styles.scriptRight} aria-hidden="true">Langkah kecil,<br />untuk mimpi besar.</div>
      </aside>
    </section>
  </main>
);

export default DesktopLoginLayout;
