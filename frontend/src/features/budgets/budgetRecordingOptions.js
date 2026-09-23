import { FiCalendar, FiCheckCircle, FiShuffle } from "react-icons/fi";

export const BUDGET_RECORDING_OPTIONS = Object.freeze([
  {
    value: "fixed_once",
    label: "Sekali bayar",
    meta: "Dipakai satu kali sampai kebutuhan selesai.",
    icon: FiCheckCircle,
  },
  {
    value: "flexible",
    label: "Bisa dipakai beberapa kali",
    meta: "Cocok untuk kebutuhan fleksibel.",
    icon: FiShuffle,
  },
  {
    value: "recurring",
    label: "Rutin",
    meta: "Digunakan berkala atau berulang.",
    icon: FiCalendar,
  },
]);

export const budgetRecordingLabel = (value) => BUDGET_RECORDING_OPTIONS.find((option) => option.value === value)?.label || "";
