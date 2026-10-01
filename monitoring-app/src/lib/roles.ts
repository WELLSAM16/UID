/**
 * Tahap 1 — Fondasi akun & role UID Jaya.
 *
 * Role:
 * - staff        : UP3, buat draf + lihat dashboard unitnya
 * - team_leader  : UP3, review draf tahap TL (se-unit)
 * - asman        : UP3, approval UP3 (se-unit)
 * - admin_uid    : UID, operasional lintas unit (kurasi, target, sync, kelola NIP)
 * - administrator: dev/maintenance, akses penuh semua fitur
 *
 * Login memakai NIP. Di belakang layar NIP dipetakan ke email
 * `<nip>@uidjaya.pln.co.id` agar tetap memakai Firebase Auth email/password
 * tanpa perlu custom-token server.
 */

export const NIP_EMAIL_DOMAIN = "uidjaya.pln.co.id";

export type Role =
  | "staff"
  | "team_leader"
  | "asman"
  | "admin_uid"
  | "administrator"
  // Legacy (pra Tahap 1) — dipetakan otomatis, jangan dipakai untuk akun baru.
  | "admin"
  | "user";

export interface UserProfile {
  uid: string;
  email: string;
  role: Role;
  nip?: string;
  name?: string;
  unitId?: string;
  isActive?: boolean;
  mustChangePassword?: boolean;
}

export const ROLE_LABELS: Record<string, string> = {
  staff: "Staff",
  team_leader: "Team Leader",
  asman: "Asman",
  admin_uid: "Admin UID",
  administrator: "Administrator",
  // legacy
  admin: "Admin (legacy)",
  user: "User (legacy)",
};

export const MANAGEABLE_ROLES = [
  "staff",
  "team_leader",
  "asman",
  "admin_uid",
  "administrator",
] as const;

/** Role lama -> role baru (kompatibilitas data existing). */
export function normalizeRole(role: string | undefined): Role {
  if (role === "admin") return "administrator";
  if (role === "user") return "staff";
  if (
    role === "staff" ||
    role === "team_leader" ||
    role === "asman" ||
    role === "admin_uid" ||
    role === "administrator"
  )
    return role;
  return "staff";
}

/** NIP PLN (Prev.Per.No): 4-32 digit, boleh diakhiri 1-2 huruf (cth: 7191037J). */
export function validateNip(nip: string): string | null {
  const v = (nip || "").trim().toUpperCase();
  if (!/^[0-9]{4,32}[A-Z]{0,2}$/.test(v))
    return "NIP harus 4-32 digit angka, boleh diakhiri 1-2 huruf (cth: 7191037J)";
  return null;
}

export function nipToEmail(nip: string): string {
  return `${nip.trim().toUpperCase()}@${NIP_EMAIL_DOMAIN}`;
}

export function emailToNip(email: string | undefined | null): string | null {
  if (!email) return null;
  const suffix = `@${NIP_EMAIL_DOMAIN}`;
  if (!email.toLowerCase().endsWith(suffix.toLowerCase())) return null;
  return email.slice(0, -suffix.length);
}

/**
 * Input login -> email Firebase Auth.
 * - Berisi "@": dianggap email langsung (khusus administrator/dev yang
 *   didaftarkan via email, misal akun Gmail).
 * - Selain itu: dianggap NIP (digit) lalu dipetakan ke email internal.
 */
export function loginToEmail(input: string): string {
  const v = (input || "").trim();
  if (v.includes("@")) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new Error("Format email tidak valid");
    return v;
  }
  const nipErr = validateNip(v);
  if (nipErr) throw nipErr;
  return nipToEmail(v);
}

/** Punya kewenangan admin operasional (kelola target/sumber/sync/approve legacy). */
export function isAdminRole(role: string | undefined | null): boolean {
  return role === "admin_uid" || role === "administrator" || role === "admin";
}

/** Boleh membuka area /admin (kelola pengguna, review, target, sumber). */
export function canAccessAdminArea(role: string | undefined | null): boolean {
  return isAdminRole(role);
}

/**
 * Boleh mengelola pengguna lain?
 * - administrator: boleh kelola semua role.
 * - admin_uid: boleh kelola role UP3 (staff/team_leader/asman) saja,
 *   tidak boleh membuat/mengubah sesama admin_uid atau administrator.
 */
export function canManageRole(
  actorRole: string | undefined | null,
  targetRole: string
): boolean {
  if (actorRole === "administrator" || actorRole === "admin") return true;
  if (actorRole === "admin_uid")
    return targetRole === "staff" || targetRole === "team_leader" || targetRole === "asman";
  return false;
}
