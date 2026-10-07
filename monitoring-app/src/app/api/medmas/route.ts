import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireUser } from "@/lib/authServer";
import { validateMedmas, monthKey } from "@/lib/medmas";
import { normalizeUnitId } from "@/lib/roles";

function readBody(raw: string): any {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isReviewer(role: string | undefined): boolean {
  return (
    role === "team_leader" ||
    role === "asman" ||
    role === "admin_uid" ||
    role === "administrator" ||
    role === "admin"
  );
}

/**
 * GET /api/medmas — daftar entri medmas.
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
  let q: FirebaseFirestore.Query = db.collection("medmas_entries");
  if (unitId) q = q.where("unitId", "==", unitId);
  const snap = await q.get();
  let items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as any[];
  if (bulan && /^\d{4}-\d{2}$/.test(bulan)) {
    items = items.filter((e) => monthKey(String(e.tanggal || "")) === bulan);
  }
  items.sort((a, b) => String(b.tanggal || "").localeCompare(String(a.tanggal || "")));
  return NextResponse.json({ entries: items });
}

/**
 * POST /api/medmas — tambah entri (status draft, unit = unit penulis).
 * Body: { tanggal, outlet, judul, url?, tierMedia?, skor }
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
  const v = validateMedmas(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const now = new Date().toISOString();
  const ref = await getAdminDb().collection("medmas_entries").add({
    unitId: user.unitId,
    tanggal: String(body.tanggal).trim(),
    outlet: String(body.outlet).trim(),
    judul: String(body.judul).trim(),
    url: body.url ? String(body.url).trim() : null,
    tierMedia: body.tierMedia ? String(body.tierMedia) : null,
    skor: Number(body.skor),
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
