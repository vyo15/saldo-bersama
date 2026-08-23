import ThemeToggle from "../../../components/common/ThemeToggle.jsx";
import { GoogleLoginPanel } from "./LoginFeedback.jsx";
import { DESKTOP_ARTWORK, MOBILE_ASSET_BASE, MONEY_NOTES } from "../loginPresentation.js";

const MoneyRain = ({ notes = MONEY_NOTES }) => (
  <div className="login-money-field" aria-hidden="true">
    {notes.map((note, index) => (
      <span className={`login-money-note login-money-note--${note.tone}`} key={`${note.denomination}-${note.left}-${index}`} style={{ "--note-delay": note.delay, "--note-drift": note.drift, "--note-duration": note.duration, "--note-left": note.left, "--note-rotation": note.rotation }}>
        <strong>{note.denomination}</strong><small>RUPIAH</small>
      </span>
    ))}
    <span className="login-spark login-spark--one" /><span className="login-spark login-spark--two" /><span className="login-spark login-spark--three" />
  </div>
);

const DesktopLoginLayout = ({ theme, authProps }) => (
  <main className="login-page login-page--desktop-minimal">
    <h1 className="sr-only">Saldo Bersama</h1>
    <section
      className="login-desktop-stage"
      aria-label="Login Saldo Bersama"
      data-fallback-artwork={DESKTOP_ARTWORK[theme] || DESKTOP_ARTWORK.light}
    >
      <div className="login-desktop-shell">
        <section className="login-desktop-hero" aria-label="Saldo Bersama">
          <MoneyRain />
          <header className="login-desktop-brand-row">
            <div className="login-desktop-brand">
              <img src="/brand/saldo-bersama-mark.png" alt="" aria-hidden="true" draggable="false" />
              <span>
                <strong>Saldo Bersama</strong>
                <small>Catatan keuangan pribadi dan bersama</small>
              </span>
            </div>
            <ThemeToggle className="login-desktop-theme-toggle" />
          </header>

          <div className="login-desktop-copy">
            <h2>Keuangan bersama, <strong>lebih sederhana.</strong></h2>
            <p>Catat, pantau, dan kelola keuangan dari satu tempat dengan tampilan yang tenang dan mudah dipakai setiap hari.</p>
          </div>

          <div className="login-desktop-visual" aria-hidden="true">
            <span className="login-desktop-visual-glow login-desktop-visual-glow--one" />
            <span className="login-desktop-visual-glow login-desktop-visual-glow--two" />
            <img className="login-desktop-visual-main" src={`${MOBILE_ASSET_BASE}/hand-phone-dashboard.webp`} alt="" draggable="false" />
            <img className="login-desktop-visual-piggy" src={`${MOBILE_ASSET_BASE}/piggy-bank.webp`} alt="" draggable="false" />
            <img className="login-desktop-visual-wallet" src={`${MOBILE_ASSET_BASE}/wallet.webp`} alt="" draggable="false" />
            <span className="login-desktop-visual-shadow" />
          </div>
        </section>

        <aside className="login-desktop-auth" aria-label="Masuk ke Saldo Bersama">
          <section className="login-desktop-auth-content">
            <div className="login-desktop-auth-logo" aria-hidden="true">
              <img src="/brand/saldo-bersama-mark.png" alt="" draggable="false" />
            </div>
            <p className="login-desktop-auth-welcome">Selamat datang</p>
            <h2>Saldo <strong>Bersama</strong></h2>
            <p className="login-desktop-auth-description">Kelola keuangan pribadi dan bersama dengan akun Google yang sudah diizinkan.</p>

            <div className="login-provider-slot login-provider-slot--desktop">
              <GoogleLoginPanel {...authProps} />
            </div>

            <div className="login-desktop-auth-security" aria-label="Keamanan login">
              <span><i />Akun terverifikasi</span>
              <span><i />Data privat</span>
              <span><i />Sinkron perangkat</span>
            </div>
            <p className="login-desktop-auth-note">Hanya akun Google yang sudah diberi akses oleh Administrator yang dapat masuk.</p>
          </section>
        </aside>
      </div>
    </section>
  </main>
);

export default DesktopLoginLayout;
