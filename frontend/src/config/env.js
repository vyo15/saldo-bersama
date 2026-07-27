const booleanEnv = (value) => String(value).toLowerCase() === "true";

export const env = Object.freeze({
  appName: import.meta.env.VITE_APP_NAME || "Saldo Bersama",
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || "",
  firebaseApiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  vapidPublicKey: import.meta.env.VITE_VAPID_PUBLIC_KEY || "",
  demoMode: import.meta.env.DEV && booleanEnv(import.meta.env.VITE_DEMO_MODE),
});

export const getPublicConfigErrors = () => {
  if (env.demoMode) return [];
  const errors = [];
  if (!env.googleClientId) errors.push("VITE_GOOGLE_CLIENT_ID belum diatur.");
  if (!env.firebaseApiKey) errors.push("VITE_FIREBASE_API_KEY belum diatur.");
  return errors;
};
