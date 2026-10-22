import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireUser } from "@/lib/authServer";
import { MEDIA_COLLECTIONS } from "@/lib/mediaRules";
import { MEDIA_TOKEN_TTL_SEC, nameFieldOf } from "@/lib/mediaShared";
import { mediaConfig, mediaTokenUrl } from "@/lib/mediaSign";

function readBody(raw: string): any {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * POST /api/files/download-url
 * Body: { collection, id, field }
 * Return: { url, path, name, expiresAt }
 *
 * URL berlaku 15 menit dan hanya untuk file yang tercatat di dokumen itu.
 * Path diambil dari Firestore (bukan dari klien) supaya tidak bisa dipakai
 * membaca file dokumen lain.
 */
export async function POST(request: Request) {
  const cfg = mediaConfig();
  if (!cfg.ready) {
    return NextResponse.json(
      { error: "Penyimpanan file belum dikonfigurasi (MEDIA_BASE_URL / MEDIA_SECRET)." },
      { status: 503 }
    );
  }

  const { response, user } = await requireUser(request);
  if (response) return response;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = readBody(await request.text());
  if (body === null) return NextResponse.json({ error: "Body bukan JSON" }, { status: 400 });

  const collection = String(body.collection || "");
  const rule = MEDIA_COLLECTIONS[collection];
  if (!rule) return NextResponse.json({ error: "Koleksi tidak mendukung file" }, { status: 400 });

  const id = String(body.id || "").trim();
  if (!id || id.includes("/")) {
    return NextResponse.json({ error: "id dokumen tidak valid" }, { status: 400 });
  }

  const field = String(body.field || "");
  if (!rule.fields[field]) {
    return NextResponse.json({ error: "Field file tidak dikenal" }, { status: 400 });
  }

  const snap = await getAdminDb().collection(collection).doc(id).get();
  if (!snap.exists) return NextResponse.json({ error: "Dokumen tidak ditemukan" }, { status: 404 });
  const doc = snap.data() as Record<string, any>;

  if (!rule.canRead(doc, user)) {
    return NextResponse.json({ error: "Tidak berhak membuka file ini" }, { status: 403 });
  }

  const path = (() => {
    const raw = doc[field];
    if (Array.isArray(raw)) {
      const idx = Number(body.index);
      if (!Number.isInteger(idx) || idx < 0 || idx >= raw.length) return "";
      return String(raw[idx] || "");
    }
    return String(raw || "");
  })();
  if (!path) {
    return NextResponse.json({ error: "File belum diunggah" }, { status: 404 });
  }
  // Jangan percaya isi dokumen mentah: path harus berada di prefix koleksi ini.
  if (!path.startsWith(`${rule.prefix}/`) || path.includes("..") || path.includes("\\")) {
    return NextResponse.json({ error: "Path file tidak valid" }, { status: 409 });
  }

  const nameIdx = Array.isArray(doc[field]) ? Number(body.index) : -1;
  const rawName = doc[nameFieldOf(field)];
  const name = String(
    (Array.isArray(rawName) && nameIdx >= 0 ? rawName[nameIdx] : rawName) ||
      path.split("/").pop() ||
      "dokumen"
  );
  const { url, expiresAt } = mediaTokenUrl({ o: "get", p: path, n: name.slice(0, 120) });

  return NextResponse.json({
    ok: true,
    url,
    path,
    name,
    expiresInSec: MEDIA_TOKEN_TTL_SEC,
    expiresAt,
  });
}
