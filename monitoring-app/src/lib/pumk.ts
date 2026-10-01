/**
 * Monitoring PUMK UP3 Bintaro (read-only) — pola sama seperti press release.
 *
 * Sumber: Google Sheet database PUMK milik UID (publik via gviz, tanpa key).
 * - Tab per-UP "UP3 Bintaro": daftar kerja (15 kolom, skema stabil).
 * - Tab "FIX REKAP DATABASE MASTER": pengaya (flag Target Operasi, saldo
 *   Juli 2026, status/validasi), join per NO ID.
 * Fokus: yang CASCADING UP 2026 = "UP3 Bintaro".
 */

export const PUMK_SHEET_ID_DEFAULT = "16h-mmD5ajfvurmGCVX9UGo73rai4HlIHLjGhxwXRSxg";
export const PUMK_BINTARO_GID_DEFAULT = "1612639547";
export const PUMK_MASTER_SHEET_DEFAULT = "FIX REKAP DATABASE MASTER";
export const PUMK_UNIT = "UP3 Bintaro";

export function resolvePumkSheetId(): string {
  return process.env.PUMK_SHEET_ID || PUMK_SHEET_ID_DEFAULT;
}

export function resolvePumkBintaroGid(): string {
  return process.env.PUMK_BINTARO_GID || PUMK_BINTARO_GID_DEFAULT;
}

/** Link ke file SPS online (tab UP3 Bintaro) — dibuka di tab baru. */
export function pumkSpsUrl(sheetId?: string, gid?: string): string {
  const id = sheetId || PUMK_SHEET_ID_DEFAULT;
  const g = gid || PUMK_BINTARO_GID_DEFAULT;
  return `https://docs.google.com/spreadsheets/d/${id}/view?gid=${encodeURIComponent(g)}`;
}

export interface PumkMitra {
  noId: string;
  nama: string;
  kolektibilitas: string;
  pks: string;
  saldoDasar: number;
  pokok: number;
  jasa: number;
  total: number;
  // Angka terbaru dari master (kolom Juli 2026), fallback = angka tab.
  pokokJul: number;
  jasaJul: number;
  totalJul: number;
  tindakLanjut: string;
  lokasiUrl: string;
  alamat: string;
  status1: string;
  status2: string;
  // Dari master:
  masukTO: string;
  usulanTL: string;
  statusPerJuli: string;
  statusTLUP: string;
  nilaiTLUP: number;
  hasilInventarisasi: string;
}

export interface PumkKpi {
  totalMitra: number;
  totalTunggakan: number;
  byKolektibilitas: { name: string; count: number; rupiah: number }[];
  selesai: number;
  berjalan: number;
  belumMulai: number;
  toCount: number;
  pksKosong: number;
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

/** Angka sheet campur aduk: number, "5,000,000", "-", "#N/A", kosong. */
export function pumkNum(raw: unknown): number {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === "number") return isFinite(raw) ? Math.round(raw) : 0;
  const s = String(raw).trim();
  if (!s || s === "-" || s.startsWith("#")) return 0;
  const cleaned = s.replace(/[^0-9\-]/g, "");
  if (!cleaned || cleaned === "-") return 0;
  const n = Number(cleaned);
  return isFinite(n) ? Math.round(n) : 0;
}

function normId(s: string): string {
  return s.trim().toUpperCase();
}

function isEmptyStatus(s: string): boolean {
  const t = s.trim().toUpperCase();
  return !t || t === "#N/A" || t === "-" || t === "NONE";
}

function parseGviz(text: string): { c?: (GvizCell | null)[] }[] {
  const m = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\)\s*;?\s*$/);
  if (!m) throw new Error("Format respons gviz tidak dikenal");
  const data = JSON.parse(m[1]);
  if (data.status !== "ok") throw new Error("gviz status: " + (data.status || "unknown"));
  return (data.table?.rows || []) as { c?: (GvizCell | null)[] }[];
}

async function fetchGviz(sheetId: string, query: string): Promise<{ c?: (GvizCell | null)[] }[]> {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&${query}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Google Sheets HTTP ${res.status}`);
    return parseGviz(await res.text());
  } finally {
    clearTimeout(timeout);
  }
}

function rowVals(r: { c?: (GvizCell | null)[] }, n: number): string[] {
  const c = r.c || [];
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(cellStr(c[i]));
  return out;
}

function rawVal(r: { c?: (GvizCell | null)[] }, i: number): unknown {
  const c = r.c || [];
  if (i >= c.length || !c[i]) return null;
  return c[i]?.v ?? null;
}

/** Baca tab UP3 Bintaro (skema 15 kolom, posisi tetap). */
function parseBintaroTab(rows: { c?: (GvizCell | null)[] }[]): PumkMitra[] {
  const out: PumkMitra[] = [];
  for (const r of rows) {
    const v = rowVals(r, 15);
    const noId = v[1].trim();
    if (!noId || noId.toUpperCase() === "NO ID") continue;
    const pokok = pumkNum(rawVal(r, 6));
    const jasa = pumkNum(rawVal(r, 7));
    let total = pumkNum(rawVal(r, 8));
    if (!total) total = pokok + jasa;
    out.push({
      noId,
      nama: v[2].trim(),
      kolektibilitas: v[3].trim() || "-",
      pks: v[4].trim() || "-",
      saldoDasar: pumkNum(rawVal(r, 5)),
      pokok,
      jasa,
      total,
      pokokJul: pokok,
      jasaJul: jasa,
      totalJul: total,
      tindakLanjut: v[10].trim() || "-",
      lokasiUrl: v[11].trim(),
      alamat: v[12].trim(),
      status1: v[13].trim(),
      status2: v[14].trim(),
      masukTO: "",
      usulanTL: "",
      statusPerJuli: "",
      statusTLUP: "",
      nilaiTLUP: 0,
      hasilInventarisasi: "",
    });
  }
  return out;
}

/** Baca master → peta NO ID → field pengaya (hanya unit Bintaro). */
function parseMaster(rows: { c?: (GvizCell | null)[] }[]): Map<string, Partial<PumkMitra>> {
  if (rows.length === 0) return new Map();
  // Petakan header → indeks (robust terhadap geser kolom).
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const head = rowVals(rows[0], 55).map(norm);
  const find = (...keys: string[]): number => {
    for (const k of keys) {
      const i = head.findIndex((h) => h === k);
      if (i >= 0) return i;
    }
    return -1;
  };
  const iId = find("no id kontrak");
  const iJulP = find("saldo pokok juli 2026");
  const iJulJ = find("saldo jasa juli 2026");
  const iJulT = find("total saldo juli 2026");
  const iTO = find("masuk to 2026");
  const iTL = find("usulan tindak lanjut to 2026");
  const iCasc = find("cascading up 2026");
  const iStJuli = find("status per juli 2026");
  const iStTL = find("status tindak lanjut up sm i 2026");
  const iNilTL = find("nilai tindak lanjut up sm i 2026");
  const iHasil = find("hasil inventarisasi up");
  if (iId < 0 || iCasc < 0) return new Map();

  const map = new Map<string, Partial<PumkMitra>>();
  for (const r of rows.slice(1)) {
    const v = rowVals(r, 55);
    if (v[iCasc].trim() !== PUMK_UNIT) continue;
    const noId = v[iId].trim();
    if (!noId) continue;
    const pJ = iJulP >= 0 ? pumkNum(rawVal(r, iJulP)) : 0;
    const jJ = iJulJ >= 0 ? pumkNum(rawVal(r, iJulJ)) : 0;
    let tJ = iJulT >= 0 ? pumkNum(rawVal(r, iJulT)) : 0;
    if (!tJ) tJ = pJ + jJ;
    map.set(normId(noId), {
      pokokJul: pJ,
      jasaJul: jJ,
      totalJul: tJ,
      masukTO: iTO >= 0 ? v[iTO].trim() : "",
      usulanTL: iTL >= 0 ? v[iTL].trim() : "",
      statusPerJuli: iStJuli >= 0 ? v[iStJuli].trim() : "",
      statusTLUP: iStTL >= 0 ? v[iStTL].trim() : "",
      nilaiTLUP: iNilTL >= 0 ? pumkNum(rawVal(r, iNilTL)) : 0,
      hasilInventarisasi: iHasil >= 0 ? v[iHasil].trim() : "",
    });
  }
  return map;
}

const DONE_STATUS = new Set(["LUNAS", "SELESAI INVENTARISASI"]);

export function tlProgress(m: PumkMitra): "selesai" | "berjalan" | "belum" {
  const s2 = m.status2.trim().toUpperCase();
  if (DONE_STATUS.has(s2)) return "selesai";
  if (!isEmptyStatus(m.status1) || !isEmptyStatus(m.status2)) return "berjalan";
  return "belum";
}

/** Baca + gabung kedua tab → daftar mitra + KPI. */
export async function readPumk(sheetId?: string): Promise<{ mitra: PumkMitra[]; kpi: PumkKpi }> {
  const id = sheetId || resolvePumkSheetId();
  const gid = resolvePumkBintaroGid();
  const masterSheet =
    process.env.PUMK_MASTER_SHEET || PUMK_MASTER_SHEET_DEFAULT;
  const [tabRows, masterRows] = await Promise.all([
    fetchGviz(id, `gid=${encodeURIComponent(gid)}`),
    fetchGviz(id, `sheet=${encodeURIComponent(masterSheet)}`),
  ]);

  const list = parseBintaroTab(tabRows);
  const enrich = parseMaster(masterRows);
  const seen = new Set(list.map((m) => normId(m.noId)));
  // Baris Bintaro yang hanya ada di master ikut ditampilkan.
  for (const [key, extra] of enrich) {
    if (seen.has(key)) continue;
    list.push({
      noId: key,
      nama: "-",
      kolektibilitas: "-",
      pks: "-",
      saldoDasar: 0,
      pokok: 0,
      jasa: 0,
      total: 0,
      pokokJul: extra.pokokJul || 0,
      jasaJul: extra.jasaJul || 0,
      totalJul: extra.totalJul || 0,
      tindakLanjut: "-",
      lokasiUrl: "",
      alamat: "",
      status1: "",
      status2: "",
      masukTO: extra.masukTO || "",
      usulanTL: extra.usulanTL || "",
      statusPerJuli: extra.statusPerJuli || "",
      statusTLUP: extra.statusTLUP || "",
      nilaiTLUP: extra.nilaiTLUP || 0,
      hasilInventarisasi: extra.hasilInventarisasi || "",
    });
  }
  for (const m of list) {
    const extra = enrich.get(normId(m.noId));
    if (!extra) continue;
    if (extra.totalJul) {
      m.pokokJul = extra.pokokJul || 0;
      m.jasaJul = extra.jasaJul || 0;
      m.totalJul = extra.totalJul;
    }
    m.masukTO = extra.masukTO || "";
    m.usulanTL = extra.usulanTL || "";
    m.statusPerJuli = extra.statusPerJuli || "";
    m.statusTLUP = extra.statusTLUP || "";
    m.nilaiTLUP = extra.nilaiTLUP || 0;
    m.hasilInventarisasi = extra.hasilInventarisasi || "";
  }
  list.sort((a, b) => b.totalJul - a.totalJul);

  const byKol = new Map<string, { count: number; rupiah: number }>();
  let selesai = 0,
    berjalan = 0,
    belum = 0,
    toCount = 0,
    pksKosong = 0,
    tunggakan = 0;
  for (const m of list) {
    tunggakan += m.totalJul;
    const k = byKol.get(m.kolektibilitas) || { count: 0, rupiah: 0 };
    k.count += 1;
    k.rupiah += m.totalJul;
    byKol.set(m.kolektibilitas, k);
    const p = tlProgress(m);
    if (p === "selesai") selesai++;
    else if (p === "berjalan") berjalan++;
    else belum++;
    if (m.masukTO.toUpperCase() === "TO 2026") toCount++;
    if (m.pks.trim().toUpperCase() !== "ADA") pksKosong++;
  }

  return {
    mitra: list,
    kpi: {
      totalMitra: list.length,
      totalTunggakan: tunggakan,
      byKolektibilitas: [...byKol.entries()]
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.rupiah - a.rupiah),
      selesai,
      berjalan,
      belumMulai: belum,
      toCount,
      pksKosong,
    },
  };
}
