import { useEffect, useRef, useState } from "react";
import { FiAlertCircle, FiCheckCircle, FiShield } from "react-icons/fi";
import { Navigate } from "react-router-dom";
import { renderGoogleLoginButton } from "../../services/auth/googleFirebaseAuth.js";
import { useAuth } from "./AuthContext.jsx";

const LoginPage = () => {
  const { status, error, configErrors, demoMode, loginWithFirebaseToken } = useAuth();
  const buttonRef = useRef(null);
  const [buttonError, setButtonError] = useState(null);

  useEffect(() => {
    if (status !== "anonymous" || demoMode || configErrors.length) return undefined;
    let cleanup = () => {};
    renderGoogleLoginButton({
      element: buttonRef.current,
      onFirebaseToken: loginWithFirebaseToken,
      onError: setButtonError,
    }).then((dispose) => { cleanup = dispose; }).catch(setButtonError);
    return () => cleanup();
  }, [configErrors.length, demoMode, loginWithFirebaseToken, status]);

  if (status === "authenticated") return <Navigate to="/" replace />;

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

        {demoMode ? (
          <div className="notice notice--warning" role="status">
            <FiAlertCircle aria-hidden="true" />
            <div><strong>Mode demo development aktif.</strong><span>Data contoh hanya tersimpan pada browser ini.</span></div>
          </div>
        ) : null}

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

        {demoMode ? (
          <button className="button button--primary button--wide" type="button" onClick={() => loginWithFirebaseToken("demo")}>
            <FiCheckCircle aria-hidden="true" /> Masuk ke demo
          </button>
        ) : (
          <div className="google-login-button" ref={buttonRef} aria-label="Masuk menggunakan Google" />
        )}

        <small>Data keuangan tidak disimpan di Vercel atau browser sebagai sumber kebenaran. Semua write production melalui API dan Google Apps Script.</small>
      </section>
    </main>
  );
};

export default LoginPage;
