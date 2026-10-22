/**
 * Aturan file media — dipakai bersama oleh server (membuat token) dan browser
 * (validasi sebelum upload). Tidak boleh mengimpor `node:*` supaya aman
 * dipakai di komponen client.
 */

/** Batas ukuran per file. Harus sama dengan MEDIA_MAX_BYTES di PC (config.env). */
export const MEDIA_MAX_BYTES = 10 * 1024 * 1024;

export const MEDIA_ALLOWED_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type MediaMime = (typeof MEDIA_ALLOWED_MIME)[number];

/** Token berlaku 15 menit (cukup untuk upload 10 MB lewat relay). */
export const MEDIA_TOKEN_TTL_SEC = 15 * 60;

/** Dokumen + field yang boleh diberi file. */
export interface MediaTarget {
  collection: string;
  id: string;
  field: string;
  /** Untuk field berbentuk array (mis. evidencePaths), pilih elemen ke-n. */
  index?: number;
}

/** Isi token yang ditandatangani server dan diverifikasi PC. */
export interface MediaTokenClaims {
  o: "put" | "get" | "del";
  p: string;
  e: number;
  s?: number;
  t?: string;
  n?: string;
}

/** Validasi file di sisi klien. Return pesan error atau null bila OK. */
export function validateMediaFile(file: {
  name: string;
  size: number;
  type: string;
}): string | null {
  if (!file) return "File belum dipilih";
  if (!(MEDIA_ALLOWED_MIME as readonly string[]).includes(file.type)) {
    return "File harus PDF atau gambar (JPG/PNG/WebP)";
  }
  if (file.size <= 0) return "File kosong";
  if (file.size > MEDIA_MAX_BYTES) {
    return `Ukuran file maksimal ${MEDIA_MAX_BYTES / 1024 / 1024} MB`;
  }
  return null;
}

/**
 * Nama file aman untuk path Storage: hanya a-z 0-9 . _ - dan maksimal 80
 * karakter. Harus cocok dengan penjagaan path di server.mjs.
 */
export function safeFileName(name: string): string {
  const base = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[._-]+/, "")
    .slice(-80);
  return base || "dokumen";
}

/** Nama field pasangan: formOPath -> formOName, evidencePaths -> evidenceNames. */
export function nameFieldOf(pathField: string): string {
  if (pathField.endsWith("Paths")) return `${pathField.slice(0, -5)}Names`;
  if (pathField.endsWith("Path")) return `${pathField.slice(0, -4)}Name`;
  return `${pathField}Name`;
}
