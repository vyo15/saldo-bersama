export const MOBILE_ONBOARDING_STORAGE_KEY = "saldo-bersama:login-onboarding-seen:v1";

const browserStorage = () => {
  if (typeof window === "undefined") return null;
  try { return window.localStorage; }
  catch { return null; }
};

export const hasSeenMobileOnboarding = (storage = browserStorage()) => {
  if (!storage) return false;
  try { return storage.getItem(MOBILE_ONBOARDING_STORAGE_KEY) === "1"; }
  catch { return false; }
};

export const markMobileOnboardingSeen = (storage = browserStorage()) => {
  if (!storage) return false;
  try {
    storage.setItem(MOBILE_ONBOARDING_STORAGE_KEY, "1");
    return true;
  } catch {
    return false;
  }
};
