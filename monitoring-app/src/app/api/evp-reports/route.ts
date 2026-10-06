import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireUser } from "@/lib/authServer";
import { validateEvp, monthKey } from "@/lib/evp";
import { normalizeUnitId } from "@/lib/roles";

function readBody(raw: string): any {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * GET /api/evp-reports — daftar laporan EVP.
 * - staff/team_leader/asman: hanya unitnya sendiri.
 * - admin_uid/administrator: semua (filter ?unitId= & ?bulan=YYYY-MM opsional).
 */
export async function GET(request: Request) {
  const { response, user } = await requireUser(request);
  if (response) return response;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const isAdmin = user.role === "admin_uid" || user.role === "administrator" || user.role === "admin";
  let unitId = user.unitId || null;
  if (isAdmin) {
    const q = params.get("unitId");
    unitId = q ? normalizeUnitId(q) || q : null;
  }
  const bulan = params.get("bulan"); // YYYY-MM

  const db = getAdminDb();
  let q: FirebaseFirestore.Query = db.collection("evp_reports");
  if (unitId) q = q.where("unitId", "==", unitId);
  const snap = await q.get();
  let items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as any[];
  if (bulan && /^\d{4}-\d{2}$/.test(bulan)) {
    items = items.filter((e) => monthKey(String(e.tanggalPelaksanaan || "")) === bulan);
  }
  items.sort((a, b) => String(b.tanggalPelaksanaan || "").localeCompare(String(a.tanggalPelaksanaan || "")));
  return NextResponse.json({ reports: items });
}

/**
 * POST /api/evp-reports — tambah laporan (status draft, unit = unit penulis).
 * Nama/NIP/unit diprefill dari profil penulis di client; server tetap validasi.
 */
export async function POST(request: Request) {
  const { response, user } = await requireUser(request);
  if (response) return response;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.unitId) {
    return NextResponse.json({ error: "Akun belum punya unit. Hubungi administrator." }, { status: 400 });
  }

  const body = readBody(await request.text());
  if (body === null) return NextResponse.json({ error: "Body bukan JSON" }, { status: 400 });
  const v = validateEvp(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const s = (x: unknown) => String(x ?? "").trim();
  const now = new Date().toISOString();
  const ref = await getAdminDb().collection("evp_reports").add({
    unitId: user.unitId,
    namaPegawai: s(body.namaPegawai),
    nip: s(body.nip),
    noHp: s(body.noHp),
    unitAsal: s(body.unitAsal),
    upDetail: s(body.upDetail),
    kategoriProgram: s(body.kategoriProgram),
    namaProgram: s(body.namaProgram),
    lokasiProvinsi: s(body.lokasiProvinsi),
    lokasiKota: s(body.lokasiKota),
    lokasiKecamatan: s(body.lokasiKecamatan),
    lokasiKelurahan: s(body.lokasiKelurahan),
    evidenUrl: s(body.evidenUrl) || null,
    tanggalPelaksanaan: s(body.tanggalPelaksanaan),
    deskripsi: s(body.deskripsi),
    status: "draft",
    authorUid: user.uid,
    authorEmail: user.email || null,
    createdAt: now,
    updatedAt: now,
    submittedAt: null,
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
  });
  return NextResponse.json({ ok: true, id: ref.id }, { status: 201 });
}
