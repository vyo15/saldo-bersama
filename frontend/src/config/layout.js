export const APP_BREAKPOINTS = Object.freeze({
  compactMobileMax: 390,
  mobileMax: 820,
  desktopMin: 821,
  compactDesktopMax: 1023,
  standardDesktopMin: 1024,
  standardDesktopMax: 1279,
  wideDesktopMin: 1280,
  ultraWideDesktopMin: 1600,
});

export const APP_MEDIA = Object.freeze({
  compactMobile: `(max-width: ${APP_BREAKPOINTS.compactMobileMax}px)`,
  mobile: `(max-width: ${APP_BREAKPOINTS.mobileMax}px)`,
  desktop: `(min-width: ${APP_BREAKPOINTS.desktopMin}px)`,
  compactDesktop: `(min-width: ${APP_BREAKPOINTS.desktopMin}px) and (max-width: ${APP_BREAKPOINTS.compactDesktopMax}px)`,
  standardDesktop: `(min-width: ${APP_BREAKPOINTS.standardDesktopMin}px) and (max-width: ${APP_BREAKPOINTS.standardDesktopMax}px)`,
  wideDesktop: `(min-width: ${APP_BREAKPOINTS.wideDesktopMin}px)`,
  ultraWideDesktop: `(min-width: ${APP_BREAKPOINTS.ultraWideDesktopMin}px)`,
  reducedMotion: "(prefers-reduced-motion: reduce)",
});
