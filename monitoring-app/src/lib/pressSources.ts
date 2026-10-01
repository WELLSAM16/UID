/**
 * Sumber spreadsheet Monitoring Press Release (multi-tahun).
 *
 * Setiap tahun/semester sheet-nya berbeda, jadi admin menyimpan daftar sumber
 * di Firestore `press_release_sources`. User memilih sumber via dropdown di
 * halaman monitoring; API membaca sheet aktif (atau ?source=<id>).
 *
 * Syarat sheet agar tampil seperti sekarang:
 * - Visibility: "Anyone with the link can view" (publik link).
 * - Struktur kolom SAMA: B=No, C=Tanggal teks, D=Tgl, E=Bulan, F=Tahun,
 *   G=Unit, H=Judul, I=Link evidence.
 *
 * File ini murni (tanpa dependensi node) agar bisa diimpor API maupun client.
 */

export interface PressReleaseSource {
  id?: string;
  /** Label tampil, mis. "2026 Semester 2" */
  label: string;
  /** ID spreadsheet (bagian /d/<id>/ dari URL) */
  sheetId: string;
  /** GID tab (angka setelah #gid= / ?gid=). Default "0". */
  gid: string;
  /** Target rilis per unit untuk sumber ini (default 12). */
  targetPerUnit: number;
  /** Tahun periode valid untuk deteksi anomali (default 2026). */
  validYear: number;
  /** Salah satu sumber = aktif (default saat user buka monitoring). */
  isActive: boolean;
  createdBy?: string;
  createdByEmail?: string;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_TARGET_PER_UNIT = 12;
export const DEFAULT_VALID_YEAR = 2026;

/**
 * Ekstrak { sheetId, gid } dari berbagai bentuk input:
 * - URL penuh: https://docs.google.com/spreadsheets/d/<ID>/...#gid=123
 * - URL gviz / export dengan ?gid= / ?id=
 * - ID mentah (tanpa URL)
 * GID default "0" bila tidak ditemukan.
 */
export function parseSpreadsheetInput(input: string): {
  ok: boolean;
  sheetId?: string;
  gid?: string;
  error?: string;
} {
  const raw = (input || "").trim();
  if (!raw) return { ok: false, error: "Link spreadsheet wajib diisi" };

  // ID mentah (tanpa slash/spasi)
  if (!/[/\s]/.test(raw)) {
    if (!/^[A-Za-z0-9-_]{15,}$/.test(raw))
      return { ok: false, error: "ID spreadsheet tidak valid" };
    return { ok: true, sheetId: raw, gid: "0" };
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "Link spreadsheet bukan URL valid" };
  }
  if (!/docs\.google\.com$/.test(url.hostname) && !/docs\.google\.com\./.test(url.hostname + "."))
    return { ok: false, error: "Link harus URL docs.google.com/spreadsheets" };

  const m = url.pathname.match(/\/spreadsheets\/d\/([A-Za-z0-9-_]+)/);
  if (!m) return { ok: false, error: "Tidak menemukan ID spreadsheet di link (/d/<ID>/)" };
  const sheetId = m[1];

  // GID bisa di fragment (#gid=), query (?gid=), atau path /.../gid
  let gid = "0";
  const frag = url.hash.match(/gid=(\d+)/);
  const q = url.searchParams.get("gid") || url.searchParams.get("id");
  if (frag) gid = frag[1];
  else if (q && /^\d+$/.test(q)) gid = q;

  return { ok: true, sheetId, gid };
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

/** Validasi body create/update sumber (dipakai API). */
export function validatePressSource(input: {
  label?: unknown;
  sheetId?: unknown;
  gid?: unknown;
  targetPerUnit?: unknown;
  validYear?: unknown;
  isActive?: unknown;
}): ValidationResult {
  const label = typeof input.label === "string" ? input.label.trim() : "";
  if (!label) return { ok: false, error: "label wajib diisi (mis. 2027 Semester 1)" };
  if (label.length > 80) return { ok: false, error: "label maksimal 80 karakter" };

  if (typeof input.sheetId !== "string" || !/^[A-Za-z0-9-_]{15,}$/.test(input.sheetId.trim()))
    return { ok: false, error: "sheetId tidak valid" };
  if (input.gid !== undefined && (typeof input.gid !== "string" || !/^\d+$/.test(input.gid.trim())))
    return { ok: false, error: "gid harus angka (tab spreadsheet)" };

  const t = Number(input.targetPerUnit);
  if (!Number.isFinite(t) || !Number.isInteger(t) || t < 1 || t > 1000)
    return { ok: false, error: "targetPerUnit harus bilangan bulat 1-1000" };
  const y = Number(input.validYear);
  if (!Number.isFinite(y) || !Number.isInteger(y) || y < 2000 || y > 2100)
    return { ok: false, error: "validYear harus tahun 2000-2100" };
  if (input.isActive !== undefined && typeof input.isActive !== "boolean")
    return { ok: false, error: "isActive harus boolean" };
  return { ok: true };
}

export function nowISO(now = new Date()): string {
  return now.toISOString();
}
