"use client";

import React, { useEffect, useState } from "react";

interface MetricCardProps {
  title: string;
  initialValue: number;
  icon: string;
  color: string;
}

export default function MetricCard({ title, initialValue, icon, color }: MetricCardProps) {
  const [isUpdating, setIsUpdating] = useState(false);

  // When initialValue changes (from parent fetching new data), we show an update animation
  useEffect(() => {
    setIsUpdating(true);
    const timeout = setTimeout(() => setIsUpdating(false), 500);
    return () => clearTimeout(timeout);
  }, [initialValue]);


  return (
    <div className="glass-card" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px", position: "relative", overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: `rgba(${color}, 0.1)`, display: "flex", alignItems: "center", justifyContent: "center", color: `rgb(${color})`, fontSize: "1.2rem" }}>
            {icon}
          </div>
          <h3 style={{ margin: 0, fontSize: "1rem", color: "var(--text-muted)" }}>{title}</h3>
        </div>
        <div className="live-indicator" style={{ backgroundColor: `rgb(${color})`, boxShadow: `0 0 10px rgb(${color})` }} title="Live Data" />
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
        <h2 style={{ 
          fontSize: "2.5rem", 
          margin: 0, 
          color: isUpdating ? `rgb(${color})` : "var(--text-main)",
          transition: "color 0.3s ease",
          textShadow: isUpdating ? `0 0 15px rgba(${color}, 0.5)` : "none"
        }}>
          {initialValue.toLocaleString()}
        </h2>
      </div>
    </div>
  );
}
