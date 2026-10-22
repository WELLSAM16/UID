import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireUser } from "@/lib/authServer";
import { isAdminRole } from "@/lib/roles";
import {
  INTEREST_LEVELS,
  INFLUENCE_LEVELS,
  quadrantFor,
  kpiForQuadrantStrict,
  validateEntryDraft,
  type EntryDraft,
  type InfluenceLevel,
  type InterestLevel,
} from "@/lib/stakeholder";

const COLLECTION = "stakeholder_activities";

function readBody(raw: string): any {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * GET /api/stakeholder-activities?kpi=&bulan=&tahun=&unitId=
 * - TL/Asman: hanya unitnya sendiri.
 * - Admin UID/administrator: semua unit (bisa difilter ?unitId=).
 */
export async function GET(request: Request) {
  const { response, user } = await requireUser(request);
  if (response) return response;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const db = getAdminDb();
  let q: FirebaseFirestore.Query = db.collection(COLLECTION);

  if (!isAdminRole(user.role)) {
    if (!user.unitId) return NextResponse.json({ activities: [] });
    q = q.where("unitId", "==", user.unitId);
  } else {
    const unitId = params.get("unitId");
    if (unitId) q = q.where("unitId", "==", unitId);
  }

  const snap = await q.get();
  let items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as any[];

  const kpi = Number(params.get("kpi"));
  if (kpi === 5 || kpi === 6) items = items.filter((e) => Number(e.kpi) === kpi);
  const bulan = Number(params.get("bulan"));
  if (bulan >= 1 && bulan <= 12) items = items.filter((e) => Number(e.bulan) === bulan);
  const tahun = Number(params.get("tahun"));
  if (tahun > 2000 && tahun < 2100) items = items.filter((e) => Number(e.tahun) === tahun);

  items.sort((a, b) => String(b.tanggal || "").localeCompare(String(a.tanggal || "")));
  return NextResponse.json({ activities: items });
}

/**
 * POST /api/stakeholder-activities — tambah satu kegiatan (status draft).
 * Kuadran & KPI diturunkan server dari pengaruh × kepentingan (tidak
 * mempercayai nilai dari client). Bukti diunggah setelah dokumen ini ada.
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

  const pengaruh = String(body.pengaruh || "");
  const kepentingan = String(body.kepentingan || "");
  if (!(INFLUENCE_LEVELS as readonly string[]).includes(pengaruh)) {
    return NextResponse.json({ error: "Tingkat pengaruh tidak valid" }, { status: 400 });
  }
  if (!(INTEREST_LEVELS as readonly string[]).includes(kepentingan)) {
    return NextResponse.json({ error: "Tingkat kepentingan tidak valid" }, { status: 400 });
  }

  const draft: EntryDraft = {
    activityKey: String(body.activityKey || ""),
    tanggal: String(body.tanggal || ""),
    judul: String(body.judul || ""),
    pengaruh: pengaruh as InfluenceLevel,
    kepentingan: kepentingan as InterestLevel,
    keterangan: String(body.keterangan || ""),
  };
  const quadrant = quadrantFor(draft.pengaruh as InfluenceLevel, draft.kepentingan as InterestLevel);
  const kpi = kpiForQuadrantStrict(quadrant);

  const v = validateEntryDraft(draft, kpi);
  if (v) return NextResponse.json({ error: v }, { status: 400 });

  const tanggal = draft.tanggal;
  const bulan = Number(tanggal.slice(5, 7));
  const tahun = Number(tanggal.slice(0, 4));
  const now = new Date().toISOString();

  const db = getAdminDb();
  const ref = await db.collection(COLLECTION).add({
    unitId: user.unitId,
    kpi,
    activityKey: draft.activityKey,
    quadrant,
    pengaruh: draft.pengaruh,
    kepentingan: draft.kepentingan,
    tanggal,
    judul: draft.judul.trim(),
    keteranganKepentingan: draft.keterangan.trim(),
    bulan,
    tahun,
    jumlah: 1,
    evidencePaths: [],
    evidenceNames: [],
    status: "draft",
    authorUid: user.uid,
    authorEmail: user.email || null,
    createdAt: now,
    updatedAt: now,
    submittedAt: null,
    asmanNote: null,
    adminNote: null,
  });

  return NextResponse.json({ ok: true, id: ref.id }, { status: 201 });
}
