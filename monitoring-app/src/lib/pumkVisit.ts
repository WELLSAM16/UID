/**
 * Kunjungan PUMK KPI 4 — pengganti g-form "Laporan Pengelolaan UMK".
 *
 * Alur: unit mengisi hasil kunjungan lapangan (draf) → ajukan (pending) →
 * review TL/Asman se-unit atau admin (approved/rejected).
 * Master Database PUMK tetap read-only (acuan Nomor ID); hasil kunjungan
 * disimpan di koleksi `pumk_visits` agar kelak langsung mengisi status
 * monitoring tanpa rekap manual spreadsheet.
 *
 * Dokumen bukti (Form O, bukti bayar) untuk sementara ditempel sebagai link
 * (mis. Drive); upload ke Storage sistem menyusul.
 */

export type PumkVisitStatus = "draft" | "pending" | "approved" | "rejected";

export const PUMK_VISIT_STATUSES: PumkVisitStatus[] = [
  "draft",
  "pending",
  "approved",
  "rejected",
];

/** Kolektibilitas — cerminan opsi g-form (Macet/Masalah) + Lancar. */
export const KOLEKTIBILITAS_OPTIONS = ["Lancar", "Masalah", "Macet"] as const;

/** Jenis tindak lanjut — cabang section g-form. */
export const TINDAK_LANJUT_OPTIONS = ["Inventarisasi", "Penagihan"] as const;

/** Kondisi mitra — cabang Inventarisasi. */
export const KONDISI_MITRA_OPTIONS = [
  "Mitra Meninggal Dunia",
  "Mitra Tidak Ditemukan",
  "Mitra Gagal Bayar",
] as const;

export interface PumkVisit {
  id?: string;
  unitId: string;
  /** Tanggal kunjungan YYYY-MM-DD */
  tanggalKunjungan: string;
  /** Kunci join ke Database PUMK (kolom NO ID). */
  noId: string;
  namaMitra: string;
  kolektibilitas: string;
  /** Angka saja (rupiah), mengikuti Kartu Piutang. */
  saldoPokok: number;
  saldoJasa: number;
  totalSaldo: number;
  jenisTindakLanjut: string;
  // --- Cabang Inventarisasi ---
  /** Titik Google Maps. */
  lokasiUrl?: string | null;
  kondisiMitra?: string | null;
  /** Link dokumen Form O (upload Storage menyusul). */
  formOUrl?: string | null;
  /** Link dokumen kunjungan lain (dipisah per jenis, maks 5 di g-form). */
  dokumenLainUrl?: string | null;
  // --- Cabang Penagihan ---
  /** Link bukti pembayaran piutang. */
  buktiBayarUrl?: string | null;
  status: PumkVisitStatus;
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

function isMoney(v: unknown): boolean {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 1000000000000;
}

/** Validasi body create/update laporan kunjungan (cerminan field wajib g-form). */
export function validatePumkVisit(input: {
  tanggalKunjungan?: unknown;
  noId?: unknown;
  namaMitra?: unknown;
  kolektibilitas?: unknown;
  saldoPokok?: unknown;
  saldoJasa?: unknown;
  totalSaldo?: unknown;
  jenisTindakLanjut?: unknown;
  lokasiUrl?: unknown;
  kondisiMitra?: unknown;
  formOUrl?: unknown;
  dokumenLainUrl?: unknown;
  buktiBayarUrl?: unknown;
}): ValidationResult {
  if (!isDateOnly(input.tanggalKunjungan))
    return { ok: false, error: "tanggalKunjungan wajib diisi (YYYY-MM-DD)" };
  if (!String(input.noId || "").trim())
    return { ok: false, error: "Nomor ID wajib diisi (kunci ke Database PUMK)" };
  if (!String(input.namaMitra || "").trim())
    return { ok: false, error: "namaMitra wajib diisi" };
  if (!(KOLEKTIBILITAS_OPTIONS as readonly string[]).includes(String(input.kolektibilitas)))
    return { ok: false, error: `kolektibilitas harus salah satu: ${KOLEKTIBILITAS_OPTIONS.join(", ")}` };
  if (!isMoney(input.saldoPokok)) return { ok: false, error: "saldoPokok harus angka >= 0" };
  if (!isMoney(input.saldoJasa)) return { ok: false, error: "saldoJasa harus angka >= 0" };
  if (!isMoney(input.totalSaldo)) return { ok: false, error: "totalSaldo harus angka >= 0" };
  const jenis = String(input.jenisTindakLanjut || "");
  if (!(TINDAK_LANJUT_OPTIONS as readonly string[]).includes(jenis))
    return { ok: false, error: `jenisTindakLanjut harus salah satu: ${TINDAK_LANJUT_OPTIONS.join(", ")}` };

  if (!isUrlOrEmpty(input.lokasiUrl)) return { ok: false, error: "lokasiUrl harus link http/https valid" };
  if (!isUrlOrEmpty(input.formOUrl)) return { ok: false, error: "formOUrl harus link http/https valid" };
  if (!isUrlOrEmpty(input.dokumenLainUrl)) return { ok: false, error: "dokumenLainUrl harus link http/https valid" };
  if (!isUrlOrEmpty(input.buktiBayarUrl)) return { ok: false, error: "buktiBayarUrl harus link http/https valid" };

  if (jenis === "Inventarisasi") {
    if (!String(input.lokasiUrl || "").trim())
      return { ok: false, error: "lokasiUrl (titik Google Maps) wajib untuk Inventarisasi" };
    if (!(KONDISI_MITRA_OPTIONS as readonly string[]).includes(String(input.kondisiMitra || "")))
      return { ok: false, error: `kondisiMitra harus salah satu: ${KONDISI_MITRA_OPTIONS.join(", ")}` };
  }
  if (jenis === "Penagihan") {
    if (!String(input.buktiBayarUrl || "").trim())
      return { ok: false, error: "buktiBayarUrl wajib untuk Penagihan" };
  }
  return { ok: true };
}

/** Kunci "YYYY-MM" dari tanggal kunjungan untuk filter bulanan. */
export function monthKey(tanggal: string): string {
  return String(tanggal || "").slice(0, 7);
}
