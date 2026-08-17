const FIREBASE_AUTH_TIMEOUT_MS = 10_000;

export const verifyFirebaseIdToken = async (idToken) => {
  const apiKey = process.env.VITE_FIREBASE_API_KEY;
  if (!apiKey) throw new Error("VITE_FIREBASE_API_KEY belum diatur.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FIREBASE_AUTH_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
      signal: controller.signal,
    });
  } catch {
    throw Object.assign(new Error("Firebase Authentication tidak dapat dihubungi."), { status: 502, code: "FIREBASE_AUTH_NETWORK_FAILED" });
  } finally {
    clearTimeout(timer);
  }
  const body = await response.json().catch(() => ({}));
  const user = body.users?.[0];
  if (!response.ok || !user) throw Object.assign(new Error("Firebase ID token tidak valid atau sudah kedaluwarsa."), { status: 401, code: "INVALID_TOKEN" });
  if (!user.emailVerified) throw Object.assign(new Error("Email Google belum terverifikasi."), { status: 403, code: "EMAIL_NOT_VERIFIED" });
  return { uid: user.localId, email: user.email, name: user.displayName || user.email, photoURL: user.photoUrl || "" };
};
