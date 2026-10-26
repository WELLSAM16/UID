import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/authServer";
import { normalizeUnitId } from "@/lib/roles";
import { PUMK_TARGET_UNITS, validatePumkTarget } from "@/lib/pumkTarget";

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
 *   items: [{ unitId, targetMitra, targetInventarisasi, targetRupiahKembali }],
 *   overwrite?: boolean  // default true
 * }
 *
 * Membuat/memperbarui target untuk banyak unit dalam satu transaksi.
 * Aturan:
 * - unit harus UP2D/UP3 (UID tidak boleh).
 * - maksimal 17 unit, tidak boleh duplikat.
 * - bila sudah ada baris untuk unit+tahun: perbarui baris aktif (atau baris
 *   pertama) menjadi Active; `assignedNoIds` dan `createdAt` dipertahankan.
 * - bila overwrite=false: unit yang sudah punya baris dilewati.
 * - bila belum ada baris: buat baru dengan assignedNoIds kosong.
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
      assignedNoIds: [],
      status: "Active",
    });
    if (!v.ok) {
      return NextResponse.json({ error: `${unitId}: ${v.error}` }, { status: 400 });
    }

    items.push({
      unitId,
      targetMitra: Number(raw.targetMitra),
      targetInventarisasi: Number(raw.targetInventarisasi),
      targetRupiahKembali: Number(raw.targetRupiahKembali),
    });
  }

  const overwrite = body.overwrite !== false;
  const db = getAdminDb();
  const now = new Date().toISOString();
  let plan: PlanItem[] = [];

  try {
    await db.runTransaction(async (tx) => {
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

      const attempt: PlanItem[] = [];
      for (const it of items) {
        const list = byUnit.get(it.unitId) || [];
        const active = list.find((x) => x.data.status === "Active");
        const chosen = active || list[0] || null;

        if (chosen && !overwrite) {
          attempt.push({ unitId: it.unitId, action: "skipped", id: chosen.id });
          continue;
        }

        if (chosen) {
          attempt.push({ unitId: it.unitId, action: "updated", id: chosen.id });
          tx.set(
            db.collection(COLLECTION).doc(chosen.id),
            {
              unitId: it.unitId,
              tahun,
              targetMitra: it.targetMitra,
              targetInventarisasi: it.targetInventarisasi,
              targetRupiahKembali: it.targetRupiahKembali,
              status: "Active",
              updatedAt: now,
              updatedBy: u.uid,
              updatedByEmail: u.email || null,
            },
            { merge: true }
          );
        } else {
          const ref = db.collection(COLLECTION).doc();
          attempt.push({ unitId: it.unitId, action: "created", id: ref.id });
          tx.set(ref, {
            unitId: it.unitId,
            tahun,
            targetMitra: it.targetMitra,
            targetInventarisasi: it.targetInventarisasi,
            targetRupiahKembali: it.targetRupiahKembali,
            assignedNoIds: [],
            status: "Active",
            createdBy: u.uid,
            createdByEmail: u.email || null,
            createdAt: now,
            updatedAt: now,
          });
        }
      }
      // Timpa hasil percobaan sebelumnya bila transaksi di-retry.
      plan = attempt;
    });

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
    });
  } catch (err: unknown) {
    console.error("POST /api/pumk-targets/bulk error:", err);
    return NextResponse.json(
      {
        error: "Gagal menyimpan target massal",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
