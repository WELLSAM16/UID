/**
 * Penandatangan token untuk file-service di PC (D:\media-store\server.mjs).
 *
 * Format WAJIB identik dengan token.mjs di PC:
 *   base64url(JSON payload) + "." + base64url(HMAC-SHA256(secret, body))
 *
 * Server hanya perlu memverifikasi tanda tangan — tidak perlu tahu user/peran,
 * karena otorisasi sudah dilakukan di API ini sebelum token dibuat.
 */
import crypto from "node:crypto";
import {
  MEDIA_TOKEN_TTL_SEC,
  type MediaTokenClaims,
} from "@/lib/mediaShared";

export interface MediaConfig {
  secret: string;
  baseUrl: string;
  ready: boolean;
}

/** Baca konfigurasi dari env. `ready` false = fitur upload dimatikan. */
export function mediaConfig(): MediaConfig {
  const secret = process.env.MEDIA_SECRET || "";
  const baseUrl = (process.env.MEDIA_BASE_URL || "").replace(/\/+$/, "");
  return {
    secret,
    baseUrl,
    ready: secret.length >= 32 && /^https:\/\/|^http:\/\//.test(baseUrl),
  };
}

/** Tanda tangani claims menjadi token siap tempel di URL. */
export function signMediaToken(
  claims: Omit<MediaTokenClaims, "e">,
  ttlSec = MEDIA_TOKEN_TTL_SEC
): string {
  const { secret } = mediaConfig();
  if (!secret) throw new Error("MEDIA_SECRET belum diset");
  const payload: MediaTokenClaims = {
    ...claims,
    e: Math.floor(Date.now() / 1000) + ttlSec,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/** URL lengkap ke file-service PC untuk satu operasi. */
export function mediaTokenUrl(
  claims: Omit<MediaTokenClaims, "e">,
  ttlSec = MEDIA_TOKEN_TTL_SEC
): { url: string; expiresAt: string } {
  const { baseUrl, ready } = mediaConfig();
  if (!ready) throw new Error("MEDIA_BASE_URL / MEDIA_SECRET belum diset");
  const token = signMediaToken(claims, ttlSec);
  return {
    url: `${baseUrl}/o/${token}`,
    expiresAt: new Date((Math.floor(Date.now() / 1000) + ttlSec) * 1000).toISOString(),
  };
}
