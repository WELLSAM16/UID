"use client";

import { useState } from "react";
import Link from "next/link";

export default function LupaSandiPage() {
  const [nip, setNip] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const submit = async () => {
    setError(null);
    if (!nip.trim() || !name.trim()) {
      setError("NIP dan nama lengkap wajib diisi (nama harus sama dengan data akun).");
      return;
    }
    try {
      setSending(true);
      const res = await fetch("/api/password-resets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nip, name, email: email.trim() || undefined }),
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
          Lupa Sandi
        </h2>
        <p style={{ margin: "0 0 24px 0", fontSize: "0.9rem", color: "var(--text-muted)", textAlign: "center" }}>
          Isi NIP + nama sesuai akun. Super admin akan mereset lalu mengirim info akun (NIP + password default) ke email kontak Anda.
        </p>

        {ok ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ padding: "14px 18px", borderRadius: "10px", background: "rgba(16,185,129,0.12)", color: "var(--success)", fontSize: "0.9rem", marginBottom: "20px" }}>
              Permintaan diterima dan diteruskan ke super admin. Setelah direset, login dengan password default lalu Anda wajib mengganti sandi.
            </div>
            <Link href="/login">
              <button className="btn" style={{ background: "#38bdf8", color: "white" }}>Kembali ke Login</button>
            </Link>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px", textAlign: "left" }}>
            {error && (
              <div style={{ padding: "10px 14px", borderRadius: "8px", fontSize: "0.875rem", background: "rgba(239,68,68,0.1)", color: "var(--danger)" }}>
                {error}
              </div>
            )}
            <div>
              <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>NIP</label>
              <input className="input-field" placeholder="cth: 7191037J" value={nip}
                onChange={(e) => setNip(e.target.value.replace(/[^0-9a-zA-Z]/g, "").toUpperCase())} />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>Nama lengkap pegawai</label>
              <input className="input-field" placeholder="Harus sama persis dengan nama di akun" value={name}
                onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 600 }}>
                Email kontak <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(opsional, untuk terima info akun)</span>
              </label>
              <input className="input-field" type="email" placeholder="nama@pln.co.id" value={email}
                onChange={(e) => setEmail(e.target.value.trim())} />
            </div>
            <button className="btn" style={{ background: "#38bdf8", color: "white", marginTop: "4px" }}
              onClick={submit} disabled={sending}>
              {sending ? "Mengirim..." : "Minta Reset Sandi"}
            </button>
            <Link href="/login" style={{ textAlign: "center", fontSize: "0.85rem" }}>
              Kembali ke Login
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
