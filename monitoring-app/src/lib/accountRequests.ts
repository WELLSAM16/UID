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
