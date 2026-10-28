import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/authServer";
import {
  PUMK_DB_COLLECTION,
  validatePumkDbInput,
  type PumkDatabaseMitra,
} from "@/lib/pumkDatabase";

function toResponse(id: string, data: FirebaseFirestore.DocumentData) {
  return { id, ...(data as Record<string, unknown>) };
}

async function readBody(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const text = await request.text();
    if (!text) return {};
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * GET /api/pumk/database — Admin UID/administrator.
 * Daftar seluruh mitra database PUMK internal (bukan dari link luar).
 */
export async function GET(request: NextRequest) {
  const { response } = await requireAdmin(request);
  if (response) return response;

  try {
    const snap = await getAdminDb().collection(PUMK_DB_COLLECTION).get();
    const mitra = snap.docs
      .map((doc) => toResponse(doc.id, doc.data()) as PumkDatabaseMitra & { id: string })
      .sort((a, b) =>
        String(a.noId || "").localeCompare(String(b.noId || ""), "id", {
          numeric: true,
          sensitivity: "base",
        })
      );

    return NextResponse.json({
      mitra,
      meta: {
        total: mitra.length,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("GET /api/pumk/database error:", err);
    return NextResponse.json({ error: "Gagal memuat database PUMK" }, { status: 500 });
  }
}

/**
 * POST /api/pumk/database — tambah mitra baru.
 */
export async function POST(request: NextRequest) {
  const { response, user } = await requireAdmin(request);
  if (response || !user) return response || NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await readBody(request);
  if (!body) return NextResponse.json({ error: "Body JSON tidak valid" }, { status: 400 });

  const parsed = validatePumkDbInput(body);
  if (!parsed.ok || !parsed.data) {
    return NextResponse.json({ error: parsed.error || "Data tidak valid" }, { status: 400 });
  }

  try {
    const db = getAdminDb();
    const collection = db.collection(PUMK_DB_COLLECTION);
    const duplicate = await collection
      .where("noIdKey", "==", parsed.data.noIdKey)
      .limit(1)
      .get();
    if (!duplicate.empty) {
      return NextResponse.json(
        { error: `NO ID ${parsed.data.noId} sudah ada di database` },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const data: Omit<PumkDatabaseMitra, "id"> = {
      ...parsed.data,
      source: "app",
      createdAt: now,
      updatedAt: now,
      updatedBy: user.uid,
      updatedByEmail: user.email || null,
    };
    const ref = await collection.add(data);
    return NextResponse.json(
      { mitra: toResponse(ref.id, data) },
      { status: 201 }
    );
  } catch (err) {
    console.error("POST /api/pumk/database error:", err);
    return NextResponse.json({ error: "Gagal menyimpan mitra PUMK" }, { status: 500 });
  }
}
