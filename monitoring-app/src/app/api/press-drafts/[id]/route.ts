import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireUser } from "@/lib/authServer";
import {
  PRESS_RETENTION_DAYS,
  PRESS_SLA_DAYS,
  addDaysISO,
  canPressAdminReview,
  canPressOwnerEdit,
  nowISO,
  pressDaysLeft,
  pressEffectiveStatus,
  validatePressDraftFields,
} from "@/lib/pressDrafts";
import type { PressDraftDoc } from "@/lib/pressDrafts";

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

type Ctx = { params: Promise<{ id: string }> };

async function loadDraft(id: string) {
  const db = getAdminDb();
  const ref = db.collection(COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { ref, snap: null, data: null };
  return { ref, snap, data: snap.data() as PressDraftDoc };
}

/** GET /api/press-drafts/[id] — owner atau admin. */
export async function GET(request: NextRequest, ctx: Ctx) {
  const { response, user } = await requireUser(request);
  if (response) return response;
  const u = user!;
  const { id } = await ctx.params;

  try {
    const { data } = await loadDraft(id);
    if (!data) return NextResponse.json({ error: "Draft tidak ditemukan" }, { status: 404 });
    if (u.role !== "admin" && data.authorUid !== u.uid) {
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
 * PATCH /api/press-drafts/[id] — action:
 * - owner: {action:"update", fields...} (draft/rejected saja),
 *          {action:"submit"} (draft/rejected -> pending, set SLA 7 hari)
 * - admin: {action:"approve", reviewNote?} / {action:"reject", reviewNote!}
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
    const isAdmin = u.role === "admin";

    if (action === "update") {
      if (!isOwner && !isAdmin) {
        return NextResponse.json({ error: "Forbidden: bukan milik Anda" }, { status: 403 });
      }
      if (!canPressOwnerEdit(data)) {
        const eff = pressEffectiveStatus(data);
        return NextResponse.json(
          { error: `Tidak bisa edit pada status ${eff}. Hanya draft/rejected.` },
          { status: 422 }
        );
      }
      const v = validatePressDraftFields(body);
      if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

      const patch: Record<string, unknown> = {
        title: String(body.title).trim(),
        body: String(body.body).trim(),
        updatedAt: t,
      };
      if (body.mediaUrl !== undefined)
        patch.mediaUrl = body.mediaUrl ? String(body.mediaUrl).trim() : null;
      if (body.notes !== undefined)
        patch.notes = body.notes ? String(body.notes).trim() : null;
      for (const f of ["what", "who", "when", "where", "why", "how"] as const) {
        if (body[f] !== undefined)
          patch[f] = body[f] ? String(body[f]).trim() : null;
      }

      await ref.update(patch);
      const fresh = await ref.get();
      return NextResponse.json({ draft: toResponse(id, fresh.data()!) });
    }

    if (action === "submit") {
      if (!isOwner) {
        return NextResponse.json({ error: "Forbidden: hanya owner yang bisa submit" }, { status: 403 });
      }
      if (!canPressOwnerEdit(data)) {
        const eff = pressEffectiveStatus(data);
        return NextResponse.json(
          { error: `Tidak bisa submit pada status ${eff}` },
          { status: 422 }
        );
      }
      const v = validatePressDraftFields(data);
      if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

      const submittedAt = t;
      await ref.update({
        status: "pending",
        submittedAt,
        slaExpiresAt: addDaysISO(submittedAt, PRESS_SLA_DAYS),
        retentionExpiresAt: null,
        reviewedBy: null,
        reviewedAt: null,
        reviewNote: null,
        updatedAt: t,
      });
      const fresh = await ref.get();
      return NextResponse.json({ draft: toResponse(id, fresh.data()!) });
    }

    if (action === "approve") {
      if (!isAdmin) {
        return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
      }
      const check = canPressAdminReview(data, u.uid);
      if (!check.ok) {
        const code = check.error?.includes("sendiri") ? 403 : 422;
        return NextResponse.json({ error: check.error }, { status: code });
      }
      await ref.update({
        status: "approved",
        reviewedBy: u.uid,
        reviewedAt: t,
        reviewNote: body.reviewNote ? String(body.reviewNote).trim() : null,
        retentionExpiresAt: addDaysISO(t, PRESS_RETENTION_DAYS),
        updatedAt: t,
      });
      const fresh = await ref.get();
      return NextResponse.json({ draft: toResponse(id, fresh.data()!) });
    }

    if (action === "reject") {
      if (!isAdmin) {
        return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
      }
      const check = canPressAdminReview(data, u.uid);
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
        retentionExpiresAt: addDaysISO(t, PRESS_RETENTION_DAYS),
        updatedAt: t,
      });
      const fresh = await ref.get();
      return NextResponse.json({ draft: toResponse(id, fresh.data()!) });
    }

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
        retentionExpiresAt: addDaysISO(t, PRESS_RETENTION_DAYS),
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
    console.error(`PATCH /api/press-drafts/${id} error:`, err);
    return NextResponse.json(
      { error: "Gagal memproses draft", details: err?.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/press-drafts/[id]
 * - owner: boleh hapus milik sendiri saat draft/rejected.
 * - admin: boleh hapus apa pun.
 */
export async function DELETE(request: NextRequest, ctx: Ctx) {
  const { response, user } = await requireUser(request);
  if (response) return response;
  const u = user!;
  const { id } = await ctx.params;

  try {
    const { ref, data } = await loadDraft(id);
    if (!data) return NextResponse.json({ error: "Draft tidak ditemukan" }, { status: 404 });

    if (u.role === "admin") {
      await ref.delete();
      return NextResponse.json({ ok: true });
    }
    if (data.authorUid !== u.uid) {
      return NextResponse.json({ error: "Forbidden: bukan milik Anda" }, { status: 403 });
    }
    if (!canPressOwnerEdit(data)) {
      return NextResponse.json(
        { error: `Tidak bisa hapus pada status ${pressEffectiveStatus(data)}` },
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
