"use client";

import { useMemo, useState } from "react";
import { formatUnitDisplay } from "@/lib/roles";
import { normalizeNoIdKey } from "@/lib/pumkTarget";

export interface PumkDbLookupItem {
  id: string;
  noId: string;
  noIdKey?: string;
  nama: string;
  unitId?: string;
  kolektibilitas?: string;
  totalSaldoJuli?: number;
  pks?: string;
  linkFolder?: string;
}

interface Props {
  title: string;
  unitId: string;
  items: PumkDbLookupItem[];
  loading?: boolean;
  error?: string;
  /** NO ID yang sudah terpilih saat picker dibuka. */
  initialSelected: string[];
  /** noIdKey → unit lain yang sudah memegang mitra pada tahun ini. */
  claimedBy?: Map<string, string>;
  onClose: () => void;
  onApply: (noIds: string[]) => void;
}

const keyOf = normalizeNoIdKey;

const rp = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n || 0);

const splitIds = (value: string): string[] =>
  value
    .split(/[\n,;]+/)
    .map((x) => x.trim())
    .filter(Boolean);

export default function PumkMitraPicker({
  title,
  unitId,
  items,
  loading = false,
  error = "",
  initialSelected,
  claimedBy,
  onClose,
  onApply,
}: Props) {
  const [selected, setSelected] = useState<string[]>(() => {
    const seen = new Set<string>();
    return initialSelected
      .map((x) => String(x).trim())
      .filter((x) => {
        if (!x) return false;
        const k = keyOf(x);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
  });
  const [search, setSearch] = useState("");
  const [manualId, setManualId] = useState("");
  const [manualNama, setManualNama] = useState("");
  const [paste, setPaste] = useState("");
  const [message, setMessage] = useState<{ type: "error" | "info"; text: string } | null>(
    null
  );

  const byKey = useMemo(() => {
    const map = new Map<string, PumkDbLookupItem>();
    for (const item of items) {
      const k = keyOf(item.noIdKey || item.noId);
      if (k && !map.has(k)) map.set(k, item);
    }
    return map;
  }, [items]);

  const selectedSet = useMemo(() => new Set(selected.map(keyOf)), [selected]);
  const unknownSelected = useMemo(
    () => selected.filter((noId) => !byKey.has(keyOf(noId))),
    [selected, byKey]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const unit = formatUnitDisplay(item.unitId || "");
      return (
        item.noId.toLowerCase().includes(q) ||
        item.nama.toLowerCase().includes(q) ||
        (item.kolektibilitas || "").toLowerCase().includes(q) ||
        (item.unitId || "").toLowerCase().includes(q) ||
        unit.toLowerCase().includes(q)
      );
    });
  }, [items, search]);

  const visible = filtered.slice(0, 250);

  const addId = (noId: string) => {
    const key = keyOf(noId);
    setSelected((prev) => {
      if (prev.some((x) => keyOf(x) === key)) return prev;
      const entry = byKey.get(key);
      return [...prev, entry ? entry.noId : String(noId).trim()];
    });
  };

  const removeId = (noId: string) => {
    const key = keyOf(noId);
    setSelected((prev) => prev.filter((x) => keyOf(x) !== key));
  };

  const handleManualAdd = () => {
    const id = manualId.trim();
    const nama = manualNama.trim();
    if (!id) {
      setMessage({ type: "error", text: "NO ID wajib diisi." });
      return;
    }
    if (!nama) {
      setMessage({ type: "error", text: "Nama mitra wajib diisi." });
      return;
    }
    const entry = byKey.get(keyOf(id));
    if (!entry) {
      setMessage({
        type: "error",
        text: `NO ID "${id}" tidak ada di database PUMK. Tambahkan dulu di menu Database PUMK.`,
      });
      return;
    }
    if (keyOf(entry.nama) !== keyOf(nama)) {
      setMessage({
        type: "error",
        text: `Nama tidak cocok dengan database. Nama untuk ${entry.noId}: "${entry.nama}".`,
      });
      return;
    }
    const other = claimedBy?.get(keyOf(id));
    if (other) {
      setMessage({
        type: "error",
        text: `${entry.noId} sudah ditargetkan ke ${formatUnitDisplay(other)} pada tahun ini.`,
      });
      return;
    }
    if (selectedSet.has(keyOf(id))) {
      setMessage({ type: "info", text: `${entry.noId} sudah ada di daftar pilihan.` });
      setManualId("");
      setManualNama("");
      return;
    }
    addId(entry.noId);
    setManualId("");
    setManualNama("");
    setMessage({ type: "info", text: `${entry.noId} — ${entry.nama} ditambahkan.` });
  };

  const handlePasteAdd = () => {
    const ids = splitIds(paste);
    if (ids.length === 0) {
      setMessage({ type: "error", text: "Tempel minimal satu NO ID." });
      return;
    }
    const unknown: string[] = [];
    const claimed: string[] = [];
    const accepted: string[] = [];
    for (const raw of ids) {
      const key = keyOf(raw);
      const entry = byKey.get(key);
      if (!entry) {
        unknown.push(raw);
        continue;
      }
      const other = claimedBy?.get(key);
      if (other) {
        claimed.push(`${entry.noId} (${formatUnitDisplay(other)})`);
        continue;
      }
      accepted.push(entry.noId);
    }
    for (const id of accepted) addId(id);
    setPaste("");
    const bits: string[] = [];
    if (accepted.length) bits.push(`${accepted.length} NO ID ditambahkan`);
    if (unknown.length) bits.push(`tidak ada di database: ${unknown.slice(0, 5).join(", ")}`);
    if (claimed.length) bits.push(`sudah di unit lain: ${claimed.slice(0, 5).join(", ")}`);
    setMessage({
      type: unknown.length || claimed.length ? "error" : "info",
      text: bits.join(" · ") || "Tidak ada NO ID yang ditambahkan.",
    });
  };

  const handleApply = () => {
    if (unknownSelected.length > 0) {
      setMessage({
        type: "error",
        text:
          `${unknownSelected.length} NO ID belum ada di database PUMK: ` +
          `${unknownSelected.slice(0, 5).join(", ")}. Hapus dulu sebelum menyimpan.`,
      });
      return;
    }
    onApply(selected);
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.62)",
        backdropFilter: "blur(5px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 70,
        padding: "16px",
      }}
    >
      <div
        className="glass-panel"
        style={{
          width: "100%",
          maxWidth: "940px",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          padding: "22px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "1.25rem" }}>{title}</h2>
            <p style={{ margin: "4px 0 0 0", fontSize: "0.82rem", color: "var(--text-muted)" }}>
              Untuk {formatUnitDisplay(unitId)} · pilih mitra dari Database PUMK, atau ketik NO ID + nama.
            </p>
          </div>
          <button
            type="button"
            className="btn"
            style={{ background: "rgba(255,255,255,0.1)", padding: "6px 12px" }}
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {error && (
          <div style={{ marginTop: "10px", color: "var(--danger)", fontSize: "0.85rem" }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
          <input
            className="input-field"
            placeholder="Cari NO ID, nama mitra, unit, kolektibilitas…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1 }}
          />
          <span style={{ alignSelf: "center", fontSize: "0.82rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
            {selected.length} dipilih
          </span>
        </div>

        {selected.length > 0 && (
          <div
            style={{
              marginTop: "8px",
              maxHeight: "96px",
              overflowY: "auto",
              display: "flex",
              flexWrap: "wrap",
              gap: "6px",
              padding: "8px",
              borderRadius: "8px",
              background: "rgba(56,189,248,0.07)",
            }}
          >
            {selected.map((noId) => {
              const entry = byKey.get(keyOf(noId));
              return (
                <span
                  key={noId}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "2px 6px 2px 8px",
                    borderRadius: "999px",
                    background: entry ? "rgba(0,0,0,0.06)" : "rgba(239,68,68,0.14)",
                    color: entry ? "inherit" : "var(--danger)",
                    fontSize: "0.76rem",
                  }}
                >
                  {entry ? `${entry.noId} — ${entry.nama}` : `${noId} (tidak ada di database)`}
                  <button
                    type="button"
                    onClick={() => removeId(noId)}
                    style={{
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      fontWeight: 700,
                      color: "inherit",
                      padding: "0 2px",
                    }}
                    aria-label={`Hapus ${noId}`}
                  >
                    ✕
                  </button>
                </span>
              );
            })}
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "10px",
            marginTop: "10px",
            padding: "10px",
            border: "1px solid rgba(0,0,0,0.1)",
            borderRadius: "10px",
          }}
        >
          <div>
            <label style={{ display: "block", fontSize: "0.8rem", marginBottom: "4px" }}>
              Input manual NO ID + nama
            </label>
            <div style={{ display: "flex", gap: "6px" }}>
              <input
                className="input-field"
                placeholder="NO ID"
                value={manualId}
                onChange={(e) => setManualId(e.target.value)}
                style={{ flex: 1 }}
              />
              <input
                className="input-field"
                placeholder="Nama mitra"
                value={manualNama}
                onChange={(e) => setManualNama(e.target.value)}
                style={{ flex: 1.4 }}
              />
              <button
                type="button"
                className="btn"
                style={{ padding: "6px 12px", whiteSpace: "nowrap" }}
                onClick={handleManualAdd}
              >
                Tambah
              </button>
            </div>
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "4px" }}>
              Nama harus sama dengan database. Bila belum terdaftar, tambahkan dulu di Database PUMK.
            </div>
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.8rem", marginBottom: "4px" }}>
              Tempel banyak NO ID (satu per baris / pisah koma)
            </label>
            <div style={{ display: "flex", gap: "6px", alignItems: "flex-start" }}>
              <textarea
                className="input-field"
                rows={2}
                placeholder={"01-01-778/93\n01-01-207/00"}
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                style={{ flex: 1, resize: "vertical", fontSize: "0.8rem" }}
              />
              <button
                type="button"
                className="btn"
                style={{ padding: "6px 12px", whiteSpace: "nowrap" }}
                onClick={handlePasteAdd}
              >
                Tambah
              </button>
            </div>
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "4px" }}>
              NO ID yang tidak terdaftar akan dilaporkan dan tidak ditambahkan.
            </div>
          </div>
        </div>

        {message && (
          <div
            style={{
              marginTop: "8px",
              padding: "8px 10px",
              borderRadius: "8px",
              fontSize: "0.82rem",
              background:
                message.type === "error" ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.1)",
              color: message.type === "error" ? "var(--danger)" : "var(--success)",
            }}
          >
            {message.text}
          </div>
        )}

        <div
          style={{
            marginTop: "10px",
            flex: 1,
            minHeight: "160px",
            overflowY: "auto",
            border: "1px solid rgba(0,0,0,0.12)",
            borderRadius: "10px",
          }}
        >
          {loading ? (
            <div style={{ padding: "18px", fontSize: "0.85rem" }}>Memuat database mitra…</div>
          ) : visible.length === 0 ? (
            <div style={{ padding: "18px", fontSize: "0.85rem" }}>
              Tidak ada mitra yang cocok.
            </div>
          ) : (
            <table className="data-table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th style={{ width: "36px" }} />
                  <th>NO ID</th>
                  <th>Nama Mitra</th>
                  <th>Unit Saat Ini</th>
                  <th>Kolektibilitas</th>
                  <th style={{ textAlign: "right" }}>Saldo Juli</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => {
                  const key = keyOf(item.noIdKey || item.noId);
                  const checked = selectedSet.has(key);
                  const other = claimedBy?.get(key);
                  const disabled = Boolean(other) && !checked;
                  return (
                    <tr key={item.id || key}>
                      <td>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={(e) =>
                            e.target.checked ? addId(item.noId) : removeId(item.noId)
                          }
                        />
                      </td>
                      <td style={{ fontFamily: "monospace", whiteSpace: "nowrap" }}>
                        {item.noId}
                      </td>
                      <td>
                        {item.nama}
                        {other && (
                          <span
                            style={{
                              marginLeft: "6px",
                              fontSize: "0.72rem",
                              color: "var(--danger)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            sudah di {formatUnitDisplay(other)}
                          </span>
                        )}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {item.unitId ? formatUnitDisplay(item.unitId) : "—"}
                      </td>
                      <td>{item.kolektibilitas || "—"}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        {rp(Number(item.totalSaldoJuli || 0))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {filtered.length > visible.length && (
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "6px" }}>
            Menampilkan {visible.length} dari {filtered.length} mitra. Persempit pencarian.
          </div>
        )}

        <div
          style={{
            display: "flex",
            gap: "10px",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "14px",
          }}
        >
          <button
            type="button"
            className="btn"
            style={{ background: "rgba(255,255,255,0.1)", padding: "6px 10px", fontSize: "0.8rem" }}
            onClick={() => setSelected([])}
          >
            Kosongkan pilihan
          </button>
          <div style={{ display: "flex", gap: "10px" }}>
            <button
              type="button"
              className="btn"
              style={{ background: "rgba(255,255,255,0.1)" }}
              onClick={onClose}
            >
              Batal
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleApply}
              disabled={loading}
            >
              {loading ? "Memuat…" : `Simpan pilihan (${selected.length})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
