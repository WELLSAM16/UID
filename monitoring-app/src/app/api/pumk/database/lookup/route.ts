import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/authServer";
import { PUMK_DB_COLLECTION } from "@/lib/pumkDatabase";
import { normalizeNoIdKey } from "@/lib/pumkTarget";

/**
 * GET /api/pumk/database/lookup — admin only.
 * Daftar mitra versi ringkas untuk picker Set Target (tanpa field panjang).
 */
export async function GET(request: NextRequest) {
  const { response } = await requireAdmin(request);
  if (response) return response;

  try {
    const snap = await getAdminDb()
      .collection(PUMK_DB_COLLECTION)
      .select(
        "noId",
        "nama",
        "unitId",
        "kolektibilitas",
        "totalSaldoJuli",
        "pks",
        "linkFolder"
      )
      .get();

    const mitra = snap.docs
      .map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        const noId = String(data.noId ?? "").trim();
        return {
          id: doc.id,
          noId,
          noIdKey: normalizeNoIdKey(noId),
          nama: String(data.nama ?? "").trim(),
          unitId: String(data.unitId ?? "").trim(),
          kolektibilitas: String(data.kolektibilitas ?? "").trim(),
          totalSaldoJuli:
            typeof data.totalSaldoJuli === "number" ? data.totalSaldoJuli : 0,
          pks: String(data.pks ?? "").trim(),
          linkFolder: String(data.linkFolder ?? "").trim(),
        };
      })
      .filter((row) => row.noId)
      .sort((a, b) =>
        a.noId.localeCompare(b.noId, "id", { numeric: true, sensitivity: "base" })
      );

    return NextResponse.json({
      mitra,
      meta: { total: mitra.length, fetchedAt: new Date().toISOString() },
    });
  } catch (err) {
    console.error("GET /api/pumk/database/lookup error:", err);
    return NextResponse.json(
      { error: "Gagal memuat daftar mitra PUMK" },
      { status: 500 }
    );
  }
}
