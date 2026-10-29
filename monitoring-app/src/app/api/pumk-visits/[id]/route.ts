import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireUser } from "@/lib/authServer";
import { validatePumkVisit, isStoragePathOrEmpty } from "@/lib/pumkVisit";

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
  // Setujui/tolak hanya Asman se-unit, bukan TL dan bukan penulis sendiri.
  if (user.role !== "asman") return false;
  if (!user.unitId || doc.unitId !== user.unitId) return false;
  return doc.authorUid !== user.uid;
}

/** TL se-unit boleh mengubah & mengajukan laporan unitnya; penulis boleh mengubah drafnya. */
function canEditVisit(user: { uid: string; role: string; unitId?: string }, doc: any): boolean {
  if (isAdminRole(user.role)) return true;
  if (doc.status !== "draft" && doc.status !== "rejected") return false;
  if (doc.authorUid === user.uid) return true;
  return user.role === "team_leader" && !!user.unitId && doc.unitId === user.unitId;
}

/**
 * PATCH /api/pumk-visits/[id]
 * - Pemilik/TL se-unit (status draft/ditolak): ubah field.
 * - Pemilik atau TL se-unit: submit ({ action: "submit" }) → menunggu Asman.
 * - Asman se-unit selain penulis: approve / reject (admin tidak menyetujui).
 */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { response, user } = await requireUser(request);
  if (response) return response;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const body = readBody(await request.text());
  if (body === null) return NextResponse.json({ error: "Body bukan JSON" }, { status: 400 });

  const db = getAdminDb();
  const ref = db.collection("pumk_visits").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Laporan tidak ditemukan" }, { status: 404 });
  const doc = snap.data() || {};
  const now = new Date().toISOString();
  const action = String(body.action || "update");

  // --- Reviewer: approve / reject atas pending ---
  if (action === "approve" || action === "reject") {
    if (doc.status !== "pending") {
      return NextResponse.json({ error: "Hanya laporan pending yang bisa direview" }, { status: 409 });
    }
    if (!canReview(user as any, doc)) {
      return NextResponse.json({ error: "Hanya Asman se-unit yang boleh menyetujui/menolak" }, { status: 403 });
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

  // --- Pemilik/TL se-unit: ajukan ke Asman (draft/ditolak → pending) ---
  if (action === "submit") {
    const isTlUnit =
      user.role === "team_leader" && !!user.unitId && doc.unitId === user.unitId;
    if (doc.authorUid !== user.uid && !isTlUnit) {
      return NextResponse.json(
        { error: "Hanya penulis atau TL unit yang boleh mengajukan laporan" },
        { status: 403 }
      );
    }
    if (doc.status !== "draft" && doc.status !== "rejected") {
      return NextResponse.json({ error: "Hanya draf atau laporan ditolak yang bisa diajukan" }, { status: 409 });
    }
    // Jangan biarkan laporan diajukan tanpa foto bukti kunjungan ke mitra.
    if (!doc.evidencePath) {
      return NextResponse.json(
        { error: "Unggah foto bukti kunjungan sebelum mengajukan laporan." },
        { status: 409 }
      );
    }
    // Jangan biarkan laporan Penagihan diajukan tanpa bukti bayar.
    if (String(doc.jenisTindakLanjut || "") === "Penagihan" && !doc.buktiBayarPath && !doc.buktiBayarUrl) {
      return NextResponse.json(
        { error: "Unggah file bukti pembayaran sebelum mengajukan laporan Penagihan." },
        { status: 409 }
      );
    }
    await ref.set(
      {
        status: "pending",
        submittedAt: now,
        updatedAt: now,
        reviewNote: null,
        reviewedBy: null,
        reviewedAt: null,
      },
      { merge: true }
    );
    return NextResponse.json({ ok: true, status: "pending" });
  }

  // --- Pemilik/TL se-unit/admin: ubah field ---
  if (!canEditVisit(user as any, doc)) {
    return NextResponse.json(
      { error: "Hanya draf/ditolak milik sendiri, TL se-unit, atau admin yang bisa diubah" },
      { status: 403 }
    );
  }
  const needsValidation =
    body.tanggalKunjungan !== undefined ||
    body.noId !== undefined ||
    body.namaMitra !== undefined ||
    body.kolektibilitas !== undefined ||
    body.saldoPokok !== undefined ||
    body.saldoJasa !== undefined ||
    body.totalSaldo !== undefined ||
    body.jenisTindakLanjut !== undefined;
  const patch: Record<string, unknown> = {};
  const s = (x: unknown) => String(x ?? "").trim();
  if (needsValidation) {
    const v = validatePumkVisit({
      tanggalKunjungan: body.tanggalKunjungan ?? doc.tanggalKunjungan,
      noId: body.noId ?? doc.noId,
      namaMitra: body.namaMitra ?? doc.namaMitra,
      kolektibilitas: body.kolektibilitas ?? doc.kolektibilitas,
      saldoPokok: body.saldoPokok ?? doc.saldoPokok,
      saldoJasa: body.saldoJasa ?? doc.saldoJasa,
      totalSaldo: body.totalSaldo ?? doc.totalSaldo,
      jenisTindakLanjut: body.jenisTindakLanjut ?? doc.jenisTindakLanjut,
      lokasiUrl: body.lokasiUrl ?? doc.lokasiUrl,
      kondisiMitra: body.kondisiMitra ?? doc.kondisiMitra,
      formOUrl: body.formOUrl ?? doc.formOUrl,
      dokumenLainUrl: body.dokumenLainUrl ?? doc.dokumenLainUrl,
      buktiBayarUrl: body.buktiBayarUrl ?? doc.buktiBayarUrl,
      formOPath: body.formOPath ?? doc.formOPath,
      dokumenLainPath: body.dokumenLainPath ?? doc.dokumenLainPath,
      evidencePath: body.evidencePath ?? doc.evidencePath,
      buktiBayarPath: body.buktiBayarPath ?? doc.buktiBayarPath,
    });
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    if (body.tanggalKunjungan !== undefined) patch.tanggalKunjungan = s(body.tanggalKunjungan);
    if (body.noId !== undefined) patch.noId = s(body.noId);
    if (body.namaMitra !== undefined) patch.namaMitra = s(body.namaMitra);
    if (body.kolektibilitas !== undefined) patch.kolektibilitas = s(body.kolektibilitas);
    if (body.saldoPokok !== undefined) patch.saldoPokok = Number(body.saldoPokok);
    if (body.saldoJasa !== undefined) patch.saldoJasa = Number(body.saldoJasa);
    if (body.totalSaldo !== undefined) patch.totalSaldo = Number(body.totalSaldo);
    if (body.jenisTindakLanjut !== undefined) patch.jenisTindakLanjut = s(body.jenisTindakLanjut);
  }
  if (body.lokasiUrl !== undefined) patch.lokasiUrl = s(body.lokasiUrl) || null;
  if (body.kondisiMitra !== undefined) patch.kondisiMitra = s(body.kondisiMitra) || null;
  if (body.formOUrl !== undefined) patch.formOUrl = s(body.formOUrl) || null;
  if (body.dokumenLainUrl !== undefined) patch.dokumenLainUrl = s(body.dokumenLainUrl) || null;
  if (body.buktiBayarUrl !== undefined) patch.buktiBayarUrl = s(body.buktiBayarUrl) || null;
  const menyentuhFile =
    body.formOPath !== undefined ||
    body.dokumenLainPath !== undefined ||
    body.evidencePath !== undefined ||
    body.buktiBayarPath !== undefined;
  if (menyentuhFile && doc.status !== "draft" && doc.status !== "rejected") {
    return NextResponse.json(
      { error: "File bukti hanya bisa diubah saat draf atau setelah laporan ditolak." },
      { status: 409 }
    );
  }
  for (const key of ["formOPath", "dokumenLainPath", "evidencePath", "buktiBayarPath"] as const) {
    if (body[key] === undefined) continue;
    if (!isStoragePathOrEmpty(body[key])) {
      return NextResponse.json({ error: `${key} tidak valid` }, { status: 400 });
    }
    patch[key] = s(body[key]) || null;
  }
  for (const key of ["formOName", "dokumenLainName", "evidenceName", "buktiBayarName"] as const) {
    if (body[key] === undefined) continue;
    patch[key] = s(body[key]).slice(0, 120) || null;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Tidak ada field yang diubah" }, { status: 400 });
  }
  patch.updatedAt = now;
  await ref.set(patch, { merge: true });
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/pumk-visits/[id] — hapus laporan.
 * Pemilik (draf/rejected) atau admin. Laporan approved hanya admin (koreksi data).
 */
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { response, user } = await requireUser(request);
  if (response) return response;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const db = getAdminDb();
  const ref = db.collection("pumk_visits").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Laporan tidak ditemukan" }, { status: 404 });
  const doc = snap.data() || {};

  const isOwnerDraft = doc.authorUid === user.uid && (doc.status === "draft" || doc.status === "rejected");
  if (!isOwnerDraft && !isAdminRole(user.role)) {
    return NextResponse.json({ error: "Hanya draf milik sendiri atau admin yang boleh menghapus" }, { status: 403 });
  }
  await ref.delete();
  return NextResponse.json({ ok: true });
}
