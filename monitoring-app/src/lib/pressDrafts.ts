/**
 * Skema + validasi + helper SLA untuk workflow press_release_drafts.
 * Meniru pola content_drafts (draf medsos):
 *
 * Tahap 1 (SLA): pending kedaluwarsa 7 hari sejak submittedAt -> expired (lunak).
 * Tahap 2 (retensi): approved/rejected/published/expired dihapus permanen
 *   via Firestore TTL pada field retentionExpiresAt (+90 hari).
 *
 * Field: judul (title), isi (body), link media gambar/video (mediaUrl),
 * catatan opsional (notes), plus panduan 5W+1H opsional (what, who, when,
 * where, why, how). Semua user boleh mengajukan; review oleh admin.
 *
 * Catatan storage: mediaUrl LEGACY (tautan luar, hanya dibaca untuk data
 * lama). Form baru memakai file upload Storage internal (mediaPath/mediaName,
 * upload menyusul; untuk kini nama file dicatat).
 *
 * File ini murni (tanpa dependensi node) agar bisa diimpor API maupun client.
 */

export type PressDraftStatus =
  | "draft"
  | "pending"
  | "approved"
  | "rejected"
  | "published"
  | "expired";

export const PRESS_DRAFT_STATUSES: PressDraftStatus[] = [
  "draft",
  "pending",
  "approved",
  "rejected",
  "published",
  "expired",
];

export const PRESS_SLA_DAYS = 7;
export const PRESS_RETENTION_DAYS = 90;

export interface PressDraftDoc {
  id?: string;
  title: string;
  body: string;
  // LEGACY (tautan luar): hanya dibaca untuk data lama.
  mediaUrl?: string;
  // Storage internal proyek (upload menyusul; untuk kini nama file dicatat).
  mediaPath?: string;
  mediaName?: string;
  notes?: string;
  // Panduan 5W+1H (semua opsional, untuk membantu penulisan isi).
  what?: string;
  who?: string;
  when?: string;
  where?: string;
  why?: string;
  how?: string;
  status: PressDraftStatus;
  authorUid: string;
  authorEmail?: string;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string | null;
  slaExpiresAt?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  publishedAt?: string | null;
  retentionExpiresAt?: string | null;
  resubmitsFrom?: string | null;
}

export function nowISO(now = new Date()): string {
  return now.toISOString();
}

export function addDaysISO(fromISO: string, days: number): string {
  const d = new Date(fromISO);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function isValidUrlOrEmpty(v: unknown): boolean {
  if (v === undefined || v === null || v === "") return true;
  if (typeof v !== "string") return false;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Status efektif dengan lazy-expiry: pending yang lewat SLA dianggap expired. */
export function pressEffectiveStatus(
  doc: Pick<PressDraftDoc, "status" | "slaExpiresAt">,
  now = new Date()
): PressDraftStatus {
  if (
    doc.status === "pending" &&
    doc.slaExpiresAt &&
    now.getTime() >= new Date(doc.slaExpiresAt).getTime()
  ) {
    return "expired";
  }
  return doc.status;
}

/** Sisa hari SLA (bulat ke bawah, bisa negatif). null bila tidak berlaku. */
export function pressDaysLeft(
  doc: Pick<PressDraftDoc, "status" | "slaExpiresAt">,
  now = new Date()
): number | null {
  if (doc.status !== "pending" || !doc.slaExpiresAt) return null;
  const ms = new Date(doc.slaExpiresAt).getTime() - now.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

/** Validasi field saat create/update draf press release (owner). */
export function validatePressDraftFields(input: {
  title?: unknown;
  body?: unknown;
  mediaUrl?: unknown;
  mediaPath?: unknown;
  mediaName?: unknown;
  notes?: unknown;
  what?: unknown;
  who?: unknown;
  when?: unknown;
  where?: unknown;
  why?: unknown;
  how?: unknown;
}): ValidationResult {
  const title = (input.title as string) ?? "";
  const body = (input.body as string) ?? "";

  if (!title || typeof title !== "string" || !title.trim())
    return { ok: false, error: "title wajib diisi" };
  if (title.trim().length > 200)
    return { ok: false, error: "title maksimal 200 karakter" };
  if (!body || typeof body !== "string" || !body.trim())
    return { ok: false, error: "body (isi press release) wajib diisi" };
  if (body.trim().length > 20000)
    return { ok: false, error: "body maksimal 20000 karakter" };
  if (!isValidUrlOrEmpty(input.mediaUrl))
    return { ok: false, error: "mediaUrl harus URL http(s) yang valid" };
  for (const [key, max] of [["mediaPath", 500], ["mediaName", 120]] as const) {
    const v = (input as Record<string, unknown>)[key];
    if (v !== undefined && v !== null && v !== "") {
      if (typeof v !== "string" || !v.trim())
        return { ok: false, error: `${key} harus berupa teks` };
      if (v.trim().length > max)
        return { ok: false, error: `${key} maksimal ${max} karakter` };
    }
  }
  if (
    input.notes !== undefined &&
    input.notes !== null &&
    typeof input.notes === "string" &&
    input.notes.length > 2000
  )
    return { ok: false, error: "notes maksimal 2000 karakter" };
  const wFields = ["what", "who", "when", "where", "why", "how"] as const;
  for (const f of wFields) {
    const v = (input as Record<string, unknown>)[f];
    if (v !== undefined && v !== null && typeof v === "string" && v.length > 2000)
      return { ok: false, error: `${f} maksimal 2000 karakter` };
    if (v !== undefined && v !== null && typeof v !== "string")
      return { ok: false, error: `${f} harus berupa teks` };
  }
  return { ok: true };
}

/** Owner boleh edit hanya saat draft/rejected (dan belum expired). */
export function canPressOwnerEdit(
  doc: Pick<PressDraftDoc, "status" | "slaExpiresAt">,
  now = new Date()
): boolean {
  const eff = pressEffectiveStatus(doc, now);
  return eff === "draft" || eff === "rejected";
}

/** Admin boleh review hanya pending yang belum lewat SLA. */
export function canPressAdminReview(
  doc: Pick<PressDraftDoc, "status" | "slaExpiresAt" | "authorUid">,
  adminUid: string,
  now = new Date()
): ValidationResult {
  if (pressEffectiveStatus(doc, now) !== "pending")
    return {
      ok: false,
      error:
        doc.status === "pending"
          ? "Draft expired (lewat 7 hari), tidak bisa direview"
          : `Hanya draft pending yang bisa direview (status: ${doc.status})`,
    };
  if (doc.authorUid === adminUid)
    return { ok: false, error: "Admin tidak boleh memvalidasi karya sendiri" };
  return { ok: true };
}

/** Bentuk dokumen baru saat owner create (status draft, tanpa SLA). */
export function buildNewPressDraft(input: {
  title: string;
  body: string;
  mediaUrl?: string;
  mediaPath?: string;
  mediaName?: string;
  notes?: string;
  what?: string;
  who?: string;
  when?: string;
  where?: string;
  why?: string;
  how?: string;
  authorUid: string;
  authorEmail?: string;
  now?: Date;
}): PressDraftDoc {
  const t = nowISO(input.now);
  return {
    title: input.title.trim(),
    body: input.body.trim(),
    ...(input.mediaUrl?.trim() ? { mediaUrl: input.mediaUrl.trim() } : {}),
    ...(input.mediaPath?.trim() ? { mediaPath: input.mediaPath.trim() } : {}),
    ...(input.mediaName?.trim() ? { mediaName: input.mediaName.trim() } : {}),
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
    ...(input.what?.trim() ? { what: input.what.trim() } : {}),
    ...(input.who?.trim() ? { who: input.who.trim() } : {}),
    ...(input.when?.trim() ? { when: input.when.trim() } : {}),
    ...(input.where?.trim() ? { where: input.where.trim() } : {}),
    ...(input.why?.trim() ? { why: input.why.trim() } : {}),
    ...(input.how?.trim() ? { how: input.how.trim() } : {}),
    status: "draft",
    authorUid: input.authorUid,
    ...(input.authorEmail ? { authorEmail: input.authorEmail } : {}),
    createdAt: t,
    updatedAt: t,
    submittedAt: null,
    slaExpiresAt: null,
    retentionExpiresAt: null,
  };
}
