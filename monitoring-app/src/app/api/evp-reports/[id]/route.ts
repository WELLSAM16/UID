import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireUser } from "@/lib/authServer";
import { validateEvp } from "@/lib/evp";

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
 * PATCH /api/evp-reports/[id]
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
  const ref = db.collection("evp_reports").doc(id);
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
  const s = (x: unknown) => String(x ?? "").trim();
  const needsValidation = [
    "namaPegawai", "nip", "noHp", "unitAsal", "upDetail", "kategoriProgram",
    "namaProgram", "lokasiProvinsi", "lokasiKota", "lokasiKecamatan",
    "lokasiKelurahan", "tanggalPelaksanaan", "deskripsi",
  ].some((k) => body[k] !== undefined);
  const patch: Record<string, unknown> = {};
  if (needsValidation) {
    const v = validateEvp({
      namaPegawai: body.namaPegawai ?? doc.namaPegawai,
      nip: body.nip ?? doc.nip,
      noHp: body.noHp ?? doc.noHp,
      unitAsal: body.unitAsal ?? doc.unitAsal,
      upDetail: body.upDetail ?? doc.upDetail,
      kategoriProgram: body.kategoriProgram ?? doc.kategoriProgram,
      namaProgram: body.namaProgram ?? doc.namaProgram,
      lokasiProvinsi: body.lokasiProvinsi ?? doc.lokasiProvinsi,
      lokasiKota: body.lokasiKota ?? doc.lokasiKota,
      lokasiKecamatan: body.lokasiKecamatan ?? doc.lokasiKecamatan,
      lokasiKelurahan: body.lokasiKelurahan ?? doc.lokasiKelurahan,
      tanggalPelaksanaan: body.tanggalPelaksanaan ?? doc.tanggalPelaksanaan,
      deskripsi: body.deskripsi ?? doc.deskripsi,
    });
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    for (const k of [
      "namaPegawai", "nip", "noHp", "unitAsal", "upDetail", "kategoriProgram",
      "namaProgram", "lokasiProvinsi", "lokasiKota", "lokasiKecamatan",
      "lokasiKelurahan", "tanggalPelaksanaan", "deskripsi",
    ]) {
      if (body[k] !== undefined) patch[k] = s(body[k]);
    }
  }
  if (body.evidenUrl !== undefined) patch.evidenUrl = s(body.evidenUrl) || null;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Tidak ada field yang diubah" }, { status: 400 });
  }
  patch.updatedAt = now;
  await ref.set(patch, { merge: true });
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/evp-reports/[id] — hapus laporan.
 * Pemilik (draf/rejected) atau admin. Laporan approved hanya admin (koreksi data).
 */
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { response, user } = await requireUser(request);
  if (response) return response;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const db = getAdminDb();
  const ref = db.collection("evp_reports").doc(id);
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
