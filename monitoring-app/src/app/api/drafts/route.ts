import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireUser } from "@/lib/authServer";
import { isAdminRole } from "@/lib/roles";
import {
  DraftDoc,
  DraftStatus,
  RETENTION_DAYS,
  SLA_DAYS,
  buildNewDraft,
  daysLeft,
  effectiveStatus,
  nowISO,
  validateDraftFields,
} from "@/lib/drafts";

const COLLECTION = "content_drafts";

function toResponse(id: string, data: FirebaseFirestore.DocumentData) {
  const doc = data as DraftDoc;
  const eff = effectiveStatus(doc);
  return {
    id,
    ...doc,
    _effectiveStatus: eff,
    _daysLeft: daysLeft(doc),
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
 * GET /api/drafts?status=&expiring=true&mine=true
 * - user: hanya milik sendiri (authorUid == uid), kecuali admin.
 * - admin: semua; filter status memakai status EFEKTIF (lazy expiry).
 */
export async function GET(request: NextRequest) {
  const { response, user } = await requireUser(request);
  if (response) return response;
  const u = user!;

  try {
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status") as DraftStatus | null;
    const expiringOnly = searchParams.get("expiring") === "true";
    const mineOnly = searchParams.get("mine") === "true";
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") || "50", 10) || 50, 1),
      100
    );

    const db = getAdminDb();
    let q: FirebaseFirestore.Query = db.collection(COLLECTION);

    // Non-admin selalu dibatasi milik sendiri di query.
    // Admin default semua; ?mine=true membatasi ke milik sendiri.
    if (!isAdminRole(u.role) || mineOnly) {
      q = q.where("authorUid", "==", u.uid);
    }
    // SENGAJA tanpa orderBy di query: kombinasi where + orderBy butuh
    // composite index. Sorting dilakukan di memori di bawah (cukup untuk MVP).
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

    // Pending paling mendesak dulu, sisanya updatedAt desc.
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
    console.error("GET /api/drafts error:", err);
    return NextResponse.json(
      { error: "Gagal memuat draft", details: err?.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/drafts
 * - Buat draft baru (status draft), atau duplikat dari expired/rejected.
 * Body: { title, caption, accountTarget, mediaPath?, mediaName?, docPath?,
 *   docName?, scheduledAt?, notes? }
 *   atau { duplicateFrom: "<id>" }
 * Catatan: mediaUrl/docUrl LEGACY (tautan luar) hanya dipertahankan saat
 * duplikat data lama; form baru tidak lagi mengirimnya.
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

    // --- Duplikat: clone expired/rejected milik sendiri jadi draft baru ---
    if (body.duplicateFrom) {
      const srcRef = db.collection(COLLECTION).doc(String(body.duplicateFrom));
      const srcSnap = await srcRef.get();
      if (!srcSnap.exists) {
        return NextResponse.json({ error: "Draft asal tidak ditemukan" }, { status: 404 });
      }
      const src = srcSnap.data() as DraftDoc;
      if (!isAdminRole(u.role) && src.authorUid !== u.uid) {
        return NextResponse.json({ error: "Forbidden: bukan milik Anda" }, { status: 403 });
      }
      const eff = effectiveStatus(src);
      if (eff !== "expired" && eff !== "rejected") {
        return NextResponse.json(
          { error: `Hanya expired/rejected yang bisa diduplikat (status: ${eff})` },
          { status: 422 }
        );
      }
      const cloned = buildNewDraft({
        title: src.title,
        caption: src.caption,
        accountTarget: src.accountTarget,
        mediaUrl: src.mediaUrl,
        docUrl: src.docUrl,
        mediaPath: src.mediaPath,
        mediaName: src.mediaName,
        docPath: src.docPath,
        docName: src.docName,
        scheduledAt: src.scheduledAt,
        notes: src.notes,
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

    // --- Buat baru ---
    const v = validateDraftFields(body);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

    const doc = buildNewDraft({
      title: String(body.title),
      caption: String(body.caption),
      accountTarget: String(body.accountTarget),
      mediaUrl: body.mediaUrl ? String(body.mediaUrl) : undefined,
      docUrl: body.docUrl ? String(body.docUrl) : undefined,
      mediaPath: body.mediaPath ? String(body.mediaPath) : undefined,
      mediaName: body.mediaName ? String(body.mediaName) : undefined,
      docPath: body.docPath ? String(body.docPath) : undefined,
      docName: body.docName ? String(body.docName) : undefined,
      scheduledAt: body.scheduledAt ? String(body.scheduledAt) : undefined,
      notes: body.notes ? String(body.notes) : undefined,
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
    console.error("POST /api/drafts error:", err);
    return NextResponse.json(
      { error: "Gagal membuat draft", details: err?.message },
      { status: 500 }
    );
  }
}

export { SLA_DAYS, RETENTION_DAYS };
