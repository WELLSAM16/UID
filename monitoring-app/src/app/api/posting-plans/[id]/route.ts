import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/authServer";
import {
  POSTING_PLAN_COLLECTION,
  POSTING_PLAN_MAX_CAPTION,
  validatePostingPlan,
} from "@/lib/postingPlan";

function readBody(raw: string): any {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** PATCH /api/posting-plans/[id] — ubah rencana + daftar media (UID/admin). */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { response } = await requireAdmin(request);
  if (response) return response;
  const { id } = await ctx.params;

  const body = readBody(await request.text());
  if (body === null) return NextResponse.json({ error: "Body bukan JSON" }, { status: 400 });

  const db = getAdminDb();
  const ref = db.collection(POSTING_PLAN_COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Rencana tidak ditemukan" }, { status: 404 });
  const doc = snap.data() || {};

  const mediaPaths = body.mediaPaths !== undefined ? body.mediaPaths : doc.mediaPaths ?? [];
  const mediaNames = body.mediaNames !== undefined ? body.mediaNames : doc.mediaNames ?? [];

  const v = validatePostingPlan({
    tanggal: body.tanggal !== undefined ? body.tanggal : doc.tanggal,
    judul: body.judul !== undefined ? body.judul : doc.judul,
    caption: body.caption !== undefined ? body.caption : doc.caption,
    mediaPaths,
    mediaNames,
  });
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  if (Array.isArray(mediaPaths) && Array.isArray(mediaNames) && mediaPaths.length !== mediaNames.length) {
    return NextResponse.json(
      { error: "Jumlah mediaPaths dan mediaNames harus sama" },
      { status: 400 }
    );
  }

  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (body.tanggal !== undefined) patch.tanggal = String(body.tanggal);
  if (body.judul !== undefined) patch.judul = String(body.judul).trim();
  if (body.caption !== undefined) {
    patch.caption = String(body.caption ?? "").slice(0, POSTING_PLAN_MAX_CAPTION);
  }
  if (body.mediaPaths !== undefined) {
    patch.mediaPaths = (mediaPaths as unknown[]).map((p) => String(p));
  }
  if (body.mediaNames !== undefined) {
    patch.mediaNames = (mediaNames as unknown[]).map((n) => String(n).slice(0, 120));
  }

  try {
    await ref.set(patch, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Gagal memperbarui rencana", details: err?.message },
      { status: 500 }
    );
  }
}

/** DELETE /api/posting-plans/[id] — hapus rencana (UID/admin). */
export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { response } = await requireAdmin(request);
  if (response) return response;
  const { id } = await ctx.params;

  const ref = getAdminDb().collection(POSTING_PLAN_COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Rencana tidak ditemukan" }, { status: 404 });

  await ref.delete();
  return NextResponse.json({ ok: true });
}
