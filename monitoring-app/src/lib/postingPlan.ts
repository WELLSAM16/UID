/**
 * Rencana postingan UP (menu Medsos).
 *
 * UID menyusun kalender konten + mengunggah media; semua unit hanya melihat
 * kalender, membuka/mengunduh media, dan menyalin caption.
 */

export const POSTING_PLAN_COLLECTION = "posting_plans";
export const POSTING_PLAN_PREFIX = "posting-plans";
export const POSTING_PLAN_MAX_MEDIA = 10;
export const POSTING_PLAN_MAX_CAPTION = 10000;
export const POSTING_PLAN_MAX_JUDUL = 200;

export interface PostingPlan {
  id: string;
  tanggal: string; // YYYY-MM-DD
  judul: string;
  caption: string;
  mediaPaths: string[];
  mediaNames: string[];
  createdBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

function isDateOnly(v: unknown): boolean {
  const s = String(v || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function isPlanStoragePath(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const p = v.trim();
  if (!p || p.length > 500) return false;
  if (p.includes("..") || p.includes("\\") || p.includes("\0")) return false;
  if (!p.startsWith(`${POSTING_PLAN_PREFIX}/`)) return false;
  return /^[A-Za-z0-9][A-Za-z0-9._\-/]*$/.test(p);
}

/** Validasi body create/update rencana postingan. */
export function validatePostingPlan(input: {
  tanggal?: unknown;
  judul?: unknown;
  caption?: unknown;
  mediaPaths?: unknown;
  mediaNames?: unknown;
}): { ok: true } | { ok: false; error: string } {
  if (!isDateOnly(input.tanggal)) {
    return { ok: false, error: "tanggal wajib diisi (YYYY-MM-DD)" };
  }
  const judul = String(input.judul ?? "").trim();
  if (!judul) return { ok: false, error: "judul wajib diisi" };
  if (judul.length > POSTING_PLAN_MAX_JUDUL) {
    return { ok: false, error: `judul maksimal ${POSTING_PLAN_MAX_JUDUL} karakter` };
  }
  const caption = String(input.caption ?? "");
  if (caption.length > POSTING_PLAN_MAX_CAPTION) {
    return { ok: false, error: `caption maksimal ${POSTING_PLAN_MAX_CAPTION} karakter` };
  }

  if (input.mediaPaths !== undefined) {
    if (!Array.isArray(input.mediaPaths)) {
      return { ok: false, error: "mediaPaths harus array" };
    }
    if (input.mediaPaths.length > POSTING_PLAN_MAX_MEDIA) {
      return { ok: false, error: `maksimal ${POSTING_PLAN_MAX_MEDIA} media per rencana` };
    }
    if (!input.mediaPaths.every(isPlanStoragePath)) {
      return { ok: false, error: "mediaPaths berisi path tidak valid" };
    }
  }

  if (input.mediaNames !== undefined) {
    if (!Array.isArray(input.mediaNames)) {
      return { ok: false, error: "mediaNames harus array" };
    }
    for (const name of input.mediaNames) {
      if (typeof name !== "string" || name.length > 120) {
        return { ok: false, error: "mediaNames maksimal 120 karakter per item" };
      }
    }
  }

  return { ok: true };
}

/** Kunci "YYYY-MM" untuk filter kalender. */
export function planMonthKey(tanggal: string): string {
  return String(tanggal || "").slice(0, 7);
}
