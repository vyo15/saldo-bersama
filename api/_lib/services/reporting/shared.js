import crypto from "node:crypto";

export const hash = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");

export const dateBefore = (date) => {
  const parsed = new Date(`${date}T00:00:00+07:00`);
  parsed.setUTCDate(parsed.getUTCDate() - 1);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(parsed);
};
