export const decodeBase64Url = (value) => {
  const candidate = String(value || "").trim();
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(candidate)) return null;
  try {
    return Buffer.from(candidate.replace(/=+$/, ""), "base64url");
  } catch {
    return null;
  }
};
