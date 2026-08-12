export const userRoleLabel = (role) => {
  if (role === "owner") return "Administrator";
  if (role === "member") return "Member";
  return String(role || "Tidak diketahui");
};

export const userOptionLabel = (user = {}) => {
  const name = String(user.name || user.email || "Pengguna").trim();
  const role = userRoleLabel(user.role);
  return `${name} · ${role}${user.is_current ? " · saya" : ""}`;
};
