"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/authContext";
import { useRouter } from "next/navigation";
import { ROLE_LABELS, UNIT_OPTIONS } from "@/lib/roles";

interface ManagedUser {
  id: string;
  nip: string | null;
  email: string | null;
  name: string | null;
  role: string | null;
  unitId: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
}

interface AccountRequestItem {
  id: string;
  nip: string;
  name: string;
  role: string;
  unitId: string | null;
  email: string;
  phone?: string | null;
  status: string;
  emailSent?: boolean;
  emailError?: string | null;
  createdAt?: string;
  note?: string | null;
}

const ROLE_OPTIONS = ["staff", "team_leader", "asman", "admin_uid", "administrator"];

export default function AdminUsersPage() {
  const { user, getToken } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Form tambah akun
  const [nip, setNip] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("staff");
  const [unitId, setUnitId] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);

  // Pengajuan akun dari publik (/ajukan-akun)
  const [requests, setRequests] = useState<AccountRequestItem[]>([]);
  const [reqLoading, setReqLoading] = useState(false);

  async function authHeaders(): Promise<HeadersInit> {
    let token = await getToken();
    const headers: HeadersInit = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return headers;
  }

  async function loadData() {
    try {
      setLoading(true);
      setError(null);
      let res = await fetch("/api/users", { headers: await authHeaders(), cache: "no-store" });
      if (res.status === 401) {
        await getToken(true);
        res = await fetch("/api/users", { headers: await authHeaders(), cache: "no-store" });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `API ${res.status}`);
      setUsers(data.users || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
    await loadRequests();
  }

  async function loadRequests() {
    try {
      setReqLoading(true);
      const res = await fetch("/api/account-requests", { headers: await authHeaders(), cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `API ${res.status}`);
      setRequests(data.requests || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setReqLoading(false);
    }
  }

  const handleApprove = async (r: AccountRequestItem) => {
    if (!confirm(`Setujui NIP ${r.nip} (${ROLE_LABELS[r.role] || r.role}, ${r.unitId})? Password awal acak akan dikirim ke ${r.email}.`)) return;
    try {
      const data = await callApi(`/api/account-requests/${r.id}`, "PATCH", { action: "approve" });
      if (data.emailSent) {
        setMsg(`NIP ${r.nip} disetujui. Kredensial terkirim ke ${r.email}.`);
      } else {
        setMsg(`NIP ${r.nip} disetujui TAPI email gagal (${data.emailError || "SMTP belum dikonfigurasi"}). Password awal: ${data.tempPassword} — sampaikan manual.`);
      }
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleReject = async (r: AccountRequestItem) => {
    const note = prompt(`Tolak pengajuan NIP ${r.nip}? Alasan (opsional):`) ?? undefined;
    // prompt batal = undefined → jangan lanjut; string (termasuk "") = lanjut.
    if (note === undefined) return;
    try {
      await callApi(`/api/account-requests/${r.id}`, "PATCH", { action: "reject", note });
      setMsg(`Pengajuan NIP ${r.nip} ditolak.`);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => {
    if (!user) return;
    if (user.role !== "administrator" && user.role !== "admin_uid" && (user.role as string) !== "admin") {
      router.replace("/beranda");
      return;
    }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function callApi(url: string, method: string, body?: unknown) {
    setMsg(null);
    setError(null);
    const res = await fetch(url, {
      method,
      headers: { ...(await authHeaders()), "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `API ${res.status}`);
    return data;
  }

  const handleCreate = async () => {
    if (!nip || !password) {
      setError("NIP dan password awal wajib diisi.");
      return;
    }
    if ((role === "staff" || role === "team_leader" || role === "asman") && !unitId) {
      setError("Unit wajib dipilih untuk Staff / Team Leader / Asman.");
      return;
    }
    try {
      setCreating(true);
      await callApi("/api/users", "POST", { nip, name, role, unitId, password });
      setMsg(`Akun NIP ${nip} (${ROLE_LABELS[role]}) berhasil dibuat. Sampaikan password awal ke pengguna.`);
      setNip("");
      setName("");
      setUnitId("");
      setPassword("");
      setRole("staff");
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleRoleChange = async (u: ManagedUser, nextRole: string) => {
    if (u.role === nextRole) return;
    if (!confirm(`Ubah NIP ${u.nip} dari ${ROLE_LABELS[u.role || ""]} menjadi ${ROLE_LABELS[nextRole]}?`)) return;
    try {
      await callApi(`/api/users/${u.id}`, "PATCH", { role: nextRole });
      setMsg(`Role NIP ${u.nip} diubah menjadi ${ROLE_LABELS[nextRole]}.`);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUnitChange = async (u: ManagedUser, nextUnit: string) => {
    try {
      await callApi(`/api/users/${u.id}`, "PATCH", { unitId: nextUnit });
      setMsg(`Unit NIP ${u.nip} diubah.`);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleResetPassword = async (u: ManagedUser) => {
    const pw = prompt(`Password baru untuk NIP ${u.nip} (min 6 karakter):`);
    if (!pw) return;
    try {
      await callApi(`/api/users/${u.id}`, "PATCH", { newPassword: pw });
      setMsg(`Password NIP ${u.nip} direset. Pengguna wajib ganti saat login berikutnya.`);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleToggleActive = async (u: ManagedUser) => {
    const action = u.isActive ? "nonaktifkan" : "aktifkan kembali";
    if (!confirm(`${action === "nonaktifkan" ? "Nonaktifkan" : "Aktifkan"} akun NIP ${u.nip}?`)) return;
    try {
      if (u.isActive) {
        await callApi(`/api/users/${u.id}`, "DELETE");
      } else {
        await callApi(`/api/users/${u.id}`, "PATCH", { isActive: true });
      }
      setMsg(`Akun NIP ${u.nip} berhasil di${action}.`);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const canEdit = (targetRole: string | null) => {
    if (user?.role === "administrator" || (user?.role as string) === "admin") return true;
    if (user?.role === "admin_uid")
      return targetRole === "staff" || targetRole === "team_leader" || targetRole === "asman";
    return false;
  };

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
      <header style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "2rem", margin: 0, color: "#111" }}>Kelola Pengguna</h1>
        <p style={{ margin: "6px 0 0 0", fontSize: "0.9rem", color: "var(--text-muted)" }}>
          Daftarkan NIP, tentukan role & unit, reset password, dan nonaktifkan akun mutasi/keluar.
        </p>
      </header>

      {msg && (
        <div style={{ marginBottom: "16px", padding: "10px 18px", borderRadius: "10px", fontSize: "0.875rem", background: "rgba(16, 185, 129, 0.12)", color: "var(--success)", border: "1px solid var(--card-border)" }}>
          {msg}
        </div>
      )}
      {error && (
        <div style={{ marginBottom: "16px", padding: "10px 18px", borderRadius: "10px", fontSize: "0.875rem", background: "rgba(239, 68, 68, 0.1)", color: "var(--danger)", border: "1px solid var(--card-border)" }}>
          {error}
        </div>
      )}

      {/* Form tambah akun */}
      <section className="glass-panel" style={{ padding: "20px 24px", marginBottom: "24px" }}>
        <h2 style={{ margin: "0 0 16px 0", fontSize: "1.05rem", fontWeight: 700 }}>Daftarkan NIP Baru</h2>
        <div className="filter-bar" style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>NIP</label>
            <input className="input-field" placeholder="7191037J" value={nip} onChange={(e) => setNip(e.target.value.replace(/[^0-9a-zA-Z]/g, "").toUpperCase())} style={{ minWidth: "150px" }} />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>Nama</label>
            <input className="input-field" placeholder="Nama pegawai" value={name} onChange={(e) => setName(e.target.value)} style={{ minWidth: "180px" }} />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>Role</label>
            <select className="input-field" value={role} onChange={(e) => setRole(e.target.value)} style={{ minWidth: "150px" }}>
              {ROLE_OPTIONS.filter((r) =>
                user?.role === "administrator" || (user?.role as string) === "admin"
                  ? true
                  : ["staff", "team_leader", "asman"].includes(r)
              ).map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>Unit</label>
            <select className="input-field" value={unitId} onChange={(e) => setUnitId(e.target.value)} style={{ minWidth: "170px" }}>
              <option value="">— Pilih unit —</option>
              {UNIT_OPTIONS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>Password awal</label>
            <input className="input-field" type="text" placeholder="Min 6 karakter" value={password} onChange={(e) => setPassword(e.target.value)} style={{ minWidth: "160px" }} />
          </div>
          <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>
            {creating ? "Menyimpan..." : "Daftarkan"}
          </button>
        </div>
        <p style={{ marginTop: "12px", fontSize: "0.8rem", color: "var(--text-muted)" }}>
          Pengguna wajib mengganti password awal saat login pertama. Admin UID hanya boleh mendaftarkan Staff / Team Leader / Asman.
        </p>
      </section>

      {/* Pengajuan akun publik */}
      <section className="glass-panel" style={{ padding: "20px 24px", marginBottom: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
          <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>
            Pengajuan Akun Masuk {requests.filter((r) => r.status === "pending").length > 0 && (
              <span style={{ marginLeft: "8px", fontSize: "0.75rem", background: "#f59e0b", color: "white", borderRadius: "999px", padding: "2px 10px" }}>
                {requests.filter((r) => r.status === "pending").length} pending
              </span>
            )}
          </h2>
          <button className="btn" onClick={loadRequests} style={{ background: "white", border: "1px solid var(--card-border)", fontSize: "0.85rem" }}>
            {reqLoading ? "Memuat..." : "Muat ulang"}
          </button>
        </div>
        {requests.length === 0 ? (
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Belum ada pengajuan.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--card-border)" }}>
                  {["NIP", "NAMA", "ROLE", "UNIT", "EMAIL", "STATUS", "AKSI"].map((c) => (
                    <th key={c} style={{ padding: "10px 12px", textAlign: "left", color: "var(--text-muted)", fontSize: "0.72rem", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid var(--card-border)" }}>
                    <td style={{ padding: "10px 12px", fontWeight: 600, whiteSpace: "nowrap" }}>{r.nip}</td>
                    <td style={{ padding: "10px 12px" }}>{r.name}</td>
                    <td style={{ padding: "10px 12px" }}>{ROLE_LABELS[r.role] || r.role}</td>
                    <td style={{ padding: "10px 12px" }}>{r.unitId || "-"}</td>
                    <td style={{ padding: "10px 12px" }}>{r.email}{r.phone ? <span style={{ color: "var(--text-muted)" }}> • {r.phone}</span> : null}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 600, color: "white",
                        background: r.status === "pending" ? "#f59e0b" : r.status === "approved" ? "#10b981" : "#6b7280" }}>
                        {r.status === "pending" ? "Pending" : r.status === "approved" ? `Disetujui${r.emailSent === false ? " (email gagal)" : ""}` : "Ditolak"}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                      {r.status === "pending" && canEdit(r.role) && (
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button onClick={() => handleApprove(r)} style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid var(--card-border)", background: "rgba(16,185,129,0.12)", color: "var(--success)", cursor: "pointer", fontSize: "0.78rem" }}>
                            Setujui + kirim email
                          </button>
                          <button onClick={() => handleReject(r)} style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid var(--card-border)", background: "rgba(239,68,68,0.1)", color: "var(--danger)", cursor: "pointer", fontSize: "0.78rem" }}>
                            Tolak
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p style={{ marginTop: "10px", fontSize: "0.78rem", color: "var(--text-muted)" }}>
          Approve membuat akun + password acak 10 karakter, lalu mengirim NIP + password ke email. Bila SMTP belum diset / gagal, password ditampilkan ke admin untuk disampaikan manual. Siap disambung kirim via WA tahap berikutnya (field no. WA sudah disimpan).
        </p>
      </section>

      {/* Tabel pengguna */}
      <section style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "16px", overflow: "hidden" }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--card-border)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
          <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>Daftar Akun</h2>
          <button className="btn" onClick={loadData} style={{ background: "white", border: "1px solid var(--card-border)", fontSize: "0.85rem" }}>
            Muat ulang
          </button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--card-border)" }}>
                {["NIP", "NAMA", "ROLE", "UNIT", "STATUS", "AKSI"].map((c) => (
                  <th key={c} style={{ padding: "12px 16px", textAlign: "left", color: "var(--text-muted)", fontWeight: "bold", fontSize: "0.75rem", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: "48px", color: "var(--text-muted)" }}>Memuat...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: "48px", color: "var(--text-muted)" }}>Belum ada akun terdaftar.</td></tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} style={{ borderBottom: "1px solid var(--card-border)", opacity: u.isActive ? 1 : 0.55 }}>
                    <td style={{ padding: "13px 16px", fontWeight: 600, whiteSpace: "nowrap" }}>
                      {u.nip || "-"}
                      {u.mustChangePassword && <span title="Belum ganti password awal" style={{ marginLeft: "8px", fontSize: "0.7rem", color: "var(--warning)", fontWeight: 700 }}>● PW AWAL</span>}
                    </td>
                    <td style={{ padding: "13px 16px" }}>{u.name || "-"}</td>
                    <td style={{ padding: "13px 16px" }}>
                      {canEdit(u.role) ? (
                        <select
                          className="input-field"
                          value={u.role || "staff"}
                          onChange={(e) => handleRoleChange(u, e.target.value)}
                          style={{ padding: "6px 10px", fontSize: "0.8rem", minWidth: "130px" }}
                        >
                          {ROLE_OPTIONS.filter((r) =>
                            user?.role === "administrator" || (user?.role as string) === "admin"
                              ? true
                              : ["staff", "team_leader", "asman"].includes(r)
                          ).map((r) => (
                            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                          ))}
                        </select>
                      ) : (
                        <span>{ROLE_LABELS[u.role || ""] || u.role}</span>
                      )}
                    </td>
                    <td style={{ padding: "13px 16px" }}>
                      {canEdit(u.role) ? (
                        <select
                          className="input-field"
                          value={(UNIT_OPTIONS as readonly string[]).includes(u.unitId || "") ? (u.unitId || "") : ""}
                          onChange={(e) => handleUnitChange(u, e.target.value)}
                          style={{ padding: "6px 10px", fontSize: "0.8rem", minWidth: "150px" }}
                        >
                          <option value="">— Pilih unit —</option>
                          {!(UNIT_OPTIONS as readonly string[]).includes(u.unitId || "") && u.unitId ? (
                            <option value={u.unitId || ""}>{u.unitId} (lama)</option>
                          ) : null}
                          {UNIT_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : (
                        u.unitId || "-"
                      )}
                    </td>
                    <td style={{ padding: "13px 16px" }}>
                      <span style={{
                        display: "inline-block", padding: "3px 10px", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 600, color: "white",
                        background: u.isActive ? "#10b981" : "#6b7280",
                      }}>
                        {u.isActive ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>
                    <td style={{ padding: "13px 16px", whiteSpace: "nowrap" }}>
                      {canEdit(u.role) && u.id !== user?.uid && (
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button onClick={() => handleResetPassword(u)} style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid var(--card-border)", background: "white", cursor: "pointer", fontSize: "0.78rem" }}>
                            Reset PW
                          </button>
                          <button onClick={() => handleToggleActive(u)} style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid var(--card-border)", background: u.isActive ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.12)", color: u.isActive ? "var(--danger)" : "var(--success)", cursor: "pointer", fontSize: "0.78rem" }}>
                            {u.isActive ? "Nonaktifkan" : "Aktifkan"}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
