/**
 * EVP KPI 3 — Laporan Employee Volunteer Program (pengganti form
 * volunteer.tjslpln.id yang butuh login eksternal).
 *
 * Alur sama seperti kunjungan PUMK: unit mengisi (draf) → ajukan (pending) →
 * review TL/Asman se-unit atau admin (approved/rejected). Admin UID memonitor
 * + merekap semua unit.
 *
 * Lokasi kegiatan untuk sementara teks bebas; dropdown berjenjang
 * Provinsi → Kota → Kecamatan → Kelurahan menyusul setelah ada master wilayah.
 * File eviden untuk sementara tampilan saja (belum diupload), mengikuti
 * keputusan yang sama dengan bukti kunjungan PUMK.
 */

export type EvpStatus = "draft" | "pending" | "approved" | "rejected";

export const EVP_STATUSES: EvpStatus[] = ["draft", "pending", "approved", "rejected"];

/** Kategori program — sesuai opsi form asli. */
export const EVP_KATEGORI = [
  "Sosial",
  "Pendidikan",
  "Lingkungan",
  "Kesehatan",
  "Ekonomi",
] as const;

export interface EvpReport {
  id?: string;
  /** Unit penulis (unitId akun). */
  unitId: string;
  namaPegawai: string;
  nip: string;
  noHp: string;
  /** Unit asal (mis. UID JAKARTA RAYA) — prefill dari profil, bisa diubah. */
  unitAsal: string;
  /** UP3/UPT/UPP/UPDL/Sektor. */
  upDetail: string;
  kategoriProgram: string;
  namaProgram: string;
  lokasiProvinsi: string;
  lokasiKota: string;
  lokasiKecamatan: string;
  lokasiKelurahan: string;
  /** Link eviden (upload Storage menyusul; untuk kini null). */
  evidenUrl?: string | null;
  /** Tanggal pelaksanaan YYYY-MM-DD */
  tanggalPelaksanaan: string;
  deskripsi: string;
  status: EvpStatus;
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

/** Validasi body create/update laporan EVP (cerminan field wajib form asli). */
export function validateEvp(input: {
  namaPegawai?: unknown;
  nip?: unknown;
  noHp?: unknown;
  unitAsal?: unknown;
  upDetail?: unknown;
  kategoriProgram?: unknown;
  namaProgram?: unknown;
  lokasiProvinsi?: unknown;
  lokasiKota?: unknown;
  lokasiKecamatan?: unknown;
  lokasiKelurahan?: unknown;
  tanggalPelaksanaan?: unknown;
  deskripsi?: unknown;
}): ValidationResult {
  if (!String(input.namaPegawai || "").trim()) return { ok: false, error: "namaPegawai wajib diisi" };
  if (!String(input.nip || "").trim()) return { ok: false, error: "nip wajib diisi" };
  if (!/^\d{9,15}$/.test(String(input.noHp || "").trim()))
    return { ok: false, error: "noHp hanya boleh angka (9–15 digit)" };
  if (!String(input.unitAsal || "").trim()) return { ok: false, error: "unitAsal wajib diisi" };
  if (!String(input.upDetail || "").trim()) return { ok: false, error: "UP3/UPT/UPP/UPDL/Sektor wajib diisi" };
  if (!(EVP_KATEGORI as readonly string[]).includes(String(input.kategoriProgram || "")))
    return { ok: false, error: `kategoriProgram harus salah satu: ${EVP_KATEGORI.join(", ")}` };
  if (!String(input.namaProgram || "").trim()) return { ok: false, error: "namaProgram wajib diisi" };
  if (!String(input.lokasiProvinsi || "").trim()) return { ok: false, error: "lokasi Provinsi wajib diisi" };
  if (!String(input.lokasiKota || "").trim()) return { ok: false, error: "lokasi Kabupaten/Kota wajib diisi" };
  if (!String(input.lokasiKecamatan || "").trim()) return { ok: false, error: "lokasi Kecamatan wajib diisi" };
  if (!String(input.lokasiKelurahan || "").trim()) return { ok: false, error: "lokasi Kelurahan wajib diisi" };
  if (!isDateOnly(input.tanggalPelaksanaan))
    return { ok: false, error: "tanggalPelaksanaan wajib diisi (YYYY-MM-DD)" };
  if (!String(input.deskripsi || "").trim()) return { ok: false, error: "deskripsi kegiatan wajib diisi" };
  return { ok: true };
}

/** Kunci "YYYY-MM" dari tanggal pelaksanaan untuk filter bulanan. */
export function monthKey(tanggal: string): string {
  return String(tanggal || "").slice(0, 7);
}
