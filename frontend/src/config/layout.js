export const APP_BREAKPOINTS = Object.freeze({
  compactMobileMax: 390,
  mobileMax: 820,
  desktopMin: 821,
});

export const APP_MEDIA = Object.freeze({
  compactMobile: `(max-width: ${APP_BREAKPOINTS.compactMobileMax}px)`,
  mobile: `(max-width: ${APP_BREAKPOINTS.mobileMax}px)`,
  desktop: `(min-width: ${APP_BREAKPOINTS.desktopMin}px)`,
  reducedMotion: "(prefers-reduced-motion: reduce)",
});
