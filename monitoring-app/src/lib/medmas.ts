/**
 * Kerangka Medmas KPI 2 — entri pemberitaan media massa per unit.
 *
 * Pasangan sisi Medsos (otomatis dari IG) adalah sisi Medmas (input manual
 * karena datanya dari pantauan redaksi). Rekap bulanan menggabungkan keduanya
 * menggantikan file "Skoring UP Medmas/Medsos - {Bulan}" + "Rekap Scoring".
 *
 * Skor per entri diinput manual mengikuti file skoring; kalibrasi tier/bobot
 * otomatis menyusul setelah contoh file bulanan diterima.
 * Workflow: draft → pending → approved / rejected (tanpa SLA/TTL).
 */

export type MedmasStatus = "draft" | "pending" | "approved" | "rejected";

export const MEDMAS_STATUSES: MedmasStatus[] = ["draft", "pending", "approved", "rejected"];

/** Tier media — label klasifikasi, belum mengikat bobot (kalibrasi menyusul). */
export const MEDMAS_TIERS = ["Nasional", "Regional", "Lokal", "Online"] as const;
export type MedmasTier = (typeof MEDMAS_TIERS)[number];

export interface MedmasEntry {
  id?: string;
  unitId: string;
  /** Tanggal terbit YYYY-MM-DD */
  tanggal: string;
  outlet: string;
  judul: string;
  /** Link berita (bukti pemberitaan itu sendiri, bukan arsip Drive). */
  url?: string | null;
  tierMedia?: string | null;
  /** Skor manual mengikuti file skoring bulanan. */
  skor: number;
  status: MedmasStatus;
  authorUid: string;
  authorEmail?: string;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

function isDateOnly(v: unknown): boolean {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return false;
  return !isNaN(new Date(v.trim()).getTime());
}

function isUrlOrEmpty(v: unknown): boolean {
  if (v === undefined || v === null || v === "") return true;
  if (typeof v !== "string") return false;
  try {
    const u = new URL(v.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Validasi body create/update entri medmas. */
export function validateMedmas(input: {
  tanggal?: unknown;
  outlet?: unknown;
  judul?: unknown;
  url?: unknown;
  tierMedia?: unknown;
  skor?: unknown;
}): ValidationResult {
  if (!isDateOnly(input.tanggal)) return { ok: false, error: "tanggal wajib diisi (YYYY-MM-DD)" };
  if (!String(input.outlet || "").trim()) return { ok: false, error: "outlet/media wajib diisi" };
  if (!String(input.judul || "").trim()) return { ok: false, error: "judul pemberitaan wajib diisi" };
  if (!isUrlOrEmpty(input.url)) return { ok: false, error: "url harus link http/https valid" };
  if (
    input.tierMedia !== undefined &&
    input.tierMedia !== null &&
    input.tierMedia !== "" &&
    !(MEDMAS_TIERS as readonly string[]).includes(String(input.tierMedia))
  ) {
    return { ok: false, error: `tierMedia harus salah satu: ${MEDMAS_TIERS.join(", ")}` };
  }
  const skor = Number(input.skor);
  if (!Number.isFinite(skor) || skor < 0 || skor > 100000) {
    return { ok: false, error: "skor harus angka 0–100000" };
  }
  return { ok: true };
}

/** Kunci "YYYY-MM" dari tanggal untuk filter rekap bulanan. */
export function monthKey(tanggal: string): string {
  return String(tanggal || "").slice(0, 7);
}
