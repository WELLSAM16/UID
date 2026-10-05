/**
 * Operasi Firebase Authentication via Identity Toolkit REST API.
 *
 * Alasan: `firebase-admin/auth` menarik `jwks-rsa` yang me-require `jose`
 * secara CommonJS, sementara `jose` v6 hanya ESM → crash ERR_REQUIRE_ESM
 * saat modul dimuat di runtime Vercel (semua /api/* 500 kosong).
 * REST API ini hanya butuh `googleapis` (JWT service account) yang sudah
 * terbukti jalan di production (dipakai ig-sync untuk Sheets).
 */

import { google } from "googleapis";

const TOOLKIT_BASE = "https://www.googleapis.com/identitytoolkit/v3/relyingparty";

function serviceAccount(): { clientEmail: string; privateKey: string } {
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!clientEmail || !privateKey) {
    throw new Error(
      "Missing Firebase Admin credentials (FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY)"
    );
  }
  return { clientEmail, privateKey };
}

async function getToolkitToken(): Promise<string> {
  const { clientEmail, privateKey } = serviceAccount();
  const jwt = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/identitytoolkit"],
  });
  const { token } = await jwt.getAccessToken();
  if (!token) throw new Error("Gagal membuat access token service account");
  return token;
}

function friendlyToolkitError(code: string): string {
  if (code.includes("EMAIL_EXISTS")) return "EMAIL_EXISTS";
  if (code.includes("WEAK_PASSWORD")) return "Password terlalu lemah (minimal 6 karakter)";
  if (code.includes("INVALID_EMAIL")) return "Format email tidak valid";
  if (code.includes("USER_NOT_FOUND")) return "Akun Auth tidak ditemukan";
  return code;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function toolkit(method: string, body: Record<string, unknown>): Promise<any> {
  const token = await getToolkitToken();
  const res = await fetch(`${TOOLKIT_BASE}/${method}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(friendlyToolkitError(String(data?.error?.message || `HTTP ${res.status}`)));
  }
  return data;
}

/** Buat akun Auth baru. Mengembalikan uid (localId). */
export async function adminCreateAuthUser(opts: {
  email: string;
  password: string;
  displayName?: string;
}): Promise<{ uid: string }> {
  const data = await toolkit("signupNewUser", {
    email: opts.email,
    password: opts.password,
    displayName: opts.displayName,
    returnSecureToken: false,
  });
  if (!data.localId) throw new Error("Respons Auth tidak mengandung localId");
  return { uid: data.localId as string };
}

/** Ubah password / nama tampilan / status disabled akun Auth. */
export async function adminUpdateAuthUser(
  uid: string,
  opts: { password?: string; displayName?: string; disabled?: boolean }
): Promise<void> {
  const body: Record<string, unknown> = { localId: uid };
  if (opts.password !== undefined) body.password = opts.password;
  if (opts.displayName !== undefined) body.displayName = opts.displayName;
  if (opts.disabled !== undefined) body.disableUser = opts.disabled;
  await toolkit("setAccountInfo", body);
}

/** Hapus permanen akun Auth. UNKNOWN/USER_NOT_FOUND diteruskan sebagai error ramah. */
export async function adminDeleteAuthUser(uid: string): Promise<void> {
  await toolkit("deleteAccount", { localId: uid });
}
