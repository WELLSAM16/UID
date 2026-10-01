import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/authServer";
import { toDateOnly, validateSkoringTarget } from "@/lib/targets";

const COLLECTION = "skoring_targets";

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
 * PATCH /api/targets/[id] — admin only. Update parsial:
 * { startDate?, endDate?, targetScore?, targetPosts?, status? }
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
      startDate: body.startDate !== undefined ? body.startDate : current.startDate,
      endDate: body.endDate !== undefined ? body.endDate : current.endDate,
      targetScore: body.targetScore !== undefined ? body.targetScore : current.targetScore,
      targetPosts: body.targetPosts !== undefined ? body.targetPosts : current.targetPosts,
      status: body.status !== undefined ? body.status : current.status,
    };
    const v = validateSkoringTarget(merged);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

    const patch: Record<string, unknown> = {
      startDate: toDateOnly(String(merged.startDate)),
      endDate: toDateOnly(String(merged.endDate)),
      targetScore: Number(merged.targetScore),
      targetPosts: Number(merged.targetPosts),
      status: merged.status === "Paused" ? "Paused" : "Active",
      updatedAt: new Date().toISOString(),
    };
    await ref.update(patch);
    const fresh = await ref.get();
    return NextResponse.json({ target: toResponse(id, fresh.data()!) });
  } catch (err: any) {
    console.error(`PATCH /api/targets/${id} error:`, err);
    return NextResponse.json(
      { error: "Gagal memperbarui target", details: err?.message },
      { status: 500 }
    );
  }
}

/** DELETE /api/targets/[id] — admin only. */
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
    console.error(`DELETE /api/targets/${id} error:`, err);
    return NextResponse.json(
      { error: "Gagal menghapus target", details: err?.message },
      { status: 500 }
    );
  }
}
