export const userRoleLabel = (role) => {
  if (role === "owner") return "Pengelola Keluarga";
  if (role === "member") return "Anggota Keluarga";
  return String(role || "Tidak diketahui");
};

