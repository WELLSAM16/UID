/**
 * Upload bukti/dokumen ke Firebase Storage internal proyek
 * (bukan Drive/eksternal). Dipakai kunjungan PUMK; siap dipakai ulang
 * stakeholder/medmas/draf medsos/draf press release dengan prefix path berbeda.
 *
 * Aturan file (MVP): PDF/gambar JPG-PNG-WebP, maks 10 MB — divalidasi
 * validateStorageFile. Video SENGAJA belum didukung: butuh batas ukuran,
 * tipe, dan biaya bandwidth sendiri; tambah STORAGE_ALLOWED_VIDEO_* terpisah
 * saat keputusannya ada (tanpa mengubah pemanggil yang sudah ada).
 */
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "./firebase";

/** Batas ukuran file 10 MB (g-form membolehkan s/d 1 GB — sengaja dibatasi). */
export const STORAGE_MAX_BYTES = 10 * 1024 * 1024;

export const STORAGE_ALLOWED_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** Validasi file sebelum upload. Return pesan error atau null bila OK. */
export function validateStorageFile(file: File | null | undefined): string | null {
  if (!file) return "File belum dipilih";
  if (!(STORAGE_ALLOWED_MIME as readonly string[]).includes(file.type)) {
    return "File harus PDF atau gambar (JPG/PNG/WebP)";
  }
  if (file.size <= 0) return "File kosong";
  if (file.size > STORAGE_MAX_BYTES) {
    return `Ukuran file maksimal ${STORAGE_MAX_BYTES / 1024 / 1024} MB`;
  }
  return null;
}

function sanitizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80) || "dokumen";
}

/**
 * Upload satu file bukti kunjungan PUMK.
 * Path: pumk-visits/{uid}/{visitId}/{kind}/{timestamp}-{nama}
 * Return download URL untuk disimpan di dokumen pumk_visits.
 */
export async function uploadVisitEvidence(
  uid: string,
  visitId: string,
  kind: "form-o" | "dokumen-lain" | "bukti-bayar",
  file: File
): Promise<string> {
  const err = validateStorageFile(file);
  if (err) throw new Error(err);
  const path = `pumk-visits/${uid}/${visitId}/${kind}/${Date.now()}-${sanitizeName(file.name)}`;
  const snapshot = await uploadBytes(ref(storage, path), file, {
    contentType: file.type,
  });
  return getDownloadURL(snapshot.ref);
}

/**
 * Upload file draf medsos (content_drafts) ke Storage internal.
 * Path: content-drafts/{uid}/{draftId}/{kind}/{timestamp}-{nama}
 * kind "media" = foto/ilustrasi, "doc" = dokumen rencana PDF.
 * BELUM DIPANGGIL (upload belum aktif) — disiapkan agar form tidak lagi
 * menerima link Drive/eksternal. Return { path, url } untuk disimpan di
 * dokumen (mediaPath/mediaUrl, docPath/docUrl).
 */
export async function uploadDraftFile(
  uid: string,
  draftId: string,
  kind: "media" | "doc",
  file: File
): Promise<{ path: string; url: string }> {
  const err = validateStorageFile(file);
  if (err) throw new Error(err);
  const path = `content-drafts/${uid}/${draftId}/${kind}/${Date.now()}-${sanitizeName(file.name)}`;
  const snapshot = await uploadBytes(ref(storage, path), file, {
    contentType: file.type,
  });
  return { path, url: await getDownloadURL(snapshot.ref) };
}

/**
 * Upload file draf press release ke Storage internal.
 * Path: press-release-drafts/{uid}/{draftId}/media/{timestamp}-{nama}
 * BELUM DIPANGGIL (upload belum aktif) — disiapkan agar form tidak lagi
 * menerima link Drive/eksternal.
 */
export async function uploadPressDraftFile(
  uid: string,
  draftId: string,
  file: File
): Promise<{ path: string; url: string }> {
  const err = validateStorageFile(file);
  if (err) throw new Error(err);
  const path = `press-release-drafts/${uid}/${draftId}/media/${Date.now()}-${sanitizeName(file.name)}`;
  const snapshot = await uploadBytes(ref(storage, path), file, {
    contentType: file.type,
  });
  return { path, url: await getDownloadURL(snapshot.ref) };
}
