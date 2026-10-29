/**
 * Kunjungan PUMK KPI 4 — pengganti g-form "Laporan Pengelolaan UMK".
 *
 * Alur: unit mengisi hasil kunjungan lapangan (draf) → ajukan (pending) →
 * review TL/Asman se-unit atau admin (approved/rejected).
 * Master Database PUMK tetap read-only (acuan Nomor ID); hasil kunjungan
 * disimpan di koleksi `pumk_visits` agar kelak langsung mengisi status
 * monitoring tanpa rekap manual spreadsheet.
 *
 * Dokumen bukti (Form O, bukti bayar) diunggah ke penyimpanan PC internal
 * lewat API /api/files/* (PDF/gambar, maks 10 MB, path disimpan di Firestore).
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
  /** LEGACY: link luar (Drive). Hanya dibaca untuk data lama. */
  formOUrl?: string | null;
  /** LEGACY: link dokumen kunjungan lain. */
  dokumenLainUrl?: string | null;
  // --- File di penyimpanan PC (path, bukan URL permanen) ---
  formOPath?: string | null;
  formOName?: string | null;
  dokumenLainPath?: string | null;
  dokumenLainName?: string | null;
  /** Foto bukti kunjungan ke mitra (wajib sebelum diajukan). */
  evidencePath?: string | null;
  evidenceName?: string | null;
  // --- Cabang Penagihan ---
  /** LEGACY: link bukti pembayaran piutang. */
  buktiBayarUrl?: string | null;
  buktiBayarPath?: string | null;
  buktiBayarName?: string | null;
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

/**
 * Path file di penyimpanan PC: wajib di bawah prefix koleksi ini, tanpa
 * `..`/backslash, hanya karakter yang diterima server.mjs, maks 500 karakter.
 */
export function isStoragePathOrEmpty(v: unknown, prefix = "pumk-visits"): boolean {
  if (v === undefined || v === null || v === "") return true;
  if (typeof v !== "string") return false;
  const p = v.trim();
  if (!p || p.length > 500) return false;
  if (p.includes("..") || p.includes("\\") || p.includes("\0")) return false;
  if (!p.startsWith(`${prefix}/`)) return false;
  return /^[A-Za-z0-9][A-Za-z0-9._\-/]*$/.test(p);
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
  formOPath?: unknown;
  formOName?: unknown;
  dokumenLainPath?: unknown;
  dokumenLainName?: unknown;
  evidencePath?: unknown;
  evidenceName?: unknown;
  buktiBayarPath?: unknown;
  buktiBayarName?: unknown;
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

  if (!isStoragePathOrEmpty(input.formOPath)) return { ok: false, error: "formOPath tidak valid" };
  if (!isStoragePathOrEmpty(input.dokumenLainPath)) return { ok: false, error: "dokumenLainPath tidak valid" };
  if (!isStoragePathOrEmpty(input.evidencePath)) return { ok: false, error: "evidencePath tidak valid" };
  if (!isStoragePathOrEmpty(input.buktiBayarPath)) return { ok: false, error: "buktiBayarPath tidak valid" };
  for (const [key, val] of [
    ["formOName", input.formOName],
    ["dokumenLainName", input.dokumenLainName],
    ["evidenceName", input.evidenceName],
    ["buktiBayarName", input.buktiBayarName],
  ] as const) {
    if (val !== undefined && val !== null && String(val).length > 120)
      return { ok: false, error: `${key} maksimal 120 karakter` };
  }

  if (jenis === "Inventarisasi") {
    if (!String(input.lokasiUrl || "").trim())
      return { ok: false, error: "lokasiUrl (titik Google Maps) wajib untuk Inventarisasi" };
    if (!(KONDISI_MITRA_OPTIONS as readonly string[]).includes(String(input.kondisiMitra || "")))
      return { ok: false, error: `kondisiMitra harus salah satu: ${KONDISI_MITRA_OPTIONS.join(", ")}` };
  }
  // Catatan: bukti bayar Penagihan tidak diwajibkan saat membuat draf, karena
  // file diunggah setelah dokumen ada (butuh id untuk path). Kewajiban itu
  // ditegakkan di route PATCH saat action=submit.
  return { ok: true };
}

/** Kunci "YYYY-MM" dari tanggal kunjungan untuk filter bulanan. */
export function monthKey(tanggal: string): string {
  return String(tanggal || "").slice(0, 7);
}
