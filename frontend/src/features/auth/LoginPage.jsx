import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation } from "react-router";
import { useTheme } from "../../app/ThemeContext.jsx";
import { useMediaQuery } from "../../hooks/useMediaQuery.js";
import DesktopLoginLayout from "./components/LoginDesktopLayout.jsx";
import MobileLoginLayout from "./components/LoginMobileLayout.jsx";
import {
  isCanonicalProductionGoogleOAuth,
  normalizeAuthReturnTo,
  productionGoogleAuthTransport,
} from "../../services/auth/googleAuthRouting.js";
import { MOBILE_LOGIN_QUERY, MOBILE_LOGIN_SLIDE, mobileOAuthErrorFromSearch } from "./loginPresentation.js";
import { hasSeenMobileOnboarding, markMobileOnboardingSeen } from "./loginOnboardingPreference.js";
import { useAuth } from "./AuthContext.jsx";
import { loginStyle } from "./loginStyles.js";

let localGoogleAuthModulePromise = null;
const preloadLocalGoogleAuth = () => {
  if (!localGoogleAuthModulePromise) {
    localGoogleAuthModulePromise = import("../../services/auth/mobileFirebaseGoogleAuth.js");
  }
  return localGoogleAuthModulePromise;
};


const useMobileLoginInteraction = () => {
  const trackRef = useRef(null);
  const swipeStartXRef = useRef(null);
  const swipeStartYRef = useRef(null);
  const swipeDeltaXRef = useRef(0);
  const swipeHorizontalRef = useRef(null);
  const mobileLayout = useMediaQuery(MOBILE_LOGIN_QUERY);
  const [mobileSlide, setMobileSlide] = useState(() => hasSeenMobileOnboarding() ? MOBILE_LOGIN_SLIDE : 0);

  useEffect(() => {
    if (mobileLayout) setMobileSlide(hasSeenMobileOnboarding() ? MOBILE_LOGIN_SLIDE : 0);
  }, [mobileLayout]);

  const resetTrackMotion = () => {
    const track = trackRef.current;
    if (!track) return;
    track.classList.remove(loginStyle("is-dragging"));
    track.style.setProperty("--login-mobile-drag", "0px");
    track.style.setProperty("--login-mobile-parallax-soft", "0px");
    track.style.setProperty("--login-mobile-parallax-medium", "0px");
    track.style.setProperty("--login-mobile-parallax-strong", "0px");
  };

  const moveMobileSlide = (nextSlide) => {
    resetTrackMotion();
    const boundedSlide = Math.max(0, Math.min(MOBILE_LOGIN_SLIDE, nextSlide));
    if (boundedSlide === MOBILE_LOGIN_SLIDE) markMobileOnboardingSeen();
    setMobileSlide(boundedSlide);
  };

  const beginSwipe = (event) => {
    if (event.target.closest?.("button, a")) return;
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
    track.classList.add(loginStyle("is-dragging"));
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

const useGoogleProvider = ({
  configErrorCount,
  googleAuthRef,
  setButtonError,
  setGoogleAuthReady,
  status,
}) => {
  useEffect(() => {
    if (status !== "anonymous" || configErrorCount) {
      googleAuthRef.current = null;
      setGoogleAuthReady(false);
      return undefined;
    }
    let active = true;
    setGoogleAuthReady(false);
    if (isCanonicalProductionGoogleOAuth()) {
      googleAuthRef.current = productionGoogleAuthTransport;
      setGoogleAuthReady(true);
    } else {
      preloadLocalGoogleAuth().then((googleAuth) => {
        if (!active) return;
        googleAuthRef.current = googleAuth;
        setGoogleAuthReady(true);
      }).catch((providerError) => {
        if (!active) return;
        setButtonError(providerError?.message ? providerError : new Error("Login Google belum siap. Muat ulang halaman lalu coba lagi."));
        setGoogleAuthReady(true);
      });
    }
    return () => {
      active = false;
      googleAuthRef.current = null;
    };
  }, [configErrorCount, googleAuthRef, setButtonError, setGoogleAuthReady, status]);
};

const LoginPage = () => {
  const { status, error, configErrors, loginWithFirebaseToken, refreshSession } = useAuth();
  const { theme } = useTheme();
  const location = useLocation();
  const googleAuthRef = useRef(null);
  const [buttonError, setButtonError] = useState(() => mobileOAuthErrorFromSearch(location.search));
  const [googleLoginPending, setGoogleLoginPending] = useState(false);
  const [googleAuthReady, setGoogleAuthReady] = useState(false);
  const {
    mobileLayout,
    mobileSlide,
    trackRef,
    moveMobileSlide,
    beginSwipe,
    moveSwipe,
    finishSwipe,
  } = useMobileLoginInteraction();
  useGoogleProvider({
    configErrorCount: configErrors.length,
    googleAuthRef,
    setButtonError,
    setGoogleAuthReady,
    status,
  });

  const requestedPath = normalizeAuthReturnTo(location.state?.from);

  const handleGoogleLogin = async () => {
    if (googleLoginPending || !googleAuthReady || status !== "anonymous" || configErrors.length) return;
    const googleAuth = googleAuthRef.current;
    if (!googleAuth) {
      setButtonError(new Error("Login Google belum siap. Muat ulang halaman lalu coba lagi."));
      return;
    }
    setButtonError(null);
    setGoogleLoginPending(true);
    try {
      await googleAuth.signInWithGoogleMobile({ onFirebaseToken: loginWithFirebaseToken, returnTo: requestedPath });
    } catch (loginError) {
      setButtonError(loginError);
    } finally {
      setGoogleLoginPending(false);
    }
  };

  if (status === "authenticated") return <Navigate to={requestedPath} replace />;

  const googleAuthProps = {
    configErrors,
    error,
    buttonError,
    status,
    refreshSession,
    pending: googleLoginPending,
    ready: googleAuthReady,
    onLogin: handleGoogleLogin,
  };
  if (mobileLayout) return (
    <MobileLoginLayout
      mobileSlide={mobileSlide}
      moveMobileSlide={moveMobileSlide}
      beginSwipe={beginSwipe}
      moveSwipe={moveSwipe}
      finishSwipe={finishSwipe}
      trackRef={trackRef}
      mobileAuthProps={googleAuthProps}
    />
  );
  return <DesktopLoginLayout theme={theme} authProps={googleAuthProps} />;
};

export default LoginPage;
