import { useEffect, useRef, useState } from "react";
import {
  FiAlertCircle,
  FiLock,
  FiRefreshCw,
  FiShield,
  FiTrendingUp,
  FiUsers,
} from "react-icons/fi";
import { Navigate, useLocation } from "react-router";
import Brand from "../../components/common/Brand.jsx";
import ThemeToggle from "../../components/common/ThemeToggle.jsx";
import { renderGoogleLoginButton } from "../../services/auth/googleFirebaseAuth.js";
import { useAuth } from "./AuthContext.jsx";

const MONEY_NOTES = Object.freeze([
  { denomination: "100000", tone: "red", left: "5%", rotation: "-14deg", duration: "18s", delay: "-15s", drift: "24px" },
  { denomination: "50000", tone: "blue", left: "22%", rotation: "12deg", duration: "22s", delay: "-7s", drift: "-28px" },
  { denomination: "20000", tone: "green", left: "39%", rotation: "-8deg", duration: "20s", delay: "-18s", drift: "20px" },
  { denomination: "10000", tone: "purple", left: "57%", rotation: "15deg", duration: "24s", delay: "-11s", drift: "-22px" },
  { denomination: "5000", tone: "gold", left: "78%", rotation: "-11deg", duration: "19s", delay: "-4s", drift: "30px" },
  { denomination: "100000", tone: "red", left: "92%", rotation: "9deg", duration: "23s", delay: "-19s", drift: "-34px" },
  { denomination: "50000", tone: "blue", left: "-4%", rotation: "16deg", duration: "25s", delay: "-5s", drift: "36px" },
  { denomination: "20000", tone: "green", left: "31%", rotation: "-17deg", duration: "21s", delay: "-2s", drift: "26px" },
  { denomination: "10000", tone: "purple", left: "68%", rotation: "7deg", duration: "26s", delay: "-23s", drift: "-30px" },
  { denomination: "5000", tone: "gold", left: "86%", rotation: "-13deg", duration: "20s", delay: "-13s", drift: "22px" },
]);

const LoginPage = () => {
  const { status, error, configErrors, loginWithFirebaseToken, refreshSession } = useAuth();
  const location = useLocation();
  const buttonRef = useRef(null);
  const [buttonError, setButtonError] = useState(null);

  useEffect(() => {
    if (status !== "anonymous" || configErrors.length) return undefined;
    let cleanup = () => {};
    renderGoogleLoginButton({
      element: buttonRef.current,
      onFirebaseToken: loginWithFirebaseToken,
      onError: setButtonError,
    }).then((dispose) => { cleanup = dispose; }).catch(setButtonError);
    return () => cleanup();
  }, [configErrors.length, loginWithFirebaseToken, status]);

  const requestedPath = typeof location.state?.from === "string" && location.state.from.startsWith("/") && !location.state.from.startsWith("//")
    ? location.state.from
    : "/";
  if (status === "authenticated") return <Navigate to={requestedPath} replace />;

  return (
    <main className="login-page">
      <div className="login-money-field" aria-hidden="true">
        {MONEY_NOTES.map((note, index) => (
          <span
            className={`login-money-note login-money-note--${note.tone}`}
            key={`${note.denomination}-${index}`}
            style={{
              "--note-delay": note.delay,
              "--note-drift": note.drift,
              "--note-duration": note.duration,
              "--note-left": note.left,
              "--note-rotation": note.rotation,
            }}
          >
            <strong>{note.denomination}</strong>
            <small>RUPIAH</small>
          </span>
        ))}
        <span className="login-spark login-spark--one" />
        <span className="login-spark login-spark--two" />
        <span className="login-spark login-spark--three" />
        <span className="login-spark login-spark--four" />
      </div>

      <ThemeToggle className="login-theme-toggle" />

      <div className="login-experience">
        <header className="login-brand-lockup">
          <Brand />
          <div className="login-brand-divider" aria-hidden="true" />
          <p>Kelola keuangan pribadi dan bersama, jadi lebih mudah. <span aria-hidden="true">♡</span></p>
        </header>

        <section className="login-card" aria-labelledby="login-title">
          <div className="login-card__illustration" aria-hidden="true">
            <span><FiTrendingUp /></span>
            <span className="login-card__shield"><FiShield /></span>
            <span><FiUsers /></span>
          </div>
          <h1 id="login-title">Selamat datang!</h1>
          <p className="login-card__subtitle">Masuk untuk melanjutkan</p>

          {configErrors.length ? (
            <div className="notice notice--danger login-card__notice" role="alert">
              <FiAlertCircle aria-hidden="true" />
              <div><strong>Konfigurasi belum lengkap.</strong>{configErrors.map((item) => <span key={item}>{item}</span>)}</div>
            </div>
          ) : null}

          {(error || buttonError) ? (
            <div className="notice notice--danger login-card__notice" role="alert">
              <FiAlertCircle aria-hidden="true" />
              <div><strong>Login belum berhasil.</strong><span>{(buttonError || error).message}</span></div>
            </div>
          ) : null}

          {status === "error" ? (
            <button className="button button--secondary button--wide" type="button" onClick={refreshSession}>
              Coba periksa sesi lagi
            </button>
          ) : null}

          <div className="google-login-button" ref={buttonRef} aria-label="Masuk menggunakan Google" />

          <div className="login-card__divider"><span>Akun yang diizinkan</span></div>
          <div className="login-card__privacy">
            <span aria-hidden="true"><FiLock /></span>
            <p>Akun lain tetap ditolak oleh server. Data keuangan hanya diproses melalui sesi dan API yang terverifikasi.</p>
          </div>
        </section>

        <p className="login-creator">Created by <strong>Vio Yusup Iskandar</strong></p>

        <section className="login-trust-strip" aria-label="Keunggulan Saldo Bersama">
          <div><span aria-hidden="true"><FiShield /></span><strong>Privasi</strong><small>Terjamin</small></div>
          <div><span aria-hidden="true"><FiRefreshCw /></span><strong>Sinkron</strong><small>Antar perangkat</small></div>
          <div><span aria-hidden="true"><FiUsers /></span><strong>Bersama</strong><small>Dua pengguna</small></div>
        </section>
      </div>
    </main>
  );
};

export default LoginPage;
