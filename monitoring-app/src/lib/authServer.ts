import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { normalizeRole, isAdminRole, type Role } from "@/lib/roles";

export interface AuthedUser {
  uid: string;
  email?: string;
  role: Role;
  nip?: string;
  name?: string;
  unitId?: string;
  isActive?: boolean;
  mustChangePassword?: boolean;
}

function unauthorized(message: string, status: number) {
  return { response: NextResponse.json({ error: message }, { status }), user: null as AuthedUser | null };
}

const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);

/**
 * Verify Firebase ID token using `jose`.
 * Validates issuer and audience against FIREBASE_PROJECT_ID.
 * Role dibaca dari Firestore `users/{uid}`.
 *
 * Tahap 1: tidak ada lagi default "user" untuk dokumen yang belum ada —
 * akun harus didaftarkan admin terlebih dahulu (NIP + role).
 */
export async function requireUser(request: Request): Promise<{ response: NextResponse | null; user: AuthedUser | null }> {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return unauthorized("Missing Authorization Bearer token", 401);

  try {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    if (!projectId) {
      throw new Error("Missing FIREBASE_PROJECT_ID environment variable");
    }

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: "https://securetoken.google.com/" + projectId,
      audience: projectId,
    });

    const uid = payload.sub as string;
    const email = payload.email as string | undefined;

    // Read profile from Firestore
    const db = getAdminDb();
    const snap = await db.collection("users").doc(uid).get();
    if (!snap.exists) {
      return unauthorized("Akun belum terdaftar. Hubungi admin.", 403);
    }
    const data = snap.data() || {};
    if (data.isActive === false) {
      return unauthorized("Akun dinonaktifkan. Hubungi admin.", 403);
    }
    const role = normalizeRole(data.role as string);

    return {
      response: null,
      user: {
        uid,
        email,
        role,
        nip: data.nip as string | undefined,
        name: data.name as string | undefined,
        unitId: data.unitId as string | undefined,
        isActive: data.isActive !== false,
        mustChangePassword: data.mustChangePassword === true,
      },
    };
  } catch (err: any) {
    // Jangan timpa respons 403 di atas yang sudah berbentuk NextResponse.
    if (err instanceof NextResponse) throw err;
    return unauthorized("Invalid or expired token: " + (err?.message || err), 401);
  }
}

/**
 * Guard untuk area admin operasional + dev.
 * Lolos bila role administrator / admin_uid (termasuk legacy "admin").
 */
export async function requireAdmin(request: Request): Promise<{ response: NextResponse | null; user: AuthedUser | null }> {
  const { response, user } = await requireUser(request);
  if (response || !user) return { response, user };
  if (!isAdminRole(user.role)) {
    return unauthorized("Forbidden: admin only", 403);
  }
  return { response: null, user };
}

/**
 * Guard role spesifik, misal requireRole(req, ["team_leader", "asman"]).
 * Administrator selalu lolos.
 */
export async function requireRole(
  request: Request,
  allowed: Role[]
): Promise<{ response: NextResponse | null; user: AuthedUser | null }> {
  const { response, user } = await requireUser(request);
  if (response || !user) return { response, user };
  if (user.role === "administrator" || user.role === "admin") return { response: null, user };
  if (!allowed.includes(user.role)) {
    return unauthorized("Forbidden: role tidak diizinkan", 403);
  }
  return { response: null, user };
}
