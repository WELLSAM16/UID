import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/authServer";
import { normalizeUnitId } from "@/lib/roles";
import {
  normalizeAssignedNoIds,
  validatePumkTarget,
} from "@/lib/pumkTarget";

const COLLECTION = "pumk_targets";

function toResponse(id: string, data: FirebaseFirestore.DocumentData) {
  return { id, ...(data as Record<string, unknown>) };
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

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/pumk-targets/[id] — admin only. Update parsial:
 * { unitId?, tahun?, targetInventarisasi?, targetRupiahKembali?,
 *   targetMitra?, assignedNoIds?, status? }
 */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  const { response } = await requireAdmin(request);
  if (response) return response;
  const { id } = await ctx.params;

  const body = await readBody(request);
  if (body === null) {
    return NextResponse.json({ error: "Body bukan JSON valid" }, { status: 400 });
  }

  try {
    const db = getAdminDb();
    const ref = db.collection(COLLECTION).doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Target tidak ditemukan" }, { status: 404 });
    }
    const current = snap.data() as Record<string, unknown>;

    const merged = {
      unitId: body.unitId !== undefined ? body.unitId : current.unitId,
      tahun: body.tahun !== undefined ? body.tahun : current.tahun,
      targetInventarisasi:
        body.targetInventarisasi !== undefined
          ? body.targetInventarisasi
          : current.targetInventarisasi,
      targetRupiahKembali:
        body.targetRupiahKembali !== undefined
          ? body.targetRupiahKembali
          : current.targetRupiahKembali,
      targetMitra:
        body.targetMitra !== undefined ? body.targetMitra : current.targetMitra,
      assignedNoIds:
        body.assignedNoIds !== undefined
          ? body.assignedNoIds
          : (current.assignedNoIds as unknown),
      status: body.status !== undefined ? body.status : current.status,
    };
    const v = validatePumkTarget(merged);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

    const unitId = normalizeUnitId(String(merged.unitId))!;
    const tahun = String(merged.tahun).trim();
    const status = merged.status === "Paused" ? "Paused" : "Active";

    if (status === "Active") {
      const dup = await db
        .collection(COLLECTION)
        .where("unitId", "==", unitId)
        .where("tahun", "==", tahun)
        .where("status", "==", "Active")
        .limit(5)
        .get();
      const conflict = dup.docs.some((d) => d.id !== id);
      if (conflict) {
        return NextResponse.json(
          { error: `Target aktif ${unitId} tahun ${tahun} sudah ada di baris lain.` },
          { status: 409 }
        );
      }
    }

    const patch: Record<string, unknown> = {
      unitId,
      tahun,
      targetInventarisasi: Math.trunc(Number(merged.targetInventarisasi)),
      targetRupiahKembali: Number(merged.targetRupiahKembali),
      targetMitra: Math.trunc(Number(merged.targetMitra)),
      assignedNoIds: normalizeAssignedNoIds(merged.assignedNoIds),
      status,
      updatedAt: new Date().toISOString(),
    };
    await ref.update(patch);
    const fresh = await ref.get();
    return NextResponse.json({ target: toResponse(id, fresh.data()!) });
  } catch (err: any) {
    console.error(`PATCH /api/pumk-targets/${id} error:`, err);
    return NextResponse.json(
      { error: "Gagal memperbarui target PUMK", details: err?.message },
      { status: 500 }
    );
  }
}

/** DELETE /api/pumk-targets/[id] — admin only. */
export async function DELETE(request: NextRequest, ctx: Ctx) {
  const { response } = await requireAdmin(request);
  if (response) return response;
  const { id } = await ctx.params;

  try {
    const db = getAdminDb();
    const ref = db.collection(COLLECTION).doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Target tidak ditemukan" }, { status: 404 });
    }
    await ref.delete();
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error(`DELETE /api/pumk-targets/${id} error:`, err);
    return NextResponse.json(
      { error: "Gagal menghapus target PUMK", details: err?.message },
      { status: 500 }
    );
  }
}
