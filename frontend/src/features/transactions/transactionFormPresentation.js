import { BankTransferIcon, CashIcon, DebitCardIcon, EwalletIcon, MoneyInIcon, MoneyOutIcon, RefundIcon, TransferIcon } from "../../components/common/FinanceChoiceIcons.jsx";
import { TRANSACTION_TYPES } from "../../domain/constants.js";

export const QUICK_EXPENSE_AMOUNTS = Object.freeze([20_000, 50_000, 100_000, 200_000, 500_000]);

export const quickAmountLabel = (amount) => `${Math.round(Number(amount || 0) / 1_000)} rb`;

export const TRANSACTION_TYPE_OPTIONS = Object.freeze([
  { value: TRANSACTION_TYPES.EXPENSE, label: "Pengeluaran", icon: MoneyOutIcon, tone: "expense" },
  { value: TRANSACTION_TYPES.INCOME, label: "Pemasukan", icon: MoneyInIcon, tone: "income" },
  { value: TRANSACTION_TYPES.TRANSFER, label: "Transfer", icon: TransferIcon },
  { value: TRANSACTION_TYPES.REFUND, label: "Refund", icon: RefundIcon },
]);

export const PAYMENT_METHOD_OPTIONS = Object.freeze([
  { value: "", label: "Belum dipilih" },
  { value: "transfer", label: "Transfer", icon: BankTransferIcon },
  { value: "cash", label: "Tunai", icon: CashIcon },
  { value: "debit", label: "Kartu debit", icon: DebitCardIcon },
  { value: "ewallet", label: "E-wallet", icon: EwalletIcon },
]);

export const paymentMethodLabel = (value) => {
  if (value === "autodebit") return "Auto-debit (data lama)";
  return PAYMENT_METHOD_OPTIONS.find((item) => item.value === value)?.label || "Belum dipilih";
};
