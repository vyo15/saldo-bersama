const CANONICAL_PRODUCTION_HOST = "saldo-bersama.vercel.app";
const SERVER_OAUTH_START_PATH = "/api/auth/google/start";

export const normalizeAuthReturnTo = (value) => {
  const candidate = String(value || "/");
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\") || candidate.length > 1_024) return "/";
  return candidate;
};

export const isCanonicalProductionGoogleOAuth = () => typeof window !== "undefined"
  && window.location.protocol === "https:"
  && window.location.hostname === CANONICAL_PRODUCTION_HOST;

export const startProductionServerOAuth = ({ returnTo = "/" } = {}) => {
  if (typeof window === "undefined") return { handled: false };
  const target = new URL(SERVER_OAUTH_START_PATH, window.location.origin);
  target.searchParams.set("returnTo", normalizeAuthReturnTo(returnTo));
  window.location.assign(target.toString());
  return { handled: true };
};

export const productionGoogleAuthTransport = Object.freeze({
  signInWithGoogleMobile: ({ returnTo = "/" } = {}) => startProductionServerOAuth({ returnTo }),
});
