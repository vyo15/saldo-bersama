import { getApps, initializeApp } from "@firebase/app";
import {
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  getAuth,
  inMemoryPersistence,
  initializeAuth,
  signInWithPopup,
  signOut,
} from "@firebase/auth";
import { env } from "../../config/env.js";

const MOBILE_FIREBASE_APP_NAME = "saldo-bersama-mobile-auth";
let mobileFirebaseAuth = null;

const friendlyMobileGoogleError = (error) => {
  const messages = {
    "auth/popup-blocked": "Popup login diblokir browser. Izinkan popup lalu coba lagi.",
    "auth/popup-closed-by-user": "Login dibatalkan. Silakan coba lagi.",
    "auth/cancelled-popup-request": "Login sebelumnya dibatalkan. Silakan coba lagi.",
    "auth/network-request-failed": "Koneksi ke Google gagal. Periksa internet lalu coba lagi.",
    "auth/unauthorized-domain": "Domain aplikasi belum diizinkan untuk login Google.",
    "auth/operation-not-allowed": "Login Google belum diaktifkan untuk aplikasi ini.",
  };
  return new Error(messages[error?.code] || "Login Google belum berhasil. Silakan coba lagi.");
};

const getMobileFirebaseAuth = () => {
  if (mobileFirebaseAuth) return mobileFirebaseAuth;
  try {
    const existingApp = getApps().find((app) => app.name === MOBILE_FIREBASE_APP_NAME);
    const app = existingApp || initializeApp({
      apiKey: env.firebaseApiKey,
      authDomain: env.firebaseAuthDomain,
    }, MOBILE_FIREBASE_APP_NAME);
    try {
      mobileFirebaseAuth = initializeAuth(app, { persistence: inMemoryPersistence });
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

export const signInWithGooglePopup = async ({ onFirebaseToken }) => {
  const auth = getMobileFirebaseAuth();
  const provider = new GoogleAuthProvider();
  let result;
  try {
    result = await signInWithPopup(auth, provider, browserPopupRedirectResolver);
  } catch (error) {
    throw friendlyMobileGoogleError(error);
  }

  let firebaseIdToken;
  try {
    firebaseIdToken = await result.user.getIdToken();
  } catch (error) {
    await signOut(auth).catch(() => {});
    throw friendlyMobileGoogleError(error);
  }

  try {
    await onFirebaseToken(firebaseIdToken);
  } finally {
    await signOut(auth).catch(() => {});
  }
};
