"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { useAuth } from "@/lib/authContext";
import { useRouter } from "next/navigation";
import { formatUnitDisplay } from "@/lib/roles";
import {
  PUMK_DB_FIELDS,
  PUMK_DB_GROUPS,
  pumkDbValue,
  type PumkDatabaseMitra,
} from "@/lib/pumkDatabase";

const rp = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n || 0);

const numFmt = (n: number) =>
  new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n || 0);

const PAGE_SIZES = [25, 50, 100];

const TABLE_KEYS = [
  "noId",
  "nama",
  "unitId",
  "kolektibilitas",
  "pks",
  "totalSaldoJuli",
  "statusPerJuli",
  "linkFolder",
];

const MONEY_KEYS = new Set(["totalSaldoJuli"]);

function emptyForm(): Record<string, string> {
  return Object.fromEntries(PUMK_DB_FIELDS.map((f) => [f.key, ""]));
}

function rowToForm(row: PumkDatabaseMitra): Record<string, string> {
  return Object.fromEntries(
    PUMK_DB_FIELDS.map((f) => {
      const value = pumkDbValue(row, f.key);
      return [f.key, value === 0 ? "0" : String(value ?? "")];
    })
  );
}

function exportLabel(key: string): string {
  return PUMK_DB_FIELDS.find((f) => f.key === key)?.label || key;
}

export default function PumkDatabasePage() {
  const { user, loading: authLoading, getToken } = useAuth();
  const router = useRouter();

  const [rows, setRows] = useState<PumkDatabaseMitra[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [fUnit, setFUnit] = useState("all");
  const [fKol, setFKol] = useState("all");
  const [fStatus, setFStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [modalOpen, setModalOpen] = useState(false);
  const [editRow, setEditRow] = useState<PumkDatabaseMitra | null>(null);
  const [form, setForm] = useState<Record<string, string>>(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const authFetch = useCallback(
    async (url: string, init?: RequestInit): Promise<Response> => {
      let token = await getToken();
      const headers: HeadersInit = {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      };
      if (token) (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
      let res = await fetch(url, { ...init, headers, cache: "no-store" });
      if (res.status === 401) {
        token = await getToken(true);
        if (token) (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
        res = await fetch(url, { ...init, headers, cache: "no-store" });
        if (res.status === 401) router.replace("/login");
      }
      return res;
    },
    [getToken, router]
  );

  const parseJson = async (res: Response): Promise<Record<string, unknown>> => {
    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      throw new Error(`API ${res.status}: respons bukan JSON.`);
    }
    if (!res.ok) {
      throw new Error(typeof data.error === "string" ? data.error : `API ${res.status}`);
    }
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
      const res = await authFetch("/api/pumk/database");
      const data = await parseJson(res);
      setRows(Array.isArray(data.mitra) ? (data.mitra as PumkDatabaseMitra[]) : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [authLoading, user, authFetch, router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const unitOptions = useMemo(() => {
    const set = new Set(rows.map((r) => r.unitId || ""));
    return [...set].sort((a, b) => {
      if (!a) return 1;
      if (!b) return -1;
      return a.localeCompare(b, "id");
    });
  }, [rows]);

  const kolOptions = useMemo(() => {
    return [...new Set(rows.map((r) => (r.kolektibilitas || "").trim()).filter(Boolean))].sort();
  }, [rows]);

  const statusOptions = useMemo(() => {
    return [...new Set(rows.map((r) => (r.statusPerJuli || "").trim()).filter(Boolean))].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (fUnit !== "all" && (r.unitId || "") !== fUnit) return false;
      if (fKol !== "all" && (r.kolektibilitas || "") !== fKol) return false;
      if (fStatus !== "all" && (r.statusPerJuli || "") !== fStatus) return false;
      if (!needle) return true;
      return [r.noId, r.nama, r.pks, r.alamat, r.kota, r.provinsi]
        .map((v) => String(v || "").toLowerCase())
        .some((v) => v.includes(needle));
    });
  }, [rows, q, fUnit, fKol, fStatus]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const totals = useMemo(() => {
    const totalSaldo = filtered.reduce((s, r) => s + Number(r.totalSaldoJuli || 0), 0);
    const assigned = rows.filter((r) => !!r.unitId).length;
    const units = new Set(rows.map((r) => r.unitId).filter(Boolean)).size;
    return { totalSaldo, assigned, units, unassigned: rows.length - assigned };
  }, [rows, filtered]);

  const openCreate = () => {
    setEditRow(null);
    setForm(emptyForm());
    setFormError("");
    setModalOpen(true);
  };

  const openEdit = (row: PumkDatabaseMitra) => {
    setEditRow(row);
    setForm(rowToForm(row));
    setFormError("");
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving || deleting) return;
    setModalOpen(false);
    setEditRow(null);
    setFormError("");
  };

  const setField = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!form.noId?.trim()) {
      setFormError("NO ID wajib diisi.");
      return;
    }
    if (!form.nama?.trim()) {
      setFormError("Nama mitra wajib diisi.");
      return;
    }

    setSaving(true);
    try {
      const payload = Object.fromEntries(PUMK_DB_FIELDS.map((f) => [f.key, form[f.key] ?? ""]));
      const res = editRow?.id
        ? await authFetch(`/api/pumk/database/${editRow.id}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : await authFetch("/api/pumk/database", {
            method: "POST",
            body: JSON.stringify(payload),
          });
      await parseJson(res);
      setModalOpen(false);
      setEditRow(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editRow?.id) return;
    const label = `${editRow.noId} — ${editRow.nama}`;
    if (!confirm(`Hapus mitra ini dari database?\n\n${label}\n\nTindakan ini tidak bisa dibatalkan.`)) return;
    setDeleting(true);
    setFormError("");
    try {
      const res = await authFetch(`/api/pumk/database/${editRow.id}`, { method: "DELETE" });
      await parseJson(res);
      setModalOpen(false);
      setEditRow(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  };

  const exportExcel = () => {
    if (filtered.length === 0) {
      alert("Tidak ada data untuk diekspor.");
      return;
    }
    const data = filtered.map((r, i) => {
      const obj: Record<string, string | number> = { No: i + 1 };
      for (const f of PUMK_DB_FIELDS) {
        const v = pumkDbValue(r, f.key);
        obj[f.label] = typeof v === "number" ? v : String(v);
      }
      return obj;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Database PUMK");
    XLSX.writeFile(wb, `Database_PUMK_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const renderCell = (row: PumkDatabaseMitra, key: string) => {
    const value = pumkDbValue(row, key);
    if (key === "linkFolder") {
      const url = String(value || "");
      return url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn"
          style={{ padding: "5px 10px", fontSize: "0.78rem", background: "rgba(16,185,129,0.14)", color: "#047857", textDecoration: "none", whiteSpace: "nowrap" }}
        >
          📁 Buka Folder
        </a>
      ) : (
        <span style={{ color: "var(--text-muted)" }}>Belum diisi</span>
      );
    }
    if (key === "unitId") {
      return value ? formatUnitDisplay(String(value)) : <span style={{ color: "var(--text-muted)" }}>Belum ditetapkan</span>;
    }
    if (key === "totalSaldoJuli") return rp(Number(value || 0));
    if (MONEY_KEYS.has(key)) return rp(Number(value || 0));
    if (value === "" || value === null || value === undefined) return <span style={{ color: "var(--text-muted)" }}>—</span>;
    return String(value);
  };

  return (
    <div style={{ maxWidth: "1400px", margin: "0 auto" }}>
      <header className="responsive-header" style={{ marginBottom: "22px" }}>
        <div>
          <h1 style={{ fontSize: "2.2rem", margin: 0, color: "#111" }}>Database PUMK</h1>
          <p style={{ margin: "5px 0 0 0", color: "#111", fontSize: "0.9rem", maxWidth: "820px" }}>
            Master mitra PUMK internal. Admin UID dapat menambah, mengubah, dan menghapus data.
            Folder PKS &amp; piutang diisi per mitra. Halaman ini tidak membuka akses ke Google Sheet.
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={openCreate} style={{ fontWeight: 700 }}>
            + Tambah Mitra
          </button>
          <button
            className="btn"
            onClick={load}
            disabled={loading}
            style={{ background: "#38bdf8", color: "#fff", border: "none", padding: "8px 16px", fontSize: "0.9rem" }}
          >
            {loading ? "Memuat…" : "Refresh"}
          </button>
          <button
            className="btn"
            onClick={exportExcel}
            disabled={filtered.length === 0}
            style={{ background: "#10b981", color: "#fff", border: "none", padding: "8px 16px", fontSize: "0.9rem", fontWeight: 700 }}
          >
            Export Excel
          </button>
        </div>
      </header>

      {error && (
        <div style={{ marginBottom: "16px", padding: "12px 18px", borderRadius: "10px", background: "rgba(239,68,68,0.1)", color: "var(--danger)", fontSize: "0.875rem" }}>
          ⚠️ {error}
        </div>
      )}

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "14px", marginBottom: "20px" }}>
        <div className="glass-card" style={{ padding: "16px 18px", borderLeft: "4px solid #38bdf8" }}>
          <div style={{ fontSize: "0.82rem", color: "#111", fontWeight: 600 }}>Total Mitra</div>
          <div style={{ fontSize: "1.6rem", fontWeight: 700 }}>{numFmt(rows.length)}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{totals.unassigned} belum punya unit</div>
        </div>
        <div className="glass-card" style={{ padding: "16px 18px", borderLeft: "4px solid #f59e0b" }}>
          <div style={{ fontSize: "0.82rem", color: "#111", fontWeight: 600 }}>Total Saldo Juli 2026</div>
          <div style={{ fontSize: "1.25rem", fontWeight: 700, overflowWrap: "anywhere" }}>{rp(totals.totalSaldo)}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>sesuai filter aktif</div>
        </div>
        <div className="glass-card" style={{ padding: "16px 18px", borderLeft: "4px solid #10b981" }}>
          <div style={{ fontSize: "0.82rem", color: "#111", fontWeight: 600 }}>Unit Terisi</div>
          <div style={{ fontSize: "1.6rem", fontWeight: 700 }}>{totals.units}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>UP2D / UP3</div>
        </div>
        <div className="glass-card" style={{ padding: "16px 18px", borderLeft: "4px solid #8b5cf6" }}>
          <div style={{ fontSize: "0.82rem", color: "#111", fontWeight: 600 }}>Hasil Filter</div>
          <div style={{ fontSize: "1.6rem", fontWeight: 700 }}>{numFmt(filtered.length)}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>mitra</div>
        </div>
      </section>

      <section className="glass-panel" style={{ padding: "16px 20px", marginBottom: "16px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "12px", alignItems: "end" }}>
          <div>
            <label style={{ display: "block", marginBottom: "6px", fontSize: "0.82rem", fontWeight: 600 }}>Cari NO ID / Nama / PKS / Alamat</label>
            <input className="input-field" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="cth: 396/96 atau SUHARTONO" style={{ width: "100%" }} />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "6px", fontSize: "0.82rem", fontWeight: 600 }}>Unit</label>
            <select className="input-field" value={fUnit} onChange={(e) => { setFUnit(e.target.value); setPage(1); }} style={{ width: "100%" }}>
              <option value="all">Semua unit</option>
              {unitOptions.map((u) => (
                <option key={u || "blank"} value={u}>{u ? formatUnitDisplay(u) : "Belum ditetapkan"}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "6px", fontSize: "0.82rem", fontWeight: 600 }}>Kolektibilitas</label>
            <select className="input-field" value={fKol} onChange={(e) => { setFKol(e.target.value); setPage(1); }} style={{ width: "100%" }}>
              <option value="all">Semua</option>
              {kolOptions.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "6px", fontSize: "0.82rem", fontWeight: 600 }}>Status Juli 2026</label>
            <select className="input-field" value={fStatus} onChange={(e) => { setFStatus(e.target.value); setPage(1); }} style={{ width: "100%" }}>
              <option value="all">Semua</option>
              {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      </section>

      <section className="glass-panel" style={{ padding: "0", overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.84rem" }}>
            <thead>
              <tr style={{ background: "rgba(56,189,248,0.08)" }}>
                {TABLE_KEYS.map((key) => (
                  <th key={key} style={{ textAlign: "left", padding: "12px 14px", whiteSpace: "nowrap", fontWeight: 700 }}>
                    {exportLabel(key)}
                  </th>
                ))}
                <th style={{ textAlign: "right", padding: "12px 14px", whiteSpace: "nowrap", fontWeight: 700 }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={TABLE_KEYS.length + 1} style={{ padding: "32px", textAlign: "center" }}>Memuat database PUMK…</td></tr>
              ) : pageRows.length === 0 ? (
                <tr><td colSpan={TABLE_KEYS.length + 1} style={{ padding: "32px", textAlign: "center", color: "var(--text-muted)" }}>Tidak ada mitra yang cocok dengan filter.</td></tr>
              ) : (
                pageRows.map((row) => (
                  <tr key={row.id || row.noId} style={{ borderTop: "1px solid var(--card-border)" }}>
                    {TABLE_KEYS.map((key) => (
                      <td key={key} style={{ padding: "10px 14px", verticalAlign: "top", maxWidth: key === "nama" ? "260px" : undefined }}>
                        <div style={{ overflowWrap: "anywhere" }}>{renderCell(row, key)}</div>
                      </td>
                    ))}
                    <td style={{ padding: "10px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                      <button
                        className="btn"
                        onClick={() => openEdit(row)}
                        style={{ padding: "5px 10px", fontSize: "0.78rem", background: "rgba(56,189,248,0.14)", color: "#0369a1" }}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", padding: "12px 16px", flexWrap: "wrap", borderTop: "1px solid var(--card-border)" }}>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
            Menampilkan {filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)} dari {filtered.length} mitra
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Baris</label>
            <select className="input-field" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} style={{ width: "76px", padding: "5px 8px" }}>
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <button className="btn" disabled={currentPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} style={{ padding: "5px 10px", fontSize: "0.8rem" }}>←</button>
            <span style={{ fontSize: "0.82rem" }}>{currentPage} / {totalPages}</span>
            <button className="btn" disabled={currentPage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} style={{ padding: "5px 10px", fontSize: "0.8rem" }}>→</button>
          </div>
        </div>
      </section>

      {modalOpen && (
        <div
          onClick={closeModal}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.62)", backdropFilter: "blur(5px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: "16px" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass-panel"
            style={{ width: "100%", maxWidth: "1040px", maxHeight: "92vh", overflowY: "auto", padding: "22px 26px" }}
            role="dialog"
            aria-modal="true"
            aria-label={editRow ? `Edit mitra ${editRow.noId}` : "Tambah mitra PUMK"}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", marginBottom: "12px" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.2rem" }}>{editRow ? "Edit Mitra PUMK" : "Tambah Mitra PUMK"}</h2>
                <div style={{ marginTop: "4px", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  {editRow ? `NO ID ${editRow.noId}` : "Isi data mitra baru. Field bertanda * wajib."}
                </div>
              </div>
              <button className="btn" onClick={closeModal} style={{ background: "rgba(255,255,255,0.1)", padding: "6px 12px" }} aria-label="Tutup">
                ✕
              </button>
            </div>

            {formError && (
              <div style={{ marginBottom: "12px", padding: "10px 14px", borderRadius: "8px", background: "rgba(239,68,68,0.1)", color: "var(--danger)", fontSize: "0.85rem" }}>
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              {PUMK_DB_GROUPS.map((group) => {
                const fields = PUMK_DB_FIELDS.filter((f) => f.group === group);
                if (fields.length === 0) return null;
                return (
                  <div key={group} style={{ marginBottom: "10px" }}>
                    <h3 style={{ margin: "10px 0 8px", fontSize: "0.92rem", fontWeight: 700, color: "#0369a1", borderBottom: "1px solid var(--card-border)", paddingBottom: "5px" }}>
                      {group}
                    </h3>
                    <div className="pumk-db-grid">
                      {fields.map((field) => {
                        const isTextarea = field.type === "textarea";
                        const span = field.wide || isTextarea ? "span-12" : field.type === "number" ? "span-3" : "span-6";
                        return (
                          <div key={field.key} className={span}>
                            <label style={{ display: "block", marginBottom: "5px", fontSize: "0.8rem", fontWeight: 600 }}>
                              {field.label}{field.required ? " *" : ""}
                            </label>
                            {field.type === "select" ? (
                              <select
                                className="input-field"
                                value={form[field.key] || ""}
                                onChange={(e) => setField(field.key, e.target.value)}
                                style={{ width: "100%" }}
                              >
                                {(field.options || [""]).map((opt) => (
                                  <option key={opt || "blank"} value={opt}>
                                    {opt ? formatUnitDisplay(opt) : "— Belum ditetapkan —"}
                                  </option>
                                ))}
                              </select>
                            ) : isTextarea ? (
                              <textarea
                                className="input-field"
                                rows={2}
                                value={form[field.key] || ""}
                                onChange={(e) => setField(field.key, e.target.value)}
                                placeholder={field.placeholder}
                                style={{ width: "100%", resize: "vertical" }}
                              />
                            ) : (
                              <input
                                className="input-field"
                                type={field.type === "number" ? "number" : field.type === "url" ? "url" : "text"}
                                min={field.type === "number" ? 0 : undefined}
                                step={field.type === "number" ? 1 : undefined}
                                value={form[field.key] || ""}
                                onChange={(e) => setField(field.key, e.target.value)}
                                placeholder={field.placeholder}
                                style={{ width: "100%" }}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", marginTop: "16px", paddingTop: "14px", borderTop: "1px solid var(--card-border)", flexWrap: "wrap" }}>
                <div>
                  {editRow?.id && (
                    <button type="button" className="btn" onClick={handleDelete} disabled={saving || deleting} style={{ background: "rgba(239,68,68,0.12)", color: "var(--danger)", border: "1px solid rgba(239,68,68,0.35)" }}>
                      {deleting ? "Menghapus…" : "Hapus Mitra"}
                    </button>
                  )}
                </div>
                <div style={{ display: "flex", gap: "10px" }}>
                  <button type="button" className="btn" onClick={closeModal} disabled={saving || deleting} style={{ background: "rgba(255,255,255,0.1)" }}>Batal</button>
                  <button type="submit" className="btn btn-primary" disabled={saving || deleting}>
                    {saving ? "Menyimpan…" : editRow ? "Simpan Perubahan" : "Tambah Mitra"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .pumk-db-grid {
          display: grid;
          grid-template-columns: repeat(12, minmax(0, 1fr));
          gap: 10px 12px;
        }
        .pumk-db-grid .span-3 { grid-column: span 3; }
        .pumk-db-grid .span-6 { grid-column: span 6; }
        .pumk-db-grid .span-12 { grid-column: span 12; }
        .pumk-db-grid .input-field { box-sizing: border-box; }
        @media (max-width: 900px) {
          .pumk-db-grid .span-3, .pumk-db-grid .span-6 { grid-column: span 6; }
          .pumk-db-grid .span-12 { grid-column: span 12; }
        }
        @media (max-width: 600px) {
          .pumk-db-grid > div { grid-column: span 12 !important; }
        }
      `}</style>
    </div>
  );
}
