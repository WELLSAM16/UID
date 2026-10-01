import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { createRemoteJWKSet, jwtVerify } from "jose";

export interface AuthedUser {
  uid: string;
  email?: string;
  role: "admin" | "user";
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
 * Returns user + role from Firestore `users/{uid}` (default "user").
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

    // Read role from Firestore
    const db = getAdminDb();
    const snap = await db.collection("users").doc(uid).get();
    const role = (snap.exists ? (snap.data()?.role as string) : "user") === "admin" ? "admin" : "user";

    return {
      response: null,
      user: { uid, email, role: role as "admin" | "user" },
    };
  } catch (err: any) {
    return unauthorized("Invalid or expired token: " + (err?.message || err), 401);
  }
}

/**
 * Same as requireUser but enforces role === "admin".
 */
export async function requireAdmin(request: Request): Promise<{ response: NextResponse | null; user: AuthedUser | null }> {
  const { response, user } = await requireUser(request);
  if (response || !user) return { response, user };
  if (user.role !== "admin") {
    return unauthorized("Forbidden: admin only", 403);
  }
  return { response: null, user };
}
