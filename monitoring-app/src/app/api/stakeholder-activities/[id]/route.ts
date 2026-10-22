import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireUser } from "@/lib/authServer";
import { isAdminRole } from "@/lib/roles";
import {
  allowedTransitions,
  validateEntryDraft,
  type ActivityStatus,
  type EntryDraft,
  type ReviewActor,
} from "@/lib/stakeholder";

const COLLECTION = "stakeholder_activities";
const EDITABLE: string[] = ["draft", "revisi_tl"];

function readBody(raw: string): any {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function actorFor(role: string | undefined): ReviewActor | null {
  if (role === "team_leader" || role === "staff") return "tl";
  if (role === "asman") return "asman";
  if (role === "admin_uid") return "admin_uid";
  if (role === "administrator" || role === "admin") return "administrator";
  return null;
}

/**
 * PATCH /api/stakeholder-activities/[id]
 * - `update`      : pemilik (draf/revisi) ubah judul/keterangan/bukti.
 * - `submit`      : pemilik kirim ke Asman (draf/revisi → pending_asman).
 * - `transition`  : Asman/Admin UID/TL memindahkan status sesuai matriks
 *                   allowedTransitions() (review dua tingkat).
 */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { response, user } = await requireUser(request);
  if (response) return response;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const body = readBody(await request.text());
  if (body === null) return NextResponse.json({ error: "Body bukan JSON" }, { status: 400 });

  const db = getAdminDb();
  const ref = db.collection(COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Kegiatan tidak ditemukan" }, { status: 404 });
  const doc = snap.data() || {};

  const now = new Date().toISOString();
  const action = String(body.action || "update");
  const isAdmin = isAdminRole(user.role);
  const isOwner = doc.authorUid === user.uid;
  const inUnit = Boolean(user.unitId) && doc.unitId === user.unitId;

  // --- Pemilik: kirim ke Asman ---
  if (action === "submit") {
    if (!isOwner) return NextResponse.json({ error: "Hanya penulis yang boleh mengajukan" }, { status: 403 });
    if (!EDITABLE.includes(String(doc.status))) {
      return NextResponse.json({ error: `Tidak bisa diajukan pada status ${doc.status}` }, { status: 409 });
    }
    await ref.set({ status: "pending_asman", submittedAt: now, updatedAt: now }, { merge: true });
    return NextResponse.json({ ok: true, status: "pending_asman" });
  }

  // --- Reviewer: pindahkan status ---
  if (action === "transition") {
    const to = String(body.to || "") as ActivityStatus;
    const actor = actorFor(user.role);
    if (!actor) return NextResponse.json({ error: "Peran tidak boleh mereview" }, { status: 403 });
    if (!allowedTransitions(doc.status as ActivityStatus, actor).includes(to)) {
      return NextResponse.json(
        { error: `Transisi ${doc.status} → ${to} tidak diizinkan untuk ${actor}` },
        { status: 422 }
      );
    }
    if (actor === "asman" && !inUnit) {
      return NextResponse.json({ error: "Hanya Asman unit yang sama" }, { status: 403 });
    }
    if (actor === "tl" && !isOwner) {
      return NextResponse.json({ error: "Hanya penulis (TL) yang boleh meneruskan" }, { status: 403 });
    }

    const note = String(body.note || "").trim().slice(0, 500);
    const patch: Record<string, unknown> = { status: to, updatedAt: now };
    if (to === "revisi_tl") {
      if (!note) return NextResponse.json({ error: "Catatan revisi wajib diisi" }, { status: 400 });
      if (actor === "asman") patch.asmanNote = note;
      else patch.adminNote = note;
    }
    if (to === "approved") patch.adminNote = note || null;
    if (to === "pending_asman") patch.submittedAt = now;

    await ref.set(patch, { merge: true });
    return NextResponse.json({ ok: true, status: to });
  }

  // --- Pemilik/admin: ubah isi + bukti ---
  if (!isAdmin && !(isOwner && EDITABLE.includes(String(doc.status)))) {
    return NextResponse.json({ error: "Hanya pemilik draf (atau admin) yang boleh mengubah" }, { status: 403 });
  }

  const s = (x: unknown) => String(x ?? "").trim();
  const patch: Record<string, unknown> = { updatedAt: now };

  if (body.judul !== undefined || body.keterangan !== undefined) {
    const merged: EntryDraft = {
      activityKey: String(doc.activityKey || ""),
      tanggal: String(doc.tanggal || ""),
      judul: body.judul !== undefined ? s(body.judul) : String(doc.judul || ""),
      pengaruh: doc.pengaruh,
      kepentingan: doc.kepentingan,
      keterangan:
        body.keterangan !== undefined
          ? s(body.keterangan)
          : String(doc.keteranganKepentingan || ""),
    };
    const v = validateEntryDraft(merged, (Number(doc.kpi) === 5 ? 5 : 6));
    if (v) return NextResponse.json({ error: v }, { status: 400 });
    if (body.judul !== undefined) patch.judul = merged.judul;
    if (body.keterangan !== undefined) patch.keteranganKepentingan = merged.keterangan;
  }

  if (body.evidencePaths !== undefined) {
    if (!Array.isArray(body.evidencePaths)) {
      return NextResponse.json({ error: "evidencePaths harus array" }, { status: 400 });
    }
    patch.evidencePaths = body.evidencePaths
      .map((p: unknown) => String(p || "").trim())
      .filter(Boolean)
      .slice(0, 20);
  }
  if (body.evidenceNames !== undefined) {
    if (!Array.isArray(body.evidenceNames)) {
      return NextResponse.json({ error: "evidenceNames harus array" }, { status: 400 });
    }
    patch.evidenceNames = body.evidenceNames
      .map((n: unknown) => String(n || "").trim().slice(0, 120))
      .filter(Boolean)
      .slice(0, 20);
  }

  if (Object.keys(patch).length === 1) {
    return NextResponse.json({ error: "Tidak ada field yang diubah" }, { status: 400 });
  }

  await ref.set(patch, { merge: true });
  return NextResponse.json({ ok: true });
}

/** DELETE — pemilik (draf/revisi) atau admin. */
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { response, user } = await requireUser(request);
  if (response) return response;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const db = getAdminDb();
  const ref = db.collection(COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Kegiatan tidak ditemukan" }, { status: 404 });
  const doc = snap.data() || {};

  const isOwner = doc.authorUid === user.uid && EDITABLE.includes(String(doc.status));
  if (!isOwner && !isAdminRole(user.role)) {
    return NextResponse.json({ error: "Hanya pemilik draf atau admin yang boleh menghapus" }, { status: 403 });
  }
  await ref.delete();
  return NextResponse.json({ ok: true });
}
