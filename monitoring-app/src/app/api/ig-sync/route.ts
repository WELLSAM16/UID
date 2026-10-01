import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireAdmin, requireUser } from "@/lib/authServer";
import { getInstagramData } from "../instagram/route";
import { IG_ARCHIVE_COLUMNS, resolveArchiveSheetId } from "@/lib/igArchive";

export const maxDuration = 300;

const STATE_COLLECTION = "ig_sync_state";
const STATE_DOC = "daily";

function toStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function toNum(v: unknown): number {
  const n = Number(v);
  return isFinite(n) ? Math.round(n) : 0;
}

/** Bentuk 1 baris sheet (16 kolom A-P) dari 1 postingan live. */
function postToRow(p: any, syncedAt: string): unknown[] {
  const caption = toStr(p.caption || "").slice(0, 10000);
  return [
    toStr(p.id),
    toStr(p.timestamp),
    toStr(p.source_account || p.username),
    toStr(p.username),
    toStr(p.media_type || "IMAGE"),
    caption,
    toStr(p.permalink || "#"),
    toNum(p.likes),
    toNum(p.comments),
    toNum(p.plays),
    toNum(p.views),
    toNum(p.reach),
    toNum(p.impressions),
    toNum(p.shares),
    toNum(p.saved),
    syncedAt,
  ];
}

function getSheetsClient() {
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!clientEmail || !privateKey) {
    throw new Error("Missing FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY");
  }
  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

function isCronRequest(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") || "";
  return !!cronSecret && header === `Bearer ${cronSecret}`;
}

async function authorized(request: NextRequest): Promise<{ ok: boolean; via: string }> {
  // 1) Vercel Cron mengirim Bearer CRON_SECRET otomatis bila env diset
  if (isCronRequest(request)) return { ok: true, via: "cron" };
  // 2) Admin login (untuk backfill/percobaan manual via curl — tanpa tombol UI)
  const { response } = await requireAdmin(request);
  if (!response) return { ok: true, via: "admin" };
  return { ok: false, via: "none" };
}

/**
 * POST /api/ig-sync — sinkronisasi harian (Vercel Cron 01:00 WIB).
 * Fetch live via Composio → upsert ke sheet arsip per ID postingan.
 * Auth: Bearer CRON_SECRET atau admin login.
 * Body opsional: { maxPosts?: number } (default env IG_SYNC_MAX_POSTS || 100).
 */
export async function POST(request: NextRequest) {
  const auth = await authorized(request);
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized (perlu CRON_SECRET / admin)" }, { status: 401 });
  }

  let maxPosts = parseInt(process.env.IG_SYNC_MAX_POSTS || "100", 10);
  try {
    const body = await request.json();
    if (body && Number.isInteger(body.maxPosts) && body.maxPosts >= 1 && body.maxPosts <= 500) {
      maxPosts = body.maxPosts;
    }
  } catch {
    // tanpa body = pakai default
  }

  return runSync(auth.via, maxPosts);
}

/**
 * GET /api/ig-sync — dua mode:
 * - Dipicu Vercel Cron (GET + Bearer CRON_SECRET, atau admin + ?run=1):
 *   jalankan sinkronisasi.
 * - Selain itu (user login): kembalikan status sync terakhir untuk
 *   label "diperbarui" di UI.
 */
export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  if (isCronRequest(request)) {
    return runSync("cron", parseInt(process.env.IG_SYNC_MAX_POSTS || "100", 10));
  }
  if (params.get("run") === "1") {
    const { response } = await requireAdmin(request);
    if (response) return response;
    const mp = parseInt(params.get("maxPosts") || process.env.IG_SYNC_MAX_POSTS || "100", 10);
    const maxPosts = Number.isInteger(mp) && mp >= 1 && mp <= 500 ? mp : 100;
    return runSync("admin", maxPosts);
  }

  const { response } = await requireUser(request);
  if (response) return response;
  try {
    const db = getAdminDb();
    const snap = await db.collection(STATE_COLLECTION).doc(STATE_DOC).get();
    return NextResponse.json({ state: snap.exists ? snap.data() : null });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Gagal memuat status sync", details: err?.message },
      { status: 500 }
    );
  }
}

async function runSync(via: string, maxPosts: number) {
  const sheetId = resolveArchiveSheetId();
  const startedAt = new Date().toISOString();
  const db = getAdminDb();
  const stateRef = db.collection(STATE_COLLECTION).doc(STATE_DOC);

  try {
    const igData = await getInstagramData(50, maxPosts);
    const posts: any[] = igData.posts || [];
    const syncedAt = new Date().toISOString();

    const sheets = getSheetsClient();
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: sheetId,
      fields: "sheets.properties",
    });
    const tab = meta.data.sheets?.[0]?.properties?.title || "Sheet1";

    // Pastikan baris header
    const head = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${tab}!A1:P1`,
    });
    const headRow = head.data.values?.[0] || [];
    if (headRow.join("|") !== [...IG_ARCHIVE_COLUMNS].join("|")) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `${tab}!A1:P1`,
        valueInputOption: "RAW",
        requestBody: { values: [[...IG_ARCHIVE_COLUMNS]] },
      });
    }

    // Petakan id → nomor baris yang sudah ada
    const idCol = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${tab}!A2:A`,
    });
    const existing = new Map<string, number>();
    (idCol.data.values || []).forEach((row, i) => {
      const id = String(row[0] || "").trim();
      if (id && !existing.has(id)) existing.set(id, i + 2); // +2: header + 1-index
    });

    const updates: { range: string; values: unknown[][] }[] = [];
    const appends: unknown[][] = [];
    for (const p of posts) {
      if (!p?.id) continue;
      const row = postToRow(p, syncedAt);
      const rowNum = existing.get(String(p.id));
      if (rowNum) {
        // Refresh metrik postingan lama (likes dkk berubah) — kolom B:P
        updates.push({ range: `${tab}!B${rowNum}:P${rowNum}`, values: [row.slice(1)] });
      } else {
        appends.push(row);
      }
    }

    if (updates.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: { valueInputOption: "RAW", data: updates },
      });
    }
    if (appends.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: `${tab}!A:P`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: appends },
      });
    }

    const result = {
      status: "ok",
      via,
      startedAt,
      syncedAt,
      fetched: posts.length,
      updated: updates.length,
      appended: appends.length,
      accounts: igData.accounts_fetched || [],
      errors: igData.errors || [],
    };
    await stateRef.set({ ...result, updatedAt: syncedAt }, { merge: true });
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("runSync /api/ig-sync error:", err);
    const result = {
      status: "error",
      via,
      startedAt,
      syncedAt: null,
      error: err?.message || String(err),
    };
    try {
      await stateRef.set({ ...result, updatedAt: new Date().toISOString() }, { merge: true });
    } catch {
      // abaikan gagal tulis state
    }
    return NextResponse.json(
      { error: "Gagal sinkronisasi arsip", details: result.error },
      { status: 500 }
    );
  }
}
