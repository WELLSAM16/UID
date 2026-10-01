import Link from "next/link";

export default function Home() {
  return (
    <div className="container flex-center" style={{ minHeight: "100vh", flexDirection: "column", gap: "20px" }}>
      <div className="glass-panel" style={{ padding: "40px", textAlign: "center", maxWidth: "600px" }}>
        <img src="/pln.svg" alt="Logo PLN" style={{ width: "170px", height: "auto", margin: "0 auto 20px auto", display: "block" }} />
        <h1 style={{ fontSize: "2.5rem", marginBottom: "30px", color: "#111" }}>
          KU UP3 Bintaro
        </h1>
        <div style={{ display: "flex", gap: "15px", justifyContent: "center" }}>
          <Link href="/login">
            <button className="btn" style={{ background: "#38bdf8", color: "white" }}>Go to Login</button>
          </Link>
        </div>
      </div>
    </div>
  );
}
