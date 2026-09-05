import { FiAlertCircle } from "react-icons/fi";
import { loginClass } from "../loginStyles.js";

const LoginFeedback = ({ configErrors, error, buttonError, status, refreshSession }) => {
  if (!configErrors.length && !error && !buttonError && status !== "error") return null;
  return (
    <div className={loginClass("login-feedback")} role="status">
      {configErrors.length ? (
        <div className={loginClass("notice", "notice--danger", "login-feedback__notice")} role="alert">
          <FiAlertCircle aria-hidden="true" />
          <div><strong>Konfigurasi belum lengkap.</strong>{configErrors.map((item) => <span key={item}>{item}</span>)}</div>
        </div>
      ) : null}

      {(error || buttonError) ? (
        <div className={loginClass("notice", "notice--danger", "login-feedback__notice")} role="alert">
          <FiAlertCircle aria-hidden="true" />
          <div><strong>Login belum berhasil.</strong><span>{(buttonError || error).message}</span></div>
        </div>
      ) : null}

      {status === "error" ? (
        <button className={loginClass("button", "button--secondary", "button--wide")} type="button" onClick={refreshSession}>
          Coba periksa sesi lagi
        </button>
      ) : null}
    </div>
  );
};

export const GoogleLoginPanel = ({ configErrors, error, buttonError, status, refreshSession, pending, ready, onLogin }) => {
  const disabled = pending || !ready || status !== "anonymous" || Boolean(configErrors.length);
  return (
    <div className={loginClass("login-mobile-auth")}>
      <LoginFeedback
        configErrors={configErrors}
        error={error}
        buttonError={buttonError}
        status={status}
        refreshSession={refreshSession}
      />
      <button
        className={loginClass("login-mobile-google-button")}
        type="button"
        onClick={onLogin}
        disabled={disabled}
        aria-busy={pending || undefined}
      >
        <span className={loginClass("login-mobile-google-button__icon")} aria-hidden="true">
          <img src="/login/google-g-logo.png" width="48" height="49" alt="" draggable="false" decoding="async" />
        </span>
        <span>{pending ? "Menghubungkan ke Google…" : ready ? "Masuk dengan Google" : "Menyiapkan login…"}</span>
        {pending ? <span className={loginClass("login-mobile-google-button__spinner")} aria-hidden="true" /> : null}
      </button>
    </div>
  );
};

export default LoginFeedback;
