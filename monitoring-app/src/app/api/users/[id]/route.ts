import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { adminUpdateAuthUser, adminDeleteAuthUser } from "@/lib/firebaseAuthAdmin";
import { requireUser } from "@/lib/authServer";
import { canManageRole, normalizeUnitId, MANAGEABLE_ROLES, type Role } from "@/lib/roles";

function isUserManager(role: string | undefined) {
  return role === "administrator" || role === "admin_uid" || role === "admin";
}

function readBody(raw: string): any {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * PATCH /api/users/[id] — ubah role / unit / nama / status aktif / reset password.
 * Body boleh berisi: { name?, role?, unitId?, isActive?, newPassword?, mustChangePassword? }
 * Mutasi pegawai = PATCH role/unitId pada NIP yang sama.
 */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { response, user } = await requireUser(request);
  if (response) return response;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isUserManager(user.role)) {
    return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
  }
  const { id } = await ctx.params;

  const body = readBody(await request.text());
  if (body === null) return NextResponse.json({ error: "Body bukan JSON" }, { status: 400 });

  const db = getAdminDb();
  const ref = db.collection("users").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Pengguna tidak ditemukan" }, { status: 404 });
  const current = snap.data() || {};

  // Cegah admin menonaktifkan dirinya sendiri.
  if (id === user.uid && body.isActive === false) {
    return NextResponse.json({ error: "Tidak bisa menonaktifkan akun sendiri" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (body.name !== undefined) update.name = String(body.name || "").trim() || current.name || "";
  if (body.unitId !== undefined) {
    const unitRaw = String(body.unitId || "").trim();
    if (!unitRaw) {
      update.unitId = null;
    } else {
      const normalized = normalizeUnitId(unitRaw);
      if (!normalized) {
        return NextResponse.json({ error: "Unit tidak valid — pilih dari daftar" }, { status: 400 });
      }
      update.unitId = normalized;
    }
  }

  if (body.role !== undefined) {
    const nextRole = String(body.role) as Role;
    if (!(MANAGEABLE_ROLES as readonly string[]).includes(nextRole)) {
      return NextResponse.json({ error: "Role tidak valid" }, { status: 400 });
    }
    // Admin UID tidak boleh menaikkan ke admin_uid/administrator,
    // dan tidak boleh mengubah akun yang sudah ber-role admin.
    if (!canManageRole(user.role, nextRole) || !canManageRole(user.role, String(current.role))) {
      return NextResponse.json(
        { error: "Admin UID hanya boleh mengelola staff / team_leader / asman" },
        { status: 403 }
      );
    }
    update.role = nextRole;
  } else if (
    body.isActive !== undefined ||
    body.newPassword ||
    body.mustChangePassword !== undefined
  ) {
    // Operasi non-role terhadap akun admin tetap butuh hak kelola.
    if (!canManageRole(user.role, String(current.role))) {
      return NextResponse.json(
        { error: "Admin UID hanya boleh mengelola staff / team_leader / asman" },
        { status: 403 }
      );
    }
  }

  if (body.isActive !== undefined) update.isActive = body.isActive === true;

  const now = new Date().toISOString();
  update.updatedAt = now;
  update.updatedBy = user.uid;

  try {
    if (body.isActive !== undefined) {
      await adminUpdateAuthUser(id, { disabled: body.isActive !== true });
    }
    if (body.newPassword) {
      const pw = String(body.newPassword);
      if (pw.length < 6) {
        return NextResponse.json({ error: "Password minimal 6 karakter" }, { status: 400 });
      }
      await adminUpdateAuthUser(id, { password: pw, disabled: false });
      update.mustChangePassword = true;
      if (update.isActive === undefined) update.isActive = true;
    } else if (body.mustChangePassword !== undefined) {
      update.mustChangePassword = body.mustChangePassword === true;
    }

    await ref.set(update, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg || "Gagal memperbarui akun" }, { status: 500 });
  }
}

/**
 * DELETE /api/users/[id] — nonaktifkan akun (soft delete).
 * Dokumen + Auth didisable, riwayat draf tetap utuh untuk audit.
 *
 * DELETE /api/users/[id]?hard=1 — HAPUS PERMANEN (administrator saja).
 * Syarat (sesuai NOTULENSI seksi 7): akun `● PW AWAL` (belum pernah login,
 * mustChangePassword=true) + nol draf di content_drafts & press_release_drafts.
 * Menghapus dokumen users + akun Auth. Dokumen account_requests dibiarkan
 * sebagai jejak audit persetujuan.
 */
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { response, user } = await requireUser(request);
  if (response) return response;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isUserManager(user.role)) {
    return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (id === user.uid) {
    return NextResponse.json({ error: "Tidak bisa menonaktifkan akun sendiri" }, { status: 400 });
  }

  const db = getAdminDb();
  const ref = db.collection("users").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Pengguna tidak ditemukan" }, { status: 404 });
  const current = snap.data() || {};
  if (!canManageRole(user.role, String(current.role))) {
    return NextResponse.json(
      { error: "Admin UID hanya boleh mengelola staff / team_leader / asman" },
      { status: 403 }
    );
  }

  // --- Hapus permanen: hanya administrator, akun PW AWAL tanpa draf ---
  if (new URL(request.url).searchParams.get("hard") === "1") {
    if (user.role !== "administrator" && user.role !== "admin") {
      return NextResponse.json({ error: "Hapus permanen hanya boleh oleh administrator" }, { status: 403 });
    }
    if (current.mustChangePassword !== true) {
      return NextResponse.json(
        { error: "Hanya akun ● PW AWAL (belum pernah login) yang boleh dihapus permanen. Nonaktifkan saja akun ini." },
        { status: 409 }
      );
    }
    const [medsos, press] = await Promise.all([
      db.collection("content_drafts").where("authorUid", "==", id).limit(1).get(),
      db.collection("press_release_drafts").where("authorUid", "==", id).limit(1).get(),
    ]);
    if (!medsos.empty || !press.empty) {
      return NextResponse.json(
        { error: "Akun memiliki draf. Hapus permanen dibatalkan — nonaktifkan saja agar atribusi draf utuh." },
        { status: 409 }
      );
    }
    try {
      await adminDeleteAuthUser(id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // Auth sudah tidak ada (misal dihapus manual di Console) → lanjut hapus dokumen.
      if (!msg.includes("USER_NOT_FOUND") && !msg.includes("tidak ditemukan")) {
        return NextResponse.json({ error: msg || "Gagal menghapus akun Auth" }, { status: 500 });
      }
    }
    await ref.delete();
    return NextResponse.json({ ok: true, hard: true });
  }

  await adminUpdateAuthUser(id, { disabled: true });
  await ref.set(
    { isActive: false, updatedAt: new Date().toISOString(), updatedBy: user.uid },
    { merge: true }
  );
  return NextResponse.json({ ok: true });
}
