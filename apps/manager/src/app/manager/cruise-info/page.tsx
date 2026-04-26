'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ManagerLayout from '@/components/ManagerLayout';
import supabase from '@/lib/supabase';

// ─────────────────────────────────────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────────────────────────────────────

type CruiseInfoRow = {
    id: string;
    cruise_code: string | null;
    cruise_name: string | null;
    name: string | null;
    description: string | null;
    duration: string | null;
    category: string | null;
    star_rating: string | null;
    capacity: string | null;
    awards: string | null;
    cruise_image: string | null;
    facilities: any;
    inclusions: string | null;
    exclusions: string | null;
    itinerary: any;
    cancellation_policy: any;
    updated_at: string | null;
};

type CruiseForm = {
    cruise_name: string;
    name: string;
    category: string;
    duration: string;
    description: string;
    star_rating: string;
    capacity: string;
    awards: string;
    cruise_image: string;
    inclusions: string;
    exclusions: string;
    facilities_text: string;
    itinerary_text: string;
    cancellation_policy_text: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────────────────────────────────────

const arrayToText = (value: any): string => {
    if (!value) return '';
    if (Array.isArray(value)) return value.map((v) => String(v ?? '').trim()).filter(Boolean).join('\n');
    if (typeof value === 'string') return value;
    return '';
};

const textToArray = (text: string): string[] =>
    Array.from(new Set(text.split(/\r?\n|,/).map((v) => v.trim()).filter(Boolean)));

const jsonToText = (value: any): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    try { return JSON.stringify(value, null, 2); } catch { return ''; }
};

const rowToCruiseForm = (ref: CruiseInfoRow, cruiseName: string): CruiseForm => ({
    cruise_name: cruiseName,
    name: ref.name || '',
    category: ref.category || '',
    duration: ref.duration || '',
    description: ref.description || '',
    star_rating: ref.star_rating || '',
    capacity: ref.capacity || '',
    awards: ref.awards || '',
    cruise_image: ref.cruise_image || '',
    inclusions: ref.inclusions || '',
    exclusions: ref.exclusions || '',
    facilities_text: arrayToText(ref.facilities),
    itinerary_text: jsonToText(ref.itinerary),
    cancellation_policy_text: jsonToText(ref.cancellation_policy),
});

// ─────────────────────────────────────────────────────────────────────────────
// 페이지
// ─────────────────────────────────────────────────────────────────────────────

export default function CruiseInfoManagePage() {
    const [rows, setRows] = useState<CruiseInfoRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [forms, setForms] = useState<Record<string, CruiseForm>>({});
    const [savingKey, setSavingKey] = useState<string>('');

    // ── 데이터 로드 ──
    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('cruise_info')
                .select('id, cruise_code, cruise_name, name, description, duration, category, star_rating, capacity, awards, cruise_image, facilities, inclusions, exclusions, itinerary, cancellation_policy, updated_at')
                .order('cruise_name', { ascending: true })
                .order('updated_at', { ascending: false })
                .limit(2000);

            if (error) { alert(`데이터 조회 실패: ${error.message}`); return; }

            const arr = (data || []) as CruiseInfoRow[];
            setRows(arr);

            // 크루즈별 대표 행(첫 행) 기준으로 폼 초기화
            const seen = new Set<string>();
            const nextForms: Record<string, CruiseForm> = {};
            for (const r of arr) {
                const key = r.cruise_name || '';
                if (!key || seen.has(key)) continue;
                seen.add(key);
                nextForms[key] = rowToCruiseForm(r, key);
            }
            setForms(nextForms);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    // ── distinct 크루즈 목록 ──
    const cruiseList = useMemo(() => {
        const seen = new Set<string>();
        return rows.filter((r) => { const k = r.cruise_name || ''; if (!k || seen.has(k)) return false; seen.add(k); return true; });
    }, [rows]);

    // ── 공통 정보 저장 (bulk-common API) ──
    const handleSave = async (cruiseName: string) => {
        const form = forms[cruiseName];
        if (!form) return;
        if (!form.cruise_name.trim()) { alert('크루즈명을 입력하세요.'); return; }
        setSavingKey(cruiseName);
        try {
            const res = await fetch('/api/manager/cruise-room/bulk-common', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cruise_name: cruiseName,
                    new_cruise_name: form.cruise_name.trim(),
                    name: form.name,
                    category: form.category,
                    duration: form.duration,
                    description: form.description,
                    star_rating: form.star_rating,
                    capacity: form.capacity,
                    awards: form.awards,
                    cruise_image: form.cruise_image,
                    inclusions: form.inclusions,
                    exclusions: form.exclusions,
                    facilities: textToArray(form.facilities_text),
                    itinerary: form.itinerary_text || null,
                    cancellation_policy: form.cancellation_policy_text || null,
                }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) { alert(`저장 실패: ${json.error || res.statusText}`); return; }
            alert(`저장 완료 (${json.updated_count}건 적용)`);
            await loadData();
        } catch (e: any) {
            alert(`저장 오류: ${e?.message || e}`);
        } finally {
            setSavingKey('');
        }
    };

    // ── 신규 크루즈 추가 ──
    const handleAddCruise = async () => {
        const cruiseName = prompt('새 크루즈명을 입력하세요');
        if (!cruiseName?.trim()) return;
        const roomName = prompt('임시 객실명을 입력하세요 (예: Standard Room)');
        if (!roomName?.trim()) return;
        try {
            const res = await fetch('/api/manager/cruise-room/upsert', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cruise_name: cruiseName.trim(), room_name: roomName.trim(), name: cruiseName.trim() }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) { alert(`추가 실패: ${json.error}`); return; }
            await loadData();
        } catch (e: any) { alert(`오류: ${e?.message}`); }
    };

    const update = (key: string, patch: Partial<CruiseForm>) =>
        setForms((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

    // ─────────────────────────────────────────────────────────────────────
    // 렌더링
    // ─────────────────────────────────────────────────────────────────────

    return (
        <ManagerLayout title="🚢 크루즈 정보 관리" activeTab="cruise-info">
            <div className="space-y-4">
                {/* 상단 컨트롤 */}
                <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-wrap items-center gap-3">
                    <span className="text-sm text-gray-600">등록된 크루즈: <b>{cruiseList.length}개</b></span>
                    <button type="button" onClick={handleAddCruise}
                        className="px-3 py-1.5 text-xs bg-blue-50 text-blue-600 rounded border border-blue-200 hover:bg-blue-100">
                        ➕ 새 크루즈 추가
                    </button>
                    <button type="button" onClick={loadData}
                        className="px-3 py-1.5 text-xs bg-gray-50 text-gray-600 rounded border border-gray-200 hover:bg-gray-100">
                        🔄 새로고침
                    </button>
                    <span className="ml-auto text-xs text-gray-400">
                        * 저장 시 같은 크루즈명의 모든 객실 행에 공통 정보가 일괄 적용됩니다.
                    </span>
                </div>

                {loading ? (
                    <div className="bg-white rounded-lg border border-gray-200 p-16 text-center text-sm text-gray-500">로딩 중...</div>
                ) : cruiseList.length === 0 ? (
                    <div className="bg-white rounded-lg border border-gray-200 p-16 text-center text-sm text-gray-500">등록된 크루즈가 없습니다.</div>
                ) : (
                    cruiseList.map((row) => {
                        const key = row.cruise_name || '';
                        const form = forms[key];
                        if (!form) return null;
                        const isSaving = savingKey === key;
                        return (
                            <CruiseInfoCard
                                key={key}
                                cruiseName={key}
                                form={form}
                                saving={isSaving}
                                onChange={(patch) => update(key, patch)}
                                onSave={() => handleSave(key)}
                            />
                        );
                    })
                )}
            </div>
        </ManagerLayout>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// CruiseInfoCard — 크루즈 1개 공통 정보 편집 카드
// ─────────────────────────────────────────────────────────────────────────────

function CruiseInfoCard({
    cruiseName,
    form,
    saving,
    onChange,
    onSave,
}: {
    cruiseName: string;
    form: CruiseForm;
    saving: boolean;
    onChange: (patch: Partial<CruiseForm>) => void;
    onSave: () => void;
}) {
    const [open, setOpen] = useState(true);

    return (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-200">
                <button type="button" onClick={() => setOpen((v) => !v)}
                    className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-blue-600">
                    <span>{open ? '▼' : '▶'}</span>
                    <span>🚢 {cruiseName}</span>
                    {form.star_rating && <span className="text-xs text-yellow-600 font-normal">{form.star_rating}</span>}
                    {form.duration && <span className="text-xs text-gray-500 font-normal">{form.duration}</span>}
                </button>
                <button type="button" onClick={onSave} disabled={saving}
                    className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50">
                    {saving ? '저장 중...' : '💾 저장'}
                </button>
            </div>

            {open && (
                <div className="p-5 space-y-4">
                    {/* 기본 정보 */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Field label="크루즈명 (한글)" value={form.cruise_name} onChange={(v) => onChange({ cruise_name: v })} className="md:col-span-2" />
                        <Field label="크루즈명 (영문)" value={form.name} onChange={(v) => onChange({ name: v })} className="md:col-span-2" />
                        <Field label="등급" value={form.star_rating} onChange={(v) => onChange({ star_rating: v })} placeholder="6성급" />
                        <Field label="카테고리" value={form.category} onChange={(v) => onChange({ category: v })} />
                        <Field label="기간" value={form.duration} onChange={(v) => onChange({ duration: v })} placeholder="1박2일" />
                        <Field label="수용 인원" value={form.capacity} onChange={(v) => onChange({ capacity: v })} placeholder="160명" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Field label="수상 이력" value={form.awards} onChange={(v) => onChange({ awards: v })} />
                        <Field label="대표 이미지 URL" value={form.cruise_image} onChange={(v) => onChange({ cruise_image: v })} />
                    </div>

                    {/* 크루즈 설명 + 시설 */}
                    <TextArea label="크루즈 설명" rows={3} value={form.description} onChange={(v) => onChange({ description: v })} />

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <TextArea
                            label="시설 목록 (한 줄에 하나씩)"
                            rows={7}
                            value={form.facilities_text}
                            onChange={(v) => onChange({ facilities_text: v })}
                            placeholder={'온수 수영장\n엘리베이터 (전 층)\n의료 센터'}
                        />
                        <TextArea label="✅ 포함 사항" rows={7} value={form.inclusions} onChange={(v) => onChange({ inclusions: v })} />
                        <TextArea label="❌ 불포함 사항" rows={7} value={form.exclusions} onChange={(v) => onChange({ exclusions: v })} />
                    </div>

                    {/* 대표 이미지 미리보기 */}
                    {form.cruise_image && (
                        <div className="flex items-center gap-3">
                            <img
                                src={form.cruise_image}
                                alt={form.cruise_name}
                                className="h-24 w-auto rounded-md border border-gray-200 object-cover"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                            <span className="text-xs text-gray-400">대표 이미지 미리보기</span>
                        </div>
                    )}

                    {/* 일정표 / 취소 규정 */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <details open className="rounded border border-gray-200">
                            <summary className="cursor-pointer px-3 py-2 text-xs text-gray-600 bg-gray-50 select-none">
                                📋 일정표 (JSON 또는 텍스트)
                            </summary>
                            <div className="p-3">
                                <TextArea
                                    rows={10}
                                    value={form.itinerary_text}
                                    onChange={(v) => onChange({ itinerary_text: v })}
                                    placeholder={'[\n  {"day": 1, "title": "1일차", "schedule": [{"time": "08:00", "activity": "탑승 시작"}]}\n]'}
                                />
                            </div>
                        </details>
                        <details open className="rounded border border-gray-200">
                            <summary className="cursor-pointer px-3 py-2 text-xs text-gray-600 bg-gray-50 select-none">
                                📜 취소 규정 (JSON 또는 텍스트)
                            </summary>
                            <div className="p-3">
                                <TextArea
                                    rows={10}
                                    value={form.cancellation_policy_text}
                                    onChange={(v) => onChange({ cancellation_policy_text: v })}
                                    placeholder={'[\n  {"condition": "보딩코드 발급 전", "penalty": "수수료 없는 무료 취소"}\n]'}
                                />
                            </div>
                        </details>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 공용 UI 컴포넌트
// ─────────────────────────────────────────────────────────────────────────────

function Field({ label, value, onChange, className = '', placeholder }: {
    label: string; value: string; onChange: (v: string) => void; className?: string; placeholder?: string;
}) {
    return (
        <div className={className}>
            <label className="block text-xs text-gray-500 mb-1">{label}</label>
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:ring-1 focus:ring-blue-400 focus:outline-none"
            />
        </div>
    );
}

function TextArea({ label, rows = 3, value, onChange, placeholder }: {
    label?: string; rows?: number; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
    return (
        <div>
            {label && <label className="block text-xs text-gray-500 mb-1">{label}</label>}
            <textarea
                rows={rows}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:ring-1 focus:ring-blue-400 focus:outline-none font-mono"
            />
        </div>
    );
}
