import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/authServer";
import { normalizeUnitId } from "@/lib/roles";
import {
  PUMK_TARGET_UNITS,
  normalizeAssignedNoIds,
  normalizeNoIdKey,
  validatePumkTarget,
  type PumkAssignedMitra,
} from "@/lib/pumkTarget";
import {
  PumkAssignError,
  describeNoIds,
  readPumkDbIndexTx,
  resolveAssignedMitra,
  syncPumkDbUnits,
  type PumkDbIndex,
  type PumkDbIndexEntry,
  type UnitAssignmentGroup,
} from "@/lib/pumkTargetDb";

const COLLECTION = "pumk_targets";

interface BulkBody {
  tahun?: unknown;
  items?: unknown;
  overwrite?: unknown;
}

type JsonObject = Record<string, unknown>;

function readBody(raw: string): BulkBody | null {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as BulkBody;
  } catch {
    return null;
  }
}

function asObject(value: unknown): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

interface BulkItem {
  unitId: string;
  targetMitra: number;
  targetInventarisasi: number;
  targetRupiahKembali: number;
  /** Bila undefined, daftar NO ID lama dipertahankan. */
  assignedNoIds?: string[];
}

type PlanAction = "created" | "updated" | "skipped";

interface PlanItem {
  unitId: string;
  action: PlanAction;
  id: string;
}

/**
 * POST /api/pumk-targets/bulk — admin only.
 * Body: {
 *   tahun: "2026",
 *   items: [{ unitId, targetMitra, targetInventarisasi, targetRupiahKembali,
 *             assignedNoIds? }],
 *   overwrite?: boolean  // default true
 * }
 *
 * Membuat/memperbarui target untuk banyak unit dalam satu transaksi.
 * Aturan:
 * - unit harus UP2D/UP3 (UID tidak boleh).
 * - maksimal 17 unit, tidak boleh duplikat.
 * - `assignedNoIds` boleh berisi banyak NO ID per unit (array/string).
 * - setiap NO ID wajib ada di `pumk_database`; nama diambil dari database.
 * - satu NO ID hanya boleh dipakai satu unit pada tahun yang sama.
 * - `unitId` mitra di database ikut diset ke unit tersebut; mitra yang
 *   dilepas dari daftar di-unassign bila unit database masih unit itu.
 * - bila sudah ada baris untuk unit+tahun: perbarui baris aktif (atau baris
 *   pertama) menjadi Active; `createdAt` dipertahankan. `assignedNoIds` diganti
 *   bila field itu dikirim, atau dipertahankan bila tidak dikirim.
 * - bila overwrite=false: unit yang sudah punya baris dilewati.
 * - bila belum ada baris: buat baru dengan assignedNoIds kosong bila tidak dikirim.
 */
export async function POST(request: NextRequest) {
  const { response, user } = await requireAdmin(request);
  if (response) return response;
  const u = user!;

  const text = await request.text().catch(() => "");
  const body = readBody(text);
  if (body === null) {
    return NextResponse.json({ error: "Body bukan JSON valid" }, { status: 400 });
  }

  const tahun = String(body.tahun ?? "").trim();
  if (!/^\d{4}$/.test(tahun)) {
    return NextResponse.json({ error: "tahun wajib format YYYY (cth 2026)" }, { status: 400 });
  }

  const rawItems = Array.isArray(body.items) ? (body.items as unknown[]) : null;
  if (!rawItems || rawItems.length === 0) {
    return NextResponse.json({ error: "items wajib berisi minimal 1 unit" }, { status: 400 });
  }
  if (rawItems.length > PUMK_TARGET_UNITS.length) {
    return NextResponse.json(
      { error: `items maksimal ${PUMK_TARGET_UNITS.length} unit` },
      { status: 400 }
    );
  }

  const allowed = new Set<string>(PUMK_TARGET_UNITS as readonly string[]);
  const seen = new Set<string>();
  const items: BulkItem[] = [];

  for (const rawItem of rawItems) {
    const raw = asObject(rawItem);
    const unitId = normalizeUnitId(String(raw.unitId ?? ""));
    if (!unitId || unitId === "UID" || !allowed.has(unitId)) {
      return NextResponse.json(
        { error: `unitId "${String(raw.unitId ?? "")}" bukan unit PUMK (UP2D/UP3)` },
        { status: 400 }
      );
    }
    if (seen.has(unitId)) {
      return NextResponse.json(
        { error: `unit ${unitId} muncul lebih dari sekali` },
        { status: 400 }
      );
    }
    seen.add(unitId);

    const v = validatePumkTarget({
      unitId,
      tahun,
      targetMitra: raw.targetMitra,
      targetInventarisasi: raw.targetInventarisasi,
      targetRupiahKembali: raw.targetRupiahKembali,
      assignedNoIds: raw.assignedNoIds,
      status: "Active",
    });
    if (!v.ok) {
      return NextResponse.json({ error: `${unitId}: ${v.error}` }, { status: 400 });
    }

    const item: BulkItem = {
      unitId,
      targetMitra: Number(raw.targetMitra),
      targetInventarisasi: Number(raw.targetInventarisasi),
      targetRupiahKembali: Number(raw.targetRupiahKembali),
    };
    if (raw.assignedNoIds !== undefined) {
      item.assignedNoIds = normalizeAssignedNoIds(raw.assignedNoIds);
    }
    items.push(item);
  }

  const overwrite = body.overwrite !== false;
  const db = getAdminDb();
  const now = new Date().toISOString();
  let plan: PlanItem[] = [];
  let index: PumkDbIndex | null = null;
  let syncGroups: UnitAssignmentGroup[] = [];
  let assignedKeys = new Set<string>();

  try {
    await db.runTransaction(async (tx) => {
      // Semua read sebelum write.
      const dbIndex = await readPumkDbIndexTx(tx, db);
      // Satu query per tahun; koleksi target kecil (maks 17 baris/tahun).
      const snap = await tx.get(db.collection(COLLECTION).where("tahun", "==", tahun));
      const byUnit = new Map<string, Array<{ id: string; data: JsonObject }>>();
      for (const d of snap.docs) {
        const data = d.data() as JsonObject;
        const unit = String(data.unitId || "");
        if (!unit) continue;
        const list = byUnit.get(unit) || [];
        list.push({ id: d.id, data });
        byUnit.set(unit, list);
      }

      // Tentukan aksi dulu (dipakai untuk menyusun klaim NO ID).
      const actions = new Map<
        string,
        { chosen: { id: string; data: JsonObject } | null; action: PlanAction }
      >();
      for (const it of items) {
        const list = byUnit.get(it.unitId) || [];
        const active = list.find((x) => x.data.status === "Active");
        const chosen = active || list[0] || null;
        const action: PlanAction = chosen
          ? overwrite
            ? "updated"
            : "skipped"
          : "created";
        actions.set(it.unitId, { chosen, action });
      }

      const rewriteUnits = new Set(
        items
          .filter(
            (it) =>
              it.assignedNoIds !== undefined &&
              actions.get(it.unitId)?.action !== "skipped"
          )
          .map((it) => it.unitId)
      );

      // Klaim dari baris aktif unit lain. Baris unit yang akan ditulis ulang
      // dikeluarkan karena daftarnya diganti.
      const claims = new Map<string, string>();
      for (const d of snap.docs) {
        const data = d.data() as JsonObject;
        if (data.status !== "Active") continue;
        const unit = String(data.unitId || "");
        if (!unit || rewriteUnits.has(unit)) continue;
        for (const raw of Array.isArray(data.assignedNoIds) ? data.assignedNoIds : []) {
          claims.set(normalizeNoIdKey(raw), unit);
        }
      }

      const attempt: PlanItem[] = [];
      const groups: UnitAssignmentGroup[] = [];
      const allAssignedKeys = new Set<string>();

      for (const it of items) {
        const { chosen, action } = actions.get(it.unitId)!;
        if (action === "skipped") {
          attempt.push({ unitId: it.unitId, action, id: chosen!.id });
          continue;
        }

        let assigned: PumkAssignedMitra[] | undefined;
        let assignedEntries: PumkDbIndexEntry[] = [];
        let removedKeys: string[] = [];

        if (it.assignedNoIds !== undefined) {
          const resolved = resolveAssignedMitra(it.assignedNoIds, dbIndex);
          if (resolved.unknown.length > 0) {
            throw new PumkAssignError(400, {
              error:
                `${it.unitId}: ${resolved.unknown.length} NO ID tidak ada di database PUMK: ` +
                `${describeNoIds(resolved.unknown)}. Tambahkan mitra tersebut di menu Database PUMK dulu.`,
              unitId: it.unitId,
              unknownNoIds: resolved.unknown,
            });
          }

          const conflicts = resolved.assigned
            .map((m) => ({
              noId: m.noId,
              unitId: claims.get(normalizeNoIdKey(m.noId)) || "",
            }))
            .filter((c) => c.unitId);
          if (conflicts.length > 0) {
            throw new PumkAssignError(409, {
              error:
                `${it.unitId}: ${conflicts.length} NO ID sudah ditargetkan ke unit lain tahun ${tahun}: ` +
                conflicts
                  .slice(0, 5)
                  .map((c) => `${c.noId} (${c.unitId})`)
                  .join(", "),
              unitId: it.unitId,
              conflicts,
            });
          }

          assigned = resolved.assigned;
          const canonicalIds = assigned.map((m) => m.noId);
          assignedEntries = canonicalIds
            .map((noId) => dbIndex.get(normalizeNoIdKey(noId)))
            .filter((e): e is PumkDbIndexEntry => Boolean(e));
          for (const entry of assignedEntries) allAssignedKeys.add(entry.noIdKey);
          // Klaim untuk item berikutnya dalam request yang sama.
          for (const entry of assignedEntries) claims.set(entry.noIdKey, it.unitId);

          const oldKeys = chosen
            ? normalizeAssignedNoIds(chosen.data.assignedNoIds).map(normalizeNoIdKey)
            : [];
          const newKeys = new Set(canonicalIds.map(normalizeNoIdKey));
          removedKeys = oldKeys.filter((key) => !newKeys.has(key));
        }

        if (chosen) {
          attempt.push({ unitId: it.unitId, action, id: chosen.id });
          tx.set(
            db.collection(COLLECTION).doc(chosen.id),
            {
              unitId: it.unitId,
              tahun,
              targetMitra: it.targetMitra,
              targetInventarisasi: it.targetInventarisasi,
              targetRupiahKembali: it.targetRupiahKembali,
              ...(it.assignedNoIds !== undefined
                ? { assignedNoIds: assigned!.map((m) => m.noId), assignedMitra: assigned }
                : {}),
              status: "Active",
              updatedAt: now,
              updatedBy: u.uid,
              updatedByEmail: u.email || null,
            },
            { merge: true }
          );
        } else {
          const ref = db.collection(COLLECTION).doc();
          attempt.push({ unitId: it.unitId, action, id: ref.id });
          tx.set(ref, {
            unitId: it.unitId,
            tahun,
            targetMitra: it.targetMitra,
            targetInventarisasi: it.targetInventarisasi,
            targetRupiahKembali: it.targetRupiahKembali,
            assignedNoIds: assigned ? assigned.map((m) => m.noId) : [],
            assignedMitra: assigned ?? [],
            status: "Active",
            createdBy: u.uid,
            createdByEmail: u.email || null,
            createdAt: now,
            updatedAt: now,
          });
        }

        if (assigned) {
          groups.push({ unitId: it.unitId, assigned: assignedEntries, removedKeys });
        }
      }

      index = dbIndex;
      syncGroups = groups;
      assignedKeys = allAssignedKeys;
      // Timpa hasil percobaan sebelumnya bila transaksi di-retry.
      plan = attempt;
    });
  } catch (err: unknown) {
    if (err instanceof PumkAssignError) {
      return NextResponse.json(err.payload, { status: err.status });
    }
    console.error("POST /api/pumk-targets/bulk error:", err);
    return NextResponse.json(
      {
        error: "Gagal menyimpan target massal",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }

  // Sinkronkan Unit Penanggung Jawab di database mitra (batch, di luar
  // transaksi target agar tidak melewati batas 500 write).
  let warning: string | undefined;
  let dbSync: { assigned: number; cleared: number } | undefined;
  if (index && syncGroups.length > 0) {
    try {
      dbSync = await syncPumkDbUnits(db, syncGroups, {
        index,
        assignedKeys,
        uid: u.uid,
        email: u.email,
      });
    } catch (err) {
      console.error("POST /api/pumk-targets/bulk db sync error:", err);
      warning = "Target tersimpan, tetapi unit di Database PUMK gagal diperbarui.";
    }
  }

  const count = (action: PlanAction) => plan.filter((p) => p.action === action).length;
  return NextResponse.json({
    ok: true,
    tahun,
    overwrite,
    summary: {
      created: count("created"),
      updated: count("updated"),
      skipped: count("skipped"),
    },
    results: plan,
    dbSync,
    ...(warning ? { warning } : {}),
  });
}
