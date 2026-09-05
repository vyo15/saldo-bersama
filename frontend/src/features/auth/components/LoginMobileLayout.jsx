import ThemeToggle from "../../../components/common/ThemeToggle.jsx";
import { loginClass } from "../loginStyles.js";
import { GoogleLoginPanel } from "./LoginFeedback.jsx";
import { MOBILE_LOGIN_SLIDE, MOBILE_MONEY_NOTES, MOBILE_ONBOARDING, MOBILE_PAGE_LABELS, MOBILE_SLIDE_COUNT, MONEY_NOTES } from "../loginPresentation.js";

const MoneyRain = ({ compact = false, notes = MONEY_NOTES }) => (
  <div className={loginClass("login-money-field", compact && "login-money-field--compact")} aria-hidden="true">
    {notes.map((note, index) => (
      <span
        className={loginClass("login-money-note", `login-money-note--${note.tone}`)}
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
    <span className={loginClass("login-spark", "login-spark--one")} />
    <span className={loginClass("login-spark", "login-spark--two")} />
    <span className={loginClass("login-spark", "login-spark--three")} />
  </div>
);

const CreatorLink = ({ mobile = false, tabIndex = 0 }) => (
  <a
    className={mobile ? loginClass("login-mobile-creator-link") : loginClass("login-artwork-hotspot", "login-desktop-creator-link")}
    href="https://www.linkedin.com/in/vio-yusup-iskandar/"
    target="_blank"
    rel="noopener noreferrer"
    aria-label="Buka LinkedIn Vio Yusup Iskandar"
    tabIndex={tabIndex}
  >
    {mobile ? "Created by Vio Yusup Iskandar" : null}
  </a>
);

const MobileAsset = ({ asset }) => (
  <img
    className={loginClass("login-mobile-asset", asset.className, `login-mobile-asset--parallax-${asset.parallax}`)}
    src={asset.src}
    width={asset.width}
    height={asset.height}
    alt=""
    aria-hidden="true"
    draggable="false"
    loading={asset.priority ? "eager" : "lazy"}
    fetchPriority={asset.priority ? "high" : "auto"}
    decoding="async"
  />
);

const MobileOnboardingSlide = ({ slide, active }) => (
  <article className={loginClass("login-mobile-slide", "login-mobile-onboarding-slide", active && "is-active")} aria-hidden={!active}>
    <div className={loginClass("login-mobile-hero", `login-mobile-hero--${slide.id}`)} aria-hidden="true">
      <div className={loginClass("login-mobile-hero__top")}>
        <span className={loginClass("login-mobile-hero__kicker")}><i />{slide.hero.label}</span>
        <span className={loginClass("login-mobile-hero__meta")}>{slide.hero.meta}</span>
      </div>
      <div className={loginClass("login-mobile-hero__panel")}>
        <div className={loginClass("login-mobile-hero__lines")}>
          <span />
          <span className={loginClass("is-short")} />
        </div>
        <div className={loginClass("login-mobile-hero__badges")}>
          {slide.hero.badges.map((badge) => <span key={badge}>{badge}</span>)}
        </div>
      </div>
      {active ? slide.assets.map((asset) => <MobileAsset key={asset.src} asset={asset} />) : null}
    </div>
    <section className={loginClass("login-mobile-copy")}>
      <p className={loginClass("login-mobile-eyebrow")}>{slide.eyebrow}</p>
      <h2>{slide.title}<br /><strong>{slide.accent}</strong></h2>
      <p className={loginClass("login-mobile-description")}>{slide.description}</p>
    </section>
  </article>
);

const MobileLoginSlide = ({ active, mobileAuthProps }) => (
  <article className={loginClass("login-mobile-slide", "login-mobile-login-slide", active && "is-active")} aria-hidden={!active}>
    <div className={loginClass("login-mobile-login-backdrop")} aria-hidden="true" />
    {active ? <MoneyRain compact notes={MOBILE_MONEY_NOTES} /> : null}
    <section className={loginClass("login-mobile-login-content")} aria-label="Masuk ke Saldo Bersama">
      <div className={loginClass("login-mobile-login-logo")}>
        <img src="/brand/saldo-bersama-mark.png" width="320" height="320" alt="" aria-hidden="true" draggable="false" decoding="async" />
      </div>
      <p className={loginClass("login-mobile-welcome")}>Selamat datang</p>
      <h2>Saldo <strong>Bersama</strong></h2>
      <p>Kelola keuangan pribadi dan bersama dengan akun Google yang sudah diizinkan.</p>
      {active ? <GoogleLoginPanel {...mobileAuthProps} /> : null}
      <div className={loginClass("login-mobile-security")} aria-label="Keamanan login">
        <span><i />Akun terverifikasi</span>
        <span><i />Data privat</span>
        <span><i />Sinkron perangkat</span>
      </div>
      <CreatorLink mobile tabIndex={active ? 0 : -1} />
    </section>
  </article>
);

const MobilePagination = ({ mobileSlide, moveMobileSlide }) => (
  <div className={loginClass("login-mobile-pagination")} aria-label="Halaman pengenalan">
    {MOBILE_PAGE_LABELS.map((label, index) => (
      <button
        type="button"
        className={loginClass("login-mobile-dot", index === mobileSlide && "is-active")}
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
  mobileAuthProps,
}) => {
  const loginActive = mobileSlide === MOBILE_LOGIN_SLIDE;
  return (
    <main className={loginClass("login-page", "login-page--mobile")}>
      <h1 className="sr-only">Saldo Bersama</h1>
      <section className={loginClass("login-mobile-stage", loginActive && "is-login-active")} aria-roledescription="carousel" aria-label="Pengenalan dan login Saldo Bersama">
        <header className={loginClass("login-mobile-header")}>
          <div className={loginClass("login-mobile-brand")} aria-label="Saldo Bersama">
            <img src="/brand/saldo-bersama-mark.png" width="320" height="320" alt="" aria-hidden="true" draggable="false" decoding="async" />
            <strong>Saldo Bersama</strong>
          </div>
          <div className={loginClass("login-mobile-header-actions")}>
            {!loginActive ? (
              <button type="button" className={loginClass("login-mobile-skip")} onClick={() => moveMobileSlide(MOBILE_LOGIN_SLIDE)}>
                Lewati
              </button>
            ) : null}
            <ThemeToggle className={loginClass("login-mobile-theme-toggle")} />
          </div>
        </header>

        <div
          className={loginClass("login-mobile-viewport")}
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
          <div ref={trackRef} className={loginClass("login-mobile-track", `is-slide-${mobileSlide}`)}>
            {MOBILE_ONBOARDING.map((slide, index) => (
              <MobileOnboardingSlide key={slide.id} slide={slide} active={index === mobileSlide} />
            ))}
            <MobileLoginSlide active={loginActive} mobileAuthProps={mobileAuthProps} />
          </div>
        </div>

        <footer className={loginClass("login-mobile-navigation")}>
          <div className={loginClass("login-mobile-navigation__row")}>
            <span className={loginClass("login-mobile-navigation__spacer")} aria-hidden="true" />
            <MobilePagination mobileSlide={mobileSlide} moveMobileSlide={moveMobileSlide} />
            {loginActive ? (
              <button type="button" className={loginClass("login-mobile-navigation__replay")} onClick={() => moveMobileSlide(0)} aria-label="Lihat pengenalan lagi">Ulang</button>
            ) : <span className={loginClass("login-mobile-navigation__hint")}>Geser</span>}
          </div>
        </footer>
        <p className="sr-only" aria-live="polite">Halaman {mobileSlide + 1} dari {MOBILE_SLIDE_COUNT}: {MOBILE_PAGE_LABELS[mobileSlide]}.</p>
      </section>
    </main>
  );
};

export default MobileLoginLayout;
