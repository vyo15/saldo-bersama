export const env = Object.freeze({
  appName: import.meta.env.VITE_APP_NAME || "Saldo Bersama",
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || "",
  firebaseApiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  firebaseAuthDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  vapidPublicKey: import.meta.env.VITE_VAPID_PUBLIC_KEY || "",
});

export const getPublicConfigErrors = () => {
  const errors = [];
  if (!env.googleClientId) errors.push("VITE_GOOGLE_CLIENT_ID belum diatur.");
  if (!env.firebaseApiKey) errors.push("VITE_FIREBASE_API_KEY belum diatur.");
  if (!env.firebaseAuthDomain) errors.push("VITE_FIREBASE_AUTH_DOMAIN belum diatur.");
  return errors;
};
