import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireAdmin, requireUser } from "@/lib/authServer";
import { normalizeUnitId } from "@/lib/roles";
import {
  normalizeAssignedNoIds,
  validatePumkTarget,
  type PumkTarget,
} from "@/lib/pumkTarget";

const COLLECTION = "pumk_targets";

function toResponse(id: string, data: FirebaseFirestore.DocumentData) {
  return { id, ...(data as PumkTarget) };
}

async function readBody(request: NextRequest): Promise<any> {
  try {
    const text = await request.text();
    if (!text) return {};
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * GET /api/pumk-targets — user login mana pun boleh baca
 * (untuk progress capaian vs target).
 * Query opsional: ?tahun=2026 & ?unitId=UP3+BINTARO
 */
export async function GET(request: NextRequest) {
  const { response } = await requireUser(request);
  if (response) return response;

  try {
    const params = new URL(request.url).searchParams;
    const tahun = (params.get("tahun") || "").trim();
    const unitQ = (params.get("unitId") || "").trim();

    const db = getAdminDb();
    const snap = await db.collection(COLLECTION).get();
    let items = snap.docs.map((d) => toResponse(d.id, d.data()));
    if (tahun) items = items.filter((t) => t.tahun === tahun);
    if (unitQ) {
      const norm = normalizeUnitId(unitQ) || unitQ;
      items = items.filter((t) => t.unitId === norm);
    }
    items.sort((a, b) =>
      a.tahun === b.tahun
        ? a.unitId.localeCompare(b.unitId)
        : b.tahun.localeCompare(a.tahun)
    );
    return NextResponse.json({ targets: items });
  } catch (err: any) {
    console.error("GET /api/pumk-targets error:", err);
    return NextResponse.json(
      { error: "Gagal memuat target PUMK", details: err?.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/pumk-targets — admin only (admin_uid / administrator).
 * Body: { unitId, tahun, targetInventarisasi, targetRupiahKembali,
 *         targetMitra, assignedNoIds?, status? }
 * Unik: satu baris Active per (unitId, tahun).
 */
export async function POST(request: NextRequest) {
  const { response, user } = await requireAdmin(request);
  if (response) return response;
  const u = user!;

  const body = await readBody(request);
  if (body === null) {
    return NextResponse.json({ error: "Body bukan JSON valid" }, { status: 400 });
  }

  const v = validatePumkTarget(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const unitId = normalizeUnitId(String(body.unitId))!;
  const tahun = String(body.tahun).trim();
  const status = body.status === "Paused" ? "Paused" : "Active";

  try {
    const db = getAdminDb();
    if (status === "Active") {
      const dup = await db
        .collection(COLLECTION)
        .where("unitId", "==", unitId)
        .where("tahun", "==", tahun)
        .where("status", "==", "Active")
        .limit(1)
        .get();
      if (!dup.empty) {
        return NextResponse.json(
          { error: `Target aktif ${unitId} tahun ${tahun} sudah ada. Edit baris tersebut.` },
          { status: 409 }
        );
      }
    }

    const t = new Date().toISOString();
    const doc: PumkTarget = {
      unitId,
      tahun,
      targetInventarisasi: Math.trunc(Number(body.targetInventarisasi)),
      targetRupiahKembali: Number(body.targetRupiahKembali),
      targetMitra: Math.trunc(Number(body.targetMitra)),
      assignedNoIds: normalizeAssignedNoIds(body.assignedNoIds),
      status,
      createdBy: u.uid,
      createdByEmail: u.email,
      createdAt: t,
      updatedAt: t,
    };
    const ref = await db.collection(COLLECTION).add(doc);
    const fresh = await ref.get();
    return NextResponse.json(
      { target: toResponse(ref.id, fresh.data()!) },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("POST /api/pumk-targets error:", err);
    return NextResponse.json(
      { error: "Gagal membuat target PUMK", details: err?.message },
      { status: 500 }
    );
  }
}
