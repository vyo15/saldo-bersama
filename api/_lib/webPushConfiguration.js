import crypto from "node:crypto";
import net from "node:net";
import { decodeBase64Url } from "./encoding.js";

export const WEB_PUSH_ENV_KEYS = Object.freeze([
  "VITE_VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
]);

const BLOCKED_VAPID_SUBJECT_SUFFIXES = Object.freeze([
  ".localhost", ".local", ".internal", ".lan", ".home", ".test", ".example", ".invalid", ".onion",
]);

const present = (values, key) => Boolean(String(values[key] ?? "").trim());

const validVapidSubject = (value) => {
  const subject = String(value || "").trim();
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(subject)) return true;
  try {
    const url = new URL(subject);
    const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    const publicHostname = hostname
      && hostname !== "localhost"
      && hostname.includes(".")
      && net.isIP(hostname) === 0
      && !BLOCKED_VAPID_SUBJECT_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
    return url.protocol === "https:" && publicHostname && !url.username && !url.password && !url.hash;
  } catch {
    return false;
  }
};

export const validateVapidConfiguration = (values = {}) => {
  const presentKeys = WEB_PUSH_ENV_KEYS.filter((key) => present(values, key));
  const missing = WEB_PUSH_ENV_KEYS.filter((key) => !present(values, key));
  const enabled = presentKeys.length > 0;
  const complete = presentKeys.length === WEB_PUSH_ENV_KEYS.length;
  if (!enabled || !complete) {
    return { enabled, complete, present: presentKeys, missing, valid: !enabled, invalid: [] };
  }

  const publicKey = decodeBase64Url(values.VITE_VAPID_PUBLIC_KEY);
  const privateKey = decodeBase64Url(values.VAPID_PRIVATE_KEY);
  const invalid = [];
  const publicKeyValid = Boolean(publicKey && publicKey.length === 65 && publicKey[0] === 4);
  const privateKeyValid = Boolean(privateKey && privateKey.length === 32);
  if (!publicKeyValid) invalid.push("VITE_VAPID_PUBLIC_KEY");
  if (!privateKeyValid) invalid.push("VAPID_PRIVATE_KEY");

  if (publicKeyValid && privateKeyValid) {
    try {
      const ecdh = crypto.createECDH("prime256v1");
      ecdh.setPrivateKey(privateKey);
      if (!crypto.timingSafeEqual(ecdh.getPublicKey(), publicKey)) invalid.push("VAPID_KEY_PAIR");
    } catch {
      invalid.push("VAPID_KEY_PAIR");
    }
  }
  if (!validVapidSubject(values.VAPID_SUBJECT)) invalid.push("VAPID_SUBJECT");

  return {
    enabled,
    complete,
    present: presentKeys,
    missing,
    valid: invalid.length === 0,
    invalid: [...new Set(invalid)],
  };
};
