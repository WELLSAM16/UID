"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/lib/authContext";
import { useRouter } from "next/navigation";
import { PUMK_TARGET_UNITS, currentYear } from "@/lib/pumkTarget";
import { formatUnitDisplay } from "@/lib/roles";

interface PumkTarget {
  id: string;
  unitId: string;
  tahun: string;
  targetInventarisasi: number;
  targetRupiahKembali: number;
  targetMitra: number;
  assignedNoIds?: string[];
  status: "Active" | "Paused";
  updatedAt?: string;
}

interface Visit {
  id: string;
  unitId: string;
  tanggalKunjungan: string;
  noId: string;
  jenisTindakLanjut: string;
  totalSaldo: number;
  status: string;
}

type BulkScope = "single" | "all" | "selected";

interface BulkRow {
  unitId: string;
  targetMitra: string;
  targetInventarisasi: string;
  targetRupiahKembali: string;
  assignedNoIds: string;
}

function emptyBulkRow(unitId: string): BulkRow {
  return {
    unitId,
    targetMitra: "",
    targetInventarisasi: "",
    targetRupiahKembali: "",
    assignedNoIds: "",
  };
}

const assignedCount = (s: string) =>
  s.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean).length;

const EMPTY = {
  unitId: "UP3 BINTARO",
  tahun: currentYear(),
  targetInventarisasi: "",
  targetRupiahKembali: "",
  targetMitra: "",
  assignedNoIds: "",
  status: "Active" as "Active" | "Paused",
};

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

const rp = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n || 0);

function pct(real: number, target: number): number {
  if (!target || target <= 0) return real > 0 ? 100 : 0;
  return Math.min(100, Math.round((real / target) * 100));
}

function Bar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  const color = v >= 100 ? "#10b981" : v >= 50 ? "#38bdf8" : "#f59e0b";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: "140px" }}>
      <div style={{ flex: 1, height: "8px", borderRadius: "999px", background: "rgba(0,0,0,0.08)", overflow: "hidden" }}>
        <div style={{ width: `${v}%`, height: "100%", background: color, borderRadius: "999px" }} />
      </div>
      <span style={{ fontSize: "0.78rem", fontWeight: 700, minWidth: "38px", textAlign: "right" }}>{v}%</span>
    </div>
  );
}

export default function PumkTargetPage() {
  const { user, loading: authLoading, getToken } = useAuth();
  const router = useRouter();
  const [tahun, setTahun] = useState(currentYear());
  const [targets, setTargets] = useState<PumkTarget[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PumkTarget | null>(null);
  const [formData, setFormData] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [showIds, setShowIds] = useState<string | null>(null);
  const [scope, setScope] = useState<BulkScope>("single");
  const [pickedUnits, setPickedUnits] = useState<string[]>([...PUMK_TARGET_UNITS]);
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([]);
  const [bulkOverwrite, setBulkOverwrite] = useState(true);
  const [quick, setQuick] = useState({ inventarisasi: "", rupiah: "" });
  const [existingYear, setExistingYear] = useState<{ tahun: string; targets: PumkTarget[] }>({
    tahun: "",
    targets: [],
  });

  const isAdmin =
    user?.role === "administrator" ||
    user?.role === "admin_uid" ||
    (user?.role as string) === "admin";

  const authFetch = useCallback(
    async (url: string, init?: RequestInit): Promise<Response> => {
      let token = await getToken();
      const headers: HeadersInit = { "Content-Type": "application/json", ...(init?.headers || {}) };
      if (token) (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
      let res = await fetch(url, { ...init, headers, cache: "no-store" });
      if (res.status === 401) {
        token = await getToken(true);
        if (token) {
          (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
          res = await fetch(url, { ...init, headers, cache: "no-store" });
        }
        if (res.status === 401) router.replace("/login");
      }
      return res;
    },
    [getToken, router]
  );

  const parseJson = async (res: Response) => {
    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
      const parsed: unknown = text ? JSON.parse(text) : {};
      data =
        parsed !== null && typeof parsed === "object"
          ? (parsed as Record<string, unknown>)
          : {};
    } catch {
      throw new Error(`API ${res.status}: body bukan JSON (potongan: ${text.slice(0, 120)})`);
    }
    if (!res.ok) throw new Error(`API ${res.status}: ${String(data.error || "gagal")}`);
    return data;
  };

  const load = useCallback(async () => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [r1, r2] = await Promise.all([
        authFetch(`/api/pumk-targets?tahun=${encodeURIComponent(tahun)}`),
        authFetch("/api/pumk-visits"),
      ]);
      const [d1, d2] = await Promise.all([parseJson(r1), parseJson(r2)]);
      setTargets((d1.targets as PumkTarget[]) || []);
      setVisits((d2.visits as Visit[]) || []);
    } catch (e: unknown) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, tahun]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Saat mode massal dibuka, ambil target tahun tersebut untuk menandai
  // unit mana yang akan dibuat vs diperbarui.
  useEffect(() => {
    if (!isModalOpen || scope === "single") return;
    const t = formData.tahun.trim();
    if (!/^\d{4}$/.test(t)) return;
    let alive = true;
    (async () => {
      try {
        const res = await authFetch(`/api/pumk-targets?tahun=${encodeURIComponent(t)}`);
        const data = await parseJson(res);
        if (alive) setExistingYear({ tahun: t, targets: (data.targets as PumkTarget[]) || [] });
      } catch {
        if (alive) setExistingYear({ tahun: t, targets: [] });
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModalOpen, scope, formData.tahun]);

  const progress = useMemo(() => {
    const map = new Map<string, { inv: number; rupiah: number; mitra: Set<string> }>();
    for (const t of targets) map.set(t.id, { inv: 0, rupiah: 0, mitra: new Set() });
    const byUnit = new Map<string, PumkTarget[]>();
    for (const t of targets) {
      const list = byUnit.get(t.unitId) || [];
      list.push(t);
      byUnit.set(t.unitId, list);
    }
    for (const v of visits) {
      if (v.status !== "approved") continue;
      if (!String(v.tanggalKunjungan || "").startsWith(tahun)) continue;
      const list = byUnit.get(v.unitId);
      if (!list) continue;
      const active = list.find((t) => t.status === "Active") || list[0];
      if (!active) continue;
      const slot = map.get(active.id);
      if (!slot) continue;
      if (v.jenisTindakLanjut === "Inventarisasi") slot.inv += 1;
      if (v.jenisTindakLanjut === "Penagihan") slot.rupiah += Number(v.totalSaldo || 0);
      if (v.noId) slot.mitra.add(String(v.noId).trim().toUpperCase());
    }
    return map;
  }, [targets, visits, tahun]);

  const handleOpenModal = (target?: PumkTarget) => {
    if (target) {
      setEditTarget(target);
      setFormData({
        unitId: target.unitId,
        tahun: target.tahun,
        targetInventarisasi: String(target.targetInventarisasi),
        targetRupiahKembali: String(target.targetRupiahKembali),
        targetMitra: String(target.targetMitra),
        assignedNoIds: (target.assignedNoIds || []).join("\n"),
        status: target.status,
      });
      setScope("single");
    } else {
      setEditTarget(null);
      setFormData({ ...EMPTY, tahun });
      setScope("single");
      setPickedUnits([...PUMK_TARGET_UNITS]);
      setBulkRows([]);
      setQuick({ inventarisasi: "", rupiah: "" });
      setBulkOverwrite(true);
      setExistingYear({ tahun: "", targets: [] });
    }
    setIsModalOpen(true);
  };

  const bulkUnits = useMemo(
    () => (scope === "all" ? [...PUMK_TARGET_UNITS] : scope === "selected" ? pickedUnits : []),
    [scope, pickedUnits]
  );

  // Baris lama apa pun (Active/Paused) akan diperbarui oleh bulk, jadi
  // preview memakai baris pertama; baris Active diprioritaskan.
  const existingByUnit = useMemo(() => {
    const map = new Map<string, PumkTarget>();
    if (existingYear.tahun !== formData.tahun.trim()) return map;
    for (const t of existingYear.targets) {
      const prev = map.get(t.unitId);
      if (!prev || (prev.status !== "Active" && t.status === "Active")) {
        map.set(t.unitId, t);
      }
    }
    return map;
  }, [existingYear, formData.tahun]);

  /** Samakan isi tabel bulk dengan daftar unit yang dipilih. */
  const syncBulkRows = (units: string[]) => {
    setBulkRows((prev) => units.map((u) => prev.find((r) => r.unitId === u) || emptyBulkRow(u)));
  };

  const changeScope = (next: BulkScope) => {
    setScope(next);
    const units = next === "all" ? [...PUMK_TARGET_UNITS] : next === "selected" ? pickedUnits : [];
    syncBulkRows(units);
  };

  const togglePickedUnit = (unitId: string) => {
    const next = pickedUnits.includes(unitId)
      ? pickedUnits.filter((u) => u !== unitId)
      : [...pickedUnits, unitId];
    setPickedUnits(next);
    if (scope === "selected") syncBulkRows(next);
  };

  const applyQuickToAll = () => {
    if (!quick.inventarisasi.trim() || !quick.rupiah.trim()) {
      alert("Isi nilai cepat inventarisasi dan rupiah dulu.");
      return;
    }
    setBulkRows((prev) =>
      prev.map((r) => ({
        ...r,
        targetInventarisasi: quick.inventarisasi,
        targetRupiahKembali: quick.rupiah,
      }))
    );
  };

  const updateBulkRow = (
    unitId: string,
    field:
      | "targetMitra"
      | "targetInventarisasi"
      | "targetRupiahKembali"
      | "assignedNoIds",
    value: string
  ) => {
    setBulkRows((prev) =>
      prev.map((r) => {
        if (r.unitId !== unitId) return r;
        if (field !== "assignedNoIds") return { ...r, [field]: value };

        // Saat daftar NO ID ditempel, target mitra otomatis mengikuti
        // jumlahnya selama belum diubah manual.
        const oldCount = assignedCount(r.assignedNoIds);
        const next = { ...r, assignedNoIds: value };
        if (!r.targetMitra.trim() || Number(r.targetMitra) === oldCount) {
          next.targetMitra = String(assignedCount(value));
        }
        return next;
      })
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // --- Mode massal: banyak unit sekaligus ---
    if (!editTarget && scope !== "single") {
      if (bulkRows.length === 0) {
        alert("Pilih minimal satu unit.");
        return;
      }
      if (!/^\d{4}$/.test(formData.tahun.trim())) {
        alert("Tahun wajib format YYYY (cth 2026).");
        return;
      }
      const items: Array<{
        unitId: string;
        targetMitra: number;
        targetInventarisasi: number;
        targetRupiahKembali: number;
        assignedNoIds?: string;
      }> = [];
      for (const r of bulkRows) {
        const idsCount = assignedCount(r.assignedNoIds);
        if (!r.targetInventarisasi.trim() || !r.targetRupiahKembali.trim()) {
          alert(
            `Lengkapi target inventarisasi dan rupiah untuk ${formatUnitDisplay(r.unitId)}.`
          );
          return;
        }
        if (!r.targetMitra.trim() && idsCount === 0) {
          alert(
            `Isi daftar NO ID mitra atau target mitra untuk ${formatUnitDisplay(r.unitId)}.`
          );
          return;
        }
        const mitra = r.targetMitra.trim() ? Number(r.targetMitra) : idsCount;
        const inv = Number(r.targetInventarisasi);
        const rupiah = Number(r.targetRupiahKembali);
        if (
          !Number.isInteger(mitra) || mitra < 0 ||
          !Number.isInteger(inv) || inv < 0 ||
          !Number.isFinite(rupiah) || rupiah < 0
        ) {
          alert(
            `Target ${formatUnitDisplay(r.unitId)} harus angka >= 0 (mitra & inventarisasi bilangan bulat).`
          );
          return;
        }
        items.push({
          unitId: r.unitId,
          targetMitra: mitra,
          targetInventarisasi: inv,
          targetRupiahKembali: rupiah,
          // Kolom kosong = pertahankan daftar lama (bila ada).
          ...(r.assignedNoIds.trim() ? { assignedNoIds: r.assignedNoIds } : {}),
        });
      }
      setSaving(true);
      try {
        const res = await authFetch("/api/pumk-targets/bulk", {
          method: "POST",
          body: JSON.stringify({
            tahun: formData.tahun.trim(),
            items,
            overwrite: bulkOverwrite,
          }),
        });
        const data = await parseJson(res);
        const s = (data.summary || {}) as {
          created?: number;
          updated?: number;
          skipped?: number;
        };
        alert(
          `Target ${formData.tahun} disimpan: ${s.created || 0} dibuat, ` +
            `${s.updated || 0} diperbarui, ${s.skipped || 0} dilewati.`
        );
        setIsModalOpen(false);
        const savedYear = formData.tahun.trim();
        if (savedYear !== tahun) setTahun(savedYear);
        else load();
      } catch (err: unknown) {
        alert("Gagal menyimpan: " + errMsg(err));
      } finally {
        setSaving(false);
      }
      return;
    }

    const inv = parseInt(formData.targetInventarisasi, 10);
    const rupiah = Number(formData.targetRupiahKembali);
    const mitra = parseInt(formData.targetMitra, 10);
    if (!formData.unitId || !formData.tahun) {
      alert("Unit dan tahun wajib diisi!");
      return;
    }
    if (isNaN(inv) || inv < 0 || isNaN(mitra) || mitra < 0 || isNaN(rupiah) || rupiah < 0) {
      alert("Target harus angka >= 0!");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        unitId: formData.unitId,
        tahun: formData.tahun.trim(),
        targetInventarisasi: inv,
        targetRupiahKembali: rupiah,
        targetMitra: mitra,
        assignedNoIds: formData.assignedNoIds,
        status: formData.status,
      };
      let res: Response;
      if (editTarget) {
        res = await authFetch(`/api/pumk-targets/${editTarget.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        res = await authFetch("/api/pumk-targets", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      await parseJson(res);
      setIsModalOpen(false);
      load();
    } catch (e: unknown) {
      alert("Gagal menyimpan: " + errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus target PUMK ini?")) return;
    try {
      const res = await authFetch(`/api/pumk-targets/${id}`, { method: "DELETE" });
      await parseJson(res);
      load();
    } catch (e: unknown) {
      alert("Gagal hapus: " + errMsg(e));
    }
  };

  return (
    <div style={{ maxWidth: "1300px", margin: "0 auto" }}>
      <header className="responsive-header">
        <div>
          <h1 style={{ fontSize: "2.2rem", margin: 0, color: "#111" }}>Target PUMK per Unit</h1>
          <p style={{ margin: "5px 0 0 0", color: "#111", fontSize: "0.9rem" }}>
            Admin UID membagi mitra ke tiap UP3/UP2D: isi daftar NO ID mitra yang menjadi tanggung jawab
            unit tersebut, lalu target inventarisasi dan rupiahnya. Capaian dihitung dari kunjungan
            <b> approved</b> tahun berjalan.
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <input
            type="text"
            inputMode="numeric"
            className="input-field"
            value={tahun}
            onChange={(e) => setTahun(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
            placeholder="2026"
            style={{ width: "100px" }}
            title="Tahun"
          />
          {isAdmin && (
            <button className="btn" onClick={() => handleOpenModal()} style={{ background: "#38bdf8", color: "white" }}>
              + Set Target
            </button>
          )}
        </div>
      </header>

      {loading && <div className="glass-panel" style={{ padding: "24px" }}>Memuat target PUMK…</div>}
      {error && <div className="glass-panel" style={{ padding: "16px", color: "var(--danger)" }}>{error}</div>}

      {!loading && !error && (
        <div className="glass-panel" style={{ padding: "24px", overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Unit</th>
                <th>Target Mitra</th>
                <th>Target Inventarisasi</th>
                <th>Target Rupiah Kembali</th>
                <th>Daftar Mitra (UID)</th>
                <th>Status</th>
                <th style={{ minWidth: "220px" }}>Capaian (approved {tahun})</th>
                {isAdmin && <th>Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {targets.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 8 : 7} style={{ textAlign: "center" }}>
                    Belum ada target tahun {tahun}. {isAdmin ? "Klik “Set Target”." : "Hubungi Admin UID."}
                  </td>
                </tr>
              ) : (
                targets.map((t) => {
                  const p = progress.get(t.id);
                  const realInv = p?.inv || 0;
                  const realRp = p?.rupiah || 0;
                  const realMitra = p?.mitra.size || 0;
                  const ids = t.assignedNoIds || [];
                  return (
                    <tr key={t.id}>
                      <td style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{formatUnitDisplay(t.unitId)}</td>
                      <td style={{ fontWeight: 600 }}>{t.targetMitra.toLocaleString("id-ID")}</td>
                      <td style={{ fontWeight: 600 }}>{t.targetInventarisasi.toLocaleString("id-ID")}</td>
                      <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{rp(t.targetRupiahKembali)}</td>
                      <td>
                        {ids.length === 0 ? (
                          <span style={{ color: "var(--text-muted)" }}>—</span>
                        ) : (
                          <button
                            className="btn"
                            style={{ padding: "4px 10px", fontSize: "0.8rem", background: "rgba(56,189,248,0.12)" }}
                            onClick={() => setShowIds(showIds === t.id ? null : t.id)}
                          >
                            {ids.length} mitra {showIds === t.id ? "▾" : "▸"}
                          </button>
                        )}
                      </td>
                      <td>
                        <span style={{
                          padding: "4px 8px",
                          background: t.status === "Active" ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
                          color: t.status === "Active" ? "var(--success)" : "var(--danger)",
                          borderRadius: "4px", fontSize: "0.8rem",
                        }}>
                          {t.status}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.82rem" }}>
                          <div>
                            <div style={{ marginBottom: "2px" }}>
                              Mitra: <b>{realMitra.toLocaleString("id-ID")}/{t.targetMitra.toLocaleString("id-ID")}</b>
                            </div>
                            <Bar value={pct(realMitra, t.targetMitra)} />
                          </div>
                          <div>
                            <div style={{ marginBottom: "2px" }}>
                              Inventarisasi: <b>{realInv.toLocaleString("id-ID")}/{t.targetInventarisasi.toLocaleString("id-ID")}</b>
                            </div>
                            <Bar value={pct(realInv, t.targetInventarisasi)} />
                          </div>
                          <div>
                            <div style={{ marginBottom: "2px" }}>
                              Rupiah: <b>{rp(realRp)} / {rp(t.targetRupiahKembali)}</b>
                            </div>
                            <Bar value={pct(realRp, t.targetRupiahKembali)} />
                          </div>
                        </div>
                      </td>
                      {isAdmin && (
                        <td style={{ whiteSpace: "nowrap" }}>
                          <button
                            className="btn"
                            style={{ padding: "6px 12px", marginRight: "8px", background: "rgba(255,255,255,0.1)" }}
                            onClick={() => handleOpenModal(t)}
                          >
                            Edit
                          </button>
                          <button className="btn btn-danger" style={{ padding: "6px 12px" }} onClick={() => handleDelete(t.id)}>
                            Hapus
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {showIds && (
            <div style={{ marginTop: "12px", padding: "12px 16px", borderRadius: "10px", background: "rgba(56,189,248,0.07)", fontSize: "0.85rem" }}>
              <b>Daftar NO ID mitra ditangani ({(targets.find((t) => t.id === showIds)?.assignedNoIds || []).length}):</b>
              <div style={{ marginTop: "6px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {(targets.find((t) => t.id === showIds)?.assignedNoIds || []).map((id) => (
                  <span key={id} style={{ padding: "2px 8px", borderRadius: "999px", background: "rgba(0,0,0,0.06)", fontSize: "0.78rem" }}>{id}</span>
                ))}
              </div>
            </div>
          )}

          {!isAdmin && (
            <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: "12px" }}>
              Role unit hanya melihat target + capaian. Perubahan target dilakukan Admin UID.
            </p>
          )}
        </div>
      )}

      {isModalOpen && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.6)", backdropFilter: "blur(5px)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: "16px",
        }}>
          <div
            className="glass-panel"
            style={{
              padding: "30px",
              width: "100%",
              maxWidth: !editTarget && scope !== "single" ? "1120px" : "560px",
              maxHeight: "92vh",
              overflowY: "auto",
            }}
          >
            <h2 style={{ marginBottom: "6px" }}>
              {editTarget
                ? "Edit Target PUMK"
                : scope === "single"
                  ? "Set Target PUMK"
                  : `Set Target ${bulkUnits.length} Unit`}
            </h2>
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: 0 }}>
              Satu baris aktif per unit per tahun. Daftar mitra = NO ID dari SPS (kolom CASCADING UP), satu per baris.
            </p>
            <form onSubmit={handleSubmit}>
              {!editTarget && (
                <div style={{ marginBottom: "16px" }}>
                  <label style={{ display: "block", marginBottom: "8px", fontSize: "0.9rem" }}>Cakupan*</label>
                  <div style={{ display: "flex", gap: "18px", flexWrap: "wrap", fontSize: "0.9rem" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <input type="radio" name="bulk-scope" checked={scope === "single"} onChange={() => changeScope("single")} />
                      Satu unit
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <input type="radio" name="bulk-scope" checked={scope === "all"} onChange={() => changeScope("all")} />
                      Semua unit ({PUMK_TARGET_UNITS.length})
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <input type="radio" name="bulk-scope" checked={scope === "selected"} onChange={() => changeScope("selected")} />
                      Pilih unit
                    </label>
                  </div>
                </div>
              )}

              {!editTarget && scope === "selected" && (
                <div
                  style={{
                    marginBottom: "16px",
                    border: "1px solid rgba(0,0,0,0.12)",
                    borderRadius: "10px",
                    padding: "12px",
                    maxHeight: "180px",
                    overflowY: "auto",
                  }}
                >
                  <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                    <button
                      type="button"
                      className="btn"
                      style={{ padding: "4px 10px", fontSize: "0.78rem" }}
                      onClick={() => {
                        setPickedUnits([...PUMK_TARGET_UNITS]);
                        syncBulkRows([...PUMK_TARGET_UNITS]);
                      }}
                    >
                      Pilih semua
                    </button>
                    <button
                      type="button"
                      className="btn"
                      style={{ padding: "4px 10px", fontSize: "0.78rem" }}
                      onClick={() => {
                        setPickedUnits([]);
                        syncBulkRows([]);
                      }}
                    >
                      Kosongkan
                    </button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "6px 14px" }}>
                    {PUMK_TARGET_UNITS.map((u) => (
                      <label key={u} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem" }}>
                        <input type="checkbox" checked={pickedUnits.includes(u)} onChange={() => togglePickedUnit(u)} />
                        {formatUnitDisplay(u)}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {scope === "single" ? (
                <>
                  <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
                    <div style={{ flex: 2 }}>
                      <label style={{ display: "block", marginBottom: "8px", fontSize: "0.9rem" }}>Unit*</label>
                      <select
                        className="input-field"
                        value={formData.unitId}
                        onChange={(e) => setFormData({ ...formData, unitId: e.target.value })}
                        style={{ width: "100%" }}
                      >
                        {PUMK_TARGET_UNITS.map((u) => (
                          <option key={u} value={u}>{formatUnitDisplay(u)}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", marginBottom: "8px", fontSize: "0.9rem" }}>Tahun*</label>
                      <input
                        className="input-field"
                        inputMode="numeric"
                        value={formData.tahun}
                        onChange={(e) => setFormData({ ...formData, tahun: e.target.value.replace(/[^0-9]/g, "").slice(0, 4) })}
                        placeholder="2026"
                        style={{ width: "100%" }}
                      />
                    </div>
                  </div>

                  <div style={{ marginBottom: "16px" }}>
                    <label style={{ display: "block", marginBottom: "8px", fontSize: "0.9rem" }}>Target Mitra Ditangani* (cascading)</label>
                    <input
                      type="number"
                      min={0}
                      className="input-field"
                      placeholder="Cth: 40"
                      value={formData.targetMitra}
                      onChange={(e) => setFormData({ ...formData, targetMitra: e.target.value })}
                    />
                  </div>

                  <div style={{ marginBottom: "16px" }}>
                    <label style={{ display: "block", marginBottom: "8px", fontSize: "0.9rem" }}>Target Inventarisasi* (mitra selesai)</label>
                    <input
                      type="number"
                      min={0}
                      className="input-field"
                      placeholder="Cth: 25"
                      value={formData.targetInventarisasi}
                      onChange={(e) => setFormData({ ...formData, targetInventarisasi: e.target.value })}
                    />
                  </div>

                  <div style={{ marginBottom: "16px" }}>
                    <label style={{ display: "block", marginBottom: "8px", fontSize: "0.9rem" }}>Target Rupiah Kembali* (Rp)</label>
                    <input
                      type="number"
                      min={0}
                      className="input-field"
                      placeholder="Cth: 500000000"
                      value={formData.targetRupiahKembali}
                      onChange={(e) => setFormData({ ...formData, targetRupiahKembali: e.target.value })}
                    />
                  </div>

                  <div style={{ marginBottom: "16px" }}>
                    <label style={{ display: "block", marginBottom: "8px", fontSize: "0.9rem" }}>
                      Daftar NO ID Mitra Ditangani (opsional, {assignedCount(formData.assignedNoIds)} terisi)
                    </label>
                    <textarea
                      className="input-field"
                      rows={5}
                      placeholder={"Satu NO ID per baris, cth:\n01-01-778/93\n01-01-207/00"}
                      value={formData.assignedNoIds}
                      onChange={(e) => setFormData({ ...formData, assignedNoIds: e.target.value })}
                      style={{ width: "100%", resize: "vertical" }}
                    />
                  </div>

                  <div style={{ marginBottom: "30px" }}>
                    <label style={{ display: "block", marginBottom: "8px", fontSize: "0.9rem" }}>Status</label>
                    <select
                      className="input-field"
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value as "Active" | "Paused" })}
                    >
                      <option value="Active">Active</option>
                      <option value="Paused">Paused</option>
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: "flex", gap: "12px", marginBottom: "16px", alignItems: "flex-end" }}>
                    <div style={{ flex: "0 0 140px" }}>
                      <label style={{ display: "block", marginBottom: "8px", fontSize: "0.9rem" }}>Tahun*</label>
                      <input
                        className="input-field"
                        inputMode="numeric"
                        value={formData.tahun}
                        onChange={(e) => setFormData({ ...formData, tahun: e.target.value.replace(/[^0-9]/g, "").slice(0, 4) })}
                        placeholder="2026"
                        style={{ width: "100%" }}
                      />
                    </div>
                    <div style={{ flex: 1, fontSize: "0.85rem", color: "var(--text-muted)", paddingBottom: "10px" }}>
                      {bulkUnits.length} unit dipilih
                      {bulkUnits.length > 0 && ` · ${bulkRows.length} baris siap diisi`}
                      {" · "}
                      {bulkRows.reduce((n, r) => n + assignedCount(r.assignedNoIds), 0)} NO ID
                      {" · "}
                      target lama yang ditemukan:{" "}
                      {existingYear.tahun === formData.tahun.trim() ? existingYear.targets.length : 0}
                    </div>
                  </div>

                  <div
                    style={{
                      padding: "12px 14px",
                      borderRadius: "10px",
                      background: "rgba(56,189,248,0.07)",
                      marginBottom: "16px",
                    }}
                  >
                    <b style={{ fontSize: "0.9rem" }}>Isi cepat inventarisasi & rupiah</b>
                    <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                      {" "}— opsional, tidak mengubah daftar mitra.
                    </span>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px", marginTop: "8px" }}>
                      <input
                        type="number"
                        min={0}
                        className="input-field"
                        placeholder="Target inventarisasi"
                        value={quick.inventarisasi}
                        onChange={(e) => setQuick({ ...quick, inventarisasi: e.target.value })}
                      />
                      <input
                        type="number"
                        min={0}
                        className="input-field"
                        placeholder="Target rupiah"
                        value={quick.rupiah}
                        onChange={(e) => setQuick({ ...quick, rupiah: e.target.value })}
                      />
                    </div>
                    <button
                      type="button"
                      className="btn"
                      style={{ marginTop: "8px", padding: "6px 12px", fontSize: "0.82rem" }}
                      onClick={applyQuickToAll}
                    >
                      Terapkan ke semua baris
                    </button>
                  </div>

                  <div
                    style={{
                      border: "1px solid rgba(0,0,0,0.12)",
                      borderRadius: "10px",
                      maxHeight: "420px",
                      overflow: "auto",
                      marginBottom: "12px",
                    }}
                  >
                    <table className="data-table" style={{ margin: 0 }}>
                      <thead>
                        <tr>
                          <th style={{ position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>Unit</th>
                          <th style={{ position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
                            Daftar NO ID Mitra
                          </th>
                          <th style={{ position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>Target Mitra</th>
                          <th style={{ position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>Target Inventarisasi</th>
                          <th style={{ position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>Target Rupiah</th>
                          <th style={{ position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bulkRows.length === 0 ? (
                          <tr>
                            <td colSpan={6} style={{ textAlign: "center" }}>
                              Belum ada unit dipilih.
                            </td>
                          </tr>
                        ) : (
                          bulkRows.map((r) => {
                            const existing = existingByUnit.get(r.unitId);
                            const label = existing ? (bulkOverwrite ? "Diperbarui" : "Dilewati") : "Baru";
                            const color = existing
                              ? bulkOverwrite
                                ? "#0284c7"
                                : "var(--text-muted)"
                              : "var(--success)";
                            return (
                              <tr key={r.unitId}>
                                <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{formatUnitDisplay(r.unitId)}</td>
                                <td>
                                  <textarea
                                    rows={2}
                                    className="input-field"
                                    style={{ width: "230px", minWidth: "210px", fontSize: "0.8rem", resize: "vertical" }}
                                    placeholder={"Satu NO ID per baris / pisah koma\ncth: 01-01-778/93"}
                                    value={r.assignedNoIds}
                                    onChange={(e) => updateBulkRow(r.unitId, "assignedNoIds", e.target.value)}
                                  />
                                  <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "2px" }}>
                                    {assignedCount(r.assignedNoIds)} NO ID
                                  </div>
                                </td>
                                <td>
                                  <input
                                    type="number"
                                    min={0}
                                    className="input-field"
                                    style={{ width: "90px", textAlign: "right" }}
                                    value={r.targetMitra}
                                    onChange={(e) => updateBulkRow(r.unitId, "targetMitra", e.target.value)}
                                  />
                                </td>
                                <td>
                                  <input
                                    type="number"
                                    min={0}
                                    className="input-field"
                                    style={{ width: "100px", textAlign: "right" }}
                                    value={r.targetInventarisasi}
                                    onChange={(e) => updateBulkRow(r.unitId, "targetInventarisasi", e.target.value)}
                                  />
                                </td>
                                <td>
                                  <input
                                    type="number"
                                    min={0}
                                    className="input-field"
                                    style={{ width: "150px", textAlign: "right" }}
                                    value={r.targetRupiahKembali}
                                    onChange={(e) => updateBulkRow(r.unitId, "targetRupiahKembali", e.target.value)}
                                  />
                                </td>
                                <td>
                                  <span style={{ fontSize: "0.8rem", fontWeight: 600, color }}>{label}</span>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  <label style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", fontSize: "0.85rem" }}>
                    <input type="checkbox" checked={bulkOverwrite} onChange={(e) => setBulkOverwrite(e.target.checked)} />
                    Perbarui target yang sudah ada (jika tidak dicentang, unit yang sudah punya target dilewati)
                  </label>
                  <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 0, marginBottom: "20px" }}>
                    Tempel banyak NO ID mitra per unit (satu per baris atau pisahkan koma). Target mitra otomatis
                    mengikuti jumlah NO ID selama belum diubah manual. Kolom kosong mempertahankan daftar lama;
                    untuk menghapus daftar, edit unit tersebut. Tidak ada pembagian rata: setiap unit memegang
                    mitra yang diinput untuk unit itu.
                  </p>
                </>
              )}

              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button type="button" className="btn" style={{ background: "rgba(255,255,255,0.1)" }} onClick={() => setIsModalOpen(false)}>
                  Batal
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving || (scope !== "single" && bulkRows.length === 0)}>
                  {saving ? "Menyimpan…" : scope === "single" ? "Simpan" : `Simpan ${bulkRows.length} Target`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
