/**
 * Helper browser untuk file media (PC storage).
 *
 * Alur satu file:
 *   1. validasi ukuran/tipe
 *   2. kompres gambar (kalau perlu) -> hemat 8-10x
 *   3. POST /api/files/upload-url (Bearer ID token) -> URL bertoken
 *   4. PUT langsung ke PC (tidak lewat Vercel)
 *
 * Setelah itu pemanggil menyimpan `path` ke dokumen lewat PATCH biasa.
 */
import {
  MEDIA_MAX_BYTES,
  validateMediaFile,
  type MediaTarget,
} from "@/lib/mediaShared";

export interface UploadResult {
  path: string;
  size: number;
}

interface UploadUrlResponse {
  path: string;
  url: string;
  method: string;
  headers?: Record<string, string>;
  maxBytes?: number;
}

async function errorFrom(res: Response): Promise<Error> {
  let message = `HTTP ${res.status}`;
  try {
    const data = await res.json();
    if (data?.error) message = String(data.error);
  } catch {
    /* bukan JSON */
  }
  return new Error(message);
}

/**
 * Perkecil gambar di browser sebelum upload.
 * Foto HP 3-5 MB -> ~300-500 KB (sisi terpanjang 1600 px, JPEG q=0.82).
 * PDF dan file kecil dibiarkan apa adanya.
 */
export async function compressImageFile(
  file: File,
  maxSide = 1600,
  quality = 0.82
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.size <= 600 * 1024) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, maxSide / longest);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    );
    if (!blob) return file;
    if (blob.size >= file.size) return file;

    const base = file.name.replace(/\.[^.]+$/, "");
    return new File([blob], `${base}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    // Browser lama / gambar rusak: kirim file asli, biar server yang menilai.
    return file;
  }
}

function putWithProgress(
  url: string,
  file: File,
  mime: string,
  onProgress?: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.setRequestHeader("Content-Type", mime);
    xhr.timeout = 180_000;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve();
      } else {
        let detail = `HTTP ${xhr.status}`;
        try {
          const data = JSON.parse(xhr.responseText);
          if (data?.error) detail = data.error;
        } catch {
          /* bukan JSON */
        }
        reject(new Error(`Upload gagal: ${detail}`));
      }
    };
    xhr.onerror = () =>
      reject(
        new Error(
          "Tidak bisa menghubungi penyimpanan. Pastikan PC storage menyala dan terhubung internet."
        )
      );
    xhr.ontimeout = () => reject(new Error("Upload timeout. Coba lagi dengan file lebih kecil."));
    xhr.send(file);
  });
}

/**
 * Unggah satu file ke PC storage.
 * @param token Firebase ID token (dari `getIdToken()`).
 */
export async function uploadMediaFile(params: {
  token: string;
  target: MediaTarget;
  file: File;
  onProgress?: (percent: number) => void;
}): Promise<UploadResult> {
  const { token, target, onProgress } = params;

  const prepared = await compressImageFile(params.file);
  const invalid = validateMediaFile(prepared);
  if (invalid) throw new Error(invalid);
  if (prepared.size > MEDIA_MAX_BYTES) {
    throw new Error(`Setelah kompresi masih lebih dari ${MEDIA_MAX_BYTES / 1024 / 1024} MB`);
  }

  const res = await fetch("/api/files/upload-url", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      ...target,
      filename: prepared.name,
      size: prepared.size,
      mime: prepared.type,
    }),
  });
  if (!res.ok) throw await errorFrom(res);
  const info = (await res.json()) as UploadUrlResponse;

  await putWithProgress(info.url, prepared, prepared.type, onProgress);
  return { path: info.path, size: prepared.size };
}

/** Ambil URL baca (15 menit) untuk sebuah field file. */
export async function fetchMediaUrl(params: {
  token: string;
  target: MediaTarget;
}): Promise<{ url: string; name: string; path: string }> {
  const res = await fetch("/api/files/download-url", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.token}`,
    },
    body: JSON.stringify(params.target),
  });
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as { url: string; name: string; path: string };
}

/** Buka file di tab baru (URL 15 menit, jadi jangan disimpan/di-bookmark). */
export async function openMediaFile(params: {
  token: string;
  target: MediaTarget;
}): Promise<void> {
  // Buka tab kosong lebih dulu: kalau menunggu fetch, browser menganggapnya
  // bukan aksi user dan memblokir popup.
  const tab = window.open("about:blank", "_blank");
  try {
    const { url } = await fetchMediaUrl(params);
    if (tab) {
      tab.opener = null;
      tab.location.replace(url);
    } else {
      window.location.href = url;
    }
  } catch (err) {
    tab?.close();
    throw err;
  }
}
