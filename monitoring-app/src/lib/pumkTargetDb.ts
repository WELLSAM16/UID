/**
 * Penghubung Set Target PUMK dengan database mitra internal (`pumk_database`).
 *
 * Aturan:
 * - NO ID yang ditargetkan wajib ada di `pumk_database` (dicocokkan lewat
 *   `noIdKey`, case-insensitive).
 * - Nama mitra yang disimpan adalah nama kanonik dari database.
 * - Saat target disimpan dengan daftar mitra eksplisit, `unitId` mitra di
 *   database ikut diset ke unit tersebut (pengganti edit satu-per-satu di
 *   halaman Database PUMK).
 * - Mitra yang dilepas dari daftar target sebuah unit di-unassign dari unit
 *   itu di database (hanya bila `unitId` database masih unit tersebut dan
 *   mitra tidak ditetapkan ke unit lain pada permintaan yang sama).
 */

import type { Firestore, QuerySnapshot, Transaction } from "firebase-admin/firestore";
import { PUMK_DB_COLLECTION } from "./pumkDatabase";
import { normalizeNoIdKey, type PumkAssignedMitra } from "./pumkTarget";

export const PUMK_TARGET_COLLECTION = "pumk_targets";

export interface PumkDbIndexEntry {
  id: string;
  noId: string;
  noIdKey: string;
  nama: string;
  unitId: string;
}

export type PumkDbIndex = Map<string, PumkDbIndexEntry>;

const DB_LOOKUP_FIELDS = ["noId", "noIdKey", "nama", "unitId"] as const;

function indexFromSnapshot(snap: QuerySnapshot): PumkDbIndex {
  const index: PumkDbIndex = new Map();
  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const noId = String(data.noId ?? "").trim();
    if (!noId) continue;
    const key = normalizeNoIdKey(data.noIdKey) || normalizeNoIdKey(noId);
    index.set(key, {
      id: doc.id,
      noId,
      noIdKey: key,
      nama: String(data.nama ?? "").trim(),
      unitId: String(data.unitId ?? "").trim(),
    });
  }
  return index;
}

function dbIndexQuery(db: Firestore) {
  return db.collection(PUMK_DB_COLLECTION).select(...DB_LOOKUP_FIELDS);
}

/** Baca seluruh indeks NO ID → mitra (field minimal, ±363 dokumen). */
export async function readPumkDbIndex(db: Firestore): Promise<PumkDbIndex> {
  return indexFromSnapshot(await dbIndexQuery(db).get());
}

/** Versi transaksi; semua read harus terjadi sebelum write. */
export async function readPumkDbIndexTx(tx: Transaction, db: Firestore): Promise<PumkDbIndex> {
  return indexFromSnapshot(await tx.get(dbIndexQuery(db)));
}

export interface ResolvedAssignment {
  assigned: PumkAssignedMitra[];
  unknown: string[];
}

/** Cocokkan daftar NO ID ke database; pertahankan urutan input. */
export function resolveAssignedMitra(noIds: string[], index: PumkDbIndex): ResolvedAssignment {
  const unknown: string[] = [];
  const assigned: PumkAssignedMitra[] = [];
  for (const raw of noIds) {
    const entry = index.get(normalizeNoIdKey(raw));
    if (!entry) {
      unknown.push(String(raw).trim());
      continue;
    }
    assigned.push({ noId: entry.noId, nama: entry.nama });
  }
  return { assigned, unknown };
}

/** Ringkas daftar NO ID tak dikenal untuk pesan error. */
export function describeNoIds(values: string[], max = 8): string {
  const unique = Array.from(new Set(values.map((v) => String(v).trim()).filter(Boolean)));
  if (unique.length <= max) return unique.join(", ");
  return `${unique.slice(0, max).join(", ")} … (+${unique.length - max} lagi)`;
}

/** Error validasi yang dikembalikan route sebagai JSON (400/409). */
export class PumkAssignError extends Error {
  readonly status: number;
  readonly payload: Record<string, unknown>;

  constructor(status: number, payload: Record<string, unknown>) {
    super(String(payload.error ?? "Penetapan mitra tidak valid"));
    this.name = "PumkAssignError";
    this.status = status;
    this.payload = payload;
  }
}

export interface UnitAssignmentGroup {
  unitId: string;
  /** Mitra yang ditetapkan ke unit ini (sudah ada di database). */
  assigned: PumkDbIndexEntry[];
  /** Kunci NO ID yang dilepas dari unit ini. */
  removedKeys: string[];
}

/**
 * Samakan `unitId` di `pumk_database` dengan hasil Set Target.
 * Ditulis per batch (maks 400) agar tetap aman untuk daftar besar.
 */
export async function syncPumkDbUnits(
  db: Firestore,
  groups: UnitAssignmentGroup[],
  options: {
    /** Indeks database sebelum perubahan (untuk tahu unitId lama). */
    index: PumkDbIndex;
    /** Kunci yang tetap ditetapkan di permintaan ini; jangan di-clear. */
    assignedKeys: Set<string>;
    uid: string;
    email?: string | null;
  }
): Promise<{ assigned: number; cleared: number }> {
  const now = new Date().toISOString();
  const changes = new Map<string, string>();

  for (const group of groups) {
    for (const entry of group.assigned) {
      if (entry.unitId !== group.unitId) changes.set(entry.id, group.unitId);
    }
  }

  for (const group of groups) {
    for (const key of group.removedKeys) {
      if (options.assignedKeys.has(key)) continue;
      const current = options.index.get(key);
      if (!current || current.unitId !== group.unitId) continue;
      // Jangan timpa bila pada request ini mitra sudah dipindah ke unit lain.
      if (changes.has(current.id)) continue;
      changes.set(current.id, "");
    }
  }

  if (changes.size === 0) return { assigned: 0, cleared: 0 };

  let assigned = 0;
  let cleared = 0;
  const list = Array.from(changes.entries());
  for (let i = 0; i < list.length; i += 400) {
    const batch = db.batch();
    for (const [id, unitId] of list.slice(i, i + 400)) {
      batch.set(
        db.collection(PUMK_DB_COLLECTION).doc(id),
        {
          unitId,
          updatedAt: now,
          updatedBy: options.uid,
          updatedByEmail: options.email ?? null,
        },
        { merge: true }
      );
      if (unitId) assigned += 1;
      else cleared += 1;
    }
    await batch.commit();
  }

  return { assigned, cleared };
}
