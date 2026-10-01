import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/authServer";
import { readPumk, resolvePumkSheetId, resolvePumkBintaroGid, PUMK_UNIT } from "@/lib/pumk";

// Cache memori 3 menit: sheet UID bisa berubah sewaktu-waktu.
const CACHE_TTL_MS = 3 * 60 * 1000;
let cache: { at: number; payload: unknown } | null = null;

/**
 * GET /api/pumk — monitoring tunggakan PUMK UP3 Bintaro (read-only).
 * Gabungan tab UP3 Bintaro + master (join NO ID). Semua user login.
 */
export async function GET(request: NextRequest) {
  const { response } = await requireUser(request);
  if (response) return response;

  try {
    const noCache = new URL(request.url).searchParams.get("refresh") === "1";
    if (!noCache && cache && Date.now() - cache.at < CACHE_TTL_MS) {
      return NextResponse.json(cache.payload);
    }

    const sheetId = resolvePumkSheetId();
    const gid = resolvePumkBintaroGid();
    const { mitra, kpi } = await readPumk(sheetId);
    const payload = {
      meta: {
        sheetId,
        gid,
        unit: PUMK_UNIT,
        totalRows: mitra.length,
        fetchedAt: new Date().toISOString(),
      },
      kpi,
      mitra,
    };
    cache = { at: Date.now(), payload };
    return NextResponse.json(payload);
  } catch (err: any) {
    const msg =
      err?.name === "AbortError"
        ? "Timeout membaca sheet PUMK (30s)"
        : err?.message || "Gagal membaca sheet PUMK";
    console.error("GET /api/pumk error:", err);
    return NextResponse.json(
      { error: "Gagal memuat data PUMK", details: msg },
      { status: 502 }
    );
  }
}
