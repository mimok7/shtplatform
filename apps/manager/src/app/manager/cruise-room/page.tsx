'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ManagerLayout from '@/components/ManagerLayout';
import supabase from '@/lib/supabase';

// ─────────────────────────────────────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────────────────────────────────────

type CruiseRoomRow = {
    id: string;
    cruise_name: string | null;
    name: string | null;
    room_name: string | null;
    room_description: string | null;
    room_image: string | null;
    room_area: string | null;
    room_url: string | null;
    bed_type: string | null;
    max_adults: number | null;
    max_guests: number | null;
    has_balcony: boolean | null;
    is_vip: boolean | null;
    has_butler: boolean | null;
    is_recommended: boolean | null;
    connecting_available: boolean | null;
    extra_bed_available: boolean | null;
    special_amenities: string | null;
    warnings: string | null;
    images: any;
    display_order: number | null;
    updated_at: string | null;
};

type RoomForm = {
    id: string;
    cruise_name: string;
    room_name: string;
    name: string;
    room_area: string;
    bed_type: string;
    max_adults: string;
    max_guests: string;
    has_balcony: boolean;
    is_vip: boolean;
    has_butler: boolean;
    is_recommended: boolean;
    connecting_available: boolean;
    extra_bed_available: boolean;
    special_amenities: string;
    warnings: string;
    room_description: string;
    room_image: string;
    images_text: string;
    display_order: string;
};

type RateRow = {
    cruise_name: string;
    schedule_type: string;
    room_type: string;
    price_adult: number | null;
    price_child: number | null;
    season_name: string | null;
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

const formatVND = (n: number | null | undefined) =>
    n == null ? '-' : `${n.toLocaleString('ko-KR')}동`;

const rowToForm = (row: CruiseRoomRow): RoomForm => ({
    id: row.id,
    cruise_name: row.cruise_name || '',
    room_name: row.room_name || '',
    name: row.name || '',
    room_area: row.room_area || '',
    bed_type: row.bed_type || '',
    max_adults: row.max_adults != null ? String(row.max_adults) : '',
    max_guests: row.max_guests != null ? String(row.max_guests) : '',
    has_balcony: !!row.has_balcony,
    is_vip: !!row.is_vip,
    has_butler: !!row.has_butler,
    is_recommended: !!row.is_recommended,
    connecting_available: !!row.connecting_available,
    extra_bed_available: row.extra_bed_available !== false,
    special_amenities: row.special_amenities || '',
    warnings: row.warnings || '',
    room_description: row.room_description || '',
    room_image: row.room_image || '',
    images_text: arrayToText(row.images),
    display_order: row.display_order != null ? String(row.display_order) : '0',
});

// ─────────────────────────────────────────────────────────────────────────────
// 페이지
// ─────────────────────────────────────────────────────────────────────────────

export default function CruiseRoomManagePage() {
    const [allRows, setAllRows] = useState<CruiseRoomRow[]>([]);
    const [rates, setRates] = useState<RateRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingId, setSavingId] = useState<string>('');

    const [selectedCruise, setSelectedCruise] = useState<string>('');
    const [roomForms, setRoomForms] = useState<Record<string, RoomForm>>({});

    // ── 데이터 로드 ──
    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [{ data: rows, error: rowsError }, { data: rateData }] = await Promise.all([
                supabase
                    .from('cruise_info')
                    .select('id, cruise_name, name, room_name, room_description, room_image, room_area, room_url, bed_type, max_adults, max_guests, has_balcony, is_vip, has_butler, is_recommended, connecting_available, extra_bed_available, special_amenities, warnings, images, display_order, updated_at')
                    .order('cruise_name', { ascending: true })
                    .order('display_order', { ascending: true })
                    .order('updated_at', { ascending: false })
                    .limit(2000),
                supabase
                    .from('cruise_rate_card')
                    .select('cruise_name, schedule_type, room_type, price_adult, price_child, season_name')
                    .eq('is_active', true)
                    .limit(5000),
            ]);

            if (rowsError) { alert(`데이터 조회 실패: ${rowsError.message}`); return; }

            const arr = (rows || []) as CruiseRoomRow[];
            setAllRows(arr);
            setRates((rateData || []) as RateRow[]);

            const firstCruise = arr.find((r) => r.cruise_name)?.cruise_name || '';
            setSelectedCruise((prev) => prev || firstCruise);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    // ── 크루즈 변경 시 폼 재구성 ──
    useEffect(() => {
        if (!selectedCruise) { setRoomForms({}); return; }
        const next: Record<string, RoomForm> = {};
        allRows.filter((r) => r.cruise_name === selectedCruise).forEach((r) => { next[r.id] = rowToForm(r); });
        setRoomForms(next);
    }, [selectedCruise, allRows]);

    // ── 크루즈 목록 ──
    const cruiseList = useMemo(() => {
        const set = new Set<string>();
        allRows.forEach((r) => { if (r.cruise_name) set.add(r.cruise_name); });
        return Array.from(set).sort();
    }, [allRows]);

    // ── 선택 크루즈 객실 (정렬) ──
    const selectedRooms = useMemo(() => {
        return allRows
            .filter((r) => r.cruise_name === selectedCruise)
            .sort((a, b) => {
                const ao = a.display_order ?? 999, bo = b.display_order ?? 999;
                if (ao !== bo) return ao - bo;
                return (a.room_name || '').localeCompare(b.room_name || '');
            });
    }, [allRows, selectedCruise]);

    // ── 가격 조회 ──
    const getRoomRates = useCallback((cruiseName: string, roomName: string) =>
        rates.filter((r) => r.cruise_name === cruiseName && r.room_type && (r.room_type === roomName || r.room_type.startsWith(roomName + ' '))),
    [rates]);

    // ── 객실 저장 ──
    const handleSaveRoom = async (form: RoomForm) => {
        if (!form.room_name.trim()) { alert('객실명을 입력하세요.'); return; }
        setSavingId(form.id);
        try {
            const res = await fetch('/api/manager/cruise-room/upsert', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: form.id,
                    cruise_name: form.cruise_name,
                    room_name: form.room_name,
                    name: form.name,
                    room_area: form.room_area,
                    bed_type: form.bed_type,
                    max_adults: form.max_adults ? Number(form.max_adults) : null,
                    max_guests: form.max_guests ? Number(form.max_guests) : null,
                    has_balcony: form.has_balcony,
                    is_vip: form.is_vip,
                    has_butler: form.has_butler,
                    is_recommended: form.is_recommended,
                    connecting_available: form.connecting_available,
                    extra_bed_available: form.extra_bed_available,
                    special_amenities: form.special_amenities,
                    warnings: form.warnings,
                    room_description: form.room_description,
                    room_image: form.room_image,
                    images: textToArray(form.images_text),
                    display_order: form.display_order ? Number(form.display_order) : 0,
                }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) { alert(`저장 실패: ${json.error || res.statusText}`); return; }
            await loadData();
        } catch (e: any) {
            alert(`저장 오류: ${e?.message || e}`);
        } finally {
            setSavingId('');
        }
    };

    // ── 객실 삭제 ──
    const handleDeleteRoom = async (id: string, roomName: string) => {
        if (!confirm(`"${roomName}" 객실을 삭제하시겠습니까?`)) return;
        try {
            const res = await fetch('/api/manager/cruise-room/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) { alert(`삭제 실패: ${json.error || res.statusText}`); return; }
            await loadData();
        } catch (e: any) { alert(`삭제 오류: ${e?.message || e}`); }
    };

    // ── 신규 객실 추가 ──
    const handleAddRoom = async () => {
        if (!selectedCruise) { alert('먼저 크루즈를 선택하세요.'); return; }
        const roomName = prompt('새 객실명을 입력하세요');
        if (!roomName?.trim()) return;
        try {
            const res = await fetch('/api/manager/cruise-room/upsert', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cruise_name: selectedCruise,
                    room_name: roomName.trim(),
                    display_order: selectedRooms.length + 1,
                }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) { alert(`추가 실패: ${json.error}`); return; }
            await loadData();
        } catch (e: any) { alert(`오류: ${e?.message}`); }
    };

    const updateRoom = (id: string, patch: Partial<RoomForm>) =>
        setRoomForms((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

    // ─────────────────────────────────────────────────────────────────────
    // 렌더링
    // ─────────────────────────────────────────────────────────────────────

    return (
        <ManagerLayout title="🛏️ 크루즈 룸 관리" activeTab="cruise-room">
            <div className="space-y-4">
                {/* 상단 컨트롤 */}
                <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-wrap items-end gap-3">
                    <div>
                        <label className="block text-xs text-gray-500 mb-1">크루즈 선택</label>
                        <select
                            value={selectedCruise}
                            onChange={(e) => setSelectedCruise(e.target.value)}
                            className="border border-gray-200 rounded-md px-3 py-2 text-sm min-w-[260px]"
                            disabled={loading}
                        >
                            <option value="">{loading ? '로딩 중...' : '크루즈를 선택하세요'}</option>
                            {cruiseList.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    <button type="button" onClick={handleAddRoom} disabled={!selectedCruise}
                        className="px-3 py-2 text-xs bg-emerald-50 text-emerald-600 rounded border border-emerald-200 hover:bg-emerald-100 disabled:opacity-50">
                        ➕ 새 객실 추가
                    </button>
                    <button type="button" onClick={loadData}
                        className="px-3 py-2 text-xs bg-gray-50 text-gray-600 rounded border border-gray-200 hover:bg-gray-100">
                        🔄 새로고침
                    </button>
                    <div className="ml-auto text-xs text-gray-500">
                        {selectedCruise && <span>{selectedRooms.length}개 객실</span>}
                    </div>
                </div>

                {/* 객실 카드 그리드 */}
                {!selectedCruise ? (
                    <div className="bg-white rounded-lg border border-gray-200 p-16 text-center text-sm text-gray-500">
                        위에서 크루즈를 선택하세요.
                    </div>
                ) : loading ? (
                    <div className="bg-white rounded-lg border border-gray-200 p-16 text-center text-sm text-gray-500">로딩 중...</div>
                ) : selectedRooms.length === 0 ? (
                    <div className="bg-white rounded-lg border border-gray-200 p-16 text-center text-sm text-gray-500">
                        등록된 객실이 없습니다. "➕ 새 객실 추가" 버튼을 이용하세요.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        {selectedRooms.map((row) => {
                            const form = roomForms[row.id];
                            if (!form) return null;
                            return (
                                <RoomCard
                                    key={row.id}
                                    form={form}
                                    rates={getRoomRates(row.cruise_name || '', row.room_name || '')}
                                    saving={savingId === row.id}
                                    onChange={(patch) => updateRoom(row.id, patch)}
                                    onSave={() => handleSaveRoom(form)}
                                    onDelete={() => handleDeleteRoom(row.id, form.room_name)}
                                />
                            );
                        })}
                    </div>
                )}
            </div>
        </ManagerLayout>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// RoomCard
// ─────────────────────────────────────────────────────────────────────────────

function RoomCard({ form, rates, saving, onChange, onSave, onDelete }: {
    form: RoomForm;
    rates: RateRow[];
    saving: boolean;
    onChange: (patch: Partial<RoomForm>) => void;
    onSave: () => void;
    onDelete: () => void;
}) {
    return (
        <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
            {/* 헤더 */}
            <div className="flex items-start gap-2">
                <div className="flex-1 space-y-1.5">
                    <input
                        type="text"
                        value={form.room_name}
                        onChange={(e) => onChange({ room_name: e.target.value })}
                        className="w-full px-2 py-1 text-sm font-semibold text-gray-800 border border-gray-200 rounded"
                        placeholder="객실명 (한글)"
                    />
                    <input
                        type="text"
                        value={form.name}
                        onChange={(e) => onChange({ name: e.target.value })}
                        className="w-full px-2 py-1 text-xs text-gray-500 border border-gray-200 rounded"
                        placeholder="크루즈 영문명"
                    />
                </div>
                <input
                    type="number"
                    value={form.display_order}
                    onChange={(e) => onChange({ display_order: e.target.value })}
                    className="w-16 px-2 py-1 text-xs border border-gray-200 rounded text-center"
                    title="표시 순서"
                    placeholder="순서"
                />
            </div>

            {/* 메타 */}
            <div className="grid grid-cols-3 gap-2">
                <Field label="📐 면적" value={form.room_area} onChange={(v) => onChange({ room_area: v })} placeholder="40㎡" />
                <Field label="🛏 침대" value={form.bed_type} onChange={(v) => onChange({ bed_type: v })} placeholder="더블 또는 트윈" />
                <Field label="👤 최대 인원" value={form.max_guests} onChange={(v) => onChange({ max_guests: v })} placeholder="3" type="number" />
            </div>

            {/* 배지 토글 */}
            <div className="flex flex-wrap gap-1.5">
                <Toggle label="추천" icon="★" value={form.is_recommended} onChange={(v) => onChange({ is_recommended: v })} />
                <Toggle label="VIP" value={form.is_vip} onChange={(v) => onChange({ is_vip: v })} />
                <Toggle label="발코니" icon="🌊" value={form.has_balcony} onChange={(v) => onChange({ has_balcony: v })} />
                <Toggle label="버틀러" icon="🎩" value={form.has_butler} onChange={(v) => onChange({ has_butler: v })} />
                <Toggle label="커넥팅" icon="🔗" value={form.connecting_available} onChange={(v) => onChange({ connecting_available: v })} />
                <Toggle label="엑스트라 베드" value={form.extra_bed_available} onChange={(v) => onChange({ extra_bed_available: v })} />
            </div>

            {/* 설명 / 어메니티 / 주의사항 */}
            <TextArea label="객실 설명" rows={3} value={form.room_description} onChange={(v) => onChange({ room_description: v })} />
            <div className="grid grid-cols-2 gap-2">
                <TextArea label="✨ 특별 어메니티" rows={2} value={form.special_amenities} onChange={(v) => onChange({ special_amenities: v })} />
                <TextArea label="⚠️ 주의사항" rows={2} value={form.warnings} onChange={(v) => onChange({ warnings: v })} />
            </div>

            {/* 이미지 */}
            <div className="grid grid-cols-2 gap-2">
                <Field label="대표 이미지 URL" value={form.room_image} onChange={(v) => onChange({ room_image: v })} />
                <TextArea label="추가 이미지 (한 줄에 하나씩)" rows={2} value={form.images_text} onChange={(v) => onChange({ images_text: v })} />
            </div>
            {form.room_image && (
                <img
                    src={form.room_image}
                    alt={form.room_name}
                    className="h-20 w-auto rounded border border-gray-200 object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
            )}

            {/* 가격 표시 (읽기전용) */}
            {rates.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded p-2.5">
                    <div className="text-xs text-amber-700 font-medium mb-1.5">💰 등록된 요금</div>
                    <div className="space-y-1 text-xs">
                        {rates.map((r, i) => (
                            <div key={i} className="flex flex-wrap items-center gap-2 text-gray-700">
                                <span className="px-1.5 py-0.5 bg-white border border-amber-200 rounded text-amber-700">{r.schedule_type}</span>
                                {r.season_name && <span className="text-gray-500">{r.season_name}</span>}
                                <span>성인 {formatVND(r.price_adult)}</span>
                                <span className="text-gray-400">/</span>
                                <span>아동 {formatVND(r.price_child)}</span>
                            </div>
                        ))}
                    </div>
                    <p className="text-[10px] text-amber-600 mt-1">* 가격은 별도 메뉴에서 수정합니다.</p>
                </div>
            )}

            {/* 액션 */}
            <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={onDelete}
                    className="px-3 py-1.5 text-xs bg-red-50 text-red-500 rounded border border-red-200 hover:bg-red-100">
                    삭제
                </button>
                <button type="button" onClick={onSave} disabled={saving}
                    className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50">
                    {saving ? '저장 중...' : '💾 이 객실 저장'}
                </button>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 공용 UI 컴포넌트
// ─────────────────────────────────────────────────────────────────────────────

function Field({ label, value, onChange, className = '', placeholder, type = 'text' }: {
    label: string; value: string; onChange: (v: string) => void; className?: string; placeholder?: string; type?: string;
}) {
    return (
        <div className={className}>
            <label className="block text-xs text-gray-500 mb-1">{label}</label>
            <input
                type={type}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-blue-400 focus:outline-none"
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
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-blue-400 focus:outline-none font-mono"
            />
        </div>
    );
}

function Toggle({ label, value, onChange, icon }: {
    label: string; value: boolean; onChange: (v: boolean) => void; icon?: string;
}) {
    return (
        <button type="button" onClick={() => onChange(!value)}
            className={`px-2 py-1 text-xs rounded border transition ${value
                ? 'bg-blue-50 text-blue-600 border-blue-200'
                : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'
            }`}>
            {icon && <span className="mr-1">{icon}</span>}
            {label}
        </button>
    );
}
