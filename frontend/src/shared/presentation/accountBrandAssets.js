import bcaCard from "../../assets/bank-cards/bca.webp";
import bniCard from "../../assets/bank-cards/bni.webp";
import btnCard from "../../assets/bank-cards/btn.webp";
import mandiriCard from "../../assets/bank-cards/mandiri.webp";
import permataCard from "../../assets/bank-cards/permata.webp";
import bcaLogo from "../../assets/bank-logos/bca.webp";
import bniLogo from "../../assets/bank-logos/bni.webp";
import btnLogo from "../../assets/bank-logos/btn.webp";
import mandiriLogo from "../../assets/bank-logos/mandiri.webp";
import permataLogo from "../../assets/bank-logos/permata.webp";
import danaCard from "../../assets/ewallet-cards/dana.webp";
import gopayCard from "../../assets/ewallet-cards/gopay.webp";
import linkajaCard from "../../assets/ewallet-cards/linkaja.webp";
import ovoCard from "../../assets/ewallet-cards/ovo.webp";
import shopeepayCard from "../../assets/ewallet-cards/shopeepay.webp";
import danaLogo from "../../assets/ewallet-logos/dana.webp";
import gopayLogo from "../../assets/ewallet-logos/gopay.webp";
import linkajaLogo from "../../assets/ewallet-logos/linkaja.webp";
import ovoLogo from "../../assets/ewallet-logos/ovo.webp";
import shopeepayLogo from "../../assets/ewallet-logos/shopeepay.webp";
import { detectBankTemplate, detectEwalletTemplate } from "./account.js";

// Card artwork remains canonical for AccountVisual. Compact selectors use the
// separate square logo assets below so a 1.586:1 card is never squeezed into
// a small account-picker thumbnail.
export const BANK_BRAND_IMAGES = Object.freeze({
  bca: bcaCard,
  bni: bniCard,
  btn: btnCard,
  mandiri: mandiriCard,
  permata: permataCard,
});

export const EWALLET_BRAND_IMAGES = Object.freeze({
  shopeepay: shopeepayCard,
  dana: danaCard,
  gopay: gopayCard,
  ovo: ovoCard,
  linkaja: linkajaCard,
});

export const BANK_BRAND_LOGOS = Object.freeze({
  bca: bcaLogo,
  bni: bniLogo,
  btn: btnLogo,
  mandiri: mandiriLogo,
  permata: permataLogo,
});

export const EWALLET_BRAND_LOGOS = Object.freeze({
  shopeepay: shopeepayLogo,
  dana: danaLogo,
  gopay: gopayLogo,
  ovo: ovoLogo,
  linkaja: linkajaLogo,
});

export const bankBrandImage = (template) => BANK_BRAND_IMAGES[String(template || "generic").toLowerCase()] || null;
export const ewalletBrandImage = (template) => EWALLET_BRAND_IMAGES[String(template || "generic").toLowerCase()] || null;
export const bankBrandLogo = (template) => BANK_BRAND_LOGOS[String(template || "generic").toLowerCase()] || null;
export const ewalletBrandLogo = (template) => EWALLET_BRAND_LOGOS[String(template || "generic").toLowerCase()] || null;


export const accountBrandLogo = (account = {}, templateOverride = "") => {
  if (account.account_type === "bank") return bankBrandLogo(templateOverride || detectBankTemplate(account));
  if (account.account_type === "ewallet") return ewalletBrandLogo(templateOverride || detectEwalletTemplate(account));
  return null;
};
