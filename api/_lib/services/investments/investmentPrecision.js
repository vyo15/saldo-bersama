import { appError } from "../core.js";

// Parse decimal input as text, before any floating point operations. Decimal commas
// are supported for API clients; ambiguous grouping separators are intentionally rejected.
export const decimalHundredths = (value, label, { allowNegative = false, allowZero = false } = {}) => {
  const raw = String(value ?? "").trim().replace(",", ".");
  const pattern = allowNegative ? /^-?\d+(?:\.\d{1,2})?$/ : /^\d+(?:\.\d{1,2})?$/;
  if (!pattern.test(raw)) throw appError("INVALID_DECIMAL", `${label} harus angka dengan maksimal dua digit desimal.`, 400);
  const negative = raw.startsWith("-");
  const digits = negative ? raw.slice(1) : raw;
  const [major, minor = ""] = digits.split(".");
  const amount = BigInt(major) * 100n + BigInt(minor.padEnd(2, "0"));
  const signed = negative ? -amount : amount;
  if ((!allowNegative && signed < 0n) || (!allowZero && signed === 0n) || signed > BigInt(Number.MAX_SAFE_INTEGER) || signed < -BigInt(Number.MAX_SAFE_INTEGER)) {
    throw appError("INVALID_DECIMAL", `${label} di luar rentang aman.`, 400);
  }
  return Number(signed);
};

export const safeRupiahFromCentsAndUnits = (unitHundredths, priceCents, label = "Nilai investasi") => {
  const result = BigInt(unitHundredths) * BigInt(priceCents);
  if (result < 0n) throw appError("INVALID_AMOUNT", `${label} tidak valid.`, 400);
  // 100 subunits/quantity x 100 cents/Rupiah = 10,000.
  const rupiah = (result + 5000n) / 10000n;
  if (rupiah > BigInt(Number.MAX_SAFE_INTEGER)) throw appError("AMOUNT_TOO_LARGE", `${label} terlalu besar.`, 400);
  return Number(rupiah);
};

export const proportionalCost = (totalRupiah, partUnits, totalUnits) => {
  const total = BigInt(Math.round(Number(totalRupiah)));
  const part = BigInt(Math.round(Number(partUnits) * 100));
  const quantity = BigInt(Math.round(Number(totalUnits) * 100));
  return Number(total * part / quantity);
};

export const isMutualFund = (instrument) => String(instrument?.exchange || "").toUpperCase() === "REKSADANA"
  || ["IHAJJ", "CAPFIX"].includes(String(instrument?.ticker || "").toUpperCase());
