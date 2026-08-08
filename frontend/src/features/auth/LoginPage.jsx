import { useEffect, useRef, useState } from "react";
import { FiAlertCircle } from "react-icons/fi";
import { Navigate, useLocation } from "react-router";
import Brand from "../../components/common/Brand.jsx";
import ThemeToggle from "../../components/common/ThemeToggle.jsx";
import { renderGoogleLoginButton } from "../../services/auth/googleFirebaseAuth.js";
import { useAuth } from "./AuthContext.jsx";

const MONEY_NOTES = Object.freeze([
  { denomination: "100000", tone: "red", left: "5%", rotation: "-14deg", duration: "22s", delay: "-15s", drift: "24px" },
  { denomination: "50000", tone: "blue", left: "22%", rotation: "12deg", duration: "26s", delay: "-7s", drift: "-28px" },
  { denomination: "20000", tone: "green", left: "43%", rotation: "-8deg", duration: "24s", delay: "-18s", drift: "20px" },
  { denomination: "10000", tone: "purple", left: "68%", rotation: "15deg", duration: "28s", delay: "-11s", drift: "-22px" },
  { denomination: "5000", tone: "gold", left: "88%", rotation: "-11deg", duration: "23s", delay: "-4s", drift: "30px" },
  { denomination: "50000", tone: "blue", left: "-4%", rotation: "16deg", duration: "29s", delay: "-5s", drift: "36px" },
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
      </div>

      <ThemeToggle className="login-theme-toggle" />

      <div className="login-experience">
        <h1 id="login-title" className="sr-only">Saldo Bersama</h1>
        <header className="login-brand-lockup">
          <Brand />
          <div className="login-brand-divider" aria-hidden="true" />
          <p>Kelola keuangan pribadi dan bersama.</p>
        </header>

        <section className="login-actions" aria-labelledby="login-title">
          {configErrors.length ? (
            <div className="notice notice--danger login-actions__notice" role="alert">
              <FiAlertCircle aria-hidden="true" />
              <div><strong>Konfigurasi belum lengkap.</strong>{configErrors.map((item) => <span key={item}>{item}</span>)}</div>
            </div>
          ) : null}

          {(error || buttonError) ? (
            <div className="notice notice--danger login-actions__notice" role="alert">
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
        </section>

        <p className="login-creator">
          Created by <a href="https://www.linkedin.com/in/vio-yusup-iskandar/" target="_blank" rel="noopener noreferrer">Vio Yusup Iskandar <span aria-hidden="true">↗</span></a>
        </p>
      </div>
    </main>
  );
};

export default LoginPage;
