/** Static login copy/artwork and error presentation only; authentication state stays in LoginPage. */
export const MOBILE_LOGIN_QUERY = "(max-width: 820px)";
export const MOBILE_SLIDE_COUNT = 4;
export const MOBILE_LOGIN_SLIDE = MOBILE_SLIDE_COUNT - 1;
export const MOBILE_ASSET_BASE = "/login/assets/mobile";
export const DESKTOP_ARTWORK = Object.freeze({
  light: "/login/desktop-light.webp",
  dark: "/login/desktop-dark.webp",
});

export const MOBILE_ONBOARDING = Object.freeze([
  {
    id: "saving",
    eyebrow: "Catat lebih mudah",
    title: "Rajin menabung,",
    accent: "bijak belanja.",
    description: "Pantau pemasukan dan pengeluaran sehari-hari dengan tampilan yang ringan dan mudah dipahami.",
    hero: { label: "Catat harian", meta: "Rapi • Cepat", badges: ["Pemasukan", "Pengeluaran"] },
    assets: [
      { src: `${MOBILE_ASSET_BASE}/phone-analytics.webp`, className: "login-mobile-asset--saving-main", priority: true, parallax: "soft" },
      { src: `${MOBILE_ASSET_BASE}/piggy-bank.webp`, className: "login-mobile-asset--saving-support", parallax: "medium" },
    ],
  },
  {
    id: "budget",
    eyebrow: "Lebih terencana",
    title: "Atur anggaran,",
    accent: "hindari boros.",
    description: "Pisahkan kebutuhan dan target agar batas belanja selalu terlihat sebelum uang digunakan.",
    hero: { label: "Atur anggaran", meta: "Bulanan • Terkontrol", badges: ["Budget", "Target"] },
    assets: [
      { src: `${MOBILE_ASSET_BASE}/wallet.webp`, className: "login-mobile-asset--budget-main", parallax: "soft" },
      { src: `${MOBILE_ASSET_BASE}/growth-board.webp`, className: "login-mobile-asset--budget-support", parallax: "medium" },
    ],
  },
  {
    id: "shared",
    eyebrow: "Tetap transparan",
    title: "Keuangan bersama,",
    accent: "tetap jelas.",
    description: "Kelola catatan pribadi dan bersama dari perangkat berbeda tanpa kehilangan gambaran keuangan kalian.",
    hero: { label: "Untuk berdua", meta: "Sinkron • Transparan", badges: ["Bersama", "Perangkat"] },
    assets: [
      { src: `${MOBILE_ASSET_BASE}/hand-phone-dashboard.webp`, className: "login-mobile-asset--shared-main", parallax: "soft" },
      { src: `${MOBILE_ASSET_BASE}/house.webp`, className: "login-mobile-asset--shared-house", parallax: "medium" },
      { src: `${MOBILE_ASSET_BASE}/finance-checklist.webp`, className: "login-mobile-asset--shared-checklist", parallax: "soft" },
    ],
  },
]);

export const MONEY_NOTES = Object.freeze([
  { denomination: "100000", tone: "red", left: "5%", rotation: "-14deg", duration: "22s", delay: "-15s", drift: "24px" },
  { denomination: "50000", tone: "blue", left: "22%", rotation: "12deg", duration: "26s", delay: "-7s", drift: "-28px" },
  { denomination: "20000", tone: "green", left: "43%", rotation: "-8deg", duration: "24s", delay: "-18s", drift: "20px" },
  { denomination: "10000", tone: "purple", left: "68%", rotation: "15deg", duration: "28s", delay: "-11s", drift: "-22px" },
  { denomination: "5000", tone: "gold", left: "88%", rotation: "-11deg", duration: "23s", delay: "-4s", drift: "30px" },
  { denomination: "50000", tone: "blue", left: "-4%", rotation: "16deg", duration: "29s", delay: "-5s", drift: "36px" },
]);

export const MOBILE_MONEY_NOTES = Object.freeze([
  { denomination: "100000", tone: "red", left: "3%", rotation: "-14deg", duration: "9s", delay: "-5s", drift: "28px" },
  { denomination: "50000", tone: "blue", left: "20%", rotation: "12deg", duration: "11s", delay: "-2s", drift: "-24px" },
  { denomination: "20000", tone: "green", left: "40%", rotation: "-9deg", duration: "10s", delay: "-8s", drift: "21px" },
  { denomination: "10000", tone: "purple", left: "62%", rotation: "15deg", duration: "12s", delay: "-4s", drift: "-27px" },
  { denomination: "5000", tone: "gold", left: "82%", rotation: "-11deg", duration: "10s", delay: "-1s", drift: "24px" },
  { denomination: "50000", tone: "mint", left: "53%", rotation: "8deg", duration: "13s", delay: "-9s", drift: "34px" },
  { denomination: "50000", tone: "blue", left: "9%", rotation: "7deg", duration: "12s", delay: "-10s", drift: "31px" },
]);

export const MOBILE_PAGE_LABELS = Object.freeze(["Menabung", "Anggaran", "Keuangan bersama", "Login"]);

export const mobileOAuthErrorFromSearch = (search) => {
  const code = new URLSearchParams(search || "").get("authError");
  const messages = {
    cancelled: "Login Google dibatalkan sebelum selesai.",
    config: "Konfigurasi login Google production belum lengkap.",
    "not-allowed": "Akun Google ini belum mendapat akses ke Saldo Bersama.",
    inactive: "Akun ini sedang dinonaktifkan. Hubungi Administrator untuk memulihkan akses.",
    "identity-conflict": "Identitas Google akun ini tidak cocok dengan akun yang tersimpan. Hubungi Administrator.",
    failed: "Google belum dapat menyelesaikan login. Silakan coba lagi.",
  };
  return code && messages[code] ? new Error(messages[code]) : null;
};
