import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireUser } from "@/lib/authServer";
import { validateMedmas } from "@/lib/medmas";

function readBody(raw: string): any {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isAdminRole(role: string | undefined): boolean {
  return role === "admin_uid" || role === "administrator" || role === "admin";
}

function canReview(user: { uid: string; role: string; unitId?: string }, doc: any): boolean {
  if (isAdminRole(user.role)) return true;
  if ((user.role === "team_leader" || user.role === "asman") && user.unitId && doc.unitId === user.unitId) {
    return doc.authorUid !== user.uid;
  }
  return false;
}

/**
 * PATCH /api/medmas/[id]
 * - Pemilik (status draft): ubah field / submit ({ action: "submit" }).
 * - Reviewer (TL/Asman se-unit selain penulis, atau admin): approve / reject.
 */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { response, user } = await requireUser(request);
  if (response) return response;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const body = readBody(await request.text());
  if (body === null) return NextResponse.json({ error: "Body bukan JSON" }, { status: 400 });

  const db = getAdminDb();
  const ref = db.collection("medmas_entries").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Entri tidak ditemukan" }, { status: 404 });
  const doc = snap.data() || {};
  const now = new Date().toISOString();
  const action = String(body.action || "update");

  // --- Reviewer: approve / reject atas pending ---
  if (action === "approve" || action === "reject") {
    if (doc.status !== "pending") {
      return NextResponse.json({ error: "Hanya entri pending yang bisa direview" }, { status: 409 });
    }
    if (!canReview(user as any, doc)) {
      return NextResponse.json({ error: "Hanya TL/Asman se-unit atau admin yang boleh mereview" }, { status: 403 });
    }
    await ref.set(
      {
        status: action === "approve" ? "approved" : "rejected",
        reviewNote: String(body.note || "").slice(0, 500) || null,
        reviewedBy: user.uid,
        reviewedAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
    return NextResponse.json({ ok: true, status: action === "approve" ? "approved" : "rejected" });
  }

  // --- Pemilik: ajukan (draft → pending) ---
  if (action === "submit") {
    if (doc.authorUid !== user.uid) {
      return NextResponse.json({ error: "Hanya penulis yang boleh mengajukan" }, { status: 403 });
    }
    if (doc.status !== "draft") {
      return NextResponse.json({ error: "Hanya draf yang bisa diajukan" }, { status: 409 });
    }
    await ref.set({ status: "pending", submittedAt: now, updatedAt: now }, { merge: true });
    return NextResponse.json({ ok: true, status: "pending" });
  }

  // --- Pemilik/admin: ubah field (draf milik sendiri, atau admin kapan saja) ---
  const isOwnerDraft = doc.authorUid === user.uid && doc.status === "draft";
  if (!isOwnerDraft && !isAdminRole(user.role)) {
    return NextResponse.json({ error: "Hanya draf milik sendiri yang bisa diubah" }, { status: 403 });
  }
  const patch: Record<string, unknown> = {};
  if (body.tanggal !== undefined || body.outlet !== undefined || body.judul !== undefined || body.skor !== undefined) {
    const v = validateMedmas({
      tanggal: body.tanggal ?? doc.tanggal,
      outlet: body.outlet ?? doc.outlet,
      judul: body.judul ?? doc.judul,
      url: body.url ?? doc.url,
      tierMedia: body.tierMedia ?? doc.tierMedia,
      skor: body.skor ?? doc.skor,
    });
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    if (body.tanggal !== undefined) patch.tanggal = String(body.tanggal).trim();
    if (body.outlet !== undefined) patch.outlet = String(body.outlet).trim();
    if (body.judul !== undefined) patch.judul = String(body.judul).trim();
    if (body.url !== undefined) patch.url = body.url ? String(body.url).trim() : null;
    if (body.tierMedia !== undefined) patch.tierMedia = body.tierMedia ? String(body.tierMedia) : null;
    if (body.skor !== undefined) patch.skor = Number(body.skor);
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Tidak ada field yang diubah" }, { status: 400 });
  }
  patch.updatedAt = now;
  await ref.set(patch, { merge: true });
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/medmas/[id] — hapus entri.
 * Pemilik (draf) atau admin. Entri approved hanya admin (koreksi data).
 */
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { response, user } = await requireUser(request);
  if (response) return response;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const db = getAdminDb();
  const ref = db.collection("medmas_entries").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Entri tidak ditemukan" }, { status: 404 });
  const doc = snap.data() || {};

  const isOwnerDraft = doc.authorUid === user.uid && (doc.status === "draft" || doc.status === "rejected");
  if (!isOwnerDraft && !isAdminRole(user.role)) {
    return NextResponse.json({ error: "Hanya draf milik sendiri atau admin yang boleh menghapus" }, { status: 403 });
  }
  await ref.delete();
  return NextResponse.json({ ok: true });
}
