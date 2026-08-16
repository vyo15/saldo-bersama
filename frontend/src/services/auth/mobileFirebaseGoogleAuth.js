import { getApps, initializeApp } from "@firebase/app";
import {
  browserPopupRedirectResolver,
  browserSessionPersistence,
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  initializeAuth,
  signInWithRedirect,
  signOut,
} from "@firebase/auth";
import { env } from "../../config/env.js";

const MOBILE_FIREBASE_APP_NAME = "saldo-bersama-mobile-auth";
const CANONICAL_PRODUCTION_HOST = "saldo-bersama.vercel.app";
let mobileFirebaseAuth = null;
let redirectResultPromise = null;

const friendlyMobileGoogleError = (error) => {
  const messages = {
    "auth/network-request-failed": ["AUTH_NETWORK_FAILED", "Koneksi ke Google gagal. Periksa internet lalu coba lagi."],
    "auth/unauthorized-domain": ["AUTH_UNAUTHORIZED_DOMAIN", "Domain aplikasi belum diizinkan untuk login Google."],
    "auth/operation-not-allowed": ["AUTH_OPERATION_NOT_ALLOWED", "Login Google belum diaktifkan untuk aplikasi ini."],
    "auth/web-storage-unsupported": ["AUTH_WEB_STORAGE_UNSUPPORTED", "Browser ini memblokir penyimpanan yang diperlukan untuk menyelesaikan login Google."],
    "auth/invalid-api-key": ["AUTH_FIREBASE_CONFIG_INVALID", "Konfigurasi login Google belum valid."],
    "auth/internal-error": ["AUTH_PROVIDER_INTERNAL", "Google belum dapat menyelesaikan login. Silakan coba lagi."],
  };
  const [code, message] = messages[error?.code] || ["AUTH_LOGIN_FAILED", "Login Google belum berhasil. Silakan coba lagi."];
  return Object.assign(new Error(message), { code });
};

const resolveMobileAuthDomain = () => {
  if (typeof window === "undefined") return env.firebaseAuthDomain;
  const { hostname, host, protocol } = window.location;
  if (protocol === "https:" && hostname === CANONICAL_PRODUCTION_HOST) return host;
  return env.firebaseAuthDomain;
};

const getMobileFirebaseAuth = () => {
  if (mobileFirebaseAuth) return mobileFirebaseAuth;
  try {
    const existingApp = getApps().find((app) => app.name === MOBILE_FIREBASE_APP_NAME);
    const app = existingApp || initializeApp({
      apiKey: env.firebaseApiKey,
      authDomain: resolveMobileAuthDomain(),
    }, MOBILE_FIREBASE_APP_NAME);
    try {
      mobileFirebaseAuth = initializeAuth(app, {
        persistence: browserSessionPersistence,
        popupRedirectResolver: browserPopupRedirectResolver,
      });
    } catch (error) {
      if (error?.code !== "auth/already-initialized") throw error;
      mobileFirebaseAuth = getAuth(app);
    }
    return mobileFirebaseAuth;
  } catch (error) {
    mobileFirebaseAuth = null;
    throw friendlyMobileGoogleError(error);
  }
};

const googleProvider = () => {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
};

export const startGoogleRedirect = async () => {
  const auth = getMobileFirebaseAuth();
  try {
    await signInWithRedirect(auth, googleProvider(), browserPopupRedirectResolver);
  } catch (error) {
    throw friendlyMobileGoogleError(error);
  }
};

const completeGoogleRedirect = async ({ onFirebaseToken }) => {
  const auth = getMobileFirebaseAuth();
  let result;
  try {
    result = await getRedirectResult(auth, browserPopupRedirectResolver);
  } catch (error) {
    await signOut(auth).catch(() => {});
    throw friendlyMobileGoogleError(error);
  }
  if (!result?.user) return { handled: false };

  let firebaseIdToken;
  try {
    firebaseIdToken = await result.user.getIdToken();
  } catch (error) {
    await signOut(auth).catch(() => {});
    throw friendlyMobileGoogleError(error);
  }

  try {
    await onFirebaseToken(firebaseIdToken);
    return { handled: true };
  } finally {
    await signOut(auth).catch(() => {});
  }
};

export const consumeGoogleRedirectResult = ({ onFirebaseToken }) => {
  if (!redirectResultPromise) {
    redirectResultPromise = completeGoogleRedirect({ onFirebaseToken });
  }
  return redirectResultPromise;
};
