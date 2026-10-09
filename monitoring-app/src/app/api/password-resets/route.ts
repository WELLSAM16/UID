import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireUser } from "@/lib/authServer";
import { validateNip } from "@/lib/roles";
import { validateRequestEmail } from "@/lib/accountRequests";
import { namesMatch } from "@/lib/passwordResets";

const COLLECTION = "password_resets";

// Rate-limit sederhana in-memory (per IP): 5 request / jam.
const hits = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 3600_000);
  if (arr.length >= 5) return true;
  arr.push(now);
  hits.set(ip, arr);
  return false;
}

function readBody(raw: string): any {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * POST /api/password-resets — PUBLIK (tanpa login).
 * Body: { nip, name, email? } — NIP harus terdaftar, nama harus cocok
 * dengan profil (verifikasi identitas sederhana). Membuat dokumen
 * status=pending untuk direset super admin.
 */
export async function POST(request: Request) {
  if (rateLimited(clientIp(request))) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan. Coba lagi 1 jam kemudian." },
      { status: 429 }
    );
  }

  const body = readBody(await request.text());
  if (body === null) return NextResponse.json({ error: "Body bukan JSON" }, { status: 400 });

  const nip = String(body.nip || "").trim().toUpperCase();
  const name = String(body.name || "").trim();
  const emailRaw = body.email !== undefined && body.email !== null ? String(body.email).trim() : "";

  const nipErr = validateNip(nip);
  if (nipErr) return NextResponse.json({ error: nipErr }, { status: 400 });
  if (!name || name.length < 2) {
    return NextResponse.json({ error: "Nama lengkap wajib diisi" }, { status: 400 });
  }
  let email: string | null = null;
  if (emailRaw) {
    const emailErr = validateRequestEmail(emailRaw);
    if (emailErr) return NextResponse.json({ error: emailErr }, { status: 400 });
    email = emailRaw;
  }

  const db = getAdminDb();
  const found = await db.collection("users").where("nip", "==", nip).limit(1).get();
  if (found.empty) {
    return NextResponse.json({ error: "NIP tidak terdaftar. Minta administrator mendaftarkan akun Anda." }, { status: 404 });
  }
  const profile = found.docs[0].data() || {};
  if (!namesMatch(name, String(profile.name || ""))) {
    return NextResponse.json({ error: "Nama tidak cocok dengan data NIP ini." }, { status: 403 });
  }

  const dupPending = await db
    .collection(COLLECTION)
    .where("nip", "==", nip)
    .where("status", "==", "pending")
    .limit(1)
    .get();
  if (!dupPending.empty) {
    return NextResponse.json(
      { error: "NIP ini sudah mengajukan reset dan sedang menunggu super admin." },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  const ref = await db.collection(COLLECTION).add({
    nip,
    name,
    email,
    status: "pending",
    emailSent: false,
    emailError: null,
    uid: found.docs[0].id,
    note: null,
    createdAt: now,
    decidedAt: null,
    decidedBy: null,
  });

  return NextResponse.json({ ok: true, id: ref.id }, { status: 201 });
}

/**
 * GET /api/password-resets — super admin saja (daftar permintaan reset).
 * Query opsional: ?status=pending (default semua, pending dulu).
 */
export async function GET(request: Request) {
  const { response, user } = await requireUser(request);
  if (response) return response;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "administrator" && user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden: super admin only" }, { status: 403 });
  }

  const status = new URL(request.url).searchParams.get("status");
  const db = getAdminDb();
  let q: FirebaseFirestore.Query = db.collection(COLLECTION);
  if (status === "pending" || status === "approved" || status === "rejected") {
    q = q.where("status", "==", status);
  }
  const snap = await q.get();
  const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }));
  const rank: Record<string, number> = { pending: 0, approved: 1, rejected: 2 };
  items.sort((a: any, b: any) => {
    const r = (rank[a.status] ?? 9) - (rank[b.status] ?? 9);
    if (r !== 0) return r;
    return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
  });
  return NextResponse.json({ requests: items });
}
