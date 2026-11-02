import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireAdmin, requireUser } from "@/lib/authServer";
import { normalizeUnitId } from "@/lib/roles";
import {
  normalizeAssignedNoIds,
  normalizeNoIdKey,
  validatePumkTarget,
  type PumkTarget,
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

function toResponse(id: string, data: FirebaseFirestore.DocumentData) {
  return { id, ...(data as PumkTarget) };
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
  } catch (err: unknown) {
    console.error("GET /api/pumk-targets error:", err);
    return NextResponse.json(
      {
        error: "Gagal memuat target PUMK",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/pumk-targets — admin only (admin_uid / administrator).
 * Body: { unitId, tahun, targetInventarisasi, targetRupiahKembali,
 *         targetMitra, assignedNoIds?, status? }
 * Unik: satu baris Active per (unitId, tahun).
 *
 * assignedNoIds wajib berisi NO ID yang terdaftar di `pumk_database`.
 * Mitra yang dipilih juga diset `unitId`-nya di database.
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
  const requestedIds = normalizeAssignedNoIds(body.assignedNoIds);

  const db = getAdminDb();
  let index: PumkDbIndex | null = null;
  let assignedEntries: PumkDbIndexEntry[] = [];
  let createdId = "";
  let doc: PumkTarget | null = null;

  try {
    await db.runTransaction(async (tx) => {
      // Semua read sebelum write.
      const dbIndex = await readPumkDbIndexTx(tx, db);
      const snap = await tx.get(db.collection(COLLECTION).where("tahun", "==", tahun));

      if (status === "Active") {
        const dup = snap.docs.find((d) => {
          const data = d.data() as Record<string, unknown>;
          return (
            data.status === "Active" &&
            normalizeUnitId(String(data.unitId || "")) === unitId
          );
        });
        if (dup) {
          throw new PumkAssignError(409, {
            error: `Target aktif ${unitId} tahun ${tahun} sudah ada. Edit baris tersebut.`,
          });
        }
      }

      // Satu mitra hanya boleh dipegang satu unit per tahun.
      const claimed = new Map<string, string>();
      for (const d of snap.docs) {
        const data = d.data() as Record<string, unknown>;
        if (data.status !== "Active") continue;
        const otherUnit = String(data.unitId || "");
        if (!otherUnit || otherUnit === unitId) continue;
        for (const raw of Array.isArray(data.assignedNoIds) ? data.assignedNoIds : []) {
          claimed.set(normalizeNoIdKey(raw), otherUnit);
        }
      }
      const conflicts = requestedIds
        .map((id) => ({ noId: id, unitId: claimed.get(normalizeNoIdKey(id)) || "" }))
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
      index = dbIndex;
      assignedEntries = canonicalIds
        .map((id) => dbIndex.get(normalizeNoIdKey(id)))
        .filter((e): e is PumkDbIndexEntry => Boolean(e));

      const t = new Date().toISOString();
      doc = {
        unitId,
        tahun,
        targetInventarisasi: Math.trunc(Number(body.targetInventarisasi)),
        targetRupiahKembali: Number(body.targetRupiahKembali),
        targetMitra: Math.trunc(Number(body.targetMitra)),
        assignedNoIds: canonicalIds,
        assignedMitra: resolved.assigned,
        status,
        createdBy: u.uid,
        createdByEmail: u.email,
        createdAt: t,
        updatedAt: t,
      };
      const ref = db.collection(COLLECTION).doc();
      createdId = ref.id;
      tx.set(ref, doc);
    });
  } catch (err: unknown) {
    if (err instanceof PumkAssignError) {
      return NextResponse.json(err.payload, { status: err.status });
    }
    console.error("POST /api/pumk-targets error:", err);
    return NextResponse.json(
      {
        error: "Gagal membuat target PUMK",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }

  // Target tersimpan; samakan unit penanggung jawab di database mitra.
  let warning: string | undefined;
  let dbSync: { assigned: number; cleared: number } | undefined;
  if (index && assignedEntries.length > 0) {
    try {
      dbSync = await syncPumkDbUnits(
        db,
        [{ unitId, assigned: assignedEntries, removedKeys: [] }],
        {
          index,
          assignedKeys: new Set(assignedEntries.map((e) => e.noIdKey)),
          uid: u.uid,
          email: u.email,
        }
      );
    } catch (err) {
      console.error("POST /api/pumk-targets db sync error:", err);
      warning = "Target tersimpan, tetapi unit di Database PUMK gagal diperbarui.";
    }
  }

  return NextResponse.json(
    {
      target: { id: createdId, ...(doc || {}) },
      dbSync,
      ...(warning ? { warning } : {}),
    },
    { status: 201 }
  );
}
