/**
 * Target PUMK per unit per tahun — diset Admin UID (cerminan SPS
 * "FIX REKAP DATABASE MASTER": kolom CASCADING UP 2026 = unit penanggung
 * jawab, MASUK TO 2026, USULAN TINDAK LANJUT, NILAI TINDAK LANJUT).
 *
 * Koleksi `pumk_targets`. Tulis via Admin SDK (/api/pumk-targets);
 * client hanya baca (progress capaian vs target di /pumk/target).
 *
 * - targetMitra: jumlah mitra yang ditangani unit (cascading).
 * - targetInventarisasi: jumlah mitra selesai inventarisasi.
 * - targetRupiahKembali: rupiah kembali via Penagihan (approved).
 * - assignedNoIds: daftar NO ID mitra yang ditangani (opsional,
 *   cerminan kolom CASCADING UP 2026, satu No ID per baris di UI).
 */

import { normalizeUnitId } from "./roles";

export type PumkTargetStatus = "Active" | "Paused";

export interface PumkTarget {
  id?: string;
  /** Unit pelaksana, cth "UP3 BINTARO", "UP2D" (bukan "UID"). */
  unitId: string;
  /** Tahun anggaran, "YYYY" cth "2026". */
  tahun: string;
  /** Jumlah mitra selesai inventarisasi (kunjungan approved). */
  targetInventarisasi: number;
  /** Rupiah kembali (sum totalSaldo kunjungan Penagihan approved). */
  targetRupiahKembali: number;
  /** Jumlah mitra yang ditangani unit (cascading). */
  targetMitra: number;
  /** Daftar NO ID mitra yang ditangani (opsional). */
  assignedNoIds?: string[];
  status: PumkTargetStatus;
  createdBy?: string;
  createdByEmail?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

/** Unit pelaksana PUMK: UP2D + 16 UP3 (UID dikecualikan). */
export const PUMK_TARGET_UNITS = [
  "UP2D",
  "UP3 BANDENGAN",
  "UP3 BINTARO",
  "UP3 BULUNGAN",
  "UP3 CEMPAKA PUTIH",
  "UP3 CENGKARENG",
  "UP3 CIPUTAT",
  "UP3 CIRACAS",
  "UP3 JATINEGARA",
  "UP3 KEBON JERUK",
  "UP3 KRAMAT JATI",
  "UP3 LENTENG AGUNG",
  "UP3 MARUNDA",
  "UP3 MENTENG",
  "UP3 PONDOK GEDE",
  "UP3 PONDOK KOPI",
  "UP3 TANJUNG PRIOK",
] as const;

function isInt(n: unknown): boolean {
  return typeof n === "number" && Number.isInteger(n);
}

function parseAssigned(input: unknown): string[] | null {
  if (input === undefined || input === null || input === "") return [];
  const arr = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.split(/[\n,;]+/)
      : null;
  if (!arr) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of arr) {
    const v = String(raw ?? "").trim();
    if (!v) continue;
    if (v.length > 120) return null;
    const key = v.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length > 5000) return null;
  }
  return out;
}

/** Validasi input create/update target PUMK. */
export function validatePumkTarget(input: {
  unitId?: unknown;
  tahun?: unknown;
  targetInventarisasi?: unknown;
  targetRupiahKembali?: unknown;
  targetMitra?: unknown;
  assignedNoIds?: unknown;
  status?: unknown;
}): ValidationResult {
  const unit = normalizeUnitId(
    typeof input.unitId === "string" ? input.unitId : ""
  );
  if (!unit) return { ok: false, error: "unitId wajib dipilih (UP2D / UP3 …)" };
  if (unit === "UID")
    return { ok: false, error: "unitId UID tidak boleh punya target PUMK" };

  const tahun = String(input.tahun ?? "").trim();
  if (!/^\d{4}$/.test(tahun))
    return { ok: false, error: "tahun wajib format YYYY (cth 2026)" };
  const y = Number(tahun);
  if (y < 2020 || y > 2100)
    return { ok: false, error: "tahun harus 2020–2100" };

  const inv = Number(input.targetInventarisasi);
  if (!Number.isFinite(inv) || !isInt(inv) || inv < 0 || inv > 100000)
    return { ok: false, error: "targetInventarisasi harus bilangan bulat 0–100000" };

  const rupiah = Number(input.targetRupiahKembali);
  if (!Number.isFinite(rupiah) || rupiah < 0 || rupiah > 1000000000000)
    return { ok: false, error: "targetRupiahKembali harus angka >= 0" };

  const mitra = Number(input.targetMitra);
  if (!Number.isFinite(mitra) || !isInt(mitra) || mitra < 0 || mitra > 100000)
    return { ok: false, error: "targetMitra harus bilangan bulat 0–100000" };

  if (parseAssigned(input.assignedNoIds) === null)
    return {
      ok: false,
      error: "assignedNoIds harus daftar NO ID (maks 5000, tiap ≤120 karakter)",
    };

  if (
    input.status !== undefined &&
    input.status !== null &&
    input.status !== "Active" &&
    input.status !== "Paused"
  )
    return { ok: false, error: 'status harus "Active" atau "Paused"' };

  return { ok: true };
}

/** Normalisasi daftar No ID (trim, buang kosong, dedup case-insensitive). */
export function normalizeAssignedNoIds(input: unknown): string[] {
  return parseAssigned(input) || [];
}

/** Kunci unik target aktif: satu baris Active per (unitId, tahun). */
export function pumkTargetKey(unitId: string, tahun: string): string {
  return `${unitId}__${tahun}`;
}

export function currentYear(): string {
  return String(new Date().getFullYear());
}
