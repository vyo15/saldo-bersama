import { FiLayers } from "react-icons/fi";
import { BankIcon, EwalletIcon } from "./FinanceChoiceIcons.jsx";
import { accountTypeIcon } from "./financeChoiceIconRegistry.js";
import { accountBrandLogo, bankBrandImage, ewalletBrandImage } from "../../shared/presentation/accountBrandAssets.js";
import { categoryIcon } from "../../shared/presentation/transaction.js";
import { investmentAssetLogo } from "../../shared/presentation/investmentAssets.js";


export const accountOptionVisual = (account = {}) => {
  const image = accountBrandLogo(account);
  if (image) return { image, imageKind: "brand-logo", visualLabel: "Logo rekening" };
  return { icon: accountTypeIcon(account.account_type) };
};

export const bankTemplateOptionVisual = (template) => {
  const image = bankBrandImage(template);
  return image ? { image, visualLabel: "Template bank" } : { icon: BankIcon };
};

export const ewalletTemplateOptionVisual = (template) => {
  const image = ewalletBrandImage(template);
  return image ? { image, visualLabel: "Provider e-wallet" } : { icon: EwalletIcon };
};

export const categoryOptionVisual = (category = {}, transactionType = "expense") => ({
  icon: categoryIcon(category.icon, category.transaction_type || transactionType),
});

export const memberOptionVisual = (member = {}) => ({
  avatar: {
    ...member,
    photoURL: member.photoURL || member.photoUrl || member.photo_url || member.picture || "",
  },
  keywords: [member.email, member.role].filter(Boolean).join(" "),
});

export const instrumentOptionVisual = (instrument = {}) => {
  const image = investmentAssetLogo(instrument.ticker);
  if (image) return { image, visualLabel: `Logo ${String(instrument.ticker || "saham").toUpperCase()}` };
  return { mark: String(instrument.ticker || instrument.name || "S").trim().slice(0, 4).toUpperCase() };
};

export const allocationOptionVisual = () => ({ icon: FiLayers });
