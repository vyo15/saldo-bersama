import { useEffect, useRef, useState } from "react";
import { FiAlertCircle, FiArrowLeft, FiArrowRight } from "react-icons/fi";
import { Navigate, useLocation } from "react-router";
import ThemeToggle from "../../components/common/ThemeToggle.jsx";
import { useTheme } from "../../app/ThemeContext.jsx";
import { renderGoogleLoginButton } from "../../services/auth/googleFirebaseAuth.js";
import { useAuth } from "./AuthContext.jsx";
import "./LoginPage.css";

const MOBILE_LOGIN_QUERY = "(max-width: 820px)";
const MOBILE_SLIDE_COUNT = 4;
const MOBILE_LOGIN_SLIDE = MOBILE_SLIDE_COUNT - 1;
const MOBILE_ASSET_BASE = "/login/assets/mobile";
const DESKTOP_ARTWORK = Object.freeze({
  light: "/login/desktop-light.webp",
  dark: "/login/desktop-dark.webp",
});

const MOBILE_ONBOARDING = Object.freeze([
  {
    id: "saving",
    eyebrow: "Catat lebih mudah",
    title: "Rajin menabung,",
    accent: "bijak belanja.",
    description: "Pantau pemasukan dan pengeluaran sehari-hari dengan tampilan yang ringan dan mudah dipahami.",
    hero: { label: "Catat harian", meta: "Rapi • Cepat", badges: ["Pemasukan", "Pengeluaran"] },
    assets: [
      { src: `${MOBILE_ASSET_BASE}/phone-analytics.webp`, className: "login-mobile-asset--saving-main", priority: true, parallax: "soft" },
      { src: `${MOBILE_ASSET_BASE}/piggy-bank.webp`, className: "login-mobile-asset--saving-support", parallax: "medium" },
    ],
  },
  {
    id: "budget",
    eyebrow: "Lebih terencana",
    title: "Atur anggaran,",
    accent: "hindari boros.",
    description: "Pisahkan kebutuhan dan target agar batas belanja selalu terlihat sebelum uang digunakan.",
    hero: { label: "Atur anggaran", meta: "Bulanan • Terkontrol", badges: ["Budget", "Target"] },
    assets: [
      { src: `${MOBILE_ASSET_BASE}/wallet.webp`, className: "login-mobile-asset--budget-main", parallax: "soft" },
      { src: `${MOBILE_ASSET_BASE}/growth-board.webp`, className: "login-mobile-asset--budget-support", parallax: "medium" },
    ],
  },
  {
    id: "shared",
    eyebrow: "Tetap transparan",
    title: "Keuangan bersama,",
    accent: "tetap jelas.",
    description: "Kelola catatan pribadi dan bersama dari perangkat berbeda tanpa kehilangan gambaran keuangan kalian.",
    hero: { label: "Untuk berdua", meta: "Sinkron • Transparan", badges: ["Bersama", "Perangkat"] },
    assets: [
      { src: `${MOBILE_ASSET_BASE}/hand-phone-dashboard.webp`, className: "login-mobile-asset--shared-main", parallax: "soft" },
      { src: `${MOBILE_ASSET_BASE}/house.webp`, className: "login-mobile-asset--shared-house", parallax: "medium" },
      { src: `${MOBILE_ASSET_BASE}/finance-checklist.webp`, className: "login-mobile-asset--shared-checklist", parallax: "soft" },
    ],
  },
]);

const MONEY_NOTES = Object.freeze([
  { denomination: "100000", tone: "red", left: "5%", rotation: "-14deg", duration: "22s", delay: "-15s", drift: "24px" },
  { denomination: "50000", tone: "blue", left: "22%", rotation: "12deg", duration: "26s", delay: "-7s", drift: "-28px" },
  { denomination: "20000", tone: "green", left: "43%", rotation: "-8deg", duration: "24s", delay: "-18s", drift: "20px" },
  { denomination: "10000", tone: "purple", left: "68%", rotation: "15deg", duration: "28s", delay: "-11s", drift: "-22px" },
  { denomination: "5000", tone: "gold", left: "88%", rotation: "-11deg", duration: "23s", delay: "-4s", drift: "30px" },
  { denomination: "50000", tone: "blue", left: "-4%", rotation: "16deg", duration: "29s", delay: "-5s", drift: "36px" },
]);

const MOBILE_MONEY_NOTES = Object.freeze([
  { denomination: "100000", tone: "red", left: "3%", rotation: "-14deg", duration: "9s", delay: "-5s", drift: "28px" },
  { denomination: "50000", tone: "blue", left: "20%", rotation: "12deg", duration: "11s", delay: "-2s", drift: "-24px" },
  { denomination: "20000", tone: "green", left: "40%", rotation: "-9deg", duration: "10s", delay: "-8s", drift: "21px" },
  { denomination: "10000", tone: "purple", left: "62%", rotation: "15deg", duration: "12s", delay: "-4s", drift: "-27px" },
  { denomination: "5000", tone: "gold", left: "82%", rotation: "-11deg", duration: "10s", delay: "-1s", drift: "24px" },
  { denomination: "50000", tone: "mint", left: "53%", rotation: "8deg", duration: "13s", delay: "-9s", drift: "34px" },
  { denomination: "50000", tone: "blue", left: "9%", rotation: "7deg", duration: "12s", delay: "-10s", drift: "31px" },
]);

const MOBILE_PAGE_LABELS = Object.freeze(["Menabung", "Anggaran", "Keuangan bersama", "Login"]);

const readMobileLayout = () => typeof window !== "undefined"
  && typeof window.matchMedia === "function"
  && window.matchMedia(MOBILE_LOGIN_QUERY).matches;

const MoneyRain = ({ compact = false, notes = MONEY_NOTES }) => (
  <div className={`login-money-field${compact ? " login-money-field--compact" : ""}`} aria-hidden="true">
    {notes.map((note, index) => (
      <span
        className={`login-money-note login-money-note--${note.tone}`}
        key={`${note.denomination}-${note.left}-${index}`}
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

const LoginProvider = ({
  buttonRef,
  buttonReady = true,
  configErrors,
  error,
  buttonError,
  status,
  refreshSession,
  showPreparing = false,
}) => {
  const preparing = showPreparing
    && !buttonReady
    && status === "anonymous"
    && !configErrors.length
    && !error
    && !buttonError;
  return (
    <>
      <LoginFeedback
        configErrors={configErrors}
        error={error}
        buttonError={buttonError}
        status={status}
        refreshSession={refreshSession}
      />
      <div
        className={`google-login-button${buttonReady ? " is-ready" : ""}`}
        ref={buttonRef}
        aria-label="Masuk menggunakan Google"
        aria-busy={preparing || undefined}
      />
      {preparing ? (
        <div className="login-mobile-provider__preparing" role="status" aria-live="polite">
          <span className="login-mobile-provider__spinner" aria-hidden="true" />
          <span>Menyiapkan login…</span>
        </div>
      ) : null}
    </>
  );
};

const CreatorLink = ({ mobile = false, tabIndex = 0 }) => (
  <a
    className={mobile ? "login-mobile-creator-link" : "login-artwork-hotspot login-desktop-creator-link"}
    href="https://www.linkedin.com/in/vio-yusup-iskandar/"
    target="_blank"
    rel="noopener noreferrer"
    aria-label="Buka LinkedIn Vio Yusup Iskandar"
    tabIndex={tabIndex}
  >
    {mobile ? "Created by Vio Yusup Iskandar" : null}
  </a>
);

const MobileAsset = ({ asset, slideIndex }) => (
  <img
    className={`login-mobile-asset ${asset.className} login-mobile-asset--parallax-${asset.parallax}`}
    src={asset.src}
    alt=""
    aria-hidden="true"
    draggable="false"
    loading={slideIndex === 0 || asset.priority ? "eager" : "lazy"}
    fetchPriority={asset.priority ? "high" : "auto"}
  />
);

const MobileOnboardingSlide = ({ slide, index, active }) => (
  <article className={`login-mobile-slide login-mobile-onboarding-slide${active ? " is-active" : ""}`} aria-hidden={!active}>
    <div className={`login-mobile-hero login-mobile-hero--${slide.id}`} aria-hidden="true">
      <div className="login-mobile-hero__top">
        <span className="login-mobile-hero__kicker"><i />{slide.hero.label}</span>
        <span className="login-mobile-hero__meta">{slide.hero.meta}</span>
      </div>
      <div className="login-mobile-hero__panel">
        <div className="login-mobile-hero__lines">
          <span />
          <span className="is-short" />
        </div>
        <div className="login-mobile-hero__badges">
          {slide.hero.badges.map((badge) => <span key={badge}>{badge}</span>)}
        </div>
      </div>
      {slide.assets.map((asset) => <MobileAsset key={asset.src} asset={asset} slideIndex={index} />)}
    </div>
    <section className="login-mobile-copy">
      <p className="login-mobile-eyebrow">{slide.eyebrow}</p>
      <h2>{slide.title}<br /><strong>{slide.accent}</strong></h2>
      <p className="login-mobile-description">{slide.description}</p>
    </section>
  </article>
);

const MobileLoginSlide = ({ active, providerProps }) => (
  <article className={`login-mobile-slide login-mobile-login-slide${active ? " is-active" : ""}`} aria-hidden={!active}>
    <div className="login-mobile-login-backdrop" aria-hidden="true" />
    {active ? <MoneyRain compact notes={MOBILE_MONEY_NOTES} /> : null}
    <section className="login-mobile-login-content" aria-label="Masuk ke Saldo Bersama">
      <div className="login-mobile-login-logo">
        <img src="/brand/saldo-bersama-mark.png" alt="" aria-hidden="true" draggable="false" />
      </div>
      <p className="login-mobile-welcome">Selamat datang</p>
      <h2>Saldo <strong>Bersama</strong></h2>
      <p>Kelola keuangan pribadi dan bersama dengan akun Google yang sudah diizinkan.</p>
      <div className="login-mobile-provider">
        <LoginProvider {...providerProps} />
      </div>
      <div className="login-mobile-security" aria-label="Keamanan login">
        <span><i />Akun terverifikasi</span>
        <span><i />Data privat</span>
        <span><i />Sinkron perangkat</span>
      </div>
      <CreatorLink mobile tabIndex={active ? 0 : -1} />
    </section>
  </article>
);

const MobilePagination = ({ mobileSlide, moveMobileSlide }) => (
  <div className="login-mobile-pagination" aria-label="Halaman pengenalan">
    {MOBILE_PAGE_LABELS.map((label, index) => (
      <button
        type="button"
        className={`login-mobile-dot${index === mobileSlide ? " is-active" : ""}`}
        key={label}
        aria-label={`Buka halaman ${index + 1}: ${label}`}
        aria-current={index === mobileSlide ? "step" : undefined}
        onClick={() => moveMobileSlide(index)}
      />
    ))}
  </div>
);

const MobileLoginLayout = ({
  mobileSlide,
  moveMobileSlide,
  beginSwipe,
  moveSwipe,
  finishSwipe,
  trackRef,
  providerProps,
}) => {
  const loginActive = mobileSlide === MOBILE_LOGIN_SLIDE;
  const nextLabel = mobileSlide === MOBILE_LOGIN_SLIDE - 1 ? "Masuk ke Saldo Bersama" : "Lanjut";
  return (
    <main className="login-page login-page--mobile">
      <h1 className="sr-only">Saldo Bersama</h1>
      <section className={`login-mobile-stage${loginActive ? " is-login-active" : ""}`} aria-roledescription="carousel" aria-label="Pengenalan dan login Saldo Bersama">
        <header className="login-mobile-header">
          <div className="login-mobile-brand" aria-label="Saldo Bersama">
            <img src="/brand/saldo-bersama-mark.png" alt="" aria-hidden="true" draggable="false" />
            <strong>Saldo Bersama</strong>
          </div>
          <div className="login-mobile-header-actions">
            {!loginActive ? (
              <button type="button" className="login-mobile-skip" onClick={() => moveMobileSlide(MOBILE_LOGIN_SLIDE)}>
                Lewati
              </button>
            ) : null}
            <ThemeToggle className="login-mobile-theme-toggle" />
          </div>
        </header>

        {!loginActive ? (
          <div className="login-mobile-progress" aria-hidden="true">
            <span className="login-mobile-progress__track">
              <span className={`login-mobile-progress__bar is-step-${mobileSlide + 1}`} />
            </span>
            <small>{mobileSlide + 1} / {MOBILE_SLIDE_COUNT}</small>
          </div>
        ) : null}

        <div
          className="login-mobile-viewport"
          onPointerDown={beginSwipe}
          onPointerMove={moveSwipe}
          onPointerUp={finishSwipe}
          onPointerCancel={finishSwipe}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") moveMobileSlide(mobileSlide + 1);
            if (event.key === "ArrowLeft") moveMobileSlide(mobileSlide - 1);
          }}
          tabIndex={0}
        >
          <div ref={trackRef} className={`login-mobile-track is-slide-${mobileSlide}`}>
            {MOBILE_ONBOARDING.map((slide, index) => (
              <MobileOnboardingSlide key={slide.id} slide={slide} index={index} active={index === mobileSlide} />
            ))}
            <MobileLoginSlide active={loginActive} providerProps={providerProps} />
          </div>
        </div>

        <footer className="login-mobile-navigation">
          {!loginActive ? (
            <button type="button" className="login-mobile-next" onClick={() => moveMobileSlide(mobileSlide + 1)}>
              <span>{nextLabel}</span>
              <FiArrowRight aria-hidden="true" />
            </button>
          ) : null}
          <div className="login-mobile-navigation__row">
            {!loginActive ? (
              <button
                type="button"
                className="login-mobile-back"
                aria-label="Kembali ke halaman sebelumnya"
                disabled={mobileSlide === 0}
                onClick={() => moveMobileSlide(mobileSlide - 1)}
              >
                <FiArrowLeft aria-hidden="true" />
              </button>
            ) : <span className="login-mobile-navigation__spacer" aria-hidden="true" />}
            <MobilePagination mobileSlide={mobileSlide} moveMobileSlide={moveMobileSlide} />
            <span className="login-mobile-navigation__hint">{loginActive ? "Login" : "Geser"}</span>
          </div>
        </footer>
        <p className="sr-only" aria-live="polite">Halaman {mobileSlide + 1} dari {MOBILE_SLIDE_COUNT}: {MOBILE_PAGE_LABELS[mobileSlide]}.</p>
      </section>
    </main>
  );
};

const useMobileLoginInteraction = () => {
  const trackRef = useRef(null);
  const swipeStartXRef = useRef(null);
  const swipeStartYRef = useRef(null);
  const swipeDeltaXRef = useRef(0);
  const swipeHorizontalRef = useRef(null);
  const [mobileLayout, setMobileLayout] = useState(readMobileLayout);
  const [mobileSlide, setMobileSlide] = useState(0);

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

  const resetTrackMotion = () => {
    const track = trackRef.current;
    if (!track) return;
    track.classList.remove("is-dragging");
    track.style.setProperty("--login-mobile-drag", "0px");
    track.style.setProperty("--login-mobile-parallax-soft", "0px");
    track.style.setProperty("--login-mobile-parallax-medium", "0px");
    track.style.setProperty("--login-mobile-parallax-strong", "0px");
  };

  const moveMobileSlide = (nextSlide) => {
    resetTrackMotion();
    setMobileSlide(Math.max(0, Math.min(MOBILE_LOGIN_SLIDE, nextSlide)));
  };

  const beginSwipe = (event) => {
    if (event.target.closest?.("button, a, .google-login-button")) return;
    swipeStartXRef.current = event.clientX;
    swipeStartYRef.current = event.clientY;
    swipeDeltaXRef.current = 0;
    swipeHorizontalRef.current = null;
  };

  const moveSwipe = (event) => {
    if (swipeStartXRef.current === null || swipeStartYRef.current === null) return;
    const deltaX = event.clientX - swipeStartXRef.current;
    const deltaY = event.clientY - swipeStartYRef.current;
    if (swipeHorizontalRef.current === null && Math.max(Math.abs(deltaX), Math.abs(deltaY)) >= 6) {
      swipeHorizontalRef.current = Math.abs(deltaX) > Math.abs(deltaY);
      if (swipeHorizontalRef.current) event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    if (!swipeHorizontalRef.current) return;

    swipeDeltaXRef.current = deltaX;
    const edgeDrag = (mobileSlide === 0 && deltaX > 0) || (mobileSlide === MOBILE_LOGIN_SLIDE && deltaX < 0);
    const effectiveDelta = deltaX * (edgeDrag ? 0.28 : 1);
    const track = trackRef.current;
    if (!track) return;
    track.classList.add("is-dragging");
    track.style.setProperty("--login-mobile-drag", `${effectiveDelta}px`);
    track.style.setProperty("--login-mobile-parallax-soft", `${effectiveDelta * 0.08}px`);
    track.style.setProperty("--login-mobile-parallax-medium", `${effectiveDelta * 0.12}px`);
    track.style.setProperty("--login-mobile-parallax-strong", `${effectiveDelta * 0.18}px`);
  };

  const finishSwipe = (event) => {
    if (swipeStartXRef.current === null) return;
    const delta = swipeDeltaXRef.current;
    const horizontal = swipeHorizontalRef.current === true;
    const width = event.currentTarget.getBoundingClientRect().width;
    const threshold = Math.min(64, width * 0.15);
    const nextSlide = horizontal && Math.abs(delta) >= threshold
      ? mobileSlide + (delta < 0 ? 1 : -1)
      : mobileSlide;

    swipeStartXRef.current = null;
    swipeStartYRef.current = null;
    swipeDeltaXRef.current = 0;
    swipeHorizontalRef.current = null;
    moveMobileSlide(nextSlide);
  };

  return { mobileLayout, mobileSlide, trackRef, moveMobileSlide, beginSwipe, moveSwipe, finishSwipe };
};

const DesktopLoginLayout = ({ theme, providerProps }) => <main className="login-page login-page--desktop-artwork">
  <h1 className="sr-only">Saldo Bersama</h1><section className="login-desktop-stage" aria-label="Login Saldo Bersama"><div className="login-desktop-artwork-frame"><img className="login-desktop-artwork" src={DESKTOP_ARTWORK[theme] || DESKTOP_ARTWORK.light} alt="" aria-hidden="true" draggable="false" fetchPriority="high" /><div className="login-provider-mask login-provider-mask--desktop" aria-hidden="true" /><section className="login-provider-slot login-provider-slot--desktop" aria-label="Masuk ke Saldo Bersama"><LoginProvider {...providerProps} /></section><CreatorLink /></div><MoneyRain /><div className="sr-only"><p>Kelola keuangan pribadi dan bersama.</p><p>Akun yang diizinkan. Akses terverifikasi. Sinkron antar perangkat.</p></div></section>
</main>;

const LoginPage = () => {
  const { status, error, configErrors, loginWithFirebaseToken, refreshSession } = useAuth();
  const { theme } = useTheme();
  const location = useLocation();
  const buttonRef = useRef(null);
  const [buttonError, setButtonError] = useState(null);
  const [googleButtonReady, setGoogleButtonReady] = useState(false);
  const {
    mobileLayout,
    mobileSlide,
    trackRef,
    moveMobileSlide,
    beginSwipe,
    moveSwipe,
    finishSwipe,
  } = useMobileLoginInteraction();
  const shouldRenderGoogleButton = status === "anonymous" && !configErrors.length;

  useEffect(() => {
    if (!shouldRenderGoogleButton) {
      setGoogleButtonReady(false);
      return undefined;
    }
    const controller = new AbortController();
    const element = buttonRef.current;
    let cleanup = () => {};
    let observer = null;
    let observedFrame = null;
    setButtonError(null);
    setGoogleButtonReady(!mobileLayout);

    const syncGoogleButtonReady = () => {
      if (!mobileLayout || controller.signal.aborted || !element) return;
      const frame = element.querySelector("iframe");
      if (!frame || frame === observedFrame) return;
      observedFrame = frame;
      frame.addEventListener("load", () => {
        if (controller.signal.aborted || !element.contains(frame)) return;
        element.querySelectorAll("button").forEach((button) => button.remove());
        setGoogleButtonReady(true);
      }, { once: true });
    };

    if (mobileLayout && element && typeof MutationObserver !== "undefined") {
      observer = new MutationObserver(syncGoogleButtonReady);
      observer.observe(element, { childList: true, subtree: true });
    }

    renderGoogleLoginButton({
      element,
      onFirebaseToken: loginWithFirebaseToken,
      onError: setButtonError,
      signal: controller.signal,
      compact: mobileLayout,
    }).then((dispose) => {
      if (controller.signal.aborted) { dispose(); return; }
      cleanup = dispose;
      syncGoogleButtonReady();
    }).catch((error) => {
      if (error?.name !== "AbortError") setButtonError(error);
    });
    return () => {
      controller.abort();
      observer?.disconnect();
      cleanup();
    };
  }, [loginWithFirebaseToken, mobileLayout, shouldRenderGoogleButton]);

  const requestedPath = typeof location.state?.from === "string" && location.state.from.startsWith("/") && !location.state.from.startsWith("//")
    ? location.state.from
    : "/";
  if (status === "authenticated") return <Navigate to={requestedPath} replace />;

  const providerProps = {
    buttonRef,
    buttonReady: !mobileLayout || googleButtonReady,
    configErrors,
    error,
    buttonError,
    status,
    refreshSession,
    showPreparing: mobileLayout,
  };
  if (mobileLayout) return (
    <MobileLoginLayout
      mobileSlide={mobileSlide}
      moveMobileSlide={moveMobileSlide}
      beginSwipe={beginSwipe}
      moveSwipe={moveSwipe}
      finishSwipe={finishSwipe}
      trackRef={trackRef}
      providerProps={providerProps}
    />
  );
  return <DesktopLoginLayout theme={theme} providerProps={providerProps} />;
};

export default LoginPage;
