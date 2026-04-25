'use client';

import React, { useState, useEffect, useMemo } from 'react';
import supabase from '@/lib/supabase';
import ManagerLayout from '@/components/ManagerLayout';
import { Search, Calendar, User, FileText, Trash2, Upload } from 'lucide-react';
import { fetchTableInBatches } from '@/lib/fetchInBatches';

interface DocumentRow {
    id: string;
    user_id: string;
    reservation_id?: string;
    document_type: 'passport' | 'boarding_code';
    image_data: string;
    checkout_date?: string;
    created_at: string;
    updated_at: string;
}

interface CruiseInfo {
    reservation_id: string;
    checkin?: string;
    room_price_code?: string;
    cruise_name?: string;
    room_type?: string;
    schedule_type?: string;
}

interface UserInfo {
    id: string;
    name?: string;
    email?: string;
    korean_name?: string;
    english_name?: string;
    phone_number?: string;
}

interface CombinedRow {
    key: string;
    user_id: string;
    user: UserInfo;
    passports: DocumentRow[];
    reservation_ids: string[];
    boardingCodes: (DocumentRow & { cruise?: CruiseInfo })[];
    cruise_name?: string;
    room_type?: string;
    checkin?: string;
    nextCheckin?: string;
}

/** 이미지를 최대 800px, JPEG 60% 품질로 리사이즈 */
async function resizeImage(file: File): Promise<string> {
    const src = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('파일 읽기 실패'));
        reader.readAsDataURL(file);
    });
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new window.Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('이미지 로딩 실패'));
        el.src = src;
    });
    const MAX = 800;
    const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
    const w = Math.max(1, Math.round(img.width * ratio));
    const h = Math.max(1, Math.round(img.height * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context 생성 실패');
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.6);
}

const toDateKey = (v?: string) => {
    if (!v) return '';
    if (typeof v === 'string' && v.length >= 10 && v[4] === '-' && v[7] === '-') return v.slice(0, 10);
    const d = new Date(v);
    if (isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const todayDateKey = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const addDays = (dateKey: string, days: number) => {
    if (!dateKey) return null;
    const d = new Date(`${dateKey}T00:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
};

const isUuid = (value?: string | null) => {
    if (!value) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
};

export default function PassportManagementPage() {
    const [rows, setRows] = useState<CombinedRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [typeFilter, setTypeFilter] = useState<'all' | 'passport_only' | 'boarding_only' | 'missing'>('all');
    const [futureOnly, setFutureOnly] = useState(true);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [uploading, setUploading] = useState<string | null>(null); // user_id being uploaded for

    const loadData = async () => {
        try {
            setLoading(true);

            // cruise_document: Supabase 기본 제한(1000행) 방지를 위해 limit 명시
            const { data: docsData, error: docErr } = await supabase
                .from('cruise_document')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(10000);

            if (docErr) {
                console.error(docErr);
                return;
            }

            const docs = (docsData || []) as DocumentRow[];

            const { data: cruiseRowsData, error: cruiseErr } = await supabase
                .from('reservation_cruise')
                .select('reservation_id, checkin, room_price_code')
                .limit(10000);

            if (cruiseErr) {
                console.error('reservation_cruise 조회 오류:', cruiseErr);
                setRows([]);
                return;
            }

            const cruiseRows: any[] = (cruiseRowsData as any[]) || [];
            if (docs.length === 0 && cruiseRows.length === 0) {
                setRows([]);
                return;
            }

            const cruiseReservationIds = Array.from(new Set(cruiseRows.map(c => c.reservation_id).filter(Boolean)));

            const reservationUserMap: Record<string, string> = {};
            if (cruiseReservationIds.length > 0) {
                const resRows = await fetchTableInBatches<{ re_id: string; re_user_id: string }>(
                    'reservation',
                    're_id',
                    cruiseReservationIds,
                    're_id, re_user_id',
                    200
                );

                (resRows || []).forEach((r) => {
                    if (r.re_id && r.re_user_id) {
                        reservationUserMap[r.re_id] = r.re_user_id;
                    }
                });

                // 1차 배치에서 누락된 예약은 더 작은 배치로 재시도
                const unresolvedReservationIds = cruiseReservationIds.filter((id) => !reservationUserMap[id]);
                if (unresolvedReservationIds.length > 0) {
                    const retryRows = await fetchTableInBatches<{ re_id: string; re_user_id: string }>(
                        'reservation',
                        're_id',
                        unresolvedReservationIds,
                        're_id, re_user_id',
                        20
                    );

                    (retryRows || []).forEach((r) => {
                        if (r.re_id && r.re_user_id) {
                            reservationUserMap[r.re_id] = r.re_user_id;
                        }
                    });
                }
            }

            const roomCodes = Array.from(new Set(cruiseRows.map(c => c.room_price_code).filter(Boolean)));
            const rateMap: Record<string, { cruise_name?: string; room_type?: string; schedule_type?: string }> = {};

            if (roomCodes.length > 0) {
                const uuidRoomCodes = roomCodes.filter((code) => isUuid(String(code)));

                if (uuidRoomCodes.length > 0) {
                    const rateRows = await fetchTableInBatches<{ id: string; cruise_name?: string; room_type?: string; schedule_type?: string }>(
                        'cruise_rate_card',
                        'id',
                        uuidRoomCodes,
                        'id, cruise_name, room_type, schedule_type',
                        100
                    );

                    (rateRows || []).forEach(r => {
                        rateMap[r.id] = {
                            cruise_name: r.cruise_name,
                            room_type: r.room_type,
                            schedule_type: r.schedule_type,
                        };
                    });
                }
            }

            const cruiseMap: Record<string, CruiseInfo> = {};
            const checkinsByUser: Record<string, string[]> = {};

            cruiseRows.forEach(c => {
                const reservationId = c.reservation_id;
                const userId = reservationUserMap[reservationId] || `unknown:${reservationId}`;
                const rate = c.room_price_code ? rateMap[c.room_price_code] : undefined;

                if (!cruiseMap[reservationId]) {
                    cruiseMap[reservationId] = {
                        reservation_id: reservationId,
                        checkin: c.checkin,
                        room_price_code: c.room_price_code,
                        cruise_name: rate?.cruise_name,
                        room_type: rate?.room_type,
                        schedule_type: rate?.schedule_type,
                    };
                }

                if (userId && c.checkin) {
                    if (!checkinsByUser[userId]) checkinsByUser[userId] = [];
                    checkinsByUser[userId].push(toDateKey(c.checkin));
                }
            });

            const allCruiseUserIds = Object.keys(checkinsByUser);
            const docUserIds = Array.from(new Set(docs.map(d => d.user_id).filter(Boolean)));
            const allUserIds = Array.from(new Set([...allCruiseUserIds, ...docUserIds])).filter((id) => !String(id).startsWith('unknown:'));

            const userMap: Record<string, UserInfo> = {};
            if (allUserIds.length > 0) {
                const usersData = await fetchTableInBatches<UserInfo>(
                    'users',
                    'id',
                    allUserIds,
                    'id, name, email, english_name, phone_number',
                    100
                );
                (usersData || []).forEach(u => {
                    userMap[u.id] = u;
                });
            }

            const todayStr = todayDateKey();

            const passportByUser: Record<string, DocumentRow[]> = {};
            const boardingByReservation: Record<string, DocumentRow[]> = {};

            docs.forEach(d => {
                if (d.document_type === 'passport') {
                    if (!passportByUser[d.user_id]) passportByUser[d.user_id] = [];
                    passportByUser[d.user_id].push(d);
                } else if (d.reservation_id) {
                    if (!boardingByReservation[d.reservation_id]) boardingByReservation[d.reservation_id] = [];
                    boardingByReservation[d.reservation_id].push(d);
                }
            });

            Object.values(passportByUser).forEach((list) => {
                list.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
            });

            const grouped: Record<string, CombinedRow> = {};

            cruiseRows.forEach((c: any) => {
                const reservationId = c.reservation_id;
                const userId = reservationUserMap[reservationId] || `unknown:${reservationId}`;
                const user = userId.startsWith('unknown:')
                    ? { id: userId, name: '사용자 확인 필요' }
                    : (userMap[userId] || { id: userId });
                const cruise = cruiseMap[reservationId];
                const checkin = toDateKey(c.checkin);

                const key = [
                    user.name || user.korean_name || '',
                    user.email || '',
                    cruise?.cruise_name || '',
                    cruise?.room_type || '',
                    checkin || ''
                ].join('|');

                if (!grouped[key]) {
                    const sortedCheckins = (checkinsByUser[userId] || [])
                        .filter(Boolean)
                        .sort((a, b) => a.localeCompare(b));
                    const nextCheckin = sortedCheckins.find(d => d >= todayStr) || sortedCheckins[0];

                    grouped[key] = {
                        key,
                        user_id: userId,
                        user,
                        passports: passportByUser[userId] || [],
                        reservation_ids: [],
                        boardingCodes: [],
                        cruise_name: cruise?.cruise_name,
                        room_type: cruise?.room_type,
                        checkin,
                        nextCheckin,
                    };
                }

                if (!grouped[key].reservation_ids.includes(reservationId)) {
                    grouped[key].reservation_ids.push(reservationId);
                }

                const boardingDocs = boardingByReservation[reservationId] || [];
                boardingDocs.forEach((doc) => {
                    if (!grouped[key].boardingCodes.some((existing) => existing.id === doc.id)) {
                        grouped[key].boardingCodes.push({ ...doc, cruise });
                    }
                });
            });

            // reservation 매핑 누락/RLS 등으로 크루즈 그룹이 생성되지 않아도
            // 여권이 등록된 사용자는 목록에서 확인할 수 있도록 fallback 행을 생성
            docUserIds.forEach((userId) => {
                const user = userMap[userId] || { id: userId };
                const alreadyExists = Object.values(grouped).some((g) => g.user_id === userId);
                if (alreadyExists) return;

                const sortedCheckins = (checkinsByUser[userId] || [])
                    .filter(Boolean)
                    .sort((a, b) => a.localeCompare(b));
                const nextCheckin = sortedCheckins.find((d) => d >= todayStr) || sortedCheckins[0];
                const key = [
                    user.name || user.korean_name || '',
                    user.email || '',
                    'doc-fallback',
                    '',
                    nextCheckin || ''
                ].join('|');

                grouped[key] = {
                    key,
                    user_id: userId,
                    user,
                    passports: passportByUser[userId] || [],
                    reservation_ids: [],
                    boardingCodes: [],
                    cruise_name: '-',
                    room_type: '-',
                    checkin: nextCheckin,
                    nextCheckin,
                };
            });

            const result = Object.values(grouped).sort((a, b) => {
                const dateCompare = (a.checkin || '9999-12-31').localeCompare(b.checkin || '9999-12-31');
                if (dateCompare !== 0) return dateCompare;
                return (a.user.name || a.user.korean_name || '').localeCompare(b.user.name || b.user.korean_name || '');
            });

            setRows(result);
        } catch (err) {
            console.error('데이터 로드 오류:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadData(); }, []);

    // 필터링
    const filtered = useMemo(() => {
        let list = [...rows];
        const today = todayDateKey();

        // 오늘 이후 일정만 보기 (기본 활성화)
        if (futureOnly) {
            list = list.filter(r => {
                if (r.checkin) return r.checkin >= today;
                // 일정 매핑이 누락되어도 등록된 여권은 확인 가능하도록 유지
                return r.passports.length > 0;
            });
        }

        if (typeFilter === 'passport_only') {
            list = list.filter(r => r.passports.length > 0);
        } else if (typeFilter === 'boarding_only') {
            list = list.filter(r => r.boardingCodes.length > 0);
        } else if (typeFilter === 'missing') {
            list = list.filter(r => r.passports.length === 0);
        }

        if (searchTerm) {
            const q = searchTerm.toLowerCase();
            list = list.filter(r =>
                r.user.name?.toLowerCase().includes(q) ||
                r.user.korean_name?.toLowerCase().includes(q) ||
                r.user.english_name?.toLowerCase().includes(q) ||
                r.user.email?.toLowerCase().includes(q) ||
                r.cruise_name?.toLowerCase().includes(q) ||
                r.room_type?.toLowerCase().includes(q) ||
                r.checkin?.includes(q)
            );
        }

        return list;
    }, [rows, typeFilter, searchTerm, futureOnly]);

    const groupedByCheckin = useMemo(() => {
        const groups: Record<string, CombinedRow[]> = {};
        filtered.forEach((row) => {
            const dateKey = row.checkin || '-';
            if (!groups[dateKey]) groups[dateKey] = [];
            groups[dateKey].push(row);
        });

        return Object.keys(groups)
            .sort((a, b) => a.localeCompare(b))
            .map((dateKey) => ({ dateKey, rows: groups[dateKey] }));
    }, [filtered]);

    // 여권 사진 업로드 (매니저가 대신 업로드)
    const handleUploadPassport = async (row: CombinedRow, file: File) => {
        if (!row.reservation_ids.length) {
            alert('연결된 크루즈 예약이 없어 여권을 업로드할 수 없습니다.');
            return;
        }

        try {
            setUploading(row.user_id);
            const imageData = await resizeImage(file);

            const reservationId = row.reservation_ids[0];
            const checkoutDate = row.checkin ? addDays(row.checkin, 2) : null;

            const { error } = await supabase
                .from('cruise_document')
                .insert({
                    user_id: row.user_id,
                    reservation_id: reservationId,
                    document_type: 'passport',
                    image_data: imageData,
                    checkout_date: checkoutDate,
                });
            if (error) throw error;
            await loadData();
        } catch (err) {
            console.error('여권 업로드 오류:', err);
            alert('여권 사진 업로드에 실패했습니다.');
        } finally {
            setUploading(null);
        }
    };

    // 문서 삭제
    const handleDelete = async (docId: string, type: string) => {
        if (!confirm(`${type === 'passport' ? '여권 사진' : '승선코드 이미지'}를 삭제하시겠습니까?`)) return;
        const { error } = await supabase.from('cruise_document').delete().eq('id', docId);
        if (error) { alert('삭제 실패'); return; }
        await loadData();
    };

    const handleUploadBoardingCode = async (row: CombinedRow, file: File) => {
        if (!row.reservation_ids.length) {
            alert('연결된 예약이 없어 승선코드를 업로드할 수 없습니다.');
            return;
        }

        try {
            setUploading(`boarding-${row.key}`);
            const imageData = await resizeImage(file);

            for (const reservationId of row.reservation_ids) {
                const existing = row.boardingCodes.find((d) => d.reservation_id === reservationId);

                if (existing) {
                    const { error } = await supabase
                        .from('cruise_document')
                        .update({ image_data: imageData, updated_at: new Date().toISOString() })
                        .eq('id', existing.id);
                    if (error) throw error;
                } else {
                    const { error } = await supabase
                        .from('cruise_document')
                        .insert({
                            user_id: row.user_id,
                            reservation_id: reservationId,
                            document_type: 'boarding_code',
                            image_data: imageData,
                        });
                    if (error) throw error;
                }
            }

            await loadData();
        } catch (err) {
            console.error('승선코드 업로드 오류:', err);
            alert('승선코드 이미지 업로드에 실패했습니다.');
        } finally {
            setUploading(null);
        }
    };

    if (loading) {
        return (
            <ManagerLayout title="여권 관리" activeTab="passport-management">
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
                    <p className="ml-4 text-gray-600">데이터를 불러오는 중...</p>
                </div>
            </ManagerLayout>
        );
    }

    return (
        <ManagerLayout title="여권 관리" activeTab="passport-management">
            <div className="space-y-6">
                <div className="bg-white rounded-lg shadow-sm p-6">
                    <div className="flex items-center gap-3">
                        <FileText className="w-6 h-6 text-blue-600" />
                        <h1 className="text-xl font-bold text-gray-800">크루즈 문서 관리 (여권 / 승선코드)</h1>
                    </div>
                </div>

                {/* 필터 */}
                <div className="bg-white rounded-lg shadow-sm p-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">문서 유형</label>
                            <div className="flex flex-wrap gap-2">
                                {[
                                    { key: 'all', label: '전체' },
                                    { key: 'passport_only', label: '여권 있음' },
                                    { key: 'boarding_only', label: '승선코드 있음' },
                                    { key: 'missing', label: '여권 미등록' },
                                ].map(f => (
                                    <button
                                        key={f.key}
                                        onClick={() => setTypeFilter(f.key as any)}
                                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${typeFilter === f.key ? 'bg-blue-200 text-blue-800' : 'bg-gray-100 text-gray-700'}`}
                                    >
                                        {f.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">일정</label>
                            <button
                                type="button"
                                onClick={() => setFutureOnly(prev => !prev)}
                                className={`text-xs px-3 py-1 rounded border inline-block transition-colors ${futureOnly
                                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                                    : 'bg-gray-50 text-gray-600 border-gray-200'
                                    }`}
                                title="체크인 기준으로 오늘 이후 일정만 표시합니다."
                            >
                                {futureOnly ? '✅ 오늘 이후 체크인만 표시' : '오늘 이후 체크인만 표시'}
                            </button>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">검색</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="이름, 이메일 검색"
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    className="w-full pl-10 pr-3 py-2 border border-gray-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* 목록 */}
                <div className="bg-white rounded-lg shadow-sm">
                    <div className="p-6 border-b border-gray-200">
                        <h2 className="text-lg font-semibold text-gray-800">
                            고객 목록 ({filtered.length}그룹)
                        </h2>
                    </div>

                    {filtered.length === 0 ? (
                        <div className="p-12 text-center text-gray-500">
                            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <p>조건에 맞는 데이터가 없습니다.</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {groupedByCheckin.map(group => (
                                <div key={group.dateKey}>
                                    <div className="px-4 py-2 bg-blue-50 border-y border-blue-100 text-sm font-semibold text-blue-800">
                                        체크인 {group.dateKey} ({group.rows.length}건)
                                    </div>
                                    {group.rows.map(row => (
                                        <div key={row.key} className="p-4 hover:bg-gray-50 transition-colors">
                                            <div className="flex flex-wrap gap-2 mb-3">
                                                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${row.passports.length > 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-700'}`}>
                                                    여권 {row.passports.length > 0 ? `${row.passports.length}장` : '미등록'}
                                                </span>
                                                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${row.boardingCodes.length > 0 ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                                                    승선코드 {row.boardingCodes.length > 0 ? '등록' : '미등록'}
                                                </span>
                                            </div>
                                            <div className="flex flex-col md:flex-row md:items-start gap-4">
                                                {/* 사용자 정보 */}
                                                <div className="flex-shrink-0 w-48">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <User className="w-4 h-4 text-gray-400" />
                                                        <span className="text-sm font-medium text-gray-900">
                                                            {row.user.name || row.user.korean_name || '이름 없음'}
                                                        </span>
                                                    </div>
                                                    {row.user.english_name && (
                                                        <p className="text-xs text-gray-500 ml-6">{row.user.english_name}</p>
                                                    )}
                                                    <p className="text-xs text-gray-400 ml-6">이메일: {row.user.email || '-'}</p>
                                                    <p className="text-xs text-gray-600 ml-6 mt-1">크루즈: {row.cruise_name || '-'}</p>
                                                    <p className="text-xs text-gray-600 ml-6">객실: {row.room_type || '-'}</p>
                                                    {row.checkin && (
                                                        <p className="text-xs text-blue-600 ml-6 mt-1">
                                                            <Calendar className="w-3 h-3 inline mr-1" />
                                                            체크인: {toDateKey(row.checkin)}
                                                        </p>
                                                    )}
                                                </div>

                                                {/* 여권 사진 */}
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-medium text-gray-700 mb-1">여권 사진</p>
                                                    {row.passports.length > 0 ? (
                                                        <div className="flex gap-2 overflow-x-auto whitespace-nowrap pb-1">
                                                            {row.passports.map((passport) => (
                                                                <div key={passport.id} className="space-y-1 shrink-0">
                                                                    <img
                                                                        src={passport.image_data}
                                                                        alt="여권"
                                                                        className="w-28 h-20 object-cover rounded border border-gray-200 cursor-pointer"
                                                                        onClick={() => setPreviewImage(passport.image_data)}
                                                                    />
                                                                    <div className="flex items-center justify-between">
                                                                        <span className="text-[11px] text-green-600">등록됨</span>
                                                                        <button onClick={() => handleDelete(passport.id, 'passport')} className="text-xs text-red-400 hover:text-red-600">
                                                                            <Trash2 className="w-3 h-3" />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <div className="w-28 h-20 bg-gray-100 rounded border border-dashed border-gray-300 flex items-center justify-center mb-1">
                                                            <span className="text-xs text-gray-400">미등록</span>
                                                        </div>
                                                    )}
                                                    <label className="inline-flex items-center gap-1 text-xs text-blue-600 cursor-pointer hover:text-blue-800 mt-1">
                                                        <Upload className="w-3 h-3" />
                                                        {uploading === row.user_id ? '업로드 중...' : '업로드'}
                                                        <input
                                                            type="file"
                                                            accept="image/*"
                                                            className="hidden"
                                                            disabled={uploading === row.user_id}
                                                            onChange={async (e) => {
                                                                const file = e.target.files?.[0];
                                                                if (file) await handleUploadPassport(row, file);
                                                                e.target.value = '';
                                                            }}
                                                        />
                                                    </label>
                                                </div>

                                                {/* 승선코드 이미지 목록 */}
                                                <div className="flex-1">
                                                    <p className="text-xs font-medium text-gray-700 mb-1">승선코드 이미지</p>
                                                    {row.boardingCodes.length > 0 ? (
                                                        <div className="flex flex-wrap gap-3">
                                                            {row.boardingCodes.map(bc => (
                                                                <div key={bc.id} className="bg-gray-50 rounded p-2 border border-gray-200">
                                                                    <img
                                                                        src={bc.image_data}
                                                                        alt="승선코드"
                                                                        className="w-24 h-16 object-cover rounded cursor-pointer"
                                                                        onClick={() => setPreviewImage(bc.image_data)}
                                                                    />
                                                                    <div className="text-xs text-gray-500 mt-1">
                                                                        {bc.cruise?.cruise_name || ''}
                                                                        {bc.cruise?.checkin && <span className="ml-1">{toDateKey(bc.cruise.checkin)}</span>}
                                                                    </div>
                                                                    <button onClick={() => handleDelete(bc.id, 'boarding_code')} className="text-xs text-red-400 hover:text-red-600 mt-1">
                                                                        <Trash2 className="w-3 h-3 inline" /> 삭제
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-gray-400">없음</span>
                                                    )}
                                                    <div className="mt-2">
                                                        <label className="inline-flex items-center gap-1 text-xs text-blue-600 cursor-pointer hover:text-blue-800">
                                                            <Upload className="w-3 h-3" />
                                                            {uploading === `boarding-${row.key}` ? '업로드 중...' : '승선코드 업로드'}
                                                            <input
                                                                type="file"
                                                                accept="image/*"
                                                                className="hidden"
                                                                disabled={uploading === `boarding-${row.key}`}
                                                                onChange={async (e) => {
                                                                    const file = e.target.files?.[0];
                                                                    if (file) await handleUploadBoardingCode(row, file);
                                                                    e.target.value = '';
                                                                }}
                                                            />
                                                        </label>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* 이미지 미리보기 모달 */}
            {previewImage && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setPreviewImage(null)}>
                    <div className="relative max-w-2xl max-h-[80vh]" onClick={e => e.stopPropagation()}>
                        <img src={previewImage} alt="미리보기" className="max-w-full max-h-[80vh] rounded-lg shadow-xl" />
                        <button
                            onClick={() => setPreviewImage(null)}
                            className="absolute -top-3 -right-3 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center text-gray-600 hover:text-gray-900"
                        >
                            ✕
                        </button>
                    </div>
                </div>
            )}
        </ManagerLayout>
    );
}
