import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireUser } from "@/lib/authServer";
import { MEDIA_COLLECTIONS } from "@/lib/mediaRules";
import {
  MEDIA_ALLOWED_MIME,
  MEDIA_MAX_BYTES,
  MEDIA_TOKEN_TTL_SEC,
  safeFileName,
} from "@/lib/mediaShared";
import { mediaConfig, mediaTokenUrl } from "@/lib/mediaSign";

function readBody(raw: string): any {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Segmen path aman (unitId/id) sesuai penjagaan di PC. */
function segment(value: unknown, fallback: string): string {
  const s = String(value ?? "")
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[._-]+/, "")
    .slice(0, 60);
  return s || fallback;
}

/**
 * POST /api/files/upload-url
 * Body: { collection, id, field, filename, size, mime }
 * Return: { path, url, method, headers, expiresAt }
 *
 * Alur: dokumen dibuat dulu (mis. draf kunjungan) -> minta URL -> browser
 * PUT langsung ke PC -> PATCH dokumen dengan `path`. File tidak lewat Vercel.
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
  if (!id || id.length > 128 || id.includes("/")) {
    return NextResponse.json({ error: "id dokumen tidak valid" }, { status: 400 });
  }

  const field = String(body.field || "");
  const fieldRule = rule.fields[field];
  if (!fieldRule) {
    return NextResponse.json(
      { error: `Field file tidak dikenal. Pilihan: ${Object.keys(rule.fields).join(", ")}` },
      { status: 400 }
    );
  }

  const filename = String(body.filename || "").trim();
  const size = Number(body.size);
  const mime = String(body.mime || "").toLowerCase();

  if (!filename || filename.length > 200) {
    return NextResponse.json({ error: "nama file tidak valid" }, { status: 400 });
  }
  if (!(MEDIA_ALLOWED_MIME as readonly string[]).includes(mime)) {
    return NextResponse.json(
      { error: "File harus PDF atau gambar (JPG/PNG/WebP)" },
      { status: 400 }
    );
  }
  if (!Number.isInteger(size) || size <= 0 || size > MEDIA_MAX_BYTES) {
    return NextResponse.json(
      { error: `Ukuran file harus 1 byte sampai ${MEDIA_MAX_BYTES / 1024 / 1024} MB` },
      { status: 400 }
    );
  }

  const snap = await getAdminDb().collection(collection).doc(id).get();
  if (!snap.exists) {
    return NextResponse.json(
      { error: "Dokumen belum ada. Simpan draf dulu, lalu unggah file." },
      { status: 404 }
    );
  }
  const doc = snap.data() as Record<string, any>;

  if (!rule.canWrite(doc, user)) {
    return NextResponse.json(
      { error: "Hanya pemilik draf (atau admin) yang boleh mengunggah file" },
      { status: 403 }
    );
  }

  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const rand = crypto.randomBytes(4).toString("hex");
  const path = [
    rule.prefix,
    segment(doc.unitId || user.unitId, "no-unit"),
    String(yyyy),
    mm,
    segment(id, "doc"),
    fieldRule.folder,
    `${Date.now()}-${rand}-${safeFileName(filename)}`,
  ].join("/");

  const { url, expiresAt } = mediaTokenUrl({
    o: "put",
    p: path,
    s: size,
    t: mime,
    n: filename.slice(0, 120),
  });

  return NextResponse.json({
    ok: true,
    path,
    url,
    method: "PUT",
    headers: { "Content-Type": mime },
    maxBytes: MEDIA_MAX_BYTES,
    expiresInSec: MEDIA_TOKEN_TTL_SEC,
    expiresAt,
  });
}
