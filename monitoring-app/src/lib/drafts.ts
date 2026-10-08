/**
 * Skema + validasi + helper SLA untuk workflow content_drafts (2 tahap).
 *
 * Tahap 1 (SLA): pending kedaluwarsa 7 hari sejak submittedAt -> expired (lunak, terkunci).
 * Tahap 2 (retensi): approved/rejected/published/expired dihapus permanen
 *   via Firestore TTL pada field retentionExpiresAt (+90 hari).
 *
 * File ini murni (tanpa dependensi node) agar bisa diimpor API route maupun client.
 */

export type DraftStatus =
  | "draft"
  | "pending"
  | "approved"
  | "rejected"
  | "published"
  | "expired";

export const DRAFT_STATUSES: DraftStatus[] = [
  "draft",
  "pending",
  "approved",
  "rejected",
  "published",
  "expired",
];

export const SLA_DAYS = 7;
export const RETENTION_DAYS = 90;

export interface DraftDoc {
  id?: string;
  title: string;
  caption: string;
  accountTarget: string;
  // LEGACY (tautan luar Drive): hanya dibaca untuk data lama. Form baru
  // tidak lagi menerima link — pakai file upload Storage internal di bawah.
  mediaUrl?: string;
  docUrl?: string;
  // Storage internal proyek (upload menyusul; untuk kini nama file dicatat).
  // mediaPath = path Storage (content-drafts/...), mediaName = nama file asli.
  mediaPath?: string;
  mediaName?: string;
  docPath?: string;
  docName?: string;
  scheduledAt?: string;
  notes?: string;
  status: DraftStatus;
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

export type DraftAction =
  | "submit"
  | "approve"
  | "reject"
  | "publish"
  | "duplicate";

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
export function effectiveStatus(
  doc: Pick<DraftDoc, "status" | "slaExpiresAt">,
  now = new Date()
): DraftStatus {
  if (
    doc.status === "pending" &&
    doc.slaExpiresAt &&
    now.getTime() >= new Date(doc.slaExpiresAt).getTime()
  ) {
    return "expired";
  }
  return doc.status;
}

export function isSlaExpired(
  doc: Pick<DraftDoc, "status" | "slaExpiresAt">,
  now = new Date()
): boolean {
  return effectiveStatus(doc, now) === "expired" && doc.status === "pending";
}

/** Sisa hari SLA (bulat ke bawah, bisa negatif). null bila tidak berlaku. */
export function daysLeft(
  doc: Pick<DraftDoc, "status" | "slaExpiresAt">,
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

/** Validasi field teks saat create/update draft (owner). */
export function validateDraftFields(input: {
  title?: unknown;
  caption?: unknown;
  accountTarget?: unknown;
  mediaUrl?: unknown;
  docUrl?: unknown;
  mediaPath?: unknown;
  mediaName?: unknown;
  docPath?: unknown;
  docName?: unknown;
  scheduledAt?: unknown;
  notes?: unknown;
}): ValidationResult {
  const title = (input.title as string) ?? "";
  const caption = (input.caption as string) ?? "";
  const accountTarget = (input.accountTarget as string) ?? "";

  if (!title || typeof title !== "string" || !title.trim())
    return { ok: false, error: "title wajib diisi" };
  if (title.trim().length > 200)
    return { ok: false, error: "title maksimal 200 karakter" };
  if (!caption || typeof caption !== "string" || !caption.trim())
    return { ok: false, error: "caption wajib diisi" };
  if (caption.trim().length > 5000)
    return { ok: false, error: "caption maksimal 5000 karakter" };
  if (!accountTarget || typeof accountTarget !== "string" || !accountTarget.trim())
    return { ok: false, error: "accountTarget wajib diisi" };
  if (!isValidUrlOrEmpty(input.mediaUrl))
    return { ok: false, error: "mediaUrl harus URL http(s) yang valid" };
  if (!isValidUrlOrEmpty(input.docUrl))
    return { ok: false, error: "docUrl harus URL http(s) yang valid" };
  // Field Storage internal: path + nama file asli (maks 500/120 karakter).
  for (const [key, max] of [
    ["mediaPath", 500],
    ["docPath", 500],
    ["mediaName", 120],
    ["docName", 120],
  ] as const) {
    const v = (input as Record<string, unknown>)[key];
    if (v !== undefined && v !== null && v !== "") {
      if (typeof v !== "string" || !v.trim())
        return { ok: false, error: `${key} harus berupa teks` };
      if (v.trim().length > max)
        return { ok: false, error: `${key} maksimal ${max} karakter` };
    }
  }
  if (
    input.scheduledAt !== undefined &&
    input.scheduledAt !== null &&
    input.scheduledAt !== ""
  ) {
    const d = new Date(input.scheduledAt as string);
    if (isNaN(d.getTime()))
      return { ok: false, error: "scheduledAt harus tanggal ISO yang valid" };
  }
  if (
    input.notes !== undefined &&
    input.notes !== null &&
    typeof input.notes === "string" &&
    input.notes.length > 2000
  )
    return { ok: false, error: "notes maksimal 2000 karakter" };
  return { ok: true };
}

/** Owner boleh edit hanya saat draft/rejected (dan belum expired). */
export function canOwnerEdit(
  doc: Pick<DraftDoc, "status" | "slaExpiresAt">,
  now = new Date()
): boolean {
  const eff = effectiveStatus(doc, now);
  return eff === "draft" || eff === "rejected";
}

/** Owner boleh submit hanya dari draft/rejected. */
export function canOwnerSubmit(
  doc: Pick<DraftDoc, "status" | "slaExpiresAt">,
  now = new Date()
): boolean {
  return canOwnerEdit(doc, now);
}

/** Admin boleh review hanya pending yang belum lewat SLA. */
export function canAdminReview(
  doc: Pick<DraftDoc, "status" | "slaExpiresAt" | "authorUid">,
  adminUid: string,
  now = new Date()
): ValidationResult {
  if (effectiveStatus(doc, now) !== "pending")
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
export function buildNewDraft(input: {
  title: string;
  caption: string;
  accountTarget: string;
  mediaUrl?: string;
  docUrl?: string;
  mediaPath?: string;
  mediaName?: string;
  docPath?: string;
  docName?: string;
  scheduledAt?: string;
  notes?: string;
  authorUid: string;
  authorEmail?: string;
  now?: Date;
}): DraftDoc {
  const t = nowISO(input.now);
  return {
    title: input.title.trim(),
    caption: input.caption.trim(),
    accountTarget: input.accountTarget.trim(),
    ...(input.mediaUrl?.trim() ? { mediaUrl: input.mediaUrl.trim() } : {}),
    ...(input.docUrl?.trim() ? { docUrl: input.docUrl.trim() } : {}),
    ...(input.mediaPath?.trim() ? { mediaPath: input.mediaPath.trim() } : {}),
    ...(input.mediaName?.trim() ? { mediaName: input.mediaName.trim() } : {}),
    ...(input.docPath?.trim() ? { docPath: input.docPath.trim() } : {}),
    ...(input.docName?.trim() ? { docName: input.docName.trim() } : {}),
    ...(input.scheduledAt ? { scheduledAt: input.scheduledAt } : {}),
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
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
