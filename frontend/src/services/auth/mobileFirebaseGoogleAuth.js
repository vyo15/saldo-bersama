/**
 * Google sign-in acquisition only. The resulting Firebase ID token must still be exchanged
 * for a backend-validated application session; popup success alone never grants access.
 */
import { getApps, initializeApp } from "@firebase/app";
import {
  browserPopupRedirectResolver,
  getAuth,
  GoogleAuthProvider,
  initializeAuth,
  inMemoryPersistence,
  signInWithPopup,
  signOut,
} from "@firebase/auth";
import { env } from "../../config/env.js";

const MOBILE_FIREBASE_APP_NAME = "saldo-bersama-mobile-auth";
const CANONICAL_PRODUCTION_HOST = "saldo-bersama.vercel.app";
const SERVER_OAUTH_START_PATH = "/api/auth/google/start";
let mobileFirebaseAuth = null;

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

const isCanonicalProduction = () => typeof window !== "undefined"
  && window.location.protocol === "https:"
  && window.location.hostname === CANONICAL_PRODUCTION_HOST;

const getLocalFirebaseAuth = () => {
  if (mobileFirebaseAuth) return mobileFirebaseAuth;
  try {
    const existingApp = getApps().find((app) => app.name === MOBILE_FIREBASE_APP_NAME);
    const app = existingApp || initializeApp({
      apiKey: env.firebaseApiKey,
      authDomain: env.firebaseAuthDomain,
    }, MOBILE_FIREBASE_APP_NAME);
    try {
      mobileFirebaseAuth = initializeAuth(app, {
        persistence: inMemoryPersistence,
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

const completeLocalPopup = async ({ onFirebaseToken }) => {
  const auth = getLocalFirebaseAuth();
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

const normalizeReturnTo = (value) => {
  const candidate = String(value || "/");
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\") || candidate.length > 1_024) return "/";
  return candidate;
};

const startProductionServerOAuth = ({ returnTo = "/" } = {}) => {
  if (typeof window === "undefined") return { handled: false };
  const target = new URL(SERVER_OAUTH_START_PATH, window.location.origin);
  target.searchParams.set("returnTo", normalizeReturnTo(returnTo));
  window.location.assign(target.toString());
  return { handled: true };
};

export const signInWithGoogleMobile = ({ onFirebaseToken, returnTo = "/" }) => isCanonicalProduction()
  ? startProductionServerOAuth({ returnTo })
  : completeLocalPopup({ onFirebaseToken });
