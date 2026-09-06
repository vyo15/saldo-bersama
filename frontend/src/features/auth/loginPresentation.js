import { APP_MEDIA } from "../../config/layout.js";
/** Static login copy/artwork and error presentation only; authentication state stays in LoginPage. */
export const MOBILE_LOGIN_QUERY = APP_MEDIA.mobile;
export const MOBILE_SLIDE_COUNT = 4;
export const MOBILE_LOGIN_SLIDE = MOBILE_SLIDE_COUNT - 1;
export const MOBILE_ASSET_BASE = "/login/assets/mobile";
export const MOBILE_ONBOARDING = Object.freeze([
  {
    id: "saving",
    eyebrow: "Catat lebih mudah",
    title: "Catat keuangan,",
    accent: "tanpa ribet.",
    description: "Pemasukan dan pengeluaran dalam satu tempat, mudah dipantau setiap hari.",
    asset: {
      src: `${MOBILE_ASSET_BASE}/onboarding-catat-keuangan.webp`,
      width: 1240,
      height: 1209,
      priority: true,
      parallax: "soft",
    },
  },
  {
    id: "budget",
    eyebrow: "Lebih terencana",
    title: "Atur anggaran,",
    accent: "tetap terkendali.",
    description: "Tetapkan batas belanja dan target agar setiap rencana keuangan lebih mudah dijaga.",
    asset: {
      src: `${MOBILE_ASSET_BASE}/onboarding-atur-anggaran.webp`,
      width: 1269,
      height: 1232,
      parallax: "soft",
    },
  },
  {
    id: "shared",
    eyebrow: "Untuk kalian berdua",
    title: "Keuangan bersama,",
    accent: "tetap jelas.",
    description: "Catatan pribadi dan bersama tetap transparan, sinkron, dan mudah dipahami.",
    asset: {
      src: `${MOBILE_ASSET_BASE}/onboarding-keuangan-bersama.webp`,
      width: 1232,
      height: 1244,
      parallax: "soft",
    },
  },
]);

export const MOBILE_MONEY_NOTES = Object.freeze([
  { denomination: "100000", tone: "red", left: "3%", rotation: "-14deg", delay: "var(--motion-stagger-0)", drift: "28px" },
  { denomination: "50000", tone: "blue", left: "20%", rotation: "12deg", delay: "var(--motion-stagger-1)", drift: "-24px" },
  { denomination: "20000", tone: "green", left: "40%", rotation: "-9deg", delay: "var(--motion-stagger-2)", drift: "21px" },
  { denomination: "10000", tone: "purple", left: "62%", rotation: "15deg", delay: "var(--motion-stagger-3)", drift: "-27px" },
  { denomination: "5000", tone: "gold", left: "82%", rotation: "-11deg", delay: "var(--motion-stagger-4)", drift: "24px" },
  { denomination: "50000", tone: "mint", left: "53%", rotation: "8deg", delay: "var(--motion-stagger-5)", drift: "34px" },
  { denomination: "50000", tone: "blue", left: "9%", rotation: "7deg", delay: "var(--motion-stagger-6)", drift: "31px" },
]);

export const MOBILE_PAGE_LABELS = Object.freeze(["Catat keuangan", "Atur anggaran", "Keuangan bersama", "Login"]);

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
