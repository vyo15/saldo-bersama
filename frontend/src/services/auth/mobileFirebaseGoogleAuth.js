import { getApps, initializeApp } from "@firebase/app";
import {
  browserPopupRedirectResolver,
  browserLocalPersistence,
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  initializeAuth,
  inMemoryPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from "@firebase/auth";
import { env } from "../../config/env.js";

const MOBILE_FIREBASE_APP_NAME = "saldo-bersama-mobile-auth";
const CANONICAL_PRODUCTION_HOST = "saldo-bersama.vercel.app";
const REDIRECT_INTENT_KEY = "saldo-bersama:mobile-google-redirect:v3";
const LEGACY_REDIRECT_INTENT_KEY = "saldo-bersama:mobile-google-redirect:v2";
const REDIRECT_INTENT_MAX_AGE_MS = 10 * 60_000;
const REDIRECT_START_TIMEOUT_MS = 8_000;
let mobileFirebaseAuth = null;
let redirectResultPromise = null;

const friendlyMobileGoogleError = (error) => {
  const messages = {
    "auth/network-request-failed": ["AUTH_NETWORK_FAILED", "Koneksi ke Google gagal. Periksa internet lalu coba lagi."],
    "auth/unauthorized-domain": ["AUTH_UNAUTHORIZED_DOMAIN", "Domain aplikasi belum diizinkan untuk login Google."],
    "auth/operation-not-allowed": ["AUTH_OPERATION_NOT_ALLOWED", "Login Google belum diaktifkan untuk aplikasi ini."],
    "auth/web-storage-unsupported": ["AUTH_WEB_STORAGE_UNSUPPORTED", "Browser ini memblokir penyimpanan yang diperlukan untuk menyelesaikan login Google."],
    "auth/invalid-api-key": ["AUTH_FIREBASE_CONFIG_INVALID", "Konfigurasi login Google belum valid."],
    "auth/popup-blocked": ["AUTH_POPUP_BLOCKED", "Browser memblokir jendela login Google. Izinkan pop-up lalu coba lagi."],
    "auth/popup-closed-by-user": ["AUTH_POPUP_CLOSED", "Login Google dibatalkan sebelum selesai."],
    "auth/cancelled-popup-request": ["AUTH_POPUP_CANCELLED", "Permintaan login sebelumnya dibatalkan. Silakan coba lagi."],
    "auth/internal-error": ["AUTH_PROVIDER_INTERNAL", "Google belum dapat menyelesaikan login. Silakan coba lagi."],
  };
  const [code, message] = messages[error?.code] || ["AUTH_LOGIN_FAILED", "Login Google belum berhasil. Silakan coba lagi."];
  return Object.assign(new Error(message), { code });
};

const normalizeMobileGoogleError = (error) => String(error?.code || "").startsWith("auth/")
  ? friendlyMobileGoogleError(error)
  : error;

const redirectIntentStores = () => {
  if (typeof window === "undefined") return [];
  const stores = [];
  for (const name of ["localStorage", "sessionStorage"]) {
    try {
      const storage = window[name];
      if (storage) stores.push(storage);
    } catch { /* Browser may disable one storage surface while leaving the other available. */ }
  }
  return stores;
};

const markRedirectIntent = () => {
  const startedAt = String(Date.now());
  for (const storage of redirectIntentStores()) {
    try { storage.setItem(REDIRECT_INTENT_KEY, startedAt); } catch { /* Firebase reports storage failures separately. */ }
  }
};

const clearRedirectIntent = () => {
  for (const storage of redirectIntentStores()) {
    try {
      storage.removeItem(REDIRECT_INTENT_KEY);
      storage.removeItem(LEGACY_REDIRECT_INTENT_KEY);
    } catch { /* Best-effort cleanup only. */ }
  }
};

const hasRecentRedirectIntent = () => redirectIntentStores().some((storage) => {
  try {
    const startedAt = Number(storage.getItem(REDIRECT_INTENT_KEY) || storage.getItem(LEGACY_REDIRECT_INTENT_KEY) || 0);
    return startedAt > 0 && Date.now() - startedAt <= REDIRECT_INTENT_MAX_AGE_MS;
  } catch {
    return false;
  }
});

const isCanonicalProduction = () => typeof window !== "undefined"
  && window.location.protocol === "https:"
  && window.location.hostname === CANONICAL_PRODUCTION_HOST;

const resolveMobileAuthDomain = () => isCanonicalProduction()
  ? window.location.host
  : env.firebaseAuthDomain;

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
        persistence: isCanonicalProduction() ? browserLocalPersistence : inMemoryPersistence,
        popupRedirectResolver: browserPopupRedirectResolver,
      });
    } catch (error) {
      if (error?.code !== "auth/already-initialized") throw error;
      mobileFirebaseAuth = getAuth(app);
    }
    return mobileFirebaseAuth;
  } catch (error) {
    mobileFirebaseAuth = null;
    throw normalizeMobileGoogleError(error);
  }
};

const googleProvider = () => {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
};

const missingRedirectResultError = () => Object.assign(
  new Error("Google sudah mengembalikan Anda ke aplikasi, tetapi sesi login belum dapat dipulihkan. Silakan coba lagi."),
  { code: "AUTH_REDIRECT_RESULT_MISSING" },
);

const redirectStartTimeoutError = () => Object.assign(
  new Error("Google tidak membuka halaman login. Periksa browser lalu coba lagi."),
  { code: "AUTH_REDIRECT_START_TIMEOUT" },
);

const startProductionRedirect = async () => {
  const auth = getMobileFirebaseAuth();
  markRedirectIntent();
  let timer;
  try {
    await Promise.race([
      signInWithRedirect(auth, googleProvider(), browserPopupRedirectResolver),
      new Promise((_, reject) => {
        timer = window.setTimeout(() => reject(redirectStartTimeoutError()), REDIRECT_START_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    clearRedirectIntent();
    throw normalizeMobileGoogleError(error);
  } finally {
    if (timer) window.clearTimeout(timer);
  }
};

const completePopup = async ({ onFirebaseToken }) => {
  const auth = getMobileFirebaseAuth();
  try {
    const result = await signInWithPopup(auth, googleProvider(), browserPopupRedirectResolver);
    if (!result?.user) throw Object.assign(new Error("Google tidak mengembalikan akun login."), { code: "AUTH_LOGIN_RESULT_MISSING" });
    const firebaseIdToken = await result.user.getIdToken();
    await onFirebaseToken(firebaseIdToken);
    return { handled: true };
  } catch (error) {
    throw normalizeMobileGoogleError(error);
  } finally {
    await signOut(auth).catch(() => {});
  }
};

const resolveRedirectUser = async (auth, result, hadRedirectIntent) => {
  if (result?.user) return result.user;
  await auth.authStateReady();
  return hadRedirectIntent ? auth.currentUser : null;
};

const completeProductionRedirect = async ({ onFirebaseToken }) => {
  if (!isCanonicalProduction()) return { handled: false };
  const auth = getMobileFirebaseAuth();
  const hadRedirectIntent = hasRecentRedirectIntent();
  let user;
  try {
    const result = await getRedirectResult(auth, browserPopupRedirectResolver);
    user = await resolveRedirectUser(auth, result, hadRedirectIntent);
  } catch (error) {
    clearRedirectIntent();
    await signOut(auth).catch(() => {});
    throw normalizeMobileGoogleError(error);
  }

  if (!user) {
    if (!hadRedirectIntent && auth.currentUser) await signOut(auth).catch(() => {});
    clearRedirectIntent();
    if (hadRedirectIntent) throw missingRedirectResultError();
    return { handled: false };
  }

  try {
    const firebaseIdToken = await user.getIdToken();
    await onFirebaseToken(firebaseIdToken);
    return { handled: true };
  } catch (error) {
    throw normalizeMobileGoogleError(error);
  } finally {
    clearRedirectIntent();
    await signOut(auth).catch(() => {});
  }
};

export const consumeGoogleRedirectResult = ({ onFirebaseToken }) => {
  if (!redirectResultPromise) redirectResultPromise = completeProductionRedirect({ onFirebaseToken });
  return redirectResultPromise;
};

export const signInWithGoogleMobile = ({ onFirebaseToken }) => isCanonicalProduction()
  ? startProductionRedirect()
  : completePopup({ onFirebaseToken });
