import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { adminUpdateAuthUser } from "@/lib/firebaseAuthAdmin";
import { requireUser } from "@/lib/authServer";
import { ROLE_LABELS } from "@/lib/roles";
import { generateTempPassword } from "@/lib/accountRequests";
import { sendPasswordResetEmail } from "@/lib/mailer";

const COLLECTION = "password_resets";

function readBody(raw: string): any {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * PATCH /api/password-resets/[id] — super admin saja.
 * Body: { action: "reset" } → password default baru + mustChangePassword +
 *   kirim info akun (profil + NIP + password default) ke email kontak.
 * Body: { action: "reject", note? } → tolak permintaan.
 *
 * Reset mengembalikan `tempPassword` HANYA bila email gagal/tak terkirim,
 * agar admin bisa menyampaikan manual (WA/lisan). Tidak pernah ke publik.
 */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { response, user } = await requireUser(request);
  if (response) return response;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "administrator" && user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden: super admin only" }, { status: 403 });
  }
  const { id } = await ctx.params;

  const body = readBody(await request.text());
  if (body === null) return NextResponse.json({ error: "Body bukan JSON" }, { status: 400 });
  const action = String(body.action || "");
  if (action !== "reset" && action !== "reject") {
    return NextResponse.json({ error: "action harus reset/reject" }, { status: 400 });
  }

  const db = getAdminDb();
  const ref = db.collection(COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Permintaan tidak ditemukan" }, { status: 404 });
  const req = snap.data() || {};
  if (req.status !== "pending") {
    return NextResponse.json({ error: `Permintaan sudah ${req.status}` }, { status: 409 });
  }

  const now = new Date().toISOString();

  if (action === "reject") {
    await ref.set(
      { status: "rejected", note: String(body.note || "").slice(0, 500) || null, decidedAt: now, decidedBy: user.uid },
      { merge: true }
    );
    return NextResponse.json({ ok: true, status: "rejected" });
  }

  // --- Reset: cari akun by NIP ---
  const found = await db.collection("users").where("nip", "==", String(req.nip)).limit(1).get();
  if (found.empty) {
    await ref.set(
      { status: "rejected", note: "Akun NIP tidak ditemukan saat reset", decidedAt: now, decidedBy: user.uid },
      { merge: true }
    );
    return NextResponse.json({ error: "Akun NIP tidak ditemukan" }, { status: 404 });
  }
  const uid = found.docs[0].id;
  const profile = found.docs[0].data() || {};
  const tempPassword = generateTempPassword(10);

  try {
    await adminUpdateAuthUser(uid, { password: tempPassword, disabled: false });
    await db.collection("users").doc(uid).set(
      { mustChangePassword: true, isActive: true, updatedAt: now },
      { merge: true }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg || "Gagal mereset password" }, { status: 500 });
  }

  // Kirim info akun (profil + NIP + password default) ke email kontak.
  let emailSent = false;
  let emailError: string | null = null;
  if (req.email) {
    const mail = await sendPasswordResetEmail({
      to: String(req.email),
      name: String(profile.name || req.name || req.nip),
      nip: String(req.nip),
      password: tempPassword,
      roleLabel: ROLE_LABELS[String(profile.role)] || String(profile.role || "-"),
      unitLabel: String(profile.unitId || "-"),
    });
    emailSent = mail.sent;
    emailError = mail.sent ? null : mail.error || null;
  } else {
    emailError = "Pemohon tidak mencantumkan email kontak";
  }

  await ref.set(
    {
      status: "approved",
      uid,
      emailSent,
      emailError,
      decidedAt: now,
      decidedBy: user.uid,
    },
    { merge: true }
  );

  return NextResponse.json({
    ok: true,
    status: "approved",
    uid,
    emailSent,
    // Hanya dikembalikan bila email gagal/tak terkirim → admin sampaikan manual. Jangan log ke mana pun.
    ...(!emailSent ? { tempPassword, emailError } : {}),
  });
}
