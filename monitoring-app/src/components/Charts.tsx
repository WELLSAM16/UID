"use client";

import { useEffect, useRef, useState } from "react";

/** Chart SVG manual ringan — tanpa dependensi tambahan. */

export function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="glass-card" style={{ padding: "20px 22px", minWidth: 0 }}>
      <div style={{ fontWeight: 700, fontSize: "1rem", color: "#111" }}>{title}</div>
      {sub && <div style={{ fontSize: "0.78rem", color: "#111", marginTop: "2px" }}>{sub}</div>}
      <div style={{ marginTop: "14px" }}>{children}</div>
    </div>
  );
}

/** Bar chart horizontal: label kiri, batang + angka. */
export function HBarChart({ data, color = "#38bdf8" }: { data: { label: string; value: number }[]; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {data.map((d) => (
        <div key={d.label} style={{ display: "grid", gridTemplateColumns: "130px 1fr 44px", gap: "10px", alignItems: "center", fontSize: "0.78rem" }}>
          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#111", fontWeight: 600 }} title={d.label}>
            {d.label}
          </div>
          <div style={{ background: "rgba(0,0,0,0.07)", borderRadius: "6px", height: "16px", overflow: "hidden" }}>
            <div
              title={`${d.label}: ${d.value}`}
              style={{ width: `${(d.value / max) * 100}%`, height: "100%", background: color, borderRadius: "6px", minWidth: d.value > 0 ? "4px" : "0" }}
            />
          </div>
          <div style={{ textAlign: "right", fontWeight: 700, color: "#111" }}>{d.value}</div>
        </div>
      ))}
      {data.length === 0 && <div style={{ fontSize: "0.8rem", color: "#111" }}>Belum ada data.</div>}
    </div>
  );
}

/** Donut chart + legenda. */
export function DonutChart({ data, size = 170, thickness = 30 }: { data: { label: string; value: number; color: string }[]; size?: number; thickness?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;
  const segs = data.map((d) => {
    const frac = total > 0 ? d.value / total : 0;
    const seg = { ...d, dash: frac * c, offset: acc * c, frac };
    acc += frac;
    return seg;
  });
  return (
    <div style={{ display: "flex", gap: "18px", alignItems: "center", flexWrap: "wrap" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Donut chart">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth={thickness} />
        {segs.map((s) =>
          s.value > 0 ? (
            <circle
              key={s.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${s.dash} ${c - s.dash}`}
              strokeDashoffset={-s.offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            >
              <title>{`${s.label}: ${s.value} (${Math.round(s.frac * 100)}%)`}</title>
            </circle>
          ) : null
        )}
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontSize="1.3rem" fontWeight={700} fill="#111">
          {total}
        </text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "0.8rem" }}>
        {segs.map((s) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: "8px", color: "#111" }}>
            <span style={{ width: "12px", height: "12px", borderRadius: "3px", background: s.color, display: "inline-block" }} />
            <span style={{ fontWeight: 600 }}>{s.label}</span>
            <span style={{ fontWeight: 700 }}>{s.value}</span>
            <span style={{ opacity: 0.7 }}>({total > 0 ? Math.round(s.frac * 100) : 0}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Line chart tren bulanan. */
export function LineChart({
  data,
  width = 560,
  height = 220,
  color = "#38bdf8",
}: {
  data: { label: string; short: string; value: number }[];
  width?: number;
  height?: number;
  color?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  // Lebar mengikuti wadah (HP) — chart menyusut, tak perlu geser.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [cw, setCw] = useState(width);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width || 0;
      if (w > 0) setCw(Math.max(300, Math.min(width, Math.round(w))));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  const padL = 36, padR = 12, padT = 12, padB = 28;
  const max = Math.max(1, ...data.map((d) => d.value));
  const iw = cw - padL - padR;
  const ih = height - padT - padB;
  const px = (i: number) => (data.length <= 1 ? padL + iw / 2 : padL + (i / (data.length - 1)) * iw);
  const py = (v: number) => padT + ih - (v / max) * ih;
  const pts = data.map((d, i) => `${px(i)},${py(d.value)}`).join(" ");
  const ticks = [0, 0.5, 1].map((f) => Math.round(max * f));
  return (
    <div ref={wrapRef} style={{ width: "100%" }}>
      <div style={{ position: "relative", width: cw }}>
        <svg width={cw} height={height} viewBox={`0 0 ${cw} ${height}`} role="img" aria-label="Line chart" style={{ display: "block", width: "100%" }}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={cw - padR} y1={py(t)} y2={py(t)} stroke="rgba(0,0,0,0.1)" strokeDasharray="4 4" />
              <text x={padL - 6} y={py(t) + 4} textAnchor="end" fontSize="10" fill="#111">{t}</text>
            </g>
          ))}
          <polyline points={pts} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          {data.map((d, i) => (
            <g key={d.label}>
              {/* area hover transparan yang lebar agar mudah kena kursor */}
              <circle
                cx={px(i)}
                cy={py(d.value)}
                r={12}
                fill="transparent"
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                <title>{`${d.label}: ${d.value}`}</title>
              </circle>
              <circle
                cx={px(i)}
                cy={py(d.value)}
                r={hover === i ? 5.5 : 3.5}
                fill={color}
                stroke="white"
                strokeWidth={1.5}
                style={{ pointerEvents: "none" }}
              />
              {(i % 2 === 0 || i === data.length - 1) && (
                <text x={px(i)} y={height - 8} textAnchor="middle" fontSize="10" fill="#111">{d.short}</text>
              )}
            </g>
          ))}
        </svg>
        {hover !== null && data[hover] && (
          <div
            style={{
              position: "absolute",
              left: Math.min(Math.max(px(hover), 70), cw - 70),
              top: Math.max(py(data[hover].value) - 48, 0),
              transform: "translateX(-50%)",
              background: "#111",
              color: "white",
              fontSize: "0.75rem",
              fontWeight: 600,
              padding: "6px 10px",
              borderRadius: "8px",
              whiteSpace: "nowrap",
              pointerEvents: "none",
              boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
              zIndex: 2,
            }}
          >
            {data[hover].label}: {data[hover].value} postingan
          </div>
        )}
      </div>
    </div>
  );
}
