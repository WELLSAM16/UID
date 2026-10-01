import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/authServer";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { readArchiveSheet, resolveArchiveSheetId } from "@/lib/igArchive";

// Cache memori 10 menit: arsip hanya berubah tiap sync harian.
const CACHE_TTL_MS = 10 * 60 * 1000;
let cache: { at: number; payload: unknown } | null = null;

/**
 * GET /api/ig-archive — baca snapshot arsip harian (read-only, semua user login).
 * Sumbernya Google Sheet arsip yang ditulis POST /api/ig-sync tiap 24 jam.
 */
export async function GET(request: NextRequest) {
  const { response } = await requireUser(request);
  if (response) return response;

  try {
    const noCache = new URL(request.url).searchParams.get("refresh") === "1";
    if (!noCache && cache && Date.now() - cache.at < CACHE_TTL_MS) {
      return NextResponse.json(cache.payload);
    }

    const sheetId = resolveArchiveSheetId();
    const posts = await readArchiveSheet(sheetId);
    const accounts = [...new Set(posts.map((p) => p.source_account).filter(Boolean))].sort();

    let syncedAt: string | null = null;
    try {
      const snap = await getAdminDb().collection("ig_sync_state").doc("daily").get();
      if (snap.exists) syncedAt = (snap.data()?.syncedAt as string) || null;
    } catch {
      // state Firestore opsional — arsip tetap dikembalikan
    }

    const payload = {
      meta: {
        sheetId,
        syncedAt,
        totalRows: posts.length,
        fetchedAt: new Date().toISOString(),
      },
      accounts_fetched: accounts,
      posts,
    };
    cache = { at: Date.now(), payload };
    return NextResponse.json(payload);
  } catch (err: any) {
    const msg =
      err?.name === "AbortError"
        ? "Timeout membaca sheet arsip (30s)"
        : err?.message || "Gagal membaca sheet arsip";
    console.error("GET /api/ig-archive error:", err);
    return NextResponse.json(
      { error: "Gagal memuat arsip", details: msg },
      { status: 502 }
    );
  }
}
