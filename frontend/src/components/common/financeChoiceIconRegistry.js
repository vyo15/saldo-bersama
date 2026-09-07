import { ACCOUNT_TYPES } from "../../domain/constants.js";
import {
  AccountIcon,
  BankIcon,
  CashIcon,
  EmergencyFundIcon,
  EwalletIcon,
  InvestmentIcon,
  OtherIcon,
  SavingsIcon,
  SinkingFundIcon,
} from "./FinanceChoiceIcons.jsx";

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

export const accountTypeIcon = (accountType) => ACCOUNT_TYPE_ICONS[accountType] || AccountIcon;
