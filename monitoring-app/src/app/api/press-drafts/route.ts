import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireUser } from "@/lib/authServer";
import { isAdminRole } from "@/lib/roles";
import {
  PRESS_RETENTION_DAYS,
  PRESS_SLA_DAYS,
  buildNewPressDraft,
  pressDaysLeft,
  pressEffectiveStatus,
  nowISO,
  validatePressDraftFields,
  type PressDraftDoc,
  type PressDraftStatus,
} from "@/lib/pressDrafts";

const COLLECTION = "press_release_drafts";

function toResponse(id: string, data: FirebaseFirestore.DocumentData) {
  const doc = data as PressDraftDoc;
  const eff = pressEffectiveStatus(doc);
  return {
    id,
    ...doc,
    _effectiveStatus: eff,
    _daysLeft: pressDaysLeft(doc),
    _isExpired: eff === "expired",
  };
}

async function readBody(request: NextRequest): Promise<any> {
  try {
    const text = await request.text();
    if (!text) return {};
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * GET /api/press-drafts?status=&expiring=true&mine=true
 * - user: hanya milik sendiri (authorUid == uid), kecuali admin.
 * - admin: semua; filter status memakai status EFEKTIF (lazy expiry).
 */
export async function GET(request: NextRequest) {
  const { response, user } = await requireUser(request);
  if (response) return response;
  const u = user!;

  try {
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status") as PressDraftStatus | null;
    const expiringOnly = searchParams.get("expiring") === "true";
    const mineOnly = searchParams.get("mine") === "true";
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") || "50", 10) || 50, 1),
      100
    );

    const db = getAdminDb();
    let q: FirebaseFirestore.Query = db.collection(COLLECTION);

    if (!isAdminRole(u.role) || mineOnly) {
      q = q.where("authorUid", "==", u.uid);
    }
    // Tanpa orderBy di query (hindari composite index); sort di memori.
    q = q.limit(limit * 2);

    const snap = await q.get();
    let items = snap.docs.map((d) => toResponse(d.id, d.data()));

    if (statusFilter) {
      items = items.filter((it) => it._effectiveStatus === statusFilter);
    }
    if (expiringOnly) {
      items = items.filter(
        (it) =>
          it._effectiveStatus === "pending" &&
          it._daysLeft !== null &&
          it._daysLeft <= 2
      );
    }

    items.sort((a, b) => {
      const ap = a._effectiveStatus === "pending" ? 0 : 1;
      const bp = b._effectiveStatus === "pending" ? 0 : 1;
      if (ap !== bp) return ap - bp;
      if (ap === 0) {
        const at = a.slaExpiresAt ? new Date(a.slaExpiresAt).getTime() : 0;
        const bt = b.slaExpiresAt ? new Date(b.slaExpiresAt).getTime() : 0;
        if (at !== bt) return at - bt;
      }
      return (
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    });

    return NextResponse.json({ drafts: items.slice(0, limit) });
  } catch (err: any) {
    console.error("GET /api/press-drafts error:", err);
    return NextResponse.json(
      { error: "Gagal memuat draft", details: err?.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/press-drafts
 * - Buat draft baru (status draft), atau duplikat dari expired/rejected.
 * Body: { title, body, mediaPath?, mediaName?, notes?, what?, who?, when?,
 *   where?, why?, how? } atau { duplicateFrom: "<id>" }
 * Catatan: mediaUrl LEGACY (tautan luar) hanya dipertahankan saat duplikat
 * data lama; form baru tidak lagi mengirimnya.
 */
export async function POST(request: NextRequest) {
  const { response, user } = await requireUser(request);
  if (response) return response;
  const u = user!;

  const body = await readBody(request);
  if (body === null) {
    return NextResponse.json({ error: "Body bukan JSON valid" }, { status: 400 });
  }

  try {
    const db = getAdminDb();
    const t = nowISO();

    if (body.duplicateFrom) {
      const srcRef = db.collection(COLLECTION).doc(String(body.duplicateFrom));
      const srcSnap = await srcRef.get();
      if (!srcSnap.exists) {
        return NextResponse.json({ error: "Draft asal tidak ditemukan" }, { status: 404 });
      }
      const src = srcSnap.data() as PressDraftDoc;
      if (!isAdminRole(u.role) && src.authorUid !== u.uid) {
        return NextResponse.json({ error: "Forbidden: bukan milik Anda" }, { status: 403 });
      }
      const eff = pressEffectiveStatus(src);
      if (eff !== "expired" && eff !== "rejected") {
        return NextResponse.json(
          { error: `Hanya expired/rejected yang bisa diduplikat (status: ${eff})` },
          { status: 422 }
        );
      }
      const cloned = buildNewPressDraft({
        title: src.title,
        body: src.body,
        mediaUrl: src.mediaUrl,
        mediaPath: src.mediaPath,
        mediaName: src.mediaName,
        notes: src.notes,
        what: src.what,
        who: src.who,
        when: src.when,
        where: src.where,
        why: src.why,
        how: src.how,
        authorUid: u.uid,
        authorEmail: u.email,
        now: new Date(t),
      });
      cloned.resubmitsFrom = srcSnap.id;
      const ref = await db.collection(COLLECTION).add(cloned);
      const fresh = await ref.get();
      return NextResponse.json(
        { draft: toResponse(ref.id, fresh.data()!) },
        { status: 201 }
      );
    }

    const v = validatePressDraftFields(body);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

    const doc = buildNewPressDraft({
      title: String(body.title),
      body: String(body.body),
      mediaUrl: body.mediaUrl ? String(body.mediaUrl) : undefined,
      mediaPath: body.mediaPath ? String(body.mediaPath) : undefined,
      mediaName: body.mediaName ? String(body.mediaName) : undefined,
      notes: body.notes ? String(body.notes) : undefined,
      what: body.what ? String(body.what) : undefined,
      who: body.who ? String(body.who) : undefined,
      when: body.when ? String(body.when) : undefined,
      where: body.where ? String(body.where) : undefined,
      why: body.why ? String(body.why) : undefined,
      how: body.how ? String(body.how) : undefined,
      authorUid: u.uid,
      authorEmail: u.email,
      now: new Date(t),
    });

    const ref = await db.collection(COLLECTION).add(doc);
    const fresh = await ref.get();
    return NextResponse.json(
      { draft: toResponse(ref.id, fresh.data()!) },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("POST /api/press-drafts error:", err);
    return NextResponse.json(
      { error: "Gagal membuat draft", details: err?.message },
      { status: 500 }
    );
  }
}

export { PRESS_SLA_DAYS, PRESS_RETENTION_DAYS };
