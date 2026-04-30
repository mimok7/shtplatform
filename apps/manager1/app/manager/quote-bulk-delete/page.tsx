'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import supabase from '@/lib/supabase';
import ManagerLayout from '@/components/ManagerLayout';
import { Search, Trash2, Copy, RefreshCw, FileText, AlertTriangle } from 'lucide-react';

interface ServiceRow {
    re_id: string;
    re_type: string;
    re_status: string;
    re_created_at: string;
}

interface QuoteGroup {
    quote_id: string | null;            // null = 견적 미연결 그룹
    quote_title: string | null;
    quote_status: string | null;
    user_id: string | null;
    user_name: string | null;
    user_email: string | null;
    services: ServiceRow[];
    created_at: string;                 // 그룹 대표 생성일 (가장 빠른 것)
}

const CHILD_TABLES = [
    'reservation_cruise',
    'reservation_cruise_car',
    'reservation_car_sht',
    'reservation_airport',
    'reservation_hotel',
    'reservation_tour',
    'reservation_rentcar',
    'reservation_package',
];

export default function QuoteBulkDeletePage() {
    const today = new Date();
    const currentYear = today.getFullYear().toString();
    const currentMonth = String(today.getMonth() + 1).padStart(2, '0');

    const [groups, setGroups] = useState<QuoteGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchInput, setSearchInput] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedYear, setSelectedYear] = useState(currentYear);
    const [selectedMonth, setSelectedMonth] = useState(currentMonth);
    const [deletingKey, setDeletingKey] = useState<string | null>(null);

    const loadGroups = useCallback(async () => {
        setLoading(true);
        try {
            // 1. 모든 reservation 조회
            const { data: reservations, error: reErr } = await supabase
                .from('reservation')
                .select('re_id, re_type, re_status, re_created_at, re_quote_id, re_user_id')
                .order('re_created_at', { ascending: false })
                .limit(2000);
            if (reErr) throw reErr;

            const quoteIds = Array.from(new Set((reservations || [])
                .map((r: any) => r.re_quote_id).filter(Boolean))) as string[];
            const userIds = Array.from(new Set((reservations || [])
                .map((r: any) => r.re_user_id).filter(Boolean))) as string[];

            // 2. quote / users 병렬 조회
            const [quoteRes, userRes] = await Promise.all([
                quoteIds.length > 0
                    ? supabase.from('quote').select('id, title, status').in('id', quoteIds)
                    : Promise.resolve({ data: [], error: null } as any),
                userIds.length > 0
                    ? supabase.from('users').select('id, name, email').in('id', userIds)
                    : Promise.resolve({ data: [], error: null } as any),
            ]);

            const quoteMap = new Map<string, any>();
            (quoteRes.data || []).forEach((q: any) => quoteMap.set(q.id, q));
            const userMap = new Map<string, any>();
            (userRes.data || []).forEach((u: any) => userMap.set(u.id, u));

            // 3. 견적 ID별로 그룹핑 (견적 ID 없으면 user_id+'-noquote' 키로 묶음)
            const groupMap = new Map<string, QuoteGroup>();
            (reservations || []).forEach((r: any) => {
                const key = r.re_quote_id ? String(r.re_quote_id) : `__nq_${r.re_user_id || r.re_id}`;
                const q = r.re_quote_id ? quoteMap.get(r.re_quote_id) : null;
                const u = r.re_user_id ? userMap.get(r.re_user_id) : null;
                let g = groupMap.get(key);
                if (!g) {
                    g = {
                        quote_id: r.re_quote_id || null,
                        quote_title: q?.title || null,
                        quote_status: q?.status || null,
                        user_id: r.re_user_id || null,
                        user_name: u?.name || null,
                        user_email: u?.email || null,
                        services: [],
                        created_at: r.re_created_at,
                    };
                    groupMap.set(key, g);
                }
                g.services.push({
                    re_id: r.re_id,
                    re_type: r.re_type,
                    re_status: r.re_status,
                    re_created_at: r.re_created_at,
                });
                if (r.re_created_at && r.re_created_at < g.created_at) {
                    g.created_at = r.re_created_at;
                }
            });

            const list = Array.from(groupMap.values())
                .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
            setGroups(list);
        } catch (err: any) {
            console.error('견적 그룹 로드 실패:', err);
            alert('로드 실패: ' + (err.message || '알 수 없는 오류'));
            setGroups([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadGroups();
    }, [loadGroups]);

    const handleCopy = async (text: string | null) => {
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
        } catch { /* noop */ }
    };

    const handleDeleteGroup = async (group: QuoteGroup) => {
        const reIds = group.services.map(s => s.re_id);
        const label = group.user_name || group.quote_title || '이 그룹';
        const confirmMsg =
            `【견적 그룹 전체 삭제】\n` +
            `${label}\n` +
            `견적ID: ${group.quote_id || '(미연결)'}\n` +
            `예약 ${reIds.length}건 + 모든 서비스 자식 + 견적 자체까지 모두 삭제됩니다.\n` +
            `되돌릴 수 없습니다. 진행할까요?`;
        if (!window.confirm(confirmMsg)) return;

        const lockKey = group.quote_id || `nq:${reIds[0]}`;
        setDeletingKey(lockKey);
        try {
            // 1. 모든 자식 테이블에서 reservation_id 일괄 삭제
            if (reIds.length > 0) {
                await Promise.all(
                    CHILD_TABLES.map(t =>
                        supabase.from(t).delete().in('reservation_id', reIds)
                            .then(({ error: e }) => {
                                if (e) console.warn(`자식 ${t} 삭제 경고:`, e.message);
                            })
                    )
                );

                // 2. reservation 본 행 삭제
                const { error: reErr } = await supabase
                    .from('reservation').delete().in('re_id', reIds);
                if (reErr) throw reErr;
            }

            // 3. 견적 cascade 삭제
            if (group.quote_id) {
                await supabase.from('quote_item').delete().eq('quote_id', group.quote_id);
                const { error: qErr } = await supabase.from('quote').delete().eq('id', group.quote_id);
                if (qErr) console.warn('견적 삭제 실패:', qErr.message);
            }

            alert('견적 그룹 전체가 삭제되었습니다.');
            await loadGroups();
        } catch (err: any) {
            console.error('전체 삭제 실패:', err);
            alert('전체 삭제 실패: ' + (err.message || '알 수 없는 오류'));
        } finally {
            setDeletingKey(null);
        }
    };

    const yearOptions = Array.from(new Set(
        groups
            .map(g => (g.created_at || '').slice(0, 4))
            .filter(Boolean)
    )).sort((a, b) => b.localeCompare(a));

    const monthOptions = Array.from(new Set(
        groups
            .filter(g => selectedYear === 'all' || (g.created_at || '').slice(0, 4) === selectedYear)
            .map(g => (g.created_at || '').slice(5, 7))
            .filter(Boolean)
    )).sort((a, b) => a.localeCompare(b));

    const filtered = groups
        .filter(g => {
            if (selectedYear !== 'all') {
                const y = (g.created_at || '').slice(0, 4);
                if (y !== selectedYear) {
                    return false;
                }
            }
            if (selectedMonth !== 'all') {
                const m = (g.created_at || '').slice(5, 7);
                if (m !== selectedMonth) {
                    return false;
                }
            }
            if (!searchTerm) return true;
            const s = searchTerm.toLowerCase();
            return (
                (g.quote_id || '').toLowerCase().includes(s) ||
                (g.quote_title || '').toLowerCase().includes(s) ||
                (g.user_name || '').toLowerCase().includes(s) ||
                (g.user_email || '').toLowerCase().includes(s)
            );
        })
        .sort((a, b) => {
            const nameA = (a.user_name || '').trim();
            const nameB = (b.user_name || '').trim();
            return nameA.localeCompare(nameB, 'ko-KR');
        });

    const groupedByDate = filtered.reduce((acc, item) => {
        const key = item.created_at ? item.created_at.slice(0, 10) : '날짜없음';
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
    }, {} as Record<string, QuoteGroup[]>);

    const dateKeys = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a));

    return (
        <ManagerLayout title="견적 그룹 일괄 삭제" activeTab="tools">
            <div className="space-y-4">
                {/* 헤더 / 안내 */}
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-yellow-800">
                        <div className="font-semibold mb-1">주의: 이 페이지의 "전체 삭제"는 되돌릴 수 없습니다.</div>
                        <div>
                            견적 ID별로 묶인 모든 예약 + 서비스 자식 테이블({CHILD_TABLES.length}종) + 견적/견적 항목까지 한 번에 삭제됩니다.
                            서비스 1건만 지우려면 <Link href="/manager/reservation-edit" className="text-blue-700 underline">예약 수정</Link> 페이지의 휴지통 버튼을 사용하세요.
                        </div>
                    </div>
                </div>

                {/* 검색 / 필터 */}
                <div className="flex items-center gap-1 overflow-x-auto">
                    <div className="relative w-32 flex-shrink-0">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                        <input
                            type="text"
                            placeholder="검색"
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') setSearchTerm(searchInput); }}
                            className="w-full pl-7 pr-2 py-1 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <button
                        onClick={() => setSearchTerm(searchInput)}
                        className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 flex-shrink-0"
                    >
                        검색
                    </button>
                    <button
                        onClick={() => { setSearchTerm(''); setSearchInput(''); }}
                        className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs hover:bg-gray-200 flex-shrink-0"
                    >
                        초기화
                    </button>
                    <select
                        value={selectedYear}
                        onChange={(e) => {
                            setSelectedYear(e.target.value);
                            setSelectedMonth('all');
                        }}
                        className="w-32 px-2 py-1 bg-white text-gray-700 border border-gray-300 rounded text-xs flex-shrink-0"
                    >
                        <option value="all">전체 연도</option>
                        {yearOptions.map((y) => (
                            <option key={y} value={y}>{y}년</option>
                        ))}
                    </select>
                    <select
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="w-32 px-2 py-1 bg-white text-gray-700 border border-gray-300 rounded text-xs flex-shrink-0"
                    >
                        <option value="all">전체 월</option>
                        {monthOptions.map((m) => (
                            <option key={m} value={m}>{Number(m)}월</option>
                        ))}
                    </select>
                    <button
                        onClick={() => {
                            setSelectedYear('all');
                            setSelectedMonth('all');
                        }}
                        className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs hover:bg-gray-200 flex-shrink-0"
                    >
                        전체보기
                    </button>
                    <button
                        onClick={loadGroups}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-gray-50 text-gray-700 border border-gray-200 rounded text-xs hover:bg-gray-100 flex-shrink-0"
                    >
                        <RefreshCw className="w-3 h-3" />
                        새로고침
                    </button>
                </div>

                {/* 카운트 */}
                <div className="text-sm text-gray-600">
                    총 <span className="font-semibold text-gray-900">{filtered.length}</span> 견적 그룹
                </div>

                {/* 목록 */}
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                        <FileText className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                        결과가 없습니다.
                    </div>
                ) : (
                    <div className="space-y-5">
                        {dateKeys.map((dateKey) => (
                            <div key={dateKey} className="space-y-3">
                                <div className="flex items-center justify-between border-b border-gray-200 pb-2">
                                    <h3 className="text-sm font-semibold text-gray-800">생성일: {dateKey}</h3>
                                    <span className="text-xs text-gray-500">{groupedByDate[dateKey].length}건</span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                                    {groupedByDate[dateKey].map((g) => {
                                        const key = g.quote_id || `nq:${g.services[0]?.re_id}`;
                                        const isDel = deletingKey === key;
                                        return (
                                            <div
                                                key={key}
                                                className="bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow p-4 flex flex-col gap-3"
                                            >
                                                <div className="pb-2 border-b border-gray-100">
                                                    <div className="text-base font-semibold text-gray-900 leading-tight">
                                                        {g.user_name || '예약자 정보 없음'}
                                                    </div>
                                                    <div className="text-xs text-gray-500 mt-1 break-all">
                                                        {g.user_email || '-'}
                                                    </div>
                                                </div>

                                                <div className="space-y-2 text-xs">
                                                    <div>
                                                        <div className="text-gray-400">견적 ID</div>
                                                        <div className="font-mono text-gray-700 break-all flex items-center gap-1 mt-0.5">
                                                            <span>{g.quote_id || '(미연결)'}</span>
                                                            {g.quote_id && (
                                                                <button
                                                                    onClick={() => handleCopy(g.quote_id)}
                                                                    className="text-gray-400 hover:text-blue-600"
                                                                    title="복사"
                                                                >
                                                                    <Copy className="w-3 h-3" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <div className="text-gray-400">행복여행 이름</div>
                                                        <div className="text-gray-800 mt-0.5">{g.quote_title || '-'}</div>
                                                        <div className="text-[11px] text-gray-500">상태: {g.quote_status || '-'}</div>
                                                    </div>

                                                    <div>
                                                        <div className="text-gray-400">서비스</div>
                                                        <div className="flex flex-wrap gap-1 mt-1">
                                                            {g.services.map((s) => (
                                                                <span
                                                                    key={s.re_id}
                                                                    className="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 text-[11px]"
                                                                    title={`${s.re_id} (${s.re_status})`}
                                                                >
                                                                    {s.re_type}
                                                                </span>
                                                            ))}
                                                        </div>
                                                        <div className="text-[11px] text-gray-400 mt-1">총 {g.services.length}건</div>
                                                    </div>

                                                    <div>
                                                        <div className="text-gray-400">생성일</div>
                                                        <div className="text-gray-600 mt-0.5">
                                                            {g.created_at ? g.created_at.replace('T', ' ').slice(0, 16) : '-'}
                                                        </div>
                                                    </div>
                                                </div>

                                                <button
                                                    onClick={() => handleDeleteGroup(g)}
                                                    disabled={isDel}
                                                    className="mt-auto inline-flex items-center justify-center gap-1 px-3 py-2 bg-red-600 text-white rounded-md text-xs hover:bg-red-700 disabled:opacity-50"
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                    {isDel ? '삭제 중...' : '전체 삭제'}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </ManagerLayout>
    );
}
