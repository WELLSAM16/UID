import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireUser } from "@/lib/authServer";
import { formatUnitDisplay, isAdminRole, normalizeUnitId } from "@/lib/roles";
import {
  buildPumkKpi,
  countPumkByUnit,
  readPumkMonitoring,
} from "@/lib/pumkMonitoring";

/** Nilai query untuk mitra yang belum punya unit penanggung jawab. */
const UNASSIGNED = "__none__";

/**
 * GET /api/pumk — monitoring PUMK dari database internal `pumk_database`.
 *
 * - staff / team_leader / asman : hanya mitra unitnya sendiri.
 * - admin_uid / administrator   : semua unit, bisa difilter `?unitId=`.
 *   `?unitId=` kosong / `ALL` = semua; `__none__` = belum ditugaskan.
 *
 * Respons: { meta, kpi, mitra, units }. `units` hanya untuk admin.
 * Tidak ada lagi pembacaan Google Sheet / SPS.
 */
export async function GET(request: Request) {
  const { response, user } = await requireUser(request);
  if (response) return response;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const isAdmin = isAdminRole(user.role);

  // null = semua unit; "" = mitra tanpa unit; selain itu unit tertentu.
  let scope: string | null;
  if (isAdmin) {
    const raw = (params.get("unitId") || "").trim();
    if (!raw || raw.toUpperCase() === "ALL") scope = null;
    else if (raw === UNASSIGNED) scope = "";
    else scope = normalizeUnitId(raw) || raw;
  } else {
    const ownUnit =
      normalizeUnitId(user.unitId) || String(user.unitId ?? "").trim();
    if (!ownUnit) {
      return NextResponse.json(
        {
          error:
            "Akun belum punya unit. Minta Admin UID mengisi Unit di Kelola Pengguna.",
        },
        { status: 400 }
      );
    }
    scope = ownUnit;
  }

  try {
    const db = getAdminDb();
    const all = await readPumkMonitoring(db);
    const mitra =
      scope === null ? all : all.filter((m) => (m.unitId || "") === scope);

    return NextResponse.json({
      meta: {
        source: "pumk_database",
        scope: scope === null ? "ALL" : scope === "" ? "UNASSIGNED" : "UNIT",
        unitId: scope ?? "",
        unitLabel:
          scope === null
            ? "Semua unit"
            : scope === ""
              ? "Belum ditugaskan"
              : formatUnitDisplay(scope),
        isAdmin,
        totalRows: mitra.length,
        totalMitra: all.length,
        fetchedAt: new Date().toISOString(),
      },
      kpi: buildPumkKpi(mitra),
      mitra,
      ...(isAdmin ? { units: countPumkByUnit(all) } : {}),
    });
  } catch (err: unknown) {
    console.error("GET /api/pumk error:", err);
    return NextResponse.json(
      {
        error: "Gagal memuat data PUMK dari database",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
