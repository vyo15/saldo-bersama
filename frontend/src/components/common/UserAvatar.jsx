import { useEffect, useMemo, useState } from "react";

const initialsFor = (user) => {
  const source = String(user?.name || user?.email || "SB").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length > 1) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
};

const UserAvatar = ({ user, className = "", size = "md" }) => {
  const [imageFailed, setImageFailed] = useState(false);
  const initials = useMemo(() => initialsFor(user), [user]);
  const photoUrl = String(user?.photoURL || user?.photoUrl || user?.picture || "").trim();
  const label = user?.name || user?.email || "Pengguna";

  useEffect(() => setImageFailed(false), [photoUrl]);

  return (
    <span className={`user-avatar user-avatar--${size}${className ? ` ${className}` : ""}`} aria-label={label} title={label}>
      {photoUrl && !imageFailed ? (
        <img src={photoUrl} width="44" height="44" alt={`Foto profil ${label}`} referrerPolicy="no-referrer" decoding="async" onError={() => setImageFailed(true)} />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}
    </span>
  );
};

export default UserAvatar;
