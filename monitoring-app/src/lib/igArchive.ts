/**
 * Arsip snapshot harian postingan IG (baca) — pola sama seperti press release.
 *
 * Tiap 24 jam, POST /api/ig-sync mengambil postingan terbaru via Composio
 * lalu upsert ke Google Sheet arsip (1 baris = 1 postingan, kunci = id).
 * Laman live + skoring MEMBACA snapshot ini (bukan live fetch), sehingga
 * filtering tanggal selalu lengkap sejauh histori yang sudah terkumpul,
 * dan load hanya hitung detik (gviz + cache 10 menit).
 *
 * Kolom sheet (A-P):
 *   id | timestamp | account | username | media_type | caption |
 *   permalink | likes | comments | plays | views | reach |
 *   impressions | shares | saved | synced_at
 *
 * File ini murni (fetch + parse) agar bisa diimpor API maupun dipakai
 * sebagai referensi skema oleh sync writer.
 */

export const IG_ARCHIVE_COLUMNS = [
  "id",
  "timestamp",
  "account",
  "username",
  "media_type",
  "caption",
  "permalink",
  "likes",
  "comments",
  "plays",
  "views",
  "reach",
  "impressions",
  "shares",
  "saved",
  "synced_at",
] as const;

export function resolveArchiveSheetId(): string {
  return (
    process.env.IG_ARCHIVE_SHEET_ID ||
    "18MIdVzIkC1QohR9up3YMysRy_zG5qjewqbWKttsyTok"
  );
}

export interface ArchivePost {
  id: string;
  caption: string;
  media_type: string;
  permalink: string;
  timestamp: string;
  username: string;
  source_account: string;
  reach: number;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  saved: number;
  plays: number;
  views: number;
}

interface GvizCell {
  v?: unknown;
}

function cellStr(c: GvizCell | null | undefined): string {
  if (!c) return "";
  const v = c.v;
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  return "";
}

function cellNum(c: GvizCell | null | undefined): number {
  if (!c) return 0;
  const v = c.v;
  if (typeof v === "number" && isFinite(v)) return Math.round(v);
  if (typeof v === "string" && v.trim() !== "" && isFinite(Number(v)))
    return Math.round(Number(v));
  return 0;
}

/** Parse respons gviz sheet arsip → daftar postingan. Abaikan baris header. */
export function parseArchiveGviz(text: string): ArchivePost[] {
  const m = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\)\s*;?\s*$/);
  if (!m) throw new Error("Format respons gviz tidak dikenal");
  const data = JSON.parse(m[1]);
  if (data.status !== "ok") {
    throw new Error("gviz status: " + (data.status || "unknown"));
  }
  const rows = (data.table?.rows || []) as { c?: (GvizCell | null)[] }[];
  const out: ArchivePost[] = [];

  for (const r of rows) {
    const c = r.c || [];
    const id = cellStr(c[0]).trim();
    // Lewati baris kosong + baris header ("id")
    if (!id || id === "id") continue;
    out.push({
      id,
      timestamp: cellStr(c[1]).trim(),
      source_account: cellStr(c[2]).trim(),
      username: cellStr(c[3]).trim() || cellStr(c[2]).trim(),
      media_type: cellStr(c[4]).trim() || "IMAGE",
      caption: cellStr(c[5]),
      permalink: cellStr(c[6]).trim() || "#",
      likes: cellNum(c[7]),
      comments: cellNum(c[8]),
      plays: cellNum(c[9]),
      views: cellNum(c[10]),
      reach: cellNum(c[11]),
      impressions: cellNum(c[12]),
      shares: cellNum(c[13]),
      saved: cellNum(c[14]),
    });
  }
  return out;
}

/** Baca sheet arsip via gviz (server-side). */
export async function readArchiveSheet(sheetId?: string): Promise<ArchivePost[]> {
  const id = sheetId || resolveArchiveSheetId();
  const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:json`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Google Sheets HTTP ${res.status}`);
    return parseArchiveGviz(await res.text());
  } finally {
    clearTimeout(timeout);
  }
}
