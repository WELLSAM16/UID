import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { adminCreateAuthUser, adminUpdateAuthUser } from "@/lib/firebaseAuthAdmin";
import { requireUser } from "@/lib/authServer";
import {
  validateNip,
  nipToEmail,
  canManageRole,
  MANAGEABLE_ROLES,
  type Role,
} from "@/lib/roles";

function readBody(raw: string): any {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * GET /api/users — daftar pengguna (admin_uid & administrator).
 * Non-admin ditolak. Password tidak pernah dikembalikan.
 */
export async function GET(request: Request) {
  const { response, user } = await requireUser(request);
  if (response) return response;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "administrator" && user.role !== "admin_uid" && user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
  }

  const snap = await getAdminDb().collection("users").get();
  const users = snap.docs.map((d) => {
    const v = d.data();
    return {
      id: d.id,
      nip: v.nip || null,
      email: v.email || null,
      name: v.name || null,
      role: v.role || null,
      unitId: v.unitId || null,
      isActive: v.isActive !== false,
      mustChangePassword: v.mustChangePassword === true,
      createdAt: v.createdAt || null,
      updatedAt: v.updatedAt || null,
    };
  });
  users.sort((a, b) => String(a.nip || "").localeCompare(String(b.nip || "")));
  return NextResponse.json({ users });
}

/**
 * POST /api/users — daftarkan NIP baru (admin saja).
 * Body: { nip, name?, role, unitId?, password }
 * Password awal dibuat admin; user wajib ganti saat login pertama.
 */
export async function POST(request: Request) {
  const { response, user } = await requireUser(request);
  if (response) return response;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "administrator" && user.role !== "admin_uid" && user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
  }

  const body = readBody(await request.text());
  if (body === null) return NextResponse.json({ error: "Body bukan JSON" }, { status: 400 });

  const nip = String(body.nip || "").trim();
  const name = String(body.name || "").trim();
  const role = String(body.role || "") as Role;
  const unitId = String(body.unitId || "").trim();
  const password = String(body.password || "");

  const nipErr = validateNip(nip);
  if (nipErr) return NextResponse.json({ error: nipErr }, { status: 400 });
  if (!(MANAGEABLE_ROLES as readonly string[]).includes(role)) {
    return NextResponse.json({ error: "Role tidak valid" }, { status: 400 });
  }
  if (!canManageRole(user.role, role)) {
    return NextResponse.json(
      { error: "Admin UID hanya boleh mendaftarkan staff / team_leader / asman" },
      { status: 403 }
    );
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Password minimal 6 karakter" }, { status: 400 });
  }

  const db = getAdminDb();
  // NIP harus unik.
  const dup = await db.collection("users").where("nip", "==", nip).limit(1).get();
  if (!dup.empty) {
    return NextResponse.json({ error: "NIP sudah terdaftar" }, { status: 409 });
  }

  const email = nipToEmail(nip);
  const now = new Date().toISOString();
  try {
    let uid: string;
    try {
      uid = (
        await adminCreateAuthUser({ email, password, displayName: name || nip })
      ).uid;
    } catch (err: unknown) {
      // Bila akun Auth sudah ada (misal migrasi), pakai uid dari Firestore
      // (sumber kebenaran lokal) lalu selaraskan password-nya.
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "EMAIL_EXISTS") {
        const found = await db
          .collection("users")
          .where("email", "==", email)
          .limit(1)
          .get();
        if (found.empty) {
          throw new Error(
            "Email sudah terdaftar di Auth tetapi tidak ada di database. Hapus manual di Firebase Console → Authentication."
          );
        }
        uid = found.docs[0].id;
        await adminUpdateAuthUser(uid, {
          password,
          displayName: name || nip,
          disabled: false,
        });
      } else {
        throw err;
      }
    }

    await db.collection("users").doc(uid!).set(
      {
        nip,
        email,
        name: name || nip,
        role,
        unitId: unitId || null,
        isActive: true,
        mustChangePassword: true,
        createdBy: user.uid,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, uid, nip, role }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg || "Gagal membuat akun" }, { status: 500 });
  }
}
