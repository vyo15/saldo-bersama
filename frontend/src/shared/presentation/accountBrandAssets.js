import bcaCard from "../../assets/bank-cards/bca.webp";
import bniCard from "../../assets/bank-cards/bni.webp";
import btnCard from "../../assets/bank-cards/btn.webp";
import mandiriCard from "../../assets/bank-cards/mandiri.webp";
import permataCard from "../../assets/bank-cards/permata.webp";
import danaCard from "../../assets/ewallet-cards/dana.webp";
import gopayCard from "../../assets/ewallet-cards/gopay.webp";
import linkajaCard from "../../assets/ewallet-cards/linkaja.webp";
import ovoCard from "../../assets/ewallet-cards/ovo.webp";
import shopeepayCard from "../../assets/ewallet-cards/shopeepay.webp";
import { detectBankTemplate, detectEwalletTemplate } from "./account.js";

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

export const bankBrandImage = (template) => BANK_BRAND_IMAGES[String(template || "generic").toLowerCase()] || null;
export const ewalletBrandImage = (template) => EWALLET_BRAND_IMAGES[String(template || "generic").toLowerCase()] || null;

export const accountBrandImage = (account = {}, templateOverride = "") => {
  if (account.account_type === "bank") return bankBrandImage(templateOverride || detectBankTemplate(account));
  if (account.account_type === "ewallet") return ewalletBrandImage(templateOverride || detectEwalletTemplate(account));
  return null;
};
