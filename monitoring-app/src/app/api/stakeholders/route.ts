import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireUser } from "@/lib/authServer";
import { validateStakeholder } from "@/lib/stakeholder";
import { normalizeUnitId } from "@/lib/roles";

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
 * GET /api/stakeholders — database stakeholder per unit (pengganti tab SPS per UP3).
 * - staff/team_leader/asman: hanya unitnya sendiri.
 * - admin_uid/administrator: semua (filter ?unitId= opsional).
 */
export async function GET(request: Request) {
  const { response, user } = await requireUser(request);
  if (response) return response;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const isAdmin = isAdminRole(user.role);
  let unitId = user.unitId || null;
  if (isAdmin) {
    const q = params.get("unitId");
    unitId = q ? normalizeUnitId(q) || q : null;
  }
  if (!isAdmin && !unitId) {
    return NextResponse.json({ error: "Akun belum punya unit. Hubungi administrator." }, { status: 400 });
  }

  const db = getAdminDb();
  let q: FirebaseFirestore.Query = db.collection("stakeholders");
  if (unitId) q = q.where("unitId", "==", unitId);
  const snap = await q.get();
  const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as any[];
  items.sort((a, b) => String(a.instansi || "").localeCompare(String(b.instansi || "")));
  return NextResponse.json({ stakeholders: items });
}

/**
 * POST /api/stakeholders — tambah satu stakeholder ke unit penulis.
 * Admin boleh mengisi unit lain via body.unitId; non-admin selalu unit sendiri.
 */
export async function POST(request: Request) {
  const { response, user } = await requireUser(request);
  if (response) return response;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = readBody(await request.text());
  if (body === null) return NextResponse.json({ error: "Body bukan JSON" }, { status: 400 });

  let unitId = user.unitId || null;
  if (isAdminRole(user.role) && body.unitId) {
    unitId = normalizeUnitId(String(body.unitId)) || String(body.unitId).trim();
  }
  if (!unitId) {
    return NextResponse.json({ error: "Akun belum punya unit. Hubungi administrator." }, { status: 400 });
  }

  const v = validateStakeholder(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const s = (x: unknown) => String(x ?? "").trim();
  const now = new Date().toISOString();
  const doc: Record<string, unknown> = { unitId };
  for (const k of STAKEHOLDER_COLS) doc[k] = s((body as any)[k]) || null;
  // Kompat baca lama.
  doc.nama = doc.instansi;
  doc.jabatan = doc.namaPimpinan;
  Object.assign(doc, {
    authorUid: user.uid,
    authorEmail: user.email || null,
    createdAt: now,
    updatedAt: now,
  });
  const ref = await getAdminDb().collection("stakeholders").add(doc);
  return NextResponse.json({ ok: true, id: ref.id }, { status: 201 });
}
