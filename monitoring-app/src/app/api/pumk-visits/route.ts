import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireUser } from "@/lib/authServer";
import { validatePumkVisit, monthKey } from "@/lib/pumkVisit";
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
 * GET /api/pumk-visits — daftar laporan kunjungan PUMK.
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
  let q: FirebaseFirestore.Query = db.collection("pumk_visits");
  if (unitId) q = q.where("unitId", "==", unitId);
  const snap = await q.get();
  let items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as any[];
  if (bulan && /^\d{4}-\d{2}$/.test(bulan)) {
    items = items.filter((e) => monthKey(String(e.tanggalKunjungan || "")) === bulan);
  }
  items.sort((a, b) => String(b.tanggalKunjungan || "").localeCompare(String(a.tanggalKunjungan || "")));
  return NextResponse.json({ visits: items });
}

/**
 * POST /api/pumk-visits — tambah laporan (status draft, unit = unit penulis).
 * Body mengikuti field g-form (lihat lib/pumkVisit.ts).
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
  const v = validatePumkVisit(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const s = (x: unknown) => String(x ?? "").trim();
  const now = new Date().toISOString();
  const ref = await getAdminDb().collection("pumk_visits").add({
    unitId: user.unitId,
    tanggalKunjungan: s(body.tanggalKunjungan),
    noId: s(body.noId),
    namaMitra: s(body.namaMitra),
    kolektibilitas: s(body.kolektibilitas),
    saldoPokok: Number(body.saldoPokok),
    saldoJasa: Number(body.saldoJasa),
    totalSaldo: Number(body.totalSaldo),
    jenisTindakLanjut: s(body.jenisTindakLanjut),
    lokasiUrl: s(body.lokasiUrl) || null,
    kondisiMitra: s(body.kondisiMitra) || null,
    formOUrl: s(body.formOUrl) || null,
    dokumenLainUrl: s(body.dokumenLainUrl) || null,
    buktiBayarUrl: s(body.buktiBayarUrl) || null,
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
