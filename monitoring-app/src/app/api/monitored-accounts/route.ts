import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireUser } from "@/lib/authServer";
import { isAdminRole, normalizeUnitId } from "@/lib/roles";

export interface MonitoredAccountInfo {
  username: string;
  /** UnitId ternormalisasi (salah satu UNIT_OPTIONS) atau null bila belum dipetakan. */
  unitId: string | null;
  status: string;
}

/**
 * GET /api/monitored-accounts
 * Daftar akun IG terpantau (status Active) + unitId-nya.
 * Dipakai filter Unit -> Akun di Skoring/Rekap. Semua user login boleh baca.
 */
export async function GET(request: NextRequest) {
  const { response } = await requireUser(request);
  if (response) return response;
  try {
    const snap = await getAdminDb()
      .collection("monitored_accounts")
      .where("status", "==", "Active")
      .get();
    const accounts: MonitoredAccountInfo[] = snap.docs
      .map((d) => {
        const data = d.data();
        const username = String(data.username || "").trim();
        if (!username) return null;
        return {
          username,
          unitId: normalizeUnitId(data.unitId as string | undefined),
          status: String(data.status || "Active"),
        } as MonitoredAccountInfo;
      })
      .filter((a): a is MonitoredAccountInfo => a !== null)
      .sort((a, b) => a.username.localeCompare(b.username));
    return NextResponse.json({ accounts });
  } catch (err: any) {
    console.error("GET /api/monitored-accounts error:", err);
    return NextResponse.json(
      { error: "Gagal memuat akun terpantau", details: err?.message },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/monitored-accounts
 * Petakan akun ke unit: { username, unitId | null }.
 * Admin operasional (admin_uid/administrator). unitId divalidasi ke UNIT_OPTIONS.
 * Data akun menyusul — isi belakangan tanpa deploy ulang (atau via Console).
 */
export async function PUT(request: NextRequest) {
  const { response, user } = await requireUser(request);
  if (response) return response;
  if (!isAdminRole(user!.role)) {
    return NextResponse.json({ error: "Forbidden: khusus admin" }, { status: 403 });
  }
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body bukan JSON valid" }, { status: 400 });
  }
  const username = String(body.username || "").trim();
  if (!username) {
    return NextResponse.json({ error: "username wajib diisi" }, { status: 400 });
  }
  const rawUnit = body.unitId;
  const unitId =
    rawUnit === null || rawUnit === undefined || String(rawUnit).trim() === ""
      ? null
      : normalizeUnitId(String(rawUnit));
  if (rawUnit !== null && rawUnit !== undefined && String(rawUnit).trim() !== "" && !unitId) {
    return NextResponse.json(
      { error: `unitId tidak dikenal: "${rawUnit}"` },
      { status: 400 }
    );
  }
  try {
    const db = getAdminDb();
    const snap = await db
      .collection("monitored_accounts")
      .where("username", "==", username)
      .limit(1)
      .get();
    if (snap.empty) {
      return NextResponse.json(
        { error: `Akun "${username}" tidak ditemukan` },
        { status: 404 }
      );
    }
    await snap.docs[0].ref.update({ unitId });
    return NextResponse.json({ username, unitId });
  } catch (err: any) {
    console.error("PUT /api/monitored-accounts error:", err);
    return NextResponse.json(
      { error: "Gagal menyimpan unitId", details: err?.message },
      { status: 500 }
    );
  }
}
