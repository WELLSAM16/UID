import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireUser } from "@/lib/authServer";
import { isAdminRole } from "@/lib/roles";
import {
  RETENTION_DAYS,
  SLA_DAYS,
  addDaysISO,
  canAdminReview,
  canOwnerEdit,
  daysLeft,
  effectiveStatus,
  nowISO,
  validateDraftFields,
} from "@/lib/drafts";
import type { DraftDoc } from "@/lib/drafts";

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

type Ctx = { params: Promise<{ id: string }> };

async function loadDraft(id: string) {
  const db = getAdminDb();
  const ref = db.collection(COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { ref, snap: null, data: null };
  return { ref, snap, data: snap.data() as DraftDoc };
}

/** GET /api/drafts/[id] — owner atau admin. */
export async function GET(request: NextRequest, ctx: Ctx) {
  const { response, user } = await requireUser(request);
  if (response) return response;
  const u = user!;
  const { id } = await ctx.params;

  try {
    const { data } = await loadDraft(id);
    if (!data) return NextResponse.json({ error: "Draft tidak ditemukan" }, { status: 404 });
    if (!isAdminRole(u.role) && data.authorUid !== u.uid) {
      return NextResponse.json({ error: "Forbidden: bukan milik Anda" }, { status: 403 });
    }
    return NextResponse.json({ draft: toResponse(id, data) });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Gagal memuat draft", details: err?.message },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/drafts/[id] — action:
 * - owner: {action:"update", fields...} (draft/rejected saja),
 *          {action:"submit"} (draft/rejected -> pending, set SLA 7 hari)
 * - admin: {action:"approve", reviewNote?} (pending -> approved)
 *          {action:"reject", reviewNote!} (pending -> rejected)
 *          {action:"publish"} (approved -> published)
 */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  const { response, user } = await requireUser(request);
  if (response) return response;
  const u = user!;
  const { id } = await ctx.params;

  const body = await readBody(request);
  if (body === null) {
    return NextResponse.json({ error: "Body bukan JSON valid" }, { status: 400 });
  }
  const action = String(body.action || "");

  try {
    const { ref, data } = await loadDraft(id);
    if (!data) return NextResponse.json({ error: "Draft tidak ditemukan" }, { status: 404 });

    const t = nowISO();
    const isOwner = data.authorUid === u.uid;
    const isAdmin = isAdminRole(u.role);

    // ---------- OWNER: update fields ----------
    if (action === "update") {
      if (!isOwner && !isAdmin) {
        return NextResponse.json({ error: "Forbidden: bukan milik Anda" }, { status: 403 });
      }
      if (!canOwnerEdit(data)) {
        const eff = effectiveStatus(data);
        return NextResponse.json(
          { error: `Tidak bisa edit pada status ${eff}. Hanya draft/rejected.` },
          { status: 422 }
        );
      }
      const v = validateDraftFields(body);
      if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

      const patch: Record<string, unknown> = {
        title: String(body.title).trim(),
        caption: String(body.caption).trim(),
        accountTarget: String(body.accountTarget).trim(),
        updatedAt: t,
      };
      if (body.mediaUrl !== undefined)
        patch.mediaUrl = body.mediaUrl ? String(body.mediaUrl).trim() : null;
      if (body.docUrl !== undefined)
        patch.docUrl = body.docUrl ? String(body.docUrl).trim() : null;
      if (body.scheduledAt !== undefined)
        patch.scheduledAt = body.scheduledAt ? String(body.scheduledAt) : null;
      if (body.notes !== undefined)
        patch.notes = body.notes ? String(body.notes).trim() : null;

      await ref.update(patch);
      const fresh = await ref.get();
      return NextResponse.json({ draft: toResponse(id, fresh.data()!) });
    }

    // ---------- OWNER: submit -> pending ----------
    if (action === "submit") {
      if (!isOwner) {
        return NextResponse.json({ error: "Forbidden: hanya owner yang bisa submit" }, { status: 403 });
      }
      if (!canOwnerEdit(data)) {
        const eff = effectiveStatus(data);
        return NextResponse.json(
          { error: `Tidak bisa submit pada status ${eff}` },
          { status: 422 }
        );
      }
      const v = validateDraftFields(data);
      if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

      const submittedAt = t;
      await ref.update({
        status: "pending",
        submittedAt,
        slaExpiresAt: addDaysISO(submittedAt, SLA_DAYS),
        retentionExpiresAt: null,
        reviewedBy: null,
        reviewedAt: null,
        reviewNote: null,
        updatedAt: t,
      });
      const fresh = await ref.get();
      return NextResponse.json({ draft: toResponse(id, fresh.data()!) });
    }

    // ---------- ADMIN: approve ----------
    if (action === "approve") {
      if (!isAdmin) {
        return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
      }
      const check = canAdminReview(data, u.uid);
      if (!check.ok) {
        const code = check.error?.includes("sendiri") ? 403 : 422;
        return NextResponse.json({ error: check.error }, { status: code });
      }
      await ref.update({
        status: "approved",
        reviewedBy: u.uid,
        reviewedAt: t,
        reviewNote: body.reviewNote ? String(body.reviewNote).trim() : null,
        retentionExpiresAt: addDaysISO(t, RETENTION_DAYS),
        updatedAt: t,
      });
      const fresh = await ref.get();
      return NextResponse.json({ draft: toResponse(id, fresh.data()!) });
    }

    // ---------- ADMIN: reject (wajib reviewNote) ----------
    if (action === "reject") {
      if (!isAdmin) {
        return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
      }
      const check = canAdminReview(data, u.uid);
      if (!check.ok) {
        const code = check.error?.includes("sendiri") ? 403 : 422;
        return NextResponse.json({ error: check.error }, { status: code });
      }
      const note = String(body.reviewNote || "").trim();
      if (!note) {
        return NextResponse.json({ error: "reviewNote wajib diisi saat reject" }, { status: 400 });
      }
      await ref.update({
        status: "rejected",
        reviewedBy: u.uid,
        reviewedAt: t,
        reviewNote: note,
        retentionExpiresAt: addDaysISO(t, RETENTION_DAYS),
        updatedAt: t,
      });
      const fresh = await ref.get();
      return NextResponse.json({ draft: toResponse(id, fresh.data()!) });
    }

    // ---------- ADMIN: publish ----------
    if (action === "publish") {
      if (!isAdmin) {
        return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
      }
      if (data.status !== "approved") {
        return NextResponse.json(
          { error: `Hanya approved yang bisa dipublish (status: ${data.status})` },
          { status: 422 }
        );
      }
      await ref.update({
        status: "published",
        publishedAt: t,
        retentionExpiresAt: addDaysISO(t, RETENTION_DAYS),
        updatedAt: t,
      });
      const fresh = await ref.get();
      return NextResponse.json({ draft: toResponse(id, fresh.data()!) });
    }

    return NextResponse.json(
      { error: "action tidak dikenal. Gunakan: update|submit|approve|reject|publish" },
      { status: 400 }
    );
  } catch (err: any) {
    console.error(`PATCH /api/drafts/${id} error:`, err);
    return NextResponse.json(
      { error: "Gagal memproses draft", details: err?.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/drafts/[id]
 * - owner: boleh hapus milik sendiri saat draft/rejected.
 * - admin: boleh hapus apa pun (untuk bersih-bersih manual; TTL menangani sisanya).
 */
export async function DELETE(request: NextRequest, ctx: Ctx) {
  const { response, user } = await requireUser(request);
  if (response) return response;
  const u = user!;
  const { id } = await ctx.params;

  try {
    const { ref, data } = await loadDraft(id);
    if (!data) return NextResponse.json({ error: "Draft tidak ditemukan" }, { status: 404 });

    if (isAdminRole(u.role)) {
      await ref.delete();
      return NextResponse.json({ ok: true });
    }
    if (data.authorUid !== u.uid) {
      return NextResponse.json({ error: "Forbidden: bukan milik Anda" }, { status: 403 });
    }
    if (!canOwnerEdit(data)) {
      return NextResponse.json(
        { error: `Tidak bisa hapus pada status ${effectiveStatus(data)}` },
        { status: 422 }
      );
    }
    await ref.delete();
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Gagal menghapus draft", details: err?.message },
      { status: 500 }
    );
  }
}
