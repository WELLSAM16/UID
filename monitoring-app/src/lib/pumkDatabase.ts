/**
 * Database PUMK internal — cerminan sheet "FIX REKAP DATABASE MASTER".
 *
 * Sumber data awal diimpor dari sheet, lalu Admin UID mengelola sendiri di
 * aplikasi. Tidak ada tautan keluar ke Google Sheet dari halaman ini.
 *
 * Koleksi Firestore: `pumk_database` (satu dokumen = satu NO ID).
 * `noIdKey` = NO ID uppercase untuk cek duplikat.
 */

import { normalizeUnitId } from "./roles";
import { PUMK_TARGET_UNITS } from "./pumkTarget";

export const PUMK_DB_COLLECTION = "pumk_database";

export type PumkDbGroup =
  | "Identitas"
  | "Keuangan"
  | "Penugasan"
  | "Status & Validasi"
  | "Lokasi";

export type PumkDbFieldType = "text" | "number" | "url" | "textarea" | "select";

export interface PumkDbField {
  key: string;
  label: string;
  type: PumkDbFieldType;
  group: PumkDbGroup;
  /** Tampil sebagai kolom utama di tabel. */
  table?: boolean;
  required?: boolean;
  /** Input melebar penuh (textarea / alamat). */
  wide?: boolean;
  placeholder?: string;
  options?: readonly string[];
}

export interface PumkDatabaseMitra {
  id?: string;
  noId: string;
  /** Normalisasi uppercase NO ID untuk query duplikat. */
  noIdKey?: string;
  nama: string;
  tahun?: string;
  linkFolder?: string;
  sektorUsaha?: string;
  kolektibilitas?: string;
  pks?: string;

  pinjamanPokok?: number;
  angsuran?: number;
  saldo?: number;
  saldoPokokApril?: number;
  saldoJasaApril?: number;
  totalSaldoApril?: number;
  saldoPokokJuli?: number;
  saldoJasaJuli?: number;
  totalSaldoJuli?: number;

  validasi1?: string;
  validasi2?: string;
  justifikasi?: string;
  validasiAkhir?: string;
  validasiPerubahanPokok?: string;
  validasiPerubahanTotal?: string;

  kk?: string;
  kota?: string;
  provinsi?: string;
  alamat?: string;
  cascading2025?: string;
  usulanMutasi2026?: string;
  masukTO2026?: string;
  usulanTLTO2026Default?: string;
  unitId?: string;
  /** Nilai asli dari sheet, cth "UP2D Jakarta". */
  unitRaw?: string;
  usulanTLTO2026?: string;
  catatanMutasi?: string;
  perkiraanLokasi?: string;
  mapsUrl?: string;
  bermasalahMei?: string;
  hapusBukuMei?: string;
  hasilInventarisasiUP?: string;
  tindakLanjutInventarisasiUP?: string;
  validasiTindakLanjut?: string;
  terdaftarUsulan19Juni?: string;
  tambahanUsulan19Juni?: string;
  bermasalahJuni?: string;
  hapusBukuJuni?: string;
  statusPerJuli?: string;
  statusTLUPSM1?: string;
  nilaiTLUPSM1?: number;
  validasiNominal?: string;

  source?: string;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
  updatedByEmail?: string | null;
}

const UNIT_OPTIONS = ["", ...PUMK_TARGET_UNITS] as const;

export const PUMK_DB_FIELDS: PumkDbField[] = [
  { key: "noId", label: "NO ID / Kontrak", type: "text", group: "Identitas", table: true, required: true, placeholder: "cth: 01-01-396/96" },
  { key: "nama", label: "Nama Mitra", type: "text", group: "Identitas", table: true, required: true, placeholder: "Nama mitra / debitur" },
  { key: "tahun", label: "Tahun", type: "text", group: "Identitas" },
  { key: "sektorUsaha", label: "Sektor Usaha", type: "text", group: "Identitas" },
  { key: "kolektibilitas", label: "Kolektibilitas", type: "text", group: "Identitas", table: true },
  { key: "pks", label: "PKS", type: "text", group: "Identitas", table: true },
  { key: "linkFolder", label: "Folder PKS & Piutang", type: "url", group: "Identitas", table: true, placeholder: "https://drive.google.com/drive/folders/..." },

  { key: "pinjamanPokok", label: "Pinjaman (Pokok)", type: "number", group: "Keuangan" },
  { key: "angsuran", label: "Angsuran", type: "number", group: "Keuangan" },
  { key: "saldo", label: "Saldo", type: "number", group: "Keuangan" },
  { key: "saldoPokokApril", label: "Saldo Pokok per 1 April 2026", type: "number", group: "Keuangan" },
  { key: "saldoJasaApril", label: "Saldo Jasa per 1 April 2026", type: "number", group: "Keuangan" },
  { key: "totalSaldoApril", label: "Jumlah Saldo per 1 April 2026", type: "number", group: "Keuangan" },
  { key: "saldoPokokJuli", label: "Saldo Pokok Juli 2026", type: "number", group: "Keuangan" },
  { key: "saldoJasaJuli", label: "Saldo Jasa Juli 2026", type: "number", group: "Keuangan" },
  { key: "totalSaldoJuli", label: "Total Saldo Juli 2026", type: "number", group: "Keuangan", table: true },

  { key: "unitId", label: "Unit Penanggung Jawab", type: "select", group: "Penugasan", table: true, options: UNIT_OPTIONS },
  { key: "cascading2025", label: "Cascading 2025", type: "text", group: "Penugasan" },
  { key: "usulanMutasi2026", label: "Usulan Mutasi 2026", type: "text", group: "Penugasan" },
  { key: "masukTO2026", label: "Masuk TO 2026", type: "text", group: "Penugasan" },
  { key: "usulanTLTO2026Default", label: "Usulan TL TO 2026 (default)", type: "text", group: "Penugasan" },
  { key: "usulanTLTO2026", label: "Usulan Tindak Lanjut TO 2026", type: "text", group: "Penugasan" },
  { key: "catatanMutasi", label: "Catatan Mutasi", type: "text", group: "Penugasan" },

  { key: "statusPerJuli", label: "Status per Juli 2026", type: "text", group: "Status & Validasi", table: true },
  { key: "statusTLUPSM1", label: "Status TL UP SM I 2026", type: "text", group: "Status & Validasi" },
  { key: "nilaiTLUPSM1", label: "Nilai TL UP SM I 2026", type: "number", group: "Status & Validasi" },
  { key: "hasilInventarisasiUP", label: "Hasil Inventarisasi UP", type: "text", group: "Status & Validasi" },
  { key: "tindakLanjutInventarisasiUP", label: "Tindak Lanjut Inventarisasi UP", type: "text", group: "Status & Validasi" },
  { key: "validasiTindakLanjut", label: "Validasi Tindak Lanjut", type: "text", group: "Status & Validasi" },
  { key: "validasi1", label: "Validasi 1", type: "text", group: "Status & Validasi" },
  { key: "validasi2", label: "Validasi 2", type: "text", group: "Status & Validasi" },
  { key: "justifikasi", label: "Justifikasi", type: "textarea", group: "Status & Validasi", wide: true },
  { key: "validasiAkhir", label: "Validasi Akhir", type: "text", group: "Status & Validasi" },
  { key: "validasiPerubahanPokok", label: "Validasi Perubahan Saldo Pokok", type: "text", group: "Status & Validasi" },
  { key: "validasiPerubahanTotal", label: "Validasi Perubahan Total Saldo", type: "text", group: "Status & Validasi" },
  { key: "validasiNominal", label: "Validasi Nominal", type: "text", group: "Status & Validasi" },
  { key: "bermasalahMei", label: "2026.05 — Bermasalah", type: "text", group: "Status & Validasi" },
  { key: "hapusBukuMei", label: "2026.05 — Hapus Buku", type: "text", group: "Status & Validasi" },
  { key: "bermasalahJuni", label: "2026.06 — Bermasalah", type: "text", group: "Status & Validasi" },
  { key: "hapusBukuJuni", label: "2026.06 — Hapus Buku", type: "text", group: "Status & Validasi" },
  { key: "terdaftarUsulan19Juni", label: "Terdaftar Usulan 19 Juni 2026", type: "text", group: "Status & Validasi" },
  { key: "tambahanUsulan19Juni", label: "Tambahan Usulan 19 Juni 2026", type: "text", group: "Status & Validasi" },

  { key: "kk", label: "KK", type: "text", group: "Lokasi" },
  { key: "kota", label: "Kota", type: "text", group: "Lokasi" },
  { key: "provinsi", label: "Provinsi", type: "text", group: "Lokasi" },
  { key: "alamat", label: "Alamat", type: "textarea", group: "Lokasi", wide: true },
  { key: "perkiraanLokasi", label: "Perkiraan Lokasi", type: "text", group: "Lokasi" },
  { key: "mapsUrl", label: "Link Maps", type: "url", group: "Lokasi", placeholder: "https://www.google.com/maps/..." },
];

export const PUMK_DB_GROUPS: PumkDbGroup[] = [
  "Identitas",
  "Keuangan",
  "Penugasan",
  "Status & Validasi",
  "Lokasi",
];

const TEXT_MAX = 1000;
const LONG_TEXT_MAX = 2000;

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** "UP2D Jakarta" / "up3 bintaro" → unit baku. Kosong = belum ditetapkan. */
export function normalizePumkUnit(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const upper = raw.toUpperCase().replace(/\s+/g, " ");
  if (upper === "UP2D JAKARTA" || upper === "UP2D") return "UP2D";
  return normalizeUnitId(raw) || "";
}

function parseNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return 0;
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
  }
  const cleaned = String(value).replace(/[^0-9-]/g, "");
  if (!cleaned || cleaned === "-") return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

export interface PumkDbValidation {
  ok: boolean;
  error?: string;
  data?: PumkDatabaseMitra;
}

/**
 * Validasi + normalisasi input form. Field yang tidak dikenali dibuang.
 * Metadata (id/createdAt/...) tidak ikut dari body.
 */
export function validatePumkDbInput(raw: Record<string, unknown>): PumkDbValidation {
  const noId = String(raw.noId ?? "").trim();
  if (!noId) return { ok: false, error: "NO ID wajib diisi" };
  if (noId.length > 120) return { ok: false, error: "NO ID maksimal 120 karakter" };

  const nama = String(raw.nama ?? "").trim();
  if (!nama) return { ok: false, error: "Nama mitra wajib diisi" };
  if (nama.length > 200) return { ok: false, error: "Nama mitra maksimal 200 karakter" };

  const out: PumkDatabaseMitra = {
    noId,
    noIdKey: noId.toUpperCase(),
    nama,
  };

  for (const field of PUMK_DB_FIELDS) {
    if (field.key === "noId" || field.key === "nama" || field.key === "unitId") continue;
    const value = raw[field.key];

    if (field.type === "number") {
      const n = parseNumber(value);
      if (n === null) return { ok: false, error: `${field.label} harus angka >= 0` };
      (out as unknown as Record<string, unknown>)[field.key] = n;
      continue;
    }

    let text = String(value ?? "").trim();
    const max = field.type === "textarea" ? LONG_TEXT_MAX : TEXT_MAX;
    if (text.length > max) return { ok: false, error: `${field.label} maksimal ${max} karakter` };
    if (field.type === "url" && text && !isHttpUrl(text)) {
      return { ok: false, error: `${field.label} harus URL http(s) yang valid` };
    }
    if (text === "#N/A" || text === "NONE") text = "";
    (out as unknown as Record<string, unknown>)[field.key] = text;
  }

  const unitRaw = String(raw.unitId ?? "").trim();
  if (unitRaw) {
    const unit = normalizePumkUnit(unitRaw);
    if (!unit) return { ok: false, error: "Unit penanggung jawab tidak dikenal" };
    out.unitId = unit;
  } else {
    out.unitId = "";
  }

  if (typeof raw.unitRaw === "string" && raw.unitRaw.trim()) {
    out.unitRaw = raw.unitRaw.trim().slice(0, 200);
  }

  return { ok: true, data: out };
}

/** Ambil nilai field untuk tabel/form. */
export function pumkDbValue(row: PumkDatabaseMitra, key: string): string | number {
  const value = (row as unknown as Record<string, unknown>)[key];
  if (typeof value === "number") return value;
  return value === null || value === undefined ? "" : String(value);
}

/** Daftar field yang tampil di tabel utama. */
export const PUMK_DB_TABLE_FIELDS = PUMK_DB_FIELDS.filter((f) => f.table);
