/**
 * Permintaan reset password (Lupa Sandi) — pola sama seperti account_requests.
 *
 * Alur: form publik (/lupa-sandi, NIP + nama + email wajib) → `password_resets` (pending)
 * → notif di /admin/users (super admin) → Reset: password acak baru,
 * mustChangePassword=true → info akun (profil + NIP + password default)
 * dikirim ke email kontak (SMTP) atau ditampilkan ke admin untuk
 * disampaikan manual → user login → wajib ganti sandi.
 */

export type PasswordResetStatus = "pending" | "approved" | "rejected";

export interface PasswordResetRequest {
  id: string;
  nip: string;
  /** Nama yang diketik pemohon (dicocokkan ke profil, tidak dipercaya buta). */
  name: string;
  /** Email kontak opsional untuk pengiriman info akun. */
  email: string | null;
  status: PasswordResetStatus;
  emailSent?: boolean;
  emailError?: string | null;
  uid?: string | null;
  note?: string | null;
  createdAt: string;
  decidedAt?: string | null;
  decidedBy?: string | null;
}

/** Samakan nama pemohon dengan nama profil (abaikan kapital/spasi ganda). */
export function namesMatch(a: string, b: string): boolean {
  const norm = (s: string) =>
    s.trim().toUpperCase().replace(/\s+/g, " ");
  return norm(a).length >= 2 && norm(a) === norm(b);
}
