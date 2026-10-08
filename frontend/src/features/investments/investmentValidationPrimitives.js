const finiteInteger = (value) => {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
};

export const positiveIntegerError = (value, label) => {
  const number = finiteInteger(value);
  if (number == null || number <= 0) return `${label} harus berupa bilangan bulat lebih dari 0.`;
  return "";
};

export const positiveDecimalError = (value, label, maximumFractionDigits = 2) => {
  const raw = String(value ?? "").trim();
  const number = Number(raw);
  if (!raw || !Number.isFinite(number) || number <= 0) return `${label} harus lebih dari 0.`;
  const decimalPart = raw.includes(".") ? raw.split(".").at(-1) : "";
  if (decimalPart.length > maximumFractionDigits) return `${label} maksimal ${maximumFractionDigits} angka di belakang desimal.`;
  return "";
};

export const nonNegativeIntegerError = (value, label) => {
  const number = finiteInteger(value);
  if (number == null || number < 0) return `${label} harus berupa bilangan bulat 0 atau lebih.`;
  return "";
};

export const signedIntegerError = (value, label) => {
  if (finiteInteger(value) == null) return `${label} harus berupa bilangan bulat.`;
  return "";
};

export const todayJakarta = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
