/**
 * Editing adapter for investment-only two-decimal values.
 * UI uses Indonesian separators (1.234,50); form/API state remains the
 * canonical dot-decimal string (1234.50). No rounding happens on input.
 * Rupiah ledger values continue using MoneyInput / integer validators.
 */
export const formatInvestmentDecimal = (value) => {
  if (value == null || value === "") return "";
  const raw = String(value);
  if (!/^\d+(?:\.\d{0,2})?$/.test(raw)) return raw;
  const [integer, fraction] = raw.split(".");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return fraction === undefined ? grouped : `${grouped},${fraction}`;
};

/** Return null for invalid input rather than silently changing its amount. */
export const parseInvestmentDecimal = (text) => {
  const cleaned = String(text ?? "").replace(/\s|\u00a0/g, "").replace(/^Rp\.?/i, "");
  if (!cleaned) return "";
  // A dot is a thousands separator in this Indonesian-locale editor.
  if (!/^[\d.,]+$/.test(cleaned) || (cleaned.match(/,/g) || []).length > 1) return null;
  const [integerPart, fraction] = cleaned.split(",");
  if (fraction !== undefined && fraction.length > 2) return null;
  const integer = integerPart.replaceAll(".", "");
  if (!/^\d*$/.test(integer) || (integer === "" && fraction === undefined)) return null;
  const normal = integer.replace(/^0+(?=\d)/, "") || "0";
  return fraction === undefined ? normal : `${normal}.${fraction}`;
};

/** Preserve insertion/deletion position despite addition of group separators. */
export const investmentDecimalCaret = (rawBeforeCaret, formatted) => {
  const significant = (String(rawBeforeCaret).match(/[\d,]/g) || []).length;
  if (!significant) return 0;
  let count = 0;
  for (let index = 0; index < formatted.length; index += 1) {
    if (/[\d,]/.test(formatted[index])) count += 1;
    if (count >= significant) return index + 1;
  }
  return formatted.length;
};
