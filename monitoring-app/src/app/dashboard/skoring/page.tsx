"use client";

import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import Link from 'next/link';
import KeywordManagerModal from '@/components/KeywordManagerModal';
import { useAuth } from "@/lib/authContext";
import { useRouter } from "next/navigation";

export default function SkoringPage() {
    const { user, loading: authLoading, getToken } = useAuth();
    const router = useRouter();
    const [posts, setPosts] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [snapshotMeta, setSnapshotMeta] = useState<{ syncedAt: string | null } | null>(null);
    
    // Filtering states
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selectedAccount, setSelectedAccount] = useState('Semua Akun');
    const [availableAccounts, setAvailableAccounts] = useState<string[]>([]);
    
    const [isKeywordModalOpen, setIsKeywordModalOpen] = useState(false);

    // Label akun = handle IG asli (username terbanyak per akun internal).
    const accountLabels = useMemo(() => {
        const counts = new Map<string, Map<string, number>>();
        for (const p of posts) {
            const src = p.source_account || p.username;
            if (!src) continue;
            if (!counts.has(src)) counts.set(src, new Map());
            const m = counts.get(src)!;
            const u = p.username || src;
            m.set(u, (m.get(u) || 0) + 1);
        }
        const labels = new Map<string, string>();
        for (const [src, m] of counts) {
            let top = src, topN = -1;
            for (const [u, n] of m) if (n > topN) { top = u; topN = n; }
            labels.set(src, top);
        }
        for (const acc of availableAccounts) if (!labels.has(acc)) labels.set(acc, acc);
        return labels;
    }, [posts, availableAccounts]);
    const accountLabel = (acc: string) => accountLabels.get(acc) || acc;

    // Target states (read-only: diatur admin di halaman Target Skoring dan Postingan)
    const [savedTargets, setSavedTargets] = useState<any[]>([]);

    useEffect(() => {
        if (authLoading || !user) return;
        (async () => {
            try {
                let token = await getToken();
                const headers: HeadersInit = {};
                if (token) headers['Authorization'] = `Bearer ${token}`;
                let res = await fetch('/api/targets', { headers, cache: 'no-store' });
                if (res.status === 401) {
                    token = await getToken(true);
                    if (token) {
                        headers['Authorization'] = `Bearer ${token}`;
                        res = await fetch('/api/targets', { headers, cache: 'no-store' });
                    }
                }
                if (!res.ok) return;
                const text = await res.text();
                const data = text ? JSON.parse(text) : {};
                setSavedTargets(data.targets || []);
            } catch {
                // Target bersifat opsional: halaman tetap jalan tanpa target
            }
        })();
    }, [authLoading, user, getToken]);

    const fetchSkoringData = async () => {
        if (authLoading) return;
        if (!user) {
            router.replace('/login');
            return;
        }

        setLoading(true);
        setError('');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45000);
        try {
            let token = await getToken();
            const headers: HeadersInit = {};
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const params = new URLSearchParams();
            if (startDate) params.append('startDate', startDate);
            if (endDate) params.append('endDate', endDate);
            if (selectedAccount && selectedAccount !== 'Semua Akun') params.append('username', selectedAccount);
            
            let res = await fetch(`/api/skoring?${params.toString()}`, { 
                signal: controller.signal,
                headers,
                cache: 'no-store'
            });

            if (res.status === 401) {
                token = await getToken(true);
                if (token) {
                    headers['Authorization'] = `Bearer ${token}`;
                    res = await fetch(`/api/skoring?${params.toString()}`, { 
                        signal: controller.signal,
                        headers,
                        cache: 'no-store'
                    });
                }
                if (res.status === 401) {
                    router.replace('/login');
                    return;
                }
            }

            const text = await res.text();
            let data: any = {};
            try { data = text ? JSON.parse(text) : {}; }
            catch { throw new Error('API ' + res.status + ' body bukan JSON (kemungkinan timeout Composio). Coba 1 akun + rentang kecil.'); }
            
            if (!res.ok) {
                throw new Error('API ' + res.status + ': ' + (data.error || data.details || text.slice(0, 200)));
            }
            
            setPosts(data.posts || []);
            setSnapshotMeta(data.meta || null);
            
            if (data.accounts_fetched && data.accounts_fetched.length > 0) {
                setAvailableAccounts(data.accounts_fetched);
            }
        } catch (err: any) {
            if (err?.name === 'AbortError') {
                setError('Permintaan timeout (45s). Coba filter 1 akun + rentang ≤7 hari.');
            } else {
                setError(err.message);
            }
        } finally {
            clearTimeout(timeoutId);
            setLoading(false);
        }
    };

    // Auto-fetch on mount
    useEffect(() => {
        fetchSkoringData();
    }, [authLoading, user, getToken, router]); // eslint-disable-line

    // Refetch when account selection changes
    useEffect(() => {
        // Skip initial render fetch as it's handled above
        if (availableAccounts.length > 0) {
            fetchSkoringData();
        }
    }, [selectedAccount]); // eslint-disable-line

    const exportToExcel = () => {
        if (!posts || posts.length === 0) {
            alert("Tidak ada data untuk diekspor!");
            return;
        }

        // Format data sesuai permintaan: tanggal dipecah jadi 3 kolom angka terpisah
        const excelData = posts.map((post, index) => {
            const d = post.timestamp ? new Date(post.timestamp) : null;
            const valid = d && !isNaN(d.getTime());
            return {
                "Nomor": index + 1,
                "Kategori": post.scoring?.kategori || "-",
                "Tanggal": valid ? d.getDate() : "-",
                "Bulan": valid ? d.getMonth() + 1 : "-",
                "Tahun": valid ? d.getFullYear() : "-",
                "Akun": post.username || post.source_account || "-",
                "Judul Pemberitaan": post.caption || "-",
                "Link": post.permalink,
                "Kategori Media": post.scoring?.tierName || post.scoring?.platform || "Tidak diketahui"
            };
        });

        // Buat worksheet dan workbook
        const worksheet = XLSX.utils.json_to_sheet(excelData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Data Skoring");

        // Nama file menyesuaikan tanggal filter dan akun
        let filename = `Laporan_Skoring_${selectedAccount.replace(/[^a-zA-Z0-9]/g, '_')}`;
        if (startDate || endDate) {
            filename += `_${startDate || 'awal'}_sampai_${endDate || 'akhir'}`;
        }
        filename += '.xlsx';

        // Trigger download
        XLSX.writeFile(workbook, filename);
    };

    const activeTarget = savedTargets.find(t => {
        if (!startDate || !endDate) return false;
        if (t.status === "Paused") return false;
        const ts = new Date(t.startDate);
        const te = new Date(t.endDate);
        const fs = new Date(startDate);
        const fe = new Date(endDate);
        // Target is active if filter range is fully within target range
        return ts <= fs && fe <= te;
    });

    const currentScore = posts.reduce((sum, p) => sum + (p.scoring?.score || 0), 0);
    const currentPosts = posts.length;
    const avgScoreNum = currentPosts > 0 ? (currentScore / currentPosts) : 0;
    const avgScoreStr = avgScoreNum.toLocaleString('id-ID', { maximumFractionDigits: 1 });

    let scorePercent = 0;
    let postPercent = 0;
    if (activeTarget && activeTarget.targetScore > 0 && activeTarget.targetPosts > 0) {
        scorePercent = Math.min(Math.round((currentScore / activeTarget.targetScore) * 100), 120);
        postPercent = Math.min(Math.round((currentPosts / activeTarget.targetPosts) * 100), 120);
    }

    const renderProgressBar = () => {
        if (!activeTarget) return null;
        
        return (
            <div className="glass-panel" style={{ padding: '20px', marginBottom: '20px' }}>
                <h3 style={{ margin: '0 0 15px 0' }}>Progress Target Aktif (Rentang: {activeTarget.startDate} s/d {activeTarget.endDate})</h3>
                
                <div style={{ marginBottom: '15px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                        <span>Skor Tercapai: {currentScore.toLocaleString('id-ID')} / {activeTarget.targetScore.toLocaleString('id-ID')}</span>
                        <span>{scorePercent}%</span>
                    </div>
                    <div style={{ width: '100%', height: '10px', background: 'rgba(255,255,255,0.1)', borderRadius: '5px', overflow: 'hidden' }}>
                        <div style={{ width: `${scorePercent}%`, height: '100%', background: scorePercent >= 100 ? '#10b981' : '#3b82f6', transition: 'width 0.5s ease' }}></div>
                    </div>
                </div>
    
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                        <span>Postingan: {currentPosts.toLocaleString('id-ID')} / {activeTarget.targetPosts.toLocaleString('id-ID')}</span>
                        <span>{postPercent}%</span>
                    </div>
                    <div style={{ width: '100%', height: '10px', background: 'rgba(255,255,255,0.1)', borderRadius: '5px', overflow: 'hidden' }}>
                        <div style={{ width: `${postPercent}%`, height: '100%', background: postPercent >= 100 ? '#10b981' : '#3b82f6', transition: 'width 0.5s ease' }}></div>
                    </div>
                </div>
            </div>
        );
    }

    const renderSummaryPanel = () => {
        if (posts.length === 0 && !loading) {
            return (
                <div className="glass-panel" style={{ padding: '20px', margin: '20px 0 12px', textAlign: 'center', color: '#666' }}>
                    Tidak ada data pada filter ini.
                </div>
            );
        }

        let targetContent = (
            <p style={{ margin: '15px 0 0 0', color: '#888', fontSize: '0.9em', fontStyle: 'italic' }}>
                Belum ada target untuk rentang ini — hubungi admin.
            </p>
        );

        if (activeTarget) {
            const sisa = Math.max(0, activeTarget.targetScore - currentScore);
            const progressColor = currentScore >= activeTarget.targetScore ? '#10b981' : '#3b82f6';
            
            targetContent = (
                <div style={{ marginTop: '15px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '0.9em' }}>
                        <span>Target <strong>{activeTarget.targetScore.toLocaleString('id-ID')}</strong> &rarr; tercapai {scorePercent}% (cap 120%), sisa {sisa.toLocaleString('id-ID')}</span>
                    </div>
                    <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ width: `${scorePercent}%`, height: '100%', background: progressColor, transition: 'width 0.5s ease' }}></div>
                    </div>
                </div>
            );
        }

        return (
            <div className="glass-panel" style={{ padding: '20px', margin: '20px 0 12px' }}>
                <h3 style={{ margin: '0 0 10px 0' }}>Total Skoring Hasil Filter</h3>
                <p style={{ margin: '0 0 10px 0' }}>
                    Total Skor: <strong>{currentScore.toLocaleString('id-ID')}</strong> dari <strong>{currentPosts.toLocaleString('id-ID')}</strong> postingan (rata-rata {avgScoreStr})
                </p>
                {targetContent}
            </div>
        );
    }

    const renderPieChart = () => {
        if (posts.length === 0) return null;
        
        const groups: Record<string, { count: number, score: number }> = {};
        let totalScore = 0;
        posts.forEach(p => {
            const plat = p.scoring?.platform || 'Unknown';
            if (!groups[plat]) groups[plat] = { count: 0, score: 0 };
            groups[plat].count += 1;
            groups[plat].score += (p.scoring?.score || 0);
            totalScore += (p.scoring?.score || 0);
        });
    
        if (totalScore === 0) return null;
    
        const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
        let currentOffset = 0;
        const radius = 16;
        const circumference = 2 * Math.PI * radius;
    
        return (
            <div className="glass-panel" style={{ padding: '20px', marginBottom: '20px', display: 'flex', gap: '40px', alignItems: 'center', flexWrap: 'wrap' }}>
                <svg width="150" height="150" viewBox="0 0 36 36" style={{ overflow: 'visible' }}>
                    {Object.entries(groups).map(([plat, data], i) => {
                        const proportion = data.score / totalScore;
                        const strokeDasharray = `${proportion * circumference} ${circumference}`;
                        const strokeDashoffset = -currentOffset;
                        currentOffset += proportion * circumference;
                        
                        return (
                            <circle 
                                key={plat}
                                r={radius} 
                                cx="18" 
                                cy="18" 
                                fill="transparent" 
                                stroke={colors[i % colors.length]}
                                strokeWidth="6" 
                                strokeDasharray={strokeDasharray}
                                strokeDashoffset={strokeDashoffset}
                                transform="rotate(-90 18 18)"
                                style={{ transition: 'stroke-dasharray 0.5s ease, stroke-dashoffset 0.5s ease' }}
                            />
                        );
                    })}
                </svg>
                <div>
                    <h3 style={{ margin: '0 0 10px 0' }}>Statistik Skor per Platform</h3>
                    {Object.entries(groups).map(([plat, data], i) => (
                        <div key={plat} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                            <div style={{ width: '12px', height: '12px', backgroundColor: colors[i % colors.length], borderRadius: '50%' }}></div>
                            <span><strong>{plat}</strong>: {data.score} skor ({data.count} post) - {Math.round((data.score/totalScore)*100)}%</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className="container" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
                    <Link href="/dashboard" className="btn" style={{ textDecoration: 'none', background: '#ef4444', border: '1px solid #ef4444', padding: '8px 16px', borderRadius: '8px', color: '#ffffff', fontWeight: 'bold', boxShadow: '0 4px 15px rgba(239, 68, 68, 0.3)' }}>
                        Back
                    </Link>
                    <h1 style={{ margin: 0, color: "#111" }}>Skoring Dashboard</h1>
                    <p className="skoring-sub" style={{ margin: "5px 0 0 0", fontSize: "0.85rem", color: "#111" }}>
                        {snapshotMeta?.syncedAt ? `Diperbarui ${new Date(snapshotMeta.syncedAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}` : ""}
                    </p>
                </div>
            </div>
            
            {/* Filter Panel */}
            <div className="glass-panel filter-bar" style={{ padding: '20px', marginBottom: '20px', display: 'flex', gap: '15px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div>
                    <label style={{ display: 'block', marginBottom: '5px' }}>Akun</label>
                    <select 
                        value={selectedAccount}
                        onChange={(e) => setSelectedAccount(e.target.value)}
                        className="input-field"
                    >
                        <option value="Semua Akun">Semua Akun</option>
                        {availableAccounts.map(acc => (
                            <option key={acc} value={acc}>{accountLabel(acc)}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label style={{ display: 'block', marginBottom: '5px' }}>Start Date</label>
                    <input 
                        type="date" 
                        value={startDate} 
                        onChange={(e) => setStartDate(e.target.value)}
                        className="input-field"
                    />
                </div>
                <div>
                    <label style={{ display: 'block', marginBottom: '5px' }}>End Date</label>
                    <input 
                        type="date" 
                        value={endDate} 
                        onChange={(e) => setEndDate(e.target.value)}
                        className="input-field"
                    />
                </div>
                <button className="btn" onClick={fetchSkoringData} disabled={loading} style={{ background: "#38bdf8", color: "white" }}>
                    {loading ? 'Loading...' : 'Filter'}
                </button>
                <button className="btn" onClick={() => setIsKeywordModalOpen(true)} style={{ background: "#38bdf8", color: "white" }}>
                    Kelola Keyword
                </button>
            </div>

            {error && <div style={{ color: '#ff4d4f', marginBottom: '20px' }}>{error}</div>}

            {renderProgressBar()}
            {renderPieChart()}

            <div className="glass-panel" style={{ overflowX: 'auto', maxHeight: '60vh', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--card-border)' }}>
                            <th style={{ padding: '12px' }}>Date</th>
                            <th style={{ padding: '12px' }}>Akun</th>
                            <th style={{ padding: '12px' }}>Media</th>
                            <th style={{ padding: '12px' }}>Platform</th>
                            <th style={{ padding: '12px' }}>Metric (Max)</th>
                            <th style={{ padding: '12px' }}>Kategori</th>
                            <th style={{ padding: '12px' }}>Keywords</th>
                            <th style={{ padding: '12px' }}>Score</th>
                        </tr>
                    </thead>
                    <tbody>
                        {posts.length === 0 && !loading && (
                            <tr>
                                <td colSpan={8} style={{ padding: '20px', textAlign: 'center' }}>No posts found</td>
                            </tr>
                        )}
                        {posts.map((post) => (
                            <tr key={post.id} style={{ borderBottom: '1px solid var(--card-border)' }}>
                                <td style={{ padding: '12px' }}>{new Date(post.timestamp).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
                                <td style={{ padding: '12px' }}>{post.username || post.source_account || "-"}</td>
                                <td style={{ padding: '12px', maxWidth: '200px' }}>
                                    <div style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                        <a href={post.permalink} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', fontWeight: '500' }}>
                                            {post.caption ? post.caption.substring(0, 50) + '...' : 'View Post'}
                                        </a>
                                    </div>
                                </td>
                                <td style={{ padding: '12px' }}>{post.scoring?.platform}</td>
                                <td style={{ padding: '12px' }} title={`Likes: ${post.likes || 0}, Views: ${post.plays || post.views || post.impressions || 0}`}>
                                    {post.used_metric_value || post.likes || 0}
                                </td>
                                <td style={{ padding: '12px' }}>
                                    <span style={{ padding: '4px 10px', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.15)', color: 'var(--primary)', fontSize: '0.85em', whiteSpace: 'nowrap', display: 'inline-block' }}>
                                        {post.scoring?.kategori}
                                    </span>
                                </td>
                                <td style={{ padding: '12px' }}>
                                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                        {post.scoring?.keywords?.map((kw: string, i: number) => (
                                            <span key={i} style={{ padding: '2px 6px', borderRadius: '4px', background: 'rgba(0,0,0,0.05)', border: '1px solid var(--card-border)', fontSize: '0.8em' }}>
                                                {kw}
                                            </span>
                                        ))}
                                    </div>
                                </td>
                                <td style={{ padding: '12px', fontWeight: 'bold', color: 'var(--primary)' }}>
                                    {post.scoring?.score}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {renderSummaryPanel()}

            <div className="sticky-action" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button 
                    className="btn" 
                    onClick={exportToExcel} 
                    disabled={loading || posts.length === 0}
                    style={{ background: '#10b981', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 4px 15px rgba(16, 185, 129, 0.3)' }}
                >
                    Download Excel
                </button>
            </div>

            <KeywordManagerModal 
                isOpen={isKeywordModalOpen} 
                onClose={() => {
                    setIsKeywordModalOpen(false);
                    fetchSkoringData();
                }} 
            />
        </div>
    );
}
