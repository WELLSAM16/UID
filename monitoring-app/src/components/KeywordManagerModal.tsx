"use client";

import React, { useState, useEffect } from 'react';
import { getDynamicKeywordCategories, saveDynamicKeywordCategories } from '@/lib/scoring';

interface KeywordManagerModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function KeywordManagerModal({ isOpen, onClose }: KeywordManagerModalProps) {
    const [categories, setCategories] = useState<Record<string, string[]>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [newKeyword, setNewKeyword] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('');
    const [newCategoryName, setNewCategoryName] = useState('');

    useEffect(() => {
        if (isOpen) {
            fetchCategories();
        }
    }, [isOpen]);

    const fetchCategories = async () => {
        setLoading(true);
        try {
            const data = await getDynamicKeywordCategories();
            setCategories(data);
            if (Object.keys(data).length > 0 && !selectedCategory) {
                setSelectedCategory(Object.keys(data)[0]);
            }
        } catch (error) {
            console.error("Error fetching categories:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddKeyword = () => {
        if (!newKeyword.trim() || !selectedCategory) return;
        
        setCategories(prev => {
            const updated = { ...prev };
            if (!updated[selectedCategory].includes(newKeyword.trim())) {
                updated[selectedCategory] = [...updated[selectedCategory], newKeyword.trim()];
            }
            return updated;
        });
        setNewKeyword('');
    };

    const handleRemoveKeyword = (category: string, keyword: string) => {
        setCategories(prev => {
            const updated = { ...prev };
            updated[category] = updated[category].filter(k => k !== keyword);
            return updated;
        });
    };

    const handleAddCategory = () => {
        if (!newCategoryName.trim()) return;
        
        setCategories(prev => {
            if (prev[newCategoryName.trim()]) return prev;
            return {
                ...prev,
                [newCategoryName.trim()]: []
            };
        });
        setSelectedCategory(newCategoryName.trim());
        setNewCategoryName('');
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await saveDynamicKeywordCategories(categories);
            onClose();
        } catch (error) {
            console.error("Error saving categories:", error);
            alert("Gagal menyimpan keyword.");
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
            display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}>
            <div style={{
                width: '90%', maxWidth: '700px', maxHeight: '90vh',
                padding: '30px', overflowY: 'auto', position: 'relative',
                background: '#ffffff', border: '1px solid var(--card-border)',
                borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)'
            }}>
                <h2 className="text-gradient" style={{ marginBottom: '20px' }}>Kelola Keyword Kategori</h2>
                
                {loading ? (
                    <p>Loading keywords...</p>
                ) : (
                    <>
                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Pilih Kategori</label>
                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                {Object.keys(categories).map(cat => (
                                    <button 
                                        key={cat}
                                        onClick={() => setSelectedCategory(cat)}
                                        style={{
                                            padding: '8px 16px',
                                            borderRadius: '20px',
                                            border: '1px solid var(--primary)',
                                            background: selectedCategory === cat ? 'var(--primary)' : 'transparent',
                                            color: selectedCategory === cat ? 'white' : 'var(--text-color)',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {cat}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                            <input 
                                type="text"
                                className="input-field"
                                placeholder="Kategori Baru (Opsional)"
                                value={newCategoryName}
                                onChange={e => setNewCategoryName(e.target.value)}
                            />
                            <button className="btn" style={{ background: '#4b5563', color: 'white', padding: '10px 15px', borderRadius: '8px' }} onClick={handleAddCategory}>
                                Tambah Kategori
                            </button>
                        </div>

                        {selectedCategory && (
                            <div style={{ marginBottom: '30px', padding: '15px', border: '1px solid var(--card-border)', borderRadius: '8px' }}>
                                <h3 style={{ marginBottom: '15px' }}>Keyword untuk: {selectedCategory}</h3>
                                <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                                    <input 
                                        type="text"
                                        className="input-field"
                                        placeholder="Tambah keyword..."
                                        value={newKeyword}
                                        onChange={e => setNewKeyword(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleAddKeyword()}
                                    />
                                    <button className="btn btn-primary" onClick={handleAddKeyword}>
                                        Tambah
                                    </button>
                                </div>

                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    {categories[selectedCategory]?.map(kw => (
                                        <div key={kw} style={{
                                            display: 'flex', alignItems: 'center', gap: '8px',
                                            padding: '6px 12px', background: 'rgba(0,0,0,0.05)',
                                            border: '1px solid var(--card-border)', borderRadius: '16px'
                                        }}>
                                            <span>{kw}</span>
                                            <button 
                                                onClick={() => handleRemoveKeyword(selectedCategory, kw)}
                                                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold' }}
                                            >
                                                &times;
                                            </button>
                                        </div>
                                    ))}
                                    {categories[selectedCategory]?.length === 0 && (
                                        <p style={{ color: 'gray' }}>Belum ada keyword.</p>
                                    )}
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px' }}>
                            <button className="btn" onClick={onClose} disabled={saving} style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid var(--card-border)' }}>
                                Batal
                            </button>
                            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                                {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
