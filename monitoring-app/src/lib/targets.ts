/**
 * Skema + validasi target skoring (koleksi `skoring_targets`).
 *
 * Target hanya ditulis admin via API (/admin/target).
 * User biasa hanya membaca target aktif yang rentangnya melingkupi
 * filter tanggal di halaman skoring.
 */

export type TargetStatus = "Active" | "Paused";

export interface SkoringTarget {
  id?: string;
  /** Tanggal ISO YYYY-MM-DD */
  startDate: string;
  /** Tanggal ISO YYYY-MM-DD */
  endDate: string;
  targetScore: number;
  targetPosts: number;
  status: TargetStatus;
  createdBy?: string;
  createdByEmail?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

function parseDateOnly(v: unknown): Date | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v.trim());
  return isNaN(d.getTime()) ? null : d;
}

/** Validasi input create/update target skoring. */
export function validateSkoringTarget(input: {
  startDate?: unknown;
  endDate?: unknown;
  targetScore?: unknown;
  targetPosts?: unknown;
  status?: unknown;
}): ValidationResult {
  const start = parseDateOnly(input.startDate);
  const end = parseDateOnly(input.endDate);
  if (!start) return { ok: false, error: "startDate wajib diisi (tanggal valid)" };
  if (!end) return { ok: false, error: "endDate wajib diisi (tanggal valid)" };
  if (start.getTime() > end.getTime())
    return { ok: false, error: "startDate tidak boleh lebih besar dari endDate" };

  const score = Number(input.targetScore);
  const posts = Number(input.targetPosts);
  if (!Number.isFinite(score) || score <= 0)
    return { ok: false, error: "targetScore harus angka > 0" };
  if (!Number.isFinite(posts) || !Number.isInteger(posts) || posts <= 0)
    return { ok: false, error: "targetPosts harus bilangan bulat > 0" };

  if (
    input.status !== undefined &&
    input.status !== null &&
    input.status !== "Active" &&
    input.status !== "Paused"
  )
    return { ok: false, error: 'status harus "Active" atau "Paused"' };

  return { ok: true };
}

/** Normalisasi tanggal ke YYYY-MM-DD (input date HTML sudah dalam format ini). */
export function toDateOnly(v: string): string {
  const d = new Date(v);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Target dianggap berlaku untuk rentang filter bila:
 * - status Active, dan
 * - rentang filter sepenuhnya di dalam rentang target.
 */
export function isTargetActiveForRange(
  t: Pick<SkoringTarget, "startDate" | "endDate" | "status">,
  filterStart: string,
  filterEnd: string
): boolean {
  if (t.status !== "Active") return false;
  if (!filterStart || !filterEnd) return false;
  const ts = new Date(t.startDate).getTime();
  const te = new Date(t.endDate).getTime();
  const fs = new Date(filterStart).getTime();
  const fe = new Date(filterEnd).getTime();
  if ([ts, te, fs, fe].some((n) => isNaN(n))) return false;
  return ts <= fs && fe <= te;
}
