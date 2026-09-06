import { FiLayers } from "react-icons/fi";
import {
  BankIcon,
  CashIcon,
  EmergencyFundIcon,
  EwalletIcon,
  InvestmentIcon,
  OtherIcon,
  SavingsIcon,
  SinkingFundIcon,
} from "./FinanceChoiceIcons.jsx";
import { ACCOUNT_TYPES } from "../../domain/constants.js";
import { accountBrandImage, bankBrandImage, ewalletBrandImage } from "../../shared/presentation/accountBrandAssets.js";
import { categoryIcon } from "../../shared/presentation/transaction.js";
import { investmentStockLogo } from "../../shared/presentation/investmentStocks.js";

const ACCOUNT_TYPE_ICONS = Object.freeze({
  [ACCOUNT_TYPES.BANK]: BankIcon,
  [ACCOUNT_TYPES.CASH]: CashIcon,
  [ACCOUNT_TYPES.EWALLET]: EwalletIcon,
  [ACCOUNT_TYPES.SAVINGS]: SavingsIcon,
  [ACCOUNT_TYPES.EMERGENCY_FUND]: EmergencyFundIcon,
  [ACCOUNT_TYPES.SINKING_FUND]: SinkingFundIcon,
  [ACCOUNT_TYPES.INVESTMENT]: InvestmentIcon,
  [ACCOUNT_TYPES.OTHER]: OtherIcon,
});

export const accountOptionVisual = (account = {}) => {
  const image = accountBrandImage(account);
  if (image) return { image, visualLabel: "Identitas rekening" };
  return { icon: ACCOUNT_TYPE_ICONS[account.account_type] || OtherIcon };
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
  const image = investmentStockLogo(instrument.ticker);
  if (image) return { image, visualLabel: `Logo ${String(instrument.ticker || "saham").toUpperCase()}` };
  return { mark: String(instrument.ticker || instrument.name || "S").trim().slice(0, 4).toUpperCase() };
};

export const allocationOptionVisual = () => ({ icon: FiLayers });
