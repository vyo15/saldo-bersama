import { env } from "../../config/env.js";

const waitForGoogleIdentity = (timeoutMs = 8000) => new Promise((resolve, reject) => {
  const startedAt = Date.now();
  const timer = window.setInterval(() => {
    if (window.google?.accounts?.id) {
      window.clearInterval(timer);
      resolve(window.google.accounts.id);
      return;
    }
    if (Date.now() - startedAt > timeoutMs) {
      window.clearInterval(timer);
      reject(new Error("Google Identity Services gagal dimuat."));
    }
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

export const renderGoogleLoginButton = async ({ element, onFirebaseToken, onError }) => {
  if (!element) return () => {};
  const identity = await waitForGoogleIdentity();
  identity.initialize({
    client_id: env.googleClientId,
    auto_select: false,
    cancel_on_tap_outside: true,
    callback: async ({ credential }) => {
      try {
        if (!credential) throw new Error("Google tidak mengembalikan credential login.");
        const firebaseIdToken = await exchangeGoogleCredentialForFirebaseToken(credential);
        await onFirebaseToken(firebaseIdToken);
      } catch (error) {
        onError(error);
      }
    },
  });
  element.replaceChildren();
  identity.renderButton(element, {
    type: "standard",
    theme: "outline",
    size: "large",
    shape: "pill",
    text: "continue_with",
    width: Math.min(360, element.clientWidth || 320),
    locale: "id",
  });
  return () => element.replaceChildren();
};
