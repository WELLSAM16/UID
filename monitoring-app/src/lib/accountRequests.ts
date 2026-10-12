/**
 * Request pembuatan akun — publik mengajukan, admin menyetujui.
 *
 * Alur: form publik (/ajukan-akun) → `account_requests` (pending)
 * → admin Approve di /admin/users → akun dibuat via Auth + Firestore `users`
 * → kredensial dikirim via email (SMTP). Field WA (phone/waStatus)
 * disiapkan dari awal agar fitur "send by WA" nanti tinggal tambah pengirim,
 * tanpa migrasi skema.
 */

export const REQUESTABLE_ROLES = ["staff", "team_leader", "asman"] as const;
export type RequestableRole = (typeof REQUESTABLE_ROLES)[number];

export type RequestStatus = "pending" | "approved" | "rejected";

export interface AccountRequest {
  id: string;
  nip: string;
  name: string;
  role: string;
  unitId: string | null;
  /** Email tujuan pengiriman NIP + password awal. */
  email: string;
  /** Opsional sejak awal untuk WA-phase berikutnya (format 62xx). */
  phone?: string | null;
  /** Kanal kirim yang dipakai saat approve: email dulu, wa menyusul. */
  channel?: "email" | "wa";
  status: RequestStatus;
  emailSent?: boolean;
  emailError?: string | null;
  /** Placeholder status WA masa depan: queued/sent/failed. */
  waStatus?: string | null;
  uid?: string | null;
  note?: string | null;
  createdAt: string;
  decidedAt?: string | null;
  decidedBy?: string | null;
}

export function validateRequestEmail(email: string): string | null {
  const v = (email || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "Email tidak valid";
  if (v.length > 120) return "Email terlalu panjang";
  return null;
}

/** Normalisasi nomor HP Indonesia ke format 62xx (atau null bila kosong). */
export function normalizePhone(input: string | undefined | null): string | null {
  if (!input) return null;
  let v = String(input).replace(/[^0-9+]/g, "");
  if (v.startsWith("+")) v = v.slice(1);
  if (v.startsWith("0")) v = "62" + v.slice(1);
  if (!/^62\d{8,13}$/.test(v)) return null;
  return v;
}

/** Normalisasi email kontak untuk perbandingan ikatan NIP (case-insensitive). */
export function normContactEmail(email: string): string {
  return String(email || "").trim().toLowerCase();
}

/**
 * Ikatan 1 NIP = 1 email kontak: NIP yang sudah pernah disetujui (akun
 * dibuat / password direset) terikat pada email tersebut. NIP yang sama
 * tidak boleh dipakai dengan email lain.
 *
 * Mengembalikan email terikat (lowercase) dari dokumen approved terbaru
 * di `account_requests` / `password_resets`, atau null bila belum ada jejak.
 * Sengaja query where("nip") saja + filter di memori agar tidak butuh
 * indeks komposit baru.
 */
export async function findBoundContactEmail(
  db: FirebaseFirestore.Firestore,
  nip: string
): Promise<string | null> {
  const [acc, rst] = await Promise.all([
    db.collection("account_requests").where("nip", "==", nip).get(),
    db.collection("password_resets").where("nip", "==", nip).get(),
  ]);
  const cands: { email: string; at: string }[] = [];
  for (const snap of [acc, rst]) {
    for (const d of snap.docs) {
      const v = d.data() as Record<string, unknown>;
      if (v.status !== "approved") continue;
      const em = normContactEmail(String(v.email || ""));
      if (!em) continue;
      cands.push({ email: em, at: String(v.decidedAt || v.createdAt || "") });
    }
  }
  if (cands.length === 0) return null;
  cands.sort((a, b) => b.at.localeCompare(a.at));
  return cands[0].email;
}

/**
 * Cek apakah NIP ini punya pengajuan akun pending/approved dengan email
 * kontak BERBEDA (pengajuan rejected diabaikan agar koreksi data tetap bisa).
 */
export async function hasNipEmailConflict(
  db: FirebaseFirestore.Firestore,
  nip: string,
  email: string
): Promise<boolean> {
  const want = normContactEmail(email);
  const snap = await db.collection("account_requests").where("nip", "==", nip).get();
  for (const d of snap.docs) {
    const v = d.data() as Record<string, unknown>;
    if (v.status !== "pending" && v.status !== "approved") continue;
    const em = normContactEmail(String(v.email || ""));
    if (em && em !== want) return true;
  }
  return false;
}
/** Password awal acak 10 karakter, mudah dibaca (tanpa 0/O/1/l). */
export function generateTempPassword(length = 10): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  // crypto tersedia di Node (route handler) maupun browser (fallback Math.random).
  const g = globalThis as unknown as { crypto?: { getRandomValues?: (a: Uint8Array) => void; randomInt?: (n: number) => number } };
  const out: string[] = [];
  if (g.crypto?.getRandomValues) {
    const buf = new Uint8Array(length);
    g.crypto.getRandomValues(buf);
    for (let i = 0; i < length; i++) out.push(alphabet[buf[i] % alphabet.length]);
    return out.join("");
  }
  for (let i = 0; i < length; i++) {
    out.push(alphabet[Math.floor(Math.random() * alphabet.length)]);
  }
  return out.join("");
}
