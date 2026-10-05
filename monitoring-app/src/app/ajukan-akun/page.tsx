"use client";

import { useState } from "react";
import Link from "next/link";
import { ROLE_LABELS, UNIT_OPTIONS } from "@/lib/roles";
import { REQUESTABLE_ROLES } from "@/lib/accountRequests";

export default function AjukanAkunPage() {
  const [nip, setNip] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<string>("staff");
  const [unitId, setUnitId] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const submit = async () => {
    setError(null);
    if (!nip.trim() || !name.trim() || !unitId || !email.trim()) {
      setError("NIP, nama lengkap, unit, dan email wajib diisi.");
      return;
    }
    try {
      setSending(true);
      const res = await fetch("/api/account-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nip, name, role, unitId, email, phone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Gagal mengirim (${res.status})`);
      setOk(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="container flex-center" style={{ minHeight: "100vh", padding: "24px 12px" }}>
      <div className="glass-panel" style={{ padding: "32px", width: "100%", maxWidth: "520px" }}>
        <h2 style={{ fontSize: "1.6rem", margin: "0 0 8px 0", color: "#111", textAlign: "center" }}>
          Ajukan Pembuatan Akun
        </h2>
        <p style={{ margin: "0 0 24px 0", fontSize: "0.9rem", color: "var(--text-muted)", textAlign: "center" }}>
          Isi data di bawah. Administrator akan memeriksa lalu mengirim NIP + password awal ke email Anda.
        </p>

        {ok ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ padding: "14px 18px", borderRadius: "10px", background: "rgba(16,185,129,0.12)", color: "var(--success)", fontSize: "0.9rem", marginBottom: "20px" }}>
              Pengajuan diterima. Tunggu email berisi NIP + password awal dari administrator, lalu login dan wajib ganti password.
            </div>
            <Link href="/login">
              <button className="btn" style={{ background: "#38bdf8", color: "white" }}>Kembali ke Login</button>
            </Link>
          </div>
        ) : (
          <>
            {error && (
              <div style={{ marginBottom: "16px", padding: "10px 14px", borderRadius: "8px", fontSize: "0.875rem", background: "rgba(239,68,68,0.1)", color: "var(--danger)" }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "14px", textAlign: "left" }}>
              <div>
                <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>NIP</label>
                <input className="input-field" placeholder="cth: 7191037J" value={nip}
                  onChange={(e) => setNip(e.target.value.replace(/[^0-9a-zA-Z]/g, "").toUpperCase())} />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>Nama lengkap pegawai</label>
                <input className="input-field" placeholder="Nama sesuai kepegawaian" value={name}
                  onChange={(e) => setName(e.target.value)} />
              </div>
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 200px" }}>
                  <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>Role</label>
                  <select className="input-field" value={role} onChange={(e) => setRole(e.target.value)}>
                    {REQUESTABLE_ROLES.map((r) => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: "1 1 200px" }}>
                  <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>Unit</label>
                  <select className="input-field" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                    <option value="">— Pilih unit —</option>
                    {UNIT_OPTIONS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>Email (untuk terima NIP + password)</label>
                <input className="input-field" type="email" placeholder="nama@pln.co.id" value={email}
                  onChange={(e) => setEmail(e.target.value.trim())} />
              </div>
              <div>
                <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>
                  No. WA <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(opsional, untuk fitur kirim via WA berikutnya)</span>
                </label>
                <input className="input-field" placeholder="08xx" value={phone}
                  onChange={(e) => setPhone(e.target.value)} />
              </div>
              <button className="btn" style={{ background: "#38bdf8", color: "white", marginTop: "4px" }}
                onClick={submit} disabled={sending}>
                {sending ? "Mengirim..." : "Kirim Pengajuan"}
              </button>
              <Link href="/login" style={{ textAlign: "center", fontSize: "0.85rem" }}>
                Sudah punya akun? Login
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
