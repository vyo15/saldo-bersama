import { useEffect, useRef, useState } from "react";
import { FiAlertCircle, FiShield } from "react-icons/fi";
import { Navigate, useLocation } from "react-router";
import { renderGoogleLoginButton } from "../../services/auth/googleFirebaseAuth.js";
import { useAuth } from "./AuthContext.jsx";

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
      <section className="login-card" aria-labelledby="login-title">
        <div className="brand-lockup brand-lockup--centered">
          <span className="brand-mark" aria-hidden="true">SB</span>
          <span>Saldo Bersama</span>
        </div>
        <div className="login-card__icon"><FiShield aria-hidden="true" /></div>
        <h1 id="login-title">Keuangan rapi, transparan, dan terlacak</h1>
        <p>Masuk dengan akun Google yang telah diizinkan. Akun lain tetap ditolak oleh server.</p>

        {configErrors.length ? (
          <div className="notice notice--danger" role="alert">
            <FiAlertCircle aria-hidden="true" />
            <div><strong>Konfigurasi belum lengkap.</strong>{configErrors.map((item) => <span key={item}>{item}</span>)}</div>
          </div>
        ) : null}

        {(error || buttonError) ? (
          <div className="notice notice--danger" role="alert">
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

        <small>Data keuangan tidak disimpan di Vercel atau browser sebagai sumber kebenaran. Semua write production melalui API dan Google Apps Script.</small>
      </section>
    </main>
  );
};

export default LoginPage;
