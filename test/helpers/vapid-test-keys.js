import crypto from "node:crypto";

export const p256PrivateKeyBase64Url = (ecdh) => {
  const privateKey = ecdh.getPrivateKey();
  if (privateKey.length > 32) throw new Error("Private key P-256 test melebihi 32 byte.");
  return Buffer.concat([Buffer.alloc(32 - privateKey.length), privateKey]).toString("base64url");
};

export const createVapidTestKeyPair = () => {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    ecdh,
    publicKey: ecdh.getPublicKey().toString("base64url"),
    privateKey: p256PrivateKeyBase64Url(ecdh),
  };
};

export const createVapidTestEnvironment = (subject = "mailto:owner@example.com") => {
  const pair = createVapidTestKeyPair();
  return {
    VITE_VAPID_PUBLIC_KEY: pair.publicKey,
    VAPID_PRIVATE_KEY: pair.privateKey,
    VAPID_SUBJECT: subject,
  };
};
