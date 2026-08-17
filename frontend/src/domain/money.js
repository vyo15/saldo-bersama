const IDR_FORMATTER = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

export const parseRupiah = (value) => {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new TypeError("Nominal harus berupa integer rupiah yang aman.");
    return value;
  }

  const normalized = String(value ?? "").replace(/[^0-9-]/g, "");
  if (!normalized || normalized === "-") throw new TypeError("Nominal wajib diisi.");
  const amount = Number(normalized);
  if (!Number.isSafeInteger(amount)) throw new TypeError("Nominal tidak valid.");
  return amount;
};

export const assertPositiveRupiah = (value, { max = Number.MAX_SAFE_INTEGER } = {}) => {
  const amount = parseRupiah(value);
  if (amount <= 0) throw new RangeError("Nominal harus lebih besar dari nol.");
  if (amount > max) throw new RangeError("Nominal melebihi batas aman.");
  return amount;
};

export const formatRupiah = (value) => IDR_FORMATTER.format(Number(value || 0));

export const formatCompactRupiah = (value) => new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  notation: "compact",
  maximumFractionDigits: 1,
}).format(Number(value || 0));
