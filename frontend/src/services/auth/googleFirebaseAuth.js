import { getApps, initializeApp } from "@firebase/app";
import { GoogleAuthProvider, getAuth, inMemoryPersistence, initializeAuth, signInWithPopup, signOut } from "@firebase/auth";
import { env } from "../../config/env.js";

const googleIdentityAbortError = () => Object.assign(new Error("Inisialisasi Google Identity dibatalkan."), { name: "AbortError" });

const waitForGoogleIdentity = (timeoutMs = 8000, signal) => new Promise((resolve, reject) => {
  const startedAt = Date.now();
  let timer = null;
  let settled = false;
  const finish = (callback, value) => {
    if (settled) return;
    settled = true;
    if (timer !== null) window.clearInterval(timer);
    signal?.removeEventListener("abort", onAbort);
    callback(value);
  };
  const onAbort = () => finish(reject, googleIdentityAbortError());
  if (signal?.aborted) {
    onAbort();
    return;
  }
  signal?.addEventListener("abort", onAbort, { once: true });
  timer = window.setInterval(() => {
    if (window.google?.accounts?.id) {
      finish(resolve, window.google.accounts.id);
      return;
    }
    if (Date.now() - startedAt > timeoutMs) finish(reject, new Error("Google Identity Services gagal dimuat."));
  }, 100);
});

const exchangeGoogleCredentialForFirebaseToken = async (googleCredential) => {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${encodeURIComponent(env.firebaseApiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      postBody: `id_token=${encodeURIComponent(googleCredential)}&providerId=google.com`,
      requestUri: window.location.origin,
      returnIdpCredential: true,
      returnSecureToken: true,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.idToken) {
    throw new Error(body.error?.message || "Firebase tidak dapat memproses login Google.");
  }
  return body.idToken;
};

const googleIdentityState = () => {
  const key = "__saldoBersamaGoogleIdentity";
  if (!window[key]) window[key] = { clientId: null, callbacks: null, initialized: false };
  return window[key];
};

const initializeGoogleIdentityOnce = (identity) => {
  const state = googleIdentityState();
  if (state.initialized) {
    if (state.clientId !== env.googleClientId) {
      throw new Error("Google Client ID berubah. Muat ulang halaman sebelum login.");
    }
    return state;
  }
  identity.initialize({
    client_id: env.googleClientId,
    auto_select: false,
    cancel_on_tap_outside: true,
    callback: async ({ credential }) => {
      const callbacks = googleIdentityState().callbacks;
      if (!callbacks) return;
      try {
        if (!credential) throw new Error("Google tidak mengembalikan credential login.");
        const firebaseIdToken = await exchangeGoogleCredentialForFirebaseToken(credential);
        await callbacks.onFirebaseToken(firebaseIdToken);
      } catch (error) {
        callbacks.onError(error);
      }
    },
  });
  state.clientId = env.googleClientId;
  state.initialized = true;
  return state;
};

export const renderGoogleLoginButton = async ({ element, onFirebaseToken, onError, signal, compact = false }) => {
  if (!element || signal?.aborted) return () => {};
  const identity = await waitForGoogleIdentity(8000, signal);
  if (signal?.aborted) return () => {};
  const state = initializeGoogleIdentityOnce(identity);
  const callbacks = { onFirebaseToken, onError };
  state.callbacks = callbacks;
  element.replaceChildren();
  identity.renderButton(element, {
    type: "standard",
    theme: "outline",
    size: compact ? "medium" : "large",
    shape: "pill",
    text: "continue_with",
    width: Math.min(compact ? 300 : 360, element.clientWidth || (compact ? 300 : 320)),
    locale: "id",
  });
  return () => {
    element.replaceChildren();
    if (state.callbacks === callbacks) state.callbacks = null;
  };
};

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
    result = await signInWithPopup(auth, provider);
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
