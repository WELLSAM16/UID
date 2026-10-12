import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { adminCreateAuthUser, adminUpdateAuthUser } from "@/lib/firebaseAuthAdmin";
import { requireUser } from "@/lib/authServer";
import { canManageRole, nipToEmail, ROLE_LABELS } from "@/lib/roles";
import { generateTempPassword, hasNipEmailConflict } from "@/lib/accountRequests";
import { sendAccountCredentialEmail, sendAccountRejectionEmail } from "@/lib/mailer";

const COLLECTION = "account_requests";

function readBody(raw: string): any {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * PATCH /api/account-requests/[id] — administrator saja.
 * Body: { action: "approve" } → buat akun + kirim email kredensial.
 * Body: { action: "reject", note? } → tolak pengajuan.
 *
 * Approve mengembalikan `tempPassword` HANYA bila email gagal terkirim,
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
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "action harus approve/reject" }, { status: 400 });
  }

  const db = getAdminDb();
  const ref = db.collection(COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Pengajuan tidak ditemukan" }, { status: 404 });
  const req = snap.data() || {};
  if (req.status !== "pending") {
    return NextResponse.json({ error: `Pengajuan sudah ${req.status}` }, { status: 409 });
  }

  const now = new Date().toISOString();

  if (action === "reject") {
    const note = String(body.note || "").slice(0, 500) || null;
    // Beritahu pemohon via email (alasan ikut terkirim). Kegagalan kirim
    // tidak menggagalkan penolakan — admin tinggal hubungi manual.
    const mail = await sendAccountRejectionEmail({
      to: String(req.email || ""),
      name: String(req.name || req.nip),
      nip: String(req.nip),
      note,
    });
    await ref.set(
      {
        status: "rejected",
        note,
        emailSent: mail.sent,
        emailError: mail.sent ? null : mail.error || null,
        decidedAt: now,
        decidedBy: user.uid,
      },
      { merge: true }
    );
    return NextResponse.json({
      ok: true,
      status: "rejected",
      emailSent: mail.sent,
      ...(mail.sent ? {} : { emailError: mail.error }),
    });
  }

  // --- Approve: role yang diminta harus dalam kewenangan admin ini ---
  if (!canManageRole(user.role, String(req.role))) {
    return NextResponse.json(
      { error: "Admin UID hanya boleh menyetujui staff / team_leader / asman" },
      { status: 403 }
    );
  }
  // NIP tidak boleh sudah punya akun (balapan dengan pembuatan manual).
  const dup = await db.collection("users").where("nip", "==", String(req.nip)).limit(1).get();
  if (!dup.empty) {
    await ref.set(
      { status: "rejected", note: "NIP sudah terdaftar (duplikat)", decidedAt: now, decidedBy: user.uid },
      { merge: true }
    );
    return NextResponse.json({ error: "NIP sudah terdaftar" }, { status: 409 });
  }
  // 1 NIP = 1 email: tolak bila pengajuan lain NIP ini sudah disetujui
  // dengan email berbeda (balapan dua pengajuan email berbeda).
  if (await hasNipEmailConflict(db, String(req.nip), String(req.email || ""))) {
    await ref.set(
      { status: "rejected", note: "NIP sudah terdaftar dengan email lain", decidedAt: now, decidedBy: user.uid },
      { merge: true }
    );
    return NextResponse.json({ error: "NIP ini sudah disetujui dengan email lain" }, { status: 409 });
  }

  const tempPassword = generateTempPassword(10);
  const loginEmail = nipToEmail(String(req.nip));
  let uid: string;
  try {
    try {
      uid = (await adminCreateAuthUser({
        email: loginEmail,
        password: tempPassword,
        displayName: String(req.name || req.nip),
      })).uid;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg !== "EMAIL_EXISTS") throw err;
      const found = await db.collection("users").where("email", "==", loginEmail).limit(1).get();
      if (found.empty) throw new Error("Email Auth bentrok tanpa dokumen users.");
      uid = found.docs[0].id;
      await adminUpdateAuthUser(uid, {
        password: tempPassword,
        displayName: String(req.name || req.nip),
        disabled: false,
      });
    }

    await db.collection("users").doc(uid!).set(
      {
        nip: String(req.nip),
        email: loginEmail,
        name: String(req.name || req.nip),
        role: String(req.role),
        unitId: req.unitId || null,
        isActive: true,
        mustChangePassword: true,
        createdBy: user.uid,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg || "Gagal membuat akun" }, { status: 500 });
  }

  // Kirim email kredensial (WA disiapkan via field phone/waStatus, tahap berikutnya).
  const mail = await sendAccountCredentialEmail({
    to: String(req.email),
    name: String(req.name || req.nip),
    nip: String(req.nip),
    password: tempPassword,
    roleLabel: ROLE_LABELS[String(req.role)] || String(req.role),
    unitLabel: String(req.unitId || "-"),
  });

  await ref.set(
    {
      status: "approved",
      uid: uid!,
      emailSent: mail.sent,
      emailError: mail.sent ? null : mail.error || null,
      decidedAt: now,
      decidedBy: user.uid,
    },
    { merge: true }
  );

  return NextResponse.json({
    ok: true,
    status: "approved",
    uid: uid!,
    emailSent: mail.sent,
    // Hanya dikembalikan bila email gagal → admin salin manual. Jangan log ke mana pun.
    ...(mail.sent ? {} : { tempPassword, emailError: mail.error }),
  });
}
