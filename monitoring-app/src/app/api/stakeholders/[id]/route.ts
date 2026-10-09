import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireUser } from "@/lib/authServer";
import { validateStakeholder } from "@/lib/stakeholder";

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

/** Satu unit berbagi daftarnya: anggota se-unit boleh ubah/hapus, admin penuh. */
function canWrite(user: { uid: string; role: string; unitId?: string }, doc: any): boolean {
  if (isAdminRole(user.role)) return true;
  if (user.unitId && doc.unitId && doc.unitId === user.unitId) return true;
  if (doc.authorUid && doc.authorUid === user.uid) return true;
  return false;
}

const STAKEHOLDER_COLS = [
  "instansi",
  "alamat",
  "namaPimpinan",
  "telpKantor",
  "noHpPimpinan",
  "tglUltahPimpinan",
  "namaPic",
  "noHpPic",
  "hutLembaga",
  "isu",
  "sikap",
  "quadrant",
  "tujuan",
  "metode",
  "pelaksana",
  "waktu",
  "tarifDaya",
  "pemeliharaan",
  "mouPks",
  "kerjasamaAnak",
] as const;

/**
 * PATCH /api/stakeholders/[id] — ubah field (se-unit atau admin).
 */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { response, user } = await requireUser(request);
  if (response) return response;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const body = readBody(await request.text());
  if (body === null) return NextResponse.json({ error: "Body bukan JSON" }, { status: 400 });

  const db = getAdminDb();
  const ref = db.collection("stakeholders").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Stakeholder tidak ditemukan" }, { status: 404 });
  const doc = snap.data() || {};
  if (!canWrite(user as any, doc)) {
    return NextResponse.json({ error: "Hanya anggota unit pemilik atau admin yang boleh mengubah" }, { status: 403 });
  }

  const s = (x: unknown) => String(x ?? "").trim();
  const patch: Record<string, unknown> = {};
  const touched = STAKEHOLDER_COLS.some((k) => (body as any)[k] !== undefined);
  if (touched) {
    const merged: Record<string, unknown> = {};
    for (const k of STAKEHOLDER_COLS) merged[k] = (body as any)[k] !== undefined ? (body as any)[k] : (doc as any)[k];
    const v = validateStakeholder(merged);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    for (const k of STAKEHOLDER_COLS) {
      if ((body as any)[k] !== undefined) patch[k] = s((body as any)[k]) || null;
    }
    if (patch.instansi !== undefined) patch.nama = patch.instansi;
    if (patch.namaPimpinan !== undefined) patch.jabatan = patch.namaPimpinan;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Tidak ada field yang diubah" }, { status: 400 });
  }
  patch.updatedAt = new Date().toISOString();
  await ref.set(patch, { merge: true });
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/stakeholders/[id] — hapus (se-unit atau admin).
 */
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { response, user } = await requireUser(request);
  if (response) return response;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const db = getAdminDb();
  const ref = db.collection("stakeholders").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Stakeholder tidak ditemukan" }, { status: 404 });
  const doc = snap.data() || {};
  if (!canWrite(user as any, doc)) {
    return NextResponse.json({ error: "Hanya anggota unit pemilik atau admin yang boleh menghapus" }, { status: 403 });
  }
  await ref.delete();
  return NextResponse.json({ ok: true });
}
