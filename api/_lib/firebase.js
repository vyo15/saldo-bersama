export const verifyFirebaseIdToken = async (idToken) => {
  const apiKey = process.env.FIREBASE_WEB_API_KEY;
  if (!apiKey) throw new Error("FIREBASE_WEB_API_KEY belum diatur.");
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  const body = await response.json().catch(() => ({}));
  const user = body.users?.[0];
  if (!response.ok || !user) throw Object.assign(new Error("Firebase ID token tidak valid atau sudah kedaluwarsa."), { status: 401, code: "INVALID_TOKEN" });
  if (!user.emailVerified) throw Object.assign(new Error("Email Google belum terverifikasi."), { status: 403, code: "EMAIL_NOT_VERIFIED" });
  return { uid: user.localId, email: user.email, name: user.displayName || user.email, photoURL: user.photoUrl || "" };
};
