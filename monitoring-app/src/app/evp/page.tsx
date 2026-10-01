"use client";

export const EVP_FORM_URL = "https://volunteer.tjslpln.id/form";

export default function EvpPage() {
  return (
    <div style={{ maxWidth: "800px", margin: "0 auto" }}>
      <header className="responsive-header">
        <div>
          <h1 style={{ fontSize: "2.2rem", margin: 0, color: "#111" }}>EVP</h1>
          <p style={{ margin: "5px 0 0 0", color: "#111" }}>
            Pengisian form volunteer TJSL PLN.
          </p>
        </div>
      </header>

      <div className="glass-panel" style={{ padding: "32px", textAlign: "center" }}>
        <div style={{ fontSize: "3rem", marginBottom: "12px" }}>📋</div>
        <h2 style={{ fontSize: "1.25rem", margin: "0 0 8px 0" }}>Form Volunteer TJSL PLN</h2>
        <p style={{ fontSize: "0.9rem", color: "var(--text-muted)", margin: "0 0 24px 0" }}>
          Klik tombol di bawah untuk membuka dan mengisi form pendaftaran volunteer
          di situs resmi TJSL PLN. Form terbuka di tab baru.
        </p>
        <a href={EVP_FORM_URL} target="_blank" rel="noopener noreferrer">
          <button className="btn" style={{ fontSize: "1rem", padding: "14px 36px" }}>
            Isi Form EVP ↗
          </button>
        </a>
        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "16px 0 0 0" }}>
          volunteer.tjslpln.id
        </p>
      </div>
    </div>
  );
}
