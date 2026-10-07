"use client";

import Link from "next/link";
import { useAuth } from "@/lib/authContext";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ROLE_LABELS, formatUnitDisplay } from "@/lib/roles";

interface SubMenu {
  name: string;
  href: string;
  icon: string;
  desc: string;
  adminOnly?: boolean;
  /** Hanya super admin (administrator). */
  superAdminOnly?: boolean;
  /** Hanya role unit (staff/team_leader/asman) + administrator. Disembunyikan dari admin_uid. */
  unitOnly?: boolean;
}

interface MainMenu {
  name: string;
  icon: string;
  href?: string;
  children?: SubMenu[];
}

const MENUS: MainMenu[] = [
  { name: "Beranda", icon: "🏠", href: "/beranda" },
  { name: "Profil", icon: "👤", href: "/profil" },
  { name: "EVP", icon: "🤝", href: "/evp" },
  {
    name: "Medsos",
    icon: "📱",
    children: [
      { name: "Skoring Medsos", href: "/dashboard", icon: "📊", desc: "Live monitoring & ringkasan" },
      { name: "Input Medmas", href: "/dashboard/medmas", icon: "📰", desc: "Pemberitaan media massa", unitOnly: true },
      { name: "Rekap Bulanan", href: "/dashboard/rekap", icon: "📑", desc: "Medmas + Medsos per bulan" },
      { name: "Draf Saya", href: "/dashboard/drafts", icon: "📝", desc: "Buat rencana postingan", unitOnly: true },
      { name: "Review Draf", href: "/admin/drafts", icon: "✅", desc: "Validasi ajuan user", superAdminOnly: true },
      { name: "Kelola Target", href: "/admin/target", icon: "⚙️", desc: "Atur target tiap akun", adminOnly: true },
    ],
  },
  {
    name: "Press Release",
    icon: "📰",
    children: [
      { name: "Monitoring Press Release", href: "/press-release/monitoring", icon: "📡", desc: "Pantau rilis dari spreadsheet" },
      { name: "Draf Press Release", href: "/press-release/drafts", icon: "📝", desc: "Ajukan siaran pers baru" },
      { name: "Review Press Release", href: "/admin/press-drafts", icon: "✅", desc: "Validasi ajuan user", adminOnly: true },
      { name: "Kelola Sumber", href: "/admin/press-sources", icon: "🔗", desc: "Atur spreadsheet per tahun", adminOnly: true },
    ],
  },
  {
    name: "PUMK",
    icon: "💰",
    children: [
      { name: "Monitoring PUMK", href: "/pumk/monitoring", icon: "📉", desc: "Tunggakan UP3 Bintaro dari database UID" },
      { name: "Laporan Kunjungan", href: "/pumk/kunjungan", icon: "📝", desc: "Pengganti g-form laporan UMK" },
    ],
  },
  {
    name: "Stakeholder",
    icon: "🤝",
    children: [
      { name: "Database Stakeholder", href: "/stakeholder/database", icon: "📇", desc: "Data + kelengkapan per unit" },
      { name: "Realisasi Kegiatan", href: "/stakeholder/realisasi", icon: "📝", desc: "Input KPI 5 & 6 + bukti" },
      { name: "Review Asman", href: "/stakeholder/review", icon: "🔍", desc: "ACC / tolak kiriman TL" },
      { name: "Evaluasi UID", href: "/stakeholder/evaluasi", icon: "✅", desc: "Evaluasi final lintas unit" },
      { name: "Rekap KPI", href: "/stakeholder/rekap", icon: "📊", desc: "Capaian vs target per bulan" },
    ],
  },
  {
    name: "Administrator",
    icon: "🛡️",
    children: [
      { name: "Kelola Pengguna", href: "/admin/users", icon: "👥", desc: "NIP, role & status akun", superAdminOnly: true },
    ],
  },
];

function itemStyle(isActive: boolean): React.CSSProperties {
  return {
    padding: "12px 16px",
    borderRadius: "10px",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    background: isActive ? "linear-gradient(90deg, rgba(59, 130, 246, 0.2) 0%, transparent 100%)" : "transparent",
    borderLeft: isActive ? "3px solid var(--primary)" : "3px solid transparent",
    transition: "all 0.3s ease",
    cursor: "pointer",
    color: isActive ? "var(--text-main)" : "var(--text-muted)",
  };
}

export default function Sidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const isAdmin = user?.role === "administrator" || user?.role === "admin_uid" || user?.role === "admin";
  const isSuperAdmin = user?.role === "administrator" || user?.role === "admin";
  const isUnitRole = user?.role === "staff" || user?.role === "team_leader" || user?.role === "asman";
  // Default: semua menu utama tertutup; hanya terbuka saat diklik,
  // atau otomatis saat salah satu sub menu-nya sedang aktif.
  const [open, setOpen] = useState<Record<string, boolean>>({});
  // Di HP navigasi disembunyikan di balik tombol hamburger.
  const [mobileOpen, setMobileOpen] = useState(false);

  const isChildActive = (menu: MainMenu) =>
    !!menu.children?.some((s) => pathname === s.href || pathname.startsWith(s.href + "/"));

  const isExpanded = (menu: MainMenu) => open[menu.name] ?? isChildActive(menu);

  const toggle = (menu: MainMenu) =>
    setOpen((o) => ({ ...o, [menu.name]: !isExpanded(menu) }));

  return (
    <div className="glass-panel sidebar-container">
      <div>
        <div className="sidebar-header" style={{ padding: "0 24px", marginBottom: "40px" }}>
          <div>
            <img src="/pln.svg" alt="Logo PLN" style={{ width: "130px", height: "auto", display: "block" }} />
            <div style={{ marginTop: "8px", fontSize: "1.25rem", fontWeight: 700, color: "#111", whiteSpace: "nowrap" }}>{formatUnitDisplay(user?.unitId)}</div>
            {user?.name && <div style={{ marginTop: "6px", fontSize: "0.9rem", fontWeight: 600, color: "#111" }}>{user.name}</div>}
            <p style={{ fontSize: "0.8rem", marginTop: "5px" }}>
              Role: <span style={{ color: isAdmin ? "var(--danger)" : "var(--success)", fontWeight: "bold" }}>{ROLE_LABELS[user?.role || ""] || user?.role}</span>
              {user?.nip && <span style={{ color: "var(--text-muted)" }}> • {user.nip}</span>}
              {user?.unitId && <span style={{ color: "var(--text-muted)" }}> • {user.unitId}</span>}
            </p>
          </div>
          <button className="sidebar-toggle" onClick={() => setMobileOpen((o) => !o)} aria-label="Buka/tutup menu navigasi">
            {mobileOpen ? "✕" : "☰"}
          </button>
        </div>

        <nav
          className={`sidebar-nav${mobileOpen ? " mobile-open" : ""}`}
          style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "0 12px" }}
          onClick={(e) => { if ((e.target as HTMLElement).closest("a")) setMobileOpen(false); }}
        >
          {MENUS.map((menu) => {
            // Menu utama tanpa anak = link langsung
            if (!menu.children) {
              const isActive = pathname === menu.href;
              return (
                <Link key={menu.name} href={menu.href!}>
                  <div
                    style={itemStyle(isActive)}
                    onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                    onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                  >
                    <span style={{ fontWeight: isActive ? "600" : "500" }}>{menu.name}</span>
                  </div>
                </Link>
              );
            }

            // Menu utama dengan sub menu (akordeon)
            const visibleSubs = menu.children.filter(
              (s) => (!s.adminOnly || isAdmin) && (!s.superAdminOnly || isSuperAdmin) && (!s.unitOnly || isUnitRole || isSuperAdmin)
            );
            if (visibleSubs.length === 0) return null;
            const expanded = isExpanded(menu);
            const activeParent = isChildActive(menu);

            return (
              <div key={menu.name}>
                <div
                  style={{
                    ...itemStyle(activeParent && !expanded),
                    justifyContent: "space-between",
                  }}
                  onClick={() => toggle(menu)}
                  onMouseEnter={(e) => { if (!(activeParent && !expanded)) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                  onMouseLeave={(e) => { if (!(activeParent && !expanded)) e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{ fontWeight: activeParent ? "600" : "500" }}>{menu.name}</span>
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{expanded ? "▾" : "▸"}</span>
                </div>

                {expanded && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginTop: "4px", marginLeft: "14px", paddingLeft: "10px", borderLeft: "1px solid var(--card-border)" }}>
                    {visibleSubs.map((sub) => {
                      const isActive = pathname === sub.href;
                      return (
                        <Link key={sub.name} href={sub.href}>
                          <div
                            style={{ ...itemStyle(isActive), padding: "10px 12px" }}
                            onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                            onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                          >
                            <span>
                              <span style={{ display: "block", fontWeight: isActive ? "600" : "500", fontSize: "0.9rem" }}>{sub.name}</span>
                              <span style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)" }}>{sub.desc}</span>
                            </span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>

      <div className={`sidebar-footer${mobileOpen ? " mobile-open" : ""}`} style={{ padding: "0 24px" }}>
        <button
          className="btn"
          style={{ width: "100%", background: "rgba(239, 68, 68, 0.1)", color: "var(--danger)", border: "1px solid rgba(239, 68, 68, 0.2)" }}
          onClick={logout}
        >
          Logout
        </button>
      </div>
    </div>
  );
}
