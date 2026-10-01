import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/authServer";
import {
  buildMonthlyStats,
  buildSummary,
  buildUnitStats,
  detectAnomalies,
  TARGET_PER_UNIT,
  VALID_YEAR,
  type PressRelease,
} from "@/lib/pressRelease";
import { getAdminDb } from "@/lib/firebaseAdmin";

// Sheet default (dipakai bila admin belum mendaftarkan sumber apa pun).
// Bisa dioverride via env tanpa ubah kode.
const DEFAULT_SHEET_ID =
  process.env.PRESS_RELEASE_SHEET_ID || "1zak7WKrf2bIo2Il9wrUmu65OBnWt35KDkcvNFldF2u8";
const DEFAULT_GID = process.env.PRESS_RELEASE_GID || "929061474";

const SOURCES_COLLECTION = "press_release_sources";

// Cache memori 10 menit PER SUMBER: hemat kuota Google + load cepat.
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; payload: unknown }>();

interface GvizCell {
  v?: unknown;
  f?: string;
}

function cellStr(c: GvizCell | null | undefined): string {
  if (!c) return "";
  const v = c.v;
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  return "";
}

function cellNum(c: GvizCell | null | undefined): number | null {
  if (!c || typeof c.v !== "number") return null;
  return c.v;
}

function parseGviz(text: string): PressRelease[] {
  const m = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\)\s*;?\s*$/);
  if (!m) throw new Error("Format respons gviz tidak dikenal");
  const data = JSON.parse(m[1]);
  if (data.status !== "ok") {
    throw new Error("gviz status: " + (data.status || "unknown"));
  }
  const rows = (data.table?.rows || []) as { c?: (GvizCell | null)[] }[];
  const out: PressRelease[] = [];

  for (const r of rows) {
    const c = r.c || [];
    const unit = cellStr(c[6]);
    const title = cellStr(c[7]);
    // Baris data = punya unit + judul (abaikan baris kosong/summary)
    if (!unit || !title) continue;
    const no = cellNum(c[1]);
    out.push({
      no: no === null ? null : Math.round(no),
      dateText: cellStr(c[2]),
      day: cellNum(c[3]),
      month: cellNum(c[4]),
      year: cellNum(c[5]),
      unit,
      title,
      evidenceUrl: cellStr(c[8]),
    });
  }
  return out;
}

async function fetchSheet(sheetId: string, gid: string): Promise<PressRelease[]> {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=${gid}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Google Sheets HTTP ${res.status}`);
    const text = await res.text();
    return parseGviz(text);
  } finally {
    clearTimeout(timeout);
  }
}

interface ResolvedSource {
  id: string | null;
  label: string;
  sheetId: string;
  gid: string;
  targetPerUnit: number;
  validYear: number;
  isDefault: boolean;
}

async function resolveSource(sourceId: string | null): Promise<ResolvedSource> {
  const fallback: ResolvedSource = {
    id: null,
    label: "2026 Semester 2 (default)",
    sheetId: DEFAULT_SHEET_ID,
    gid: DEFAULT_GID,
    targetPerUnit: TARGET_PER_UNIT,
    validYear: VALID_YEAR,
    isDefault: true,
  };
  try {
    const db = getAdminDb();
    if (sourceId) {
      const snap = await db.collection(SOURCES_COLLECTION).doc(sourceId).get();
      if (!snap.exists) throw new Error("Sumber tidak ditemukan");
      const d = snap.data() as Record<string, unknown>;
      return {
        id: snap.id,
        label: String(d.label || snap.id),
        sheetId: String(d.sheetId),
        gid: String(d.gid || "0"),
        targetPerUnit: Number(d.targetPerUnit) || TARGET_PER_UNIT,
        validYear: Number(d.validYear) || VALID_YEAR,
        isDefault: false,
      };
    }
    const active = await db
      .collection(SOURCES_COLLECTION)
      .where("isActive", "==", true)
      .limit(1)
      .get();
    if (active.empty) return fallback;
    const doc = active.docs[0];
    const d = doc.data() as Record<string, unknown>;
    return {
      id: doc.id,
      label: String(d.label || doc.id),
      sheetId: String(d.sheetId),
      gid: String(d.gid || "0"),
      targetPerUnit: Number(d.targetPerUnit) || TARGET_PER_UNIT,
      validYear: Number(d.validYear) || VALID_YEAR,
      isDefault: false,
    };
  } catch (err: any) {
    // Bila Firestore tak bisa diakses (mis. Koleksi belum ada), pakai default
    // — kecuali user meminta source spesifik (tetap 404).
    if (sourceId) throw err;
    return fallback;
  }
}

/**
 * GET /api/press-release?source=<id>&refresh=1 — read-only untuk semua user login.
 * Tanpa ?source=: memakai sumber aktif (atau sheet default bila belum ada).
 * Mengembalikan rilis + ringkasan + rekap unit + tren bulanan + anomali.
 */
export async function GET(request: NextRequest) {
  const { response } = await requireUser(request);
  if (response) return response;

  try {
    const params = new URL(request.url).searchParams;
    const sourceId = params.get("source");
    const noCache = params.get("refresh") === "1";

    const src = await resolveSource(sourceId);
    const cacheKey = `${src.sheetId}:${src.gid}`;
    const hit = cache.get(cacheKey);
    if (!noCache && hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return NextResponse.json(hit.payload);
    }

    const releases = await fetchSheet(src.sheetId, src.gid);
    const units = buildUnitStats(releases, src.targetPerUnit);
    const payload = {
      meta: {
        sourceId: src.id,
        label: src.label,
        sheetId: src.sheetId,
        gid: src.gid,
        targetPerUnit: src.targetPerUnit,
        validYear: src.validYear,
        isDefault: src.isDefault,
        fetchedAt: new Date().toISOString(),
        totalRows: releases.length,
      },
      summary: buildSummary(releases, units),
      units,
      monthly: buildMonthlyStats(releases),
      releases,
      anomalies: detectAnomalies(releases, src.validYear),
    };
    cache.set(cacheKey, { at: Date.now(), payload });
    return NextResponse.json(payload);
  } catch (err: any) {
    const msg =
      err?.name === "AbortError"
        ? "Timeout membaca Google Sheet (30s)"
        : err?.message || "Gagal membaca Google Sheet";
    console.error("GET /api/press-release error:", err);
    const status = /tidak ditemukan/i.test(msg) ? 404 : 502;
    return NextResponse.json(
      { error: "Gagal memuat monitoring press release", details: msg },
      { status }
    );
  }
}
