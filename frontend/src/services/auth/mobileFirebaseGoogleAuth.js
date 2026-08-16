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
let mobileFirebaseAuth = null;

const friendlyMobileGoogleError = (error) => {
  const messages = {
    "auth/network-request-failed": ["AUTH_NETWORK_FAILED", "Koneksi ke Google gagal. Periksa internet lalu coba lagi."],
    "auth/unauthorized-domain": ["AUTH_UNAUTHORIZED_DOMAIN", "Domain aplikasi belum diizinkan untuk login Google."],
    "auth/operation-not-allowed": ["AUTH_OPERATION_NOT_ALLOWED", "Login Google belum diaktifkan untuk aplikasi ini."],
    "auth/invalid-api-key": ["AUTH_FIREBASE_CONFIG_INVALID", "Konfigurasi login Google belum valid."],
    "auth/popup-blocked": ["AUTH_POPUP_BLOCKED", "Browser memblokir jendela login Google. Izinkan pop-up untuk Saldo Bersama lalu coba lagi."],
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

const getMobileFirebaseAuth = () => {
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

export const signInWithGooglePopup = ({ onFirebaseToken }) => {
  const auth = getMobileFirebaseAuth();
  const popupPromise = signInWithPopup(auth, googleProvider(), browserPopupRedirectResolver);
  return popupPromise
    .then(async (result) => {
      if (!result?.user) throw Object.assign(new Error("Google tidak mengembalikan akun login."), { code: "AUTH_LOGIN_RESULT_MISSING" });
      const firebaseIdToken = await result.user.getIdToken();
      await onFirebaseToken(firebaseIdToken);
      return { handled: true };
    })
    .catch((error) => {
      throw normalizeMobileGoogleError(error);
    })
    .finally(() => signOut(auth).catch(() => {}));
};
