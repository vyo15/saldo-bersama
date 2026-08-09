import { useEffect, useRef, useState } from "react";
import { FiAlertCircle } from "react-icons/fi";
import { Navigate, useLocation } from "react-router";
import ThemeToggle from "../../components/common/ThemeToggle.jsx";
import { useTheme } from "../../app/ThemeContext.jsx";
import { renderGoogleLoginButton } from "../../services/auth/googleFirebaseAuth.js";
import { useAuth } from "./AuthContext.jsx";

const MOBILE_LOGIN_QUERY = "(max-width: 820px)";
const MOBILE_SLIDE_COUNT = 3;
const MOBILE_LOGIN_SLIDE = MOBILE_SLIDE_COUNT - 1;
const MOBILE_ARTWORK = Object.freeze([
  "/login/mobile-onboarding-saving.webp",
  "/login/mobile-onboarding-budget.webp",
  "/login/mobile-login.webp",
]);
const DESKTOP_ARTWORK = Object.freeze({
  light: "/login/desktop-light.webp",
  dark: "/login/desktop-dark.webp",
});

const MONEY_NOTES = Object.freeze([
  { denomination: "100000", tone: "red", left: "5%", rotation: "-14deg", duration: "22s", delay: "-15s", drift: "24px" },
  { denomination: "50000", tone: "blue", left: "22%", rotation: "12deg", duration: "26s", delay: "-7s", drift: "-28px" },
  { denomination: "20000", tone: "green", left: "43%", rotation: "-8deg", duration: "24s", delay: "-18s", drift: "20px" },
  { denomination: "10000", tone: "purple", left: "68%", rotation: "15deg", duration: "28s", delay: "-11s", drift: "-22px" },
  { denomination: "5000", tone: "gold", left: "88%", rotation: "-11deg", duration: "23s", delay: "-4s", drift: "30px" },
  { denomination: "50000", tone: "blue", left: "-4%", rotation: "16deg", duration: "29s", delay: "-5s", drift: "36px" },
]);

const readMobileLayout = () => typeof window !== "undefined"
  && typeof window.matchMedia === "function"
  && window.matchMedia(MOBILE_LOGIN_QUERY).matches;

const MoneyRain = ({ compact = false }) => {
  const notes = compact ? MONEY_NOTES.slice(0, 4) : MONEY_NOTES;
  return (
    <div className={`login-money-field${compact ? " login-money-field--compact" : ""}`} aria-hidden="true">
      {notes.map((note, index) => (
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
  );
};

const LoginFeedback = ({ configErrors, error, buttonError, status, refreshSession }) => {
  if (!configErrors.length && !error && !buttonError && status !== "error") return null;
  return (
    <div className="login-feedback" role="status">
      {configErrors.length ? (
        <div className="notice notice--danger login-feedback__notice" role="alert">
          <FiAlertCircle aria-hidden="true" />
          <div><strong>Konfigurasi belum lengkap.</strong>{configErrors.map((item) => <span key={item}>{item}</span>)}</div>
        </div>
      ) : null}

      {(error || buttonError) ? (
        <div className="notice notice--danger login-feedback__notice" role="alert">
          <FiAlertCircle aria-hidden="true" />
          <div><strong>Login belum berhasil.</strong><span>{(buttonError || error).message}</span></div>
        </div>
      ) : null}

      {status === "error" ? (
        <button className="button button--secondary button--wide" type="button" onClick={refreshSession}>
          Coba periksa sesi lagi
        </button>
      ) : null}
    </div>
  );
};

const LoginProvider = ({ buttonRef, configErrors, error, buttonError, status, refreshSession }) => (
  <>
    <LoginFeedback
      configErrors={configErrors}
      error={error}
      buttonError={buttonError}
      status={status}
      refreshSession={refreshSession}
    />
    <div className="google-login-button" ref={buttonRef} aria-label="Masuk menggunakan Google" />
  </>
);

const MOBILE_SLIDE_COPY = Object.freeze([
  "Rajin menabung, bijak belanja. Catat pengeluaran, kurangi foya, dan jaga saldo tetap terkontrol.",
  "Atur anggaran, hindari boros. Pantau pemasukan dan pengeluaran agar belanja tetap terencana.",
  "Login Saldo Bersama dengan akun Google yang diizinkan.",
]);

const CreatorLink = ({ mobile = false }) => <a className={`login-artwork-hotspot ${mobile ? "login-mobile-creator-link" : "login-desktop-creator-link"}`} href="https://www.linkedin.com/in/vio-yusup-iskandar/" target="_blank" rel="noopener noreferrer" aria-label="Buka LinkedIn Vio Yusup Iskandar" />;

const MobileLoginProvider = (props) => <><MoneyRain compact /><ThemeToggle className="login-mobile-theme-toggle" /><div className="login-provider-mask login-provider-mask--mobile" aria-hidden="true" /><section className="login-provider-slot login-provider-slot--mobile" aria-label="Masuk ke Saldo Bersama"><LoginProvider {...props} /></section><CreatorLink mobile /></>;

const MobileArtworkSlide = ({ src, index, mobileSlide, moveMobileSlide, providerProps }) => {
  const isLogin = index === MOBILE_LOGIN_SLIDE;
  const active = index === mobileSlide;
  return <article className="login-mobile-slide" aria-hidden={!active}><p className="sr-only">{MOBILE_SLIDE_COPY[index]}</p><img className="login-mobile-artwork" src={src} alt="" aria-hidden="true" draggable="false" loading={index === 0 ? "eager" : "lazy"} fetchPriority={index === 0 ? "high" : "auto"} />{!isLogin ? <button type="button" className="login-artwork-hotspot login-mobile-next" aria-label={index === 0 ? "Lanjut ke pengaturan anggaran" : "Lanjut ke login"} onClick={() => moveMobileSlide(index + 1)} tabIndex={active ? 0 : -1} /> : null}{isLogin && active ? <MobileLoginProvider {...providerProps} /> : null}</article>;
};

const MobileLoginLayout = ({ mobileSlide, moveMobileSlide, finishSwipe, swipeStartXRef, swipeDeltaXRef, providerProps }) => <main className="login-page login-page--mobile-artwork">
  <h1 className="sr-only">Saldo Bersama</h1>
  <section className="login-mobile-stage" aria-roledescription="carousel" aria-label="Pengenalan dan login Saldo Bersama" onPointerDown={(event) => { if (event.target.closest?.("button, a, .google-login-button")) return; swipeStartXRef.current = event.clientX; swipeDeltaXRef.current = 0; event.currentTarget.setPointerCapture?.(event.pointerId); }} onPointerMove={(event) => { if (swipeStartXRef.current !== null) swipeDeltaXRef.current = event.clientX - swipeStartXRef.current; }} onPointerUp={finishSwipe} onPointerCancel={finishSwipe} onKeyDown={(event) => { if (event.key === "ArrowRight") moveMobileSlide(mobileSlide + 1); if (event.key === "ArrowLeft") moveMobileSlide(mobileSlide - 1); }} tabIndex={0}>
    <div className="login-mobile-track" style={{ "--login-mobile-slide": mobileSlide }}>{MOBILE_ARTWORK.map((src, index) => <MobileArtworkSlide key={src} src={src} index={index} mobileSlide={mobileSlide} moveMobileSlide={moveMobileSlide} providerProps={providerProps} />)}</div>
    <p className="sr-only" aria-live="polite">Slide {mobileSlide + 1} dari {MOBILE_SLIDE_COUNT}.</p>
  </section>
</main>;

const DesktopLoginLayout = ({ theme, providerProps }) => <main className="login-page login-page--desktop-artwork">
  <h1 className="sr-only">Saldo Bersama</h1><section className="login-desktop-stage" aria-label="Login Saldo Bersama"><img className="login-desktop-artwork" src={DESKTOP_ARTWORK[theme] || DESKTOP_ARTWORK.light} alt="" aria-hidden="true" draggable="false" fetchPriority="high" /><MoneyRain /><div className="login-provider-mask login-provider-mask--desktop" aria-hidden="true" /><section className="login-provider-slot login-provider-slot--desktop" aria-label="Masuk ke Saldo Bersama"><LoginProvider {...providerProps} /></section><CreatorLink /><div className="sr-only"><p>Kelola keuangan pribadi dan bersama.</p><p>Akun yang diizinkan. Akses terverifikasi. Sinkron antar perangkat.</p></div></section>
</main>;

const LoginPage = () => {
  const { status, error, configErrors, loginWithFirebaseToken, refreshSession } = useAuth();
  const { theme } = useTheme();
  const location = useLocation();
  const buttonRef = useRef(null);
  const swipeStartXRef = useRef(null);
  const swipeDeltaXRef = useRef(0);
  const [buttonError, setButtonError] = useState(null);
  const [mobileLayout, setMobileLayout] = useState(readMobileLayout);
  const [mobileSlide, setMobileSlide] = useState(0);

  const showGoogleButton = status === "anonymous" && !configErrors.length && (!mobileLayout || mobileSlide === MOBILE_LOGIN_SLIDE);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia(MOBILE_LOGIN_QUERY);
    const syncLayout = (event) => {
      setMobileLayout(event.matches);
      if (event.matches) setMobileSlide(0);
    };
    setMobileLayout(media.matches);
    media.addEventListener?.("change", syncLayout);
    return () => media.removeEventListener?.("change", syncLayout);
  }, []);

  useEffect(() => {
    if (!showGoogleButton) return undefined;
    let cleanup = () => {};
    setButtonError(null);
    renderGoogleLoginButton({
      element: buttonRef.current,
      onFirebaseToken: loginWithFirebaseToken,
      onError: setButtonError,
    }).then((dispose) => { cleanup = dispose; }).catch(setButtonError);
    return () => cleanup();
  }, [loginWithFirebaseToken, mobileLayout, showGoogleButton]);

  const requestedPath = typeof location.state?.from === "string" && location.state.from.startsWith("/") && !location.state.from.startsWith("//")
    ? location.state.from
    : "/";
  if (status === "authenticated") return <Navigate to={requestedPath} replace />;

  const moveMobileSlide = (nextSlide) => {
    setMobileSlide(Math.max(0, Math.min(MOBILE_LOGIN_SLIDE, nextSlide)));
  };

  const finishSwipe = () => {
    const delta = swipeDeltaXRef.current;
    if (Math.abs(delta) >= 46) moveMobileSlide(mobileSlide + (delta < 0 ? 1 : -1));
    swipeStartXRef.current = null;
    swipeDeltaXRef.current = 0;
  };

  const providerProps = { buttonRef, configErrors, error, buttonError, status, refreshSession };
  if (mobileLayout) return <MobileLoginLayout mobileSlide={mobileSlide} moveMobileSlide={moveMobileSlide} finishSwipe={finishSwipe} swipeStartXRef={swipeStartXRef} swipeDeltaXRef={swipeDeltaXRef} providerProps={providerProps} />;
  return <DesktopLoginLayout theme={theme} providerProps={providerProps} />;
};

export default LoginPage;
