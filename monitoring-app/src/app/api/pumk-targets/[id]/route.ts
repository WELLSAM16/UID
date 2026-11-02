import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/authServer";
import { normalizeUnitId } from "@/lib/roles";
import {
  normalizeAssignedNoIds,
  normalizeNoIdKey,
  validatePumkTarget,
} from "@/lib/pumkTarget";
import {
  PumkAssignError,
  describeNoIds,
  readPumkDbIndexTx,
  resolveAssignedMitra,
  syncPumkDbUnits,
  type PumkDbIndex,
  type PumkDbIndexEntry,
} from "@/lib/pumkTargetDb";

const COLLECTION = "pumk_targets";

function toResponse(id: string, data: Record<string, unknown>) {
  return { id, ...data };
}

async function readBody(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const text = await request.text();
    if (!text) return {};
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/pumk-targets/[id] — admin only. Update parsial:
 * { unitId?, tahun?, targetInventarisasi?, targetRupiahKembali?,
 *   targetMitra?, assignedNoIds?, status? }
 *
 * Bila `assignedNoIds` dikirim, semua NO ID harus ada di `pumk_database`,
 * tidak boleh dipakai unit lain pada tahun yang sama, dan `unitId` mitra di
 * database ikut diset ke unit target ini. Mitra yang dilepas di-unassign.
 */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  const { response, user } = await requireAdmin(request);
  if (response) return response;
  const u = user!;
  const { id } = await ctx.params;

  const body = await readBody(request);
  if (body === null) {
    return NextResponse.json({ error: "Body bukan JSON valid" }, { status: 400 });
  }

  const db = getAdminDb();
  const listProvided = body.assignedNoIds !== undefined;

  let index: PumkDbIndex | null = null;
  let assignedEntries: PumkDbIndexEntry[] = [];
  let removedKeys: string[] = [];
  let updated: Record<string, unknown> | null = null;
  let unitId = "";
  let tahun = "";

  try {
    await db.runTransaction(async (tx) => {
      // Read dulu semua.
      const ref = db.collection(COLLECTION).doc(id);
      const snap = await tx.get(ref);
      if (!snap.exists) {
        throw new PumkAssignError(404, { error: "Target tidak ditemukan" });
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
        assignedNoIds: listProvided
          ? body.assignedNoIds
          : (current.assignedNoIds as unknown),
        status: body.status !== undefined ? body.status : current.status,
      };
      const v = validatePumkTarget(merged);
      if (!v.ok) {
        throw new PumkAssignError(400, { error: v.error });
      }

      unitId = normalizeUnitId(String(merged.unitId))!;
      tahun = String(merged.tahun).trim();
      const status = merged.status === "Paused" ? "Paused" : "Active";

      const yearSnap = await tx.get(
        db.collection(COLLECTION).where("tahun", "==", tahun)
      );

      if (status === "Active") {
        const conflict = yearSnap.docs.some((d) => {
          if (d.id === id) return false;
          const data = d.data() as Record<string, unknown>;
          return (
            data.status === "Active" &&
            normalizeUnitId(String(data.unitId || "")) === unitId
          );
        });
        if (conflict) {
          throw new PumkAssignError(409, {
            error: `Target aktif ${unitId} tahun ${tahun} sudah ada di baris lain.`,
          });
        }
      }

      let patch: Record<string, unknown> = {
        unitId,
        tahun,
        targetInventarisasi: Number(merged.targetInventarisasi),
        targetRupiahKembali: Number(merged.targetRupiahKembali),
        targetMitra: Math.trunc(Number(merged.targetMitra)),
        status,
        updatedAt: new Date().toISOString(),
      };

      if (listProvided) {
        const dbIndex = await readPumkDbIndexTx(tx, db);
        const requestedIds = normalizeAssignedNoIds(merged.assignedNoIds);

        // Satu mitra satu unit per tahun.
        const claimed = new Map<string, string>();
        for (const d of yearSnap.docs) {
          if (d.id === id) continue;
          const data = d.data() as Record<string, unknown>;
          if (data.status !== "Active") continue;
          const otherUnit = String(data.unitId || "");
          if (!otherUnit || otherUnit === unitId) continue;
          for (const raw of Array.isArray(data.assignedNoIds) ? data.assignedNoIds : []) {
            claimed.set(normalizeNoIdKey(raw), otherUnit);
          }
        }
        const conflicts = requestedIds
          .map((noId) => ({ noId, unitId: claimed.get(normalizeNoIdKey(noId)) || "" }))
          .filter((c) => c.unitId);
        if (conflicts.length > 0) {
          throw new PumkAssignError(409, {
            error:
              `${conflicts.length} NO ID sudah ditargetkan ke unit lain tahun ${tahun}: ` +
              conflicts
                .slice(0, 5)
                .map((c) => `${c.noId} (${c.unitId})`)
                .join(", "),
            conflicts,
          });
        }

        const resolved = resolveAssignedMitra(requestedIds, dbIndex);
        if (resolved.unknown.length > 0) {
          throw new PumkAssignError(400, {
            error:
              `${resolved.unknown.length} NO ID tidak ada di database PUMK: ` +
              `${describeNoIds(resolved.unknown)}. Tambahkan mitra tersebut di menu Database PUMK dulu.`,
            unknownNoIds: resolved.unknown,
          });
        }

        const canonicalIds = resolved.assigned.map((m) => m.noId);
        const newKeys = new Set(canonicalIds.map(normalizeNoIdKey));
        const oldKeys = normalizeAssignedNoIds(current.assignedNoIds).map(normalizeNoIdKey);

        index = dbIndex;
        assignedEntries = canonicalIds
          .map((noId) => dbIndex.get(normalizeNoIdKey(noId)))
          .filter((e): e is PumkDbIndexEntry => Boolean(e));
        removedKeys = oldKeys.filter((key) => !newKeys.has(key));

        patch = {
          ...patch,
          assignedNoIds: canonicalIds,
          assignedMitra: resolved.assigned,
        };
      }

      tx.update(ref, patch);
      updated = { ...current, ...patch };
    });
  } catch (err: unknown) {
    if (err instanceof PumkAssignError) {
      return NextResponse.json(err.payload, { status: err.status });
    }
    console.error(`PATCH /api/pumk-targets/${id} error:`, err);
    return NextResponse.json(
      {
        error: "Gagal memperbarui target PUMK",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }

  let warning: string | undefined;
  let dbSync: { assigned: number; cleared: number } | undefined;
  if (listProvided && index) {
    try {
      dbSync = await syncPumkDbUnits(
        db,
        [{ unitId, assigned: assignedEntries, removedKeys }],
        {
          index,
          assignedKeys: new Set(assignedEntries.map((e) => e.noIdKey)),
          uid: u.uid,
          email: u.email,
        }
      );
    } catch (err) {
      console.error(`PATCH /api/pumk-targets/${id} db sync error:`, err);
      warning = "Target tersimpan, tetapi unit di Database PUMK gagal diperbarui.";
    }
  }

  return NextResponse.json({
    target: toResponse(id, updated || {}),
    dbSync,
    ...(warning ? { warning } : {}),
  });
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
  } catch (err: unknown) {
    console.error(`DELETE /api/pumk-targets/${id} error:`, err);
    return NextResponse.json(
      {
        error: "Gagal menghapus target PUMK",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
