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

/** Batas khusus video (rencana postingan). MEDIA_MAX_BYTES di PC harus >= angka ini. */
export const MEDIA_VIDEO_MAX_BYTES = 100 * 1024 * 1024;

export const MEDIA_VIDEO_MIME = ["video/mp4", "video/quicktime"] as const;

/** Media rencana postingan: gambar + video (tanpa PDF). */
export const MEDIA_PLAN_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  ...MEDIA_VIDEO_MIME,
] as const;

export type MediaMime =
  | (typeof MEDIA_ALLOWED_MIME)[number]
  | (typeof MEDIA_VIDEO_MIME)[number];

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
export function validateMediaFile(
  file: {
    name: string;
    size: number;
    type: string;
  },
  limits?: { allowedMime?: readonly string[]; maxBytes?: number }
): string | null {
  const allowed = limits?.allowedMime ?? MEDIA_ALLOWED_MIME;
  const maxBytes = limits?.maxBytes ?? MEDIA_MAX_BYTES;
  if (!file) return "File belum dipilih";
  if (!allowed.includes(file.type)) {
    if (allowed.includes("video/mp4")) {
      return "File harus gambar (JPG/PNG/WebP) atau video (MP4/MOV)";
    }
    if (allowed.includes("application/pdf")) {
      return "File harus PDF atau gambar (JPG/PNG/WebP)";
    }
    return "File harus gambar (JPG/PNG/WebP)";
  }
  if (file.size <= 0) return "File kosong";
  if (file.size > maxBytes) {
    return `Ukuran file maksimal ${Math.round(maxBytes / 1024 / 1024)} MB`;
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
