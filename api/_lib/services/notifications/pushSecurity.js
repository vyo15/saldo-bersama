import { decodeBase64Url } from "../../encoding.js";
import { WEB_PUSH_ENV_KEYS, validateVapidConfiguration } from "../../webPushConfiguration.js";
import dns from "node:dns";
import https from "node:https";
import net from "node:net";
import webpush from "web-push";
import { appError } from "../core.js";

// Web Push endpoints are untrusted network destinations. DNS results are validated
// at connection time so hostname validation alone cannot be bypassed via rebinding.
const BLOCKED_ENDPOINT_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home", ".test", ".example", ".invalid", ".onion"];
export const PUSH_REQUEST_TIMEOUT_MS = 8_000;

const PUSH_ADDRESS_BLOCKLIST = new net.BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
]) PUSH_ADDRESS_BLOCKLIST.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of [
  ["::", 128], ["::1", 128], ["64:ff9b:1::", 48], ["100::", 64],
  ["2001::", 32], ["2001:2::", 48], ["2001:10::", 28], ["2001:20::", 28],
  ["2001:db8::", 32], ["2002::", 16], ["fc00::", 7], ["fe80::", 10],
  ["fec0::", 10], ["ff00::", 8],
]) PUSH_ADDRESS_BLOCKLIST.addSubnet(network, prefix, "ipv6");

const parseIpv6Hextets = (value) => {
  let address = String(value || "").trim().toLowerCase();
  const dottedTail = address.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dottedTail) {
    const octets = dottedTail[2].split(".").map(Number);
    if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return null;
    address = `${dottedTail[1]}${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }
  const halves = address.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
  const parts = [...left, ...Array(Math.max(0, missing)).fill("0"), ...right];
  if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/i.test(part))) return null;
  return parts.map((part) => Number.parseInt(part, 16));
};

const ipv4FromHextets = (high, low) => `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;

export const isPublicPushAddress = (value) => {
  const address = String(value || "").trim().toLowerCase();
  const family = net.isIP(address);
  if (!family) return false;
  if (family === 6) {
    const hextets = parseIpv6Hextets(address);
    if (!hextets) return false;
    const ipv4Mapped = hextets.slice(0, 5).every((part) => part === 0) && hextets[5] === 0xffff;
    if (ipv4Mapped) return isPublicPushAddress(ipv4FromHextets(hextets[6], hextets[7]));
    const wellKnownNat64 = hextets[0] === 0x64 && hextets[1] === 0xff9b && hextets.slice(2, 6).every((part) => part === 0);
    if (wellKnownNat64) return isPublicPushAddress(ipv4FromHextets(hextets[6], hextets[7]));
  }
  return !PUSH_ADDRESS_BLOCKLIST.check(address, family === 4 ? "ipv4" : "ipv6");
};

export const createSafePushLookup = (lookup = dns.lookup) => (hostname, options, callback) => {
  const normalizedOptions = typeof options === "object" && options !== null ? options : {};
  const requestedFamily = typeof options === "number" ? Number(options || 0) : Number(normalizedOptions.family || 0);
  const hints = Number(normalizedOptions.hints || 0);
  const returnAll = normalizedOptions.all === true;
  lookup(hostname, { all: true, verbatim: true, family: requestedFamily, hints }, (error, addresses) => {
    if (error) return callback(error);
    const candidates = Array.isArray(addresses) ? addresses : [];
    if (!candidates.length || candidates.some((entry) => !isPublicPushAddress(entry.address))) {
      return callback(Object.assign(new Error("Alamat push service tidak diizinkan."), { code: "PUSH_ENDPOINT_PRIVATE_ADDRESS" }));
    }
    if (returnAll) return callback(null, candidates);
    const selected = candidates.find((entry) => !requestedFamily || entry.family === requestedFamily) || candidates[0];
    return callback(null, selected.address, selected.family);
  });
};

export const safePushLookup = createSafePushLookup();
const PUSH_HTTPS_AGENT = new https.Agent({ keepAlive: true, maxSockets: 10, lookup: safePushLookup });
export const webPushRequestOptions = (ttlSeconds) => ({
  TTL: ttlSeconds,
  timeout: PUSH_REQUEST_TIMEOUT_MS,
  agent: PUSH_HTTPS_AGENT,
});

export const webPushConfigurationStatus = (environment = process.env) => {
  const values = Object.fromEntries(WEB_PUSH_ENV_KEYS.map((key) => [key, String(environment[key] || "").trim()]));
  const status = validateVapidConfiguration(values);
  if (!status.enabled) return { configured: false, ready: false, code: "DISABLED", missing: [...WEB_PUSH_ENV_KEYS], invalid: [] };
  if (!status.complete) return { configured: true, ready: false, code: "INCOMPLETE", missing: status.missing, invalid: [] };
  if (!status.valid) return { configured: true, ready: false, code: "INVALID", missing: [], invalid: status.invalid };
  return { configured: true, ready: true, code: "READY", missing: [], invalid: [] };
};

export const configureWebPushClient = (client = webpush, environment = process.env) => {
  const status = webPushConfigurationStatus(environment);
  if (!status.ready) {
    throw appError(
      "WEB_PUSH_NOT_READY",
      status.configured ? "Konfigurasi Web Push belum valid." : "Web Push belum dikonfigurasi pada server.",
      503,
      { configurationCode: status.code },
    );
  }
  try {
    client.setVapidDetails(
      String(environment.VAPID_SUBJECT).trim(),
      String(environment.VITE_VAPID_PUBLIC_KEY).trim(),
      String(environment.VAPID_PRIVATE_KEY).trim(),
    );
  } catch {
    throw appError("WEB_PUSH_NOT_READY", "Konfigurasi Web Push belum valid.", 503, { configurationCode: "CLIENT_REJECTED" });
  }
  return status;
};

export const normalizePushEndpoint = (value) => {
  const candidate = String(value || "").trim();
  if (!candidate || candidate.length > 2_048) throw appError("INVALID_SUBSCRIPTION", "Push subscription tidak valid.", 400);
  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw appError("INVALID_SUBSCRIPTION", "Push subscription tidak valid.", 400);
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const blockedHostname = !hostname
    || hostname.length > 253
    || hostname === "localhost"
    || !hostname.includes(".")
    || BLOCKED_ENDPOINT_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
    || net.isIP(hostname) !== 0;
  if (url.protocol !== "https:" || (url.port && url.port !== "443") || url.username || url.password || url.hash || blockedHostname) {
    throw appError("INVALID_SUBSCRIPTION", "Push subscription tidak valid.", 400);
  }
  return url.href;
};

export const normalizeSubscriptionKeys = (keys) => {
  const p256dh = String(keys?.p256dh || "").trim();
  const auth = String(keys?.auth || "").trim();
  const p256dhBuffer = decodeBase64Url(p256dh);
  const authBuffer = decodeBase64Url(auth);
  if (!p256dhBuffer || p256dhBuffer.length !== 65 || p256dhBuffer[0] !== 4 || !authBuffer || authBuffer.length !== 16) {
    throw appError("INVALID_SUBSCRIPTION", "Push subscription tidak valid.", 400);
  }
  return { p256dh: p256dh.replace(/=+$/, ""), auth: auth.replace(/=+$/, "") };
};

export const safeNotificationTargetPath = (value = "/") => {
  const candidate = String(value || "/").trim();
  if (candidate.length > 200 || !/^\/(?!\/)[A-Za-z0-9/_-]*$/.test(candidate) || candidate.includes("\\")) return "/";
  return candidate;
};
