'use client';

import React, { useState, useEffect, useMemo } from 'react';
import supabase from '@/lib/supabase';
import ManagerLayout from '@/components/ManagerLayout';
import { Search, Calendar, User, AlertCircle, CheckCircle, Ship } from 'lucide-react';
import { fetchTableInBatches } from '@/lib/fetchInBatches';

interface CruiseDetail {
    id?: string; // reservation_cruise PK
    boarding_code?: string;
    boarding_code_image?: string;
    checkin?: string;
    room_price_code?: string;
    guest_count?: number;
    room_total_price?: number;
    request_note?: string;
    cruise_name?: string;
    room_type?: string;
    room_category?: string;
}

interface CruiseReservation {
    reservation_id: string;
    re_user_id: string;
    re_quote_id: string;
    re_status: string;
    re_created_at: string;
    re_type?: string; // 예약 타입 (cruise, package 등)
    checkin?: string; // 대표 체크인 날짜
    boarding_code?: string; // 대표 승선 코드 (필터/표시용)
    boarding_code_image?: string; // 대표 승선 코드 이미지 (data URL)

    items: CruiseDetail[]; // 상세 항목 리스트

    users?: {
        name?: string;
        phone?: string;
        email?: string;
    };
    quote?: {
        title?: string;
        quote_id?: string;
    };
}

const BoardingCodePage = () => {
    const [reservations, setReservations] = useState<CruiseReservation[]>([]);
    const [filteredReservations, setFilteredReservations] = useState<CruiseReservation[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // 필터 상태
    const [statusFilter, setStatusFilter] = useState<'all' | 'has_code' | 'no_code'>('all');
    const [dateFilter, setDateFilter] = useState<string>('');
    const [futureOnly, setFutureOnly] = useState<boolean>(false);
    const [searchTerm, setSearchTerm] = useState<string>('');

    // 편집 상태
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingCode, setEditingCode] = useState<string>('');
    const [editingImage, setEditingImage] = useState<string>('');
    const [editingImageName, setEditingImageName] = useState<string>('');

    const resizeImageToDataUrl = async (file: File): Promise<string> => {
        const src = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('이미지 파일을 읽지 못했습니다.'));
            reader.readAsDataURL(file);
        });

        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new Image();
            el.onload = () => resolve(el);
            el.onerror = () => reject(new Error('이미지 로딩에 실패했습니다.'));
            el.src = src;
        });

        const MAX = 800;
        const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
        const targetWidth = Math.max(1, Math.round(img.width * ratio));
        const targetHeight = Math.max(1, Math.round(img.height * ratio));

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('이미지 변환 컨텍스트를 생성하지 못했습니다.');
        }

        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        return canvas.toDataURL('image/jpeg', 0.6);
    };

    // 날짜 비교를 위한 YYYY-MM-DD 키 함수 (타임존 영향 최소화)
    const toDateKey = (input?: string) => {
        if (!input) return '';
        // 문자열인 경우 ISO/일반 날짜 문자열의 앞 10자리(YYYY-MM-DD)만 사용
        if (typeof input === 'string') {
            if (input.length >= 10 && input[4] === '-' && input[7] === '-') return input.slice(0, 10);
            // 포맷이 다르면 Date 파싱 후 en-CA로 변환
            const d = new Date(input);
            return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-CA');
        }
        const d = new Date(input as any);
        return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-CA');
    };

    const todayKey = () => new Date().toLocaleDateString('en-CA');

    // 크루즈 예약 데이터 로드 (매니저 뷰 + 배치 조회)
    const loadCruiseReservations = async () => {
        try {
            setLoading(true);
            setError(null);

            // 1) reservation_cruise 테이블에서 직접 조회 (모든 크루즈 서비스 포함)
            // 패키지 예약에 포함된 크루즈도 표시하기 위해 reservation_cruise 기준으로 조회
            const { data: cruiseRows, error: cruiseErr } = await supabase
                .from('reservation_cruise')
                .select('id, reservation_id, boarding_code, checkin, room_price_code, guest_count, room_total_price, request_note')
                .order('checkin', { ascending: true })
                .limit(10000);

            if (cruiseErr) {
                console.error('크루즈 예약 목록 조회 오류:', cruiseErr);
                setError('크루즈 예약 목록을 불러오지 못했습니다.');
                setReservations([]);
                return;
            }

            if (!cruiseRows || cruiseRows.length === 0) {
                setReservations([]);
                return;
            }

            // 예약 ID 수집
            const reIds = Array.from(new Set(cruiseRows.map(r => r.reservation_id).filter(Boolean)));
            console.log(`📊 총 ${cruiseRows.length}건의 크루즈 데이터, ${reIds.length}개 예약 처리 시작...`);

            // 2) reservation 테이블에서 예약 정보 조회
            const { data: baseRows, error: baseErr } = await supabase
                .from('reservation')
                .select('re_id, re_user_id, re_quote_id, re_status, re_created_at, re_type')
                .in('re_id', reIds);

            if (baseErr) {
                console.error('예약 정보 조회 오류:', baseErr);
            }

            const reservationMap: Record<string, any> = {};
            (baseRows || []).forEach((r: any) => {
                reservationMap[r.re_id] = r;
            });

            const quoteIds = (baseRows || []).map(r => r.re_quote_id).filter(Boolean);
            const userIds = Array.from(new Set((baseRows || []).map(r => r.re_user_id).filter(Boolean))) as string[];

            console.log(`📊 총 ${baseRows.length}건의 예약 데이터 처리 시작...`);

            // 1.5) 사용자 정보 배치 조회 (bulk/page.tsx 패턴 적용)
            let userMap: Record<string, any> = {};
            if (userIds.length > 0) {
                console.log(`👥 사용자 배치 조회: ${userIds.length}명`);
                const usersData = await fetchTableInBatches<{ id: string; name?: string; email?: string; phone_number?: string }>(
                    'users', 'id', userIds, 'id, name, email, phone_number', 100
                );

                if (usersData) {
                    usersData.forEach(u => {
                        userMap[u.id] = {
                            name: u.name,
                            email: u.email,
                            phone: u.phone_number // phone_number를 phone으로 매핑할 예정
                        };
                    });
                }
                console.log('✅ 사용자 데이터 로드 완료');
            }

            // 2) cruiseRows에서 직접 cruiseMap 구성 (중복 조회 제거)
            let cruiseMap: Record<string, any[]> = {};
            cruiseRows.forEach((row: any) => {
                if (!cruiseMap[row.reservation_id]) {
                    cruiseMap[row.reservation_id] = [];
                }
                cruiseMap[row.reservation_id].push(row);
            });
            console.log(`✅ cruiseMap 구성 완료: ${Object.keys(cruiseMap).length}그룹`);

            // 3) quote 타이틀을 배치로 조회하여 맵 구성 (청크 단위 처리)
            let quoteMap: Record<string, any> = {};
            if (quoteIds.length > 0) {
                const CHUNK_SIZE = 200;
                const chunks: string[][] = [];
                for (let i = 0; i < quoteIds.length; i += CHUNK_SIZE) {
                    chunks.push(quoteIds.slice(i, i + CHUNK_SIZE));
                }

                console.log(`🔄 quote 조회 중... (${chunks.length}개 청크)`);
                for (let idx = 0; idx < chunks.length; idx++) {
                    const chunk = chunks[idx];
                    const { data: quotes, error: quoteErr } = await supabase
                        .from('quote')
                        .select('id, title')
                        .in('id', chunk);

                    if (!quoteErr && quotes) {
                        quotes.forEach((q: any) => {
                            quoteMap[q.id] = q;
                        });
                    } else if (quoteErr) {
                        console.warn(`⚠️ 견적 타이틀 배치 조회 오류 (chunk ${idx + 1}/${chunks.length}):`, quoteErr);
                    }
                }
                console.log(`✅ quote 조회 완료: ${Object.keys(quoteMap).length}건`);
            }

            // 4) cruise_rate_card를 배치로 조회해 크루즈명 맵 구성
            // cruiseMap의 모든 아이템에서 room_price_code 수집
            const roomPriceCodes = Object.values(cruiseMap)
                .flat()
                .map((c: any) => c?.room_price_code)
                .filter(Boolean);

            // 중복 제거 + UUID 형식 코드만 유지 (레거시 코드가 섞이면 id(uuid) IN 조회에서 22P02 발생)
            const uniqueCodes = Array.from(new Set(roomPriceCodes));
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            const validUuidCodes = uniqueCodes.filter((code) => uuidRegex.test(String(code)));
            const skippedLegacyCodes = uniqueCodes.filter((code) => !uuidRegex.test(String(code)));

            if (skippedLegacyCodes.length > 0) {
                console.warn('⚠️ cruise_rate_card UUID 아님, 조회 제외:', skippedLegacyCodes);
            }

            let roomPriceMap: Record<string, any> = {};
            if (validUuidCodes.length > 0) {
                const CHUNK_SIZE = 200;
                const chunks: string[][] = [];
                for (let i = 0; i < validUuidCodes.length; i += CHUNK_SIZE) {
                    chunks.push(validUuidCodes.slice(i, i + CHUNK_SIZE));
                }

                console.log(`🔄 cruise_rate_card 조회 중... (${chunks.length}개 청크)`);
                for (let idx = 0; idx < chunks.length; idx++) {
                    const chunk = chunks[idx];
                    const { data: rpRows, error: rpErr } = await supabase
                        .from('cruise_rate_card')
                        .select('id, cruise_name, room_type, schedule_type')
                        .in('id', chunk);

                    if (!rpErr && rpRows) {
                        rpRows.forEach((row: any) => {
                            roomPriceMap[row.id] = row;
                        });
                    } else if (rpErr) {
                        console.warn(`⚠️ cruise_rate_card 배치 조회 오류 (chunk ${idx + 1}/${chunks.length}):`, rpErr);
                    }
                }
                console.log(`✅ cruise_rate_card 조회 완료: ${Object.keys(roomPriceMap).length}건`);
            }

            // 5) cruise_document에서 승선코드 이미지 조회
            let boardingImageMap: Record<string, string> = {};
            if (reIds.length > 0) {
                const { data: docRows } = await supabase
                    .from('cruise_document')
                    .select('reservation_id, image_data')
                    .eq('document_type', 'boarding_code')
                    .in('reservation_id', reIds);

                (docRows || []).forEach((d: any) => {
                    if (d.reservation_id) boardingImageMap[d.reservation_id] = d.image_data;
                });
                console.log(`✅ cruise_document 승선코드 이미지: ${Object.keys(boardingImageMap).length}건`);
            }

            // 6) 최종 머지 (reservation 기준으로 데이터 병합)
            console.log('🔄 데이터 병합 중...');
            const merged: CruiseReservation[] = reIds.map((reId: string) => {
                const r = reservationMap[reId] || { re_id: reId };
                const cItems = cruiseMap[reId] || [];
                const q = r.re_quote_id ? quoteMap[r.re_quote_id] : undefined;
                const u = r.re_user_id ? userMap[r.re_user_id] : {};

                const docImage = boardingImageMap[reId];

                const enrichedItems: CruiseDetail[] = cItems.map((c: any) => {
                    const rp = c.room_price_code ? roomPriceMap[c.room_price_code] : undefined;
                    return {
                        id: c.id,
                        boarding_code: c.boarding_code,
                        boarding_code_image: docImage,
                        checkin: c.checkin,
                        room_price_code: c.room_price_code,
                        guest_count: c.guest_count,
                        room_total_price: c.room_total_price,
                        request_note: c.request_note,
                        cruise_name: rp?.cruise_name,
                        room_type: rp?.room_type,
                        room_category: undefined
                    };
                });

                const firstItem = enrichedItems[0] || {};

                return {
                    reservation_id: reId,
                    re_user_id: r.re_user_id,
                    re_quote_id: r.re_quote_id,
                    re_status: r.re_status || 'pending',
                    re_created_at: r.re_created_at,
                    re_type: r.re_type,

                    boarding_code: firstItem.boarding_code,
                    boarding_code_image: docImage,
                    checkin: firstItem.checkin,

                    items: enrichedItems,

                    users: {
                        name: u.name,
                        email: u.email,
                        phone: u.phone
                    },
                    quote: q ? { title: q.title, quote_id: r.re_quote_id } : undefined
                };
            });

            setReservations(merged);
            console.log(`✅ 데이터 로드 완료: 총 ${merged.length}건`);

            // 통계 정보 출력
            const withCruiseName = merged.filter(m => m.items.some(item => item.cruise_name)).length;
            const withRoomType = merged.filter(m => m.items.some(item => item.room_type)).length;
            const withCategory = merged.filter(m => m.items.some(item => item.room_category)).length;
            console.log(`📊 크루즈명: ${withCruiseName}건, 객실명: ${withRoomType}건, 카테고리: ${withCategory}건`);
        } catch (err) {
            console.error('예상치 못한 오류:', err);
            setError('데이터 로드 중 예상치 못한 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    // 필터링 로직
    useEffect(() => {
        let filtered = [...reservations];

        // 승선 코드 상태 필터
        if (statusFilter === 'has_code') {
            filtered = filtered.filter(r =>
                // 하나라도 승선코드가 았으면 OK, 또는 대표 코드가 있으면 OK
                (r.boarding_code && r.boarding_code.trim() !== '') ||
                !!r.boarding_code_image ||
                r.items.some(i => (i.boarding_code && i.boarding_code.trim() !== '') || !!i.boarding_code_image)
            );
        } else if (statusFilter === 'no_code') {
            filtered = filtered.filter(r =>
                (!r.boarding_code || r.boarding_code.trim() === '') &&
                !r.boarding_code_image
            );
        }

        // 날짜 필터 (체크인 날짜 기준)
        if (dateFilter) {
            filtered = filtered.filter(r => {
                const checkinKey = toDateKey(r.checkin);
                return !!checkinKey && checkinKey === dateFilter;
            });
        }

        // 오늘 이후만 보기 (체크인 날짜 기준)
        if (futureOnly) {
            const tKey = todayKey();
            filtered = filtered.filter(r => {
                const checkinKey = toDateKey(r.checkin);
                return !!checkinKey && checkinKey >= tKey;
            });
        }

        // 검색 필터
        if (searchTerm) {
            const q = searchTerm.toLowerCase();
            filtered = filtered.filter(r =>
                r.users?.name?.toLowerCase().includes(q) ||
                r.quote?.title?.toLowerCase().includes(q) ||
                r.re_quote_id?.toLowerCase().includes(q) ||
                // 아이템 내부 검색
                r.items.some(i =>
                    i.cruise_name?.toLowerCase().includes(q) ||
                    i.boarding_code?.toLowerCase().includes(q)
                )
            );
        }

        // 체크인 기준 정렬
        filtered.sort((a, b) => (a.checkin || '').localeCompare(b.checkin || ''));

        setFilteredReservations(filtered);
    }, [reservations, statusFilter, dateFilter, searchTerm, futureOnly]);

    // 승선 코드 업데이트 (예약 ID 기준 일괄 업데이트)
    const updateBoardingCode = async (reservationId: string, newCode: string, imageData?: string) => {
        try {
            const hasImage = !!(imageData && imageData.trim());
            const normalizedCode = hasImage ? null : (newCode.trim() || null);

            // 해당 예약의 모든 reservation_cruise 행의 텍스트 코드 업데이트
            const { error: updateError } = await supabase
                .from('reservation_cruise')
                .update({
                    boarding_code: normalizedCode,
                })
                .eq('reservation_id', reservationId);

            // 이미지는 cruise_document 테이블에 저장
            if (hasImage) {
                const { data: resData } = await supabase
                    .from('reservation')
                    .select('re_user_id')
                    .eq('re_id', reservationId)
                    .single();

                const userId = resData?.re_user_id;
                if (userId) {
                    const { data: existing } = await supabase
                        .from('cruise_document')
                        .select('id')
                        .eq('reservation_id', reservationId)
                        .eq('document_type', 'boarding_code')
                        .maybeSingle();

                    const { data: cruiseItem } = await supabase
                        .from('reservation_cruise')
                        .select('checkin')
                        .eq('reservation_id', reservationId)
                        .limit(1)
                        .maybeSingle();

                    let checkoutDate: string | null = null;
                    if (cruiseItem?.checkin) {
                        const d = new Date(cruiseItem.checkin);
                        d.setDate(d.getDate() + 2);
                        checkoutDate = d.toISOString().slice(0, 10);
                    }

                    if (existing) {
                        await supabase
                            .from('cruise_document')
                            .update({ image_data: imageData, checkout_date: checkoutDate, updated_at: new Date().toISOString() })
                            .eq('id', existing.id);
                    } else {
                        await supabase
                            .from('cruise_document')
                            .insert({
                                user_id: userId,
                                reservation_id: reservationId,
                                document_type: 'boarding_code',
                                image_data: imageData,
                                checkout_date: checkoutDate,
                            });
                    }
                }
            } else {
                await supabase
                    .from('cruise_document')
                    .delete()
                    .eq('reservation_id', reservationId)
                    .eq('document_type', 'boarding_code');
            }

            if (updateError) {
                console.error('승선 코드 업데이트 오류:', updateError);
                alert('승선 코드 업데이트에 실패했습니다.');
                return;
            }

            // 로컬 상태 업데이트
            setReservations(prev =>
                prev.map(r => {
                    if (r.reservation_id === reservationId) {
                        const updatedCode = normalizedCode || undefined;
                        const updatedImage = hasImage ? imageData : undefined;
                        // 아이템들도 모두 업데이트
                        const updatedItems = r.items.map(i => ({
                            ...i,
                            boarding_code: updatedCode,
                            boarding_code_image: updatedImage,
                        }));
                        return {
                            ...r,
                            boarding_code: updatedCode,
                            boarding_code_image: updatedImage,
                            items: updatedItems
                        };
                    }
                    return r;
                })
            );

            setEditingId(null);
            setEditingCode('');
            setEditingImage('');
            setEditingImageName('');
            console.log('승선 코드 업데이트 완료:', reservationId, '→', hasImage ? '이미지' : newCode);
        } catch (err) {
            console.error('승선 코드 업데이트 예외:', err);
            alert('승선 코드 업데이트 중 오류가 발생했습니다.');
        }
    };

    // 편집 시작
    const startEditing = (reservationId: string, currentCode: string = '', currentImage: string = '') => {
        setEditingId(reservationId);
        setEditingCode(currentCode);
        setEditingImage(currentImage);
        setEditingImageName('');
    };

    // 편집 취소
    const cancelEditing = () => {
        setEditingId(null);
        setEditingCode('');
        setEditingImage('');
        setEditingImageName('');
    };

    // 컴포넌트 마운트시 데이터 로드
    useEffect(() => {
        loadCruiseReservations();
    }, []);

    // 체크인 기준 그룹화 메모
    const groupedByCheckin = useMemo(() => {
        const map: Record<string, CruiseReservation[]> = {};
        for (const r of filteredReservations) {
            const key = toDateKey(r.checkin) || '미정';
            (map[key] ||= []).push(r);
        }
        return Object.entries(map)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([date, items]) => ({ date, items }));
    }, [filteredReservations]);

    if (loading) {
        return (
            <ManagerLayout title="승선 코드 관리" activeTab="boarding-code">
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                    <p className="ml-4 text-gray-600">크루즈 예약 데이터를 불러오는 중...</p>
                </div>
            </ManagerLayout>
        );
    }

    return (
        <ManagerLayout title="승선 코드 관리" activeTab="boarding-code">
            <div className="space-y-6">
                <div className="bg-white rounded-lg shadow-sm p-6">
                    <div className="flex items-center gap-3">
                        <Ship className="w-6 h-6 text-blue-600" />
                        <h1 className="text-xl font-bold text-gray-800">크루즈 승선 코드 관리</h1>
                    </div>
                </div>

                {/* 필터 섹션 */}
                <div className="bg-white rounded-lg shadow-sm p-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* 승선 코드 상태 필터 */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">승선 코드 상태</label>
                            <div className="flex gap-2">
                                {[
                                    { key: 'all', label: '전체', color: 'bg-gray-100 text-gray-700' },
                                    { key: 'has_code', label: '발급완료', color: 'bg-green-100 text-green-700' },
                                    { key: 'no_code', label: '미발급', color: 'bg-orange-100 text-orange-700' }
                                ].map(status => (
                                    <button
                                        key={status.key}
                                        onClick={() => setStatusFilter(status.key as any)}
                                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${statusFilter === status.key
                                            ? status.color.replace('100', '200').replace('700', '800')
                                            : status.color
                                            }`}
                                    >
                                        {status.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 날짜 필터 */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">체크인 날짜</label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="date"
                                    value={dateFilter}
                                    onChange={(e) => setDateFilter(e.target.value)}
                                    className="w-full pl-10 pr-3 py-2 border border-gray-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                            <p className="mt-1 text-xs text-gray-500">체크인(승선) 날짜 기준으로 필터링됩니다. 예약 생성일이 아닙니다.</p>
                            <div className="mt-2">
                                <button
                                    type="button"
                                    onClick={() => setFutureOnly(v => !v)}
                                    className={`text-xs px-3 py-1 rounded border transition-colors ${futureOnly ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-50 text-gray-600 border-gray-200'}`}
                                    title="체크인 기준으로 오늘 이후 일정만 표시합니다."
                                >
                                    {futureOnly ? '✅ 오늘 이후만 보기' : '오늘 이후만 보기'}
                                </button>
                            </div>
                        </div>

                        {/* 검색 */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">검색</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="이름, 여행명, 승선코드, 견적ID 검색"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-10 pr-3 py-2 border border-gray-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                        </div>
                    </div>

                    {/* 필터 초기화 */}
                    {(statusFilter !== 'all' || dateFilter || searchTerm || futureOnly) && (
                        <div className="mt-4 pt-4 border-t border-gray-200">
                            <button
                                onClick={() => {
                                    setStatusFilter('all');
                                    setDateFilter('');
                                    setFutureOnly(false);
                                    setSearchTerm('');
                                }}
                                className="text-sm text-blue-600 hover:text-blue-800"
                            >
                                모든 필터 초기화
                            </button>
                        </div>
                    )}
                </div>

                {/* 예약 목록 */}
                <div className="bg-white rounded-lg shadow-sm">
                    <div className="p-6 border-b border-gray-200">
                        <h2 className="text-lg font-semibold text-gray-800">
                            크루즈 예약 목록 ({filteredReservations.length}건)
                        </h2>
                    </div>

                    {error && (
                        <div className="p-6 bg-red-50 border-l-4 border-red-400">
                            <div className="flex items-center">
                                <AlertCircle className="w-5 h-5 text-red-400 mr-2" />
                                <p className="text-red-700">{error}</p>
                            </div>
                            <button
                                onClick={loadCruiseReservations}
                                className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
                            >
                                다시 시도
                            </button>
                        </div>
                    )}

                    {filteredReservations.length === 0 ? (
                        <div className="p-12 text-center text-gray-500">
                            <Ship className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <p>조건에 맞는 크루즈 예약이 없습니다.</p>
                        </div>
                    ) : (
                        <div className="p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                                {groupedByCheckin.map(group => (
                                    <React.Fragment key={`group-${group.date}`}>
                                        {/* 그룹 헤더 */}
                                        <div className="col-span-full">
                                            <div className="bg-gray-100 rounded-lg px-4 py-2 mb-4">
                                                <h3 className="text-sm font-semibold text-gray-700">
                                                    체크인 {group.date} · {group.items.length}건
                                                </h3>
                                            </div>
                                        </div>

                                        {/* 그룹 내 카드들 */}
                                        {group.items.map((reservation) => (
                                            <div key={reservation.reservation_id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                                                {/* 예약 정보 섹션 */}
                                                <div className="mb-3">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <User className="w-4 h-4 text-gray-400" />
                                                        <span className="text-sm font-medium text-gray-900">
                                                            {reservation.users?.name || '이름 없음'}
                                                        </span>
                                                        {reservation.re_type === 'package' && (
                                                            <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 ml-auto">📦 패키지</span>
                                                        )}
                                                    </div>
                                                    <div className="text-xs text-gray-500 mb-1">
                                                        {reservation.quote?.title || '제목 없음'}
                                                    </div>
                                                    {/* 크루즈 정보 표시 (그룹화) */}
                                                    <div className="space-y-2 mt-2 border-t border-gray-100 pt-2">
                                                        {Object.values(reservation.items.reduce((acc, item) => {
                                                            const key = `${item.cruise_name || ''}-${item.room_type || ''}`;
                                                            if (!acc[key]) {
                                                                acc[key] = {
                                                                    cruise_name: item.cruise_name,
                                                                    room_type: item.room_type,
                                                                    details: []
                                                                };
                                                            }
                                                            acc[key].details.push(item);
                                                            return acc;
                                                        }, {} as Record<string, any>)).map((group, gIdx) => (
                                                            <div key={gIdx} className="bg-gray-50 p-2 rounded text-xs text-gray-500 space-y-1">
                                                                <div className="font-semibold text-gray-700">🚢 {group.cruise_name || '크루즈명 미정'}</div>
                                                                <div className="font-medium text-gray-600">🏠 객실명: {group.room_type || '미정'}</div>
                                                                <div className="pl-2 mt-1 space-y-1 border-l-2 border-gray-200">
                                                                    {group.details.map((detail: any, dIdx: number) => (
                                                                        <div key={dIdx} className="flex flex-col gap-0.5 pb-1 last:pb-0">
                                                                            {detail.room_category && <div>🏷️ 카테고리: {detail.room_category}</div>}
                                                                            <div>👥 인원수: {detail.guest_count ? `${detail.guest_count}명` : '미정'}</div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* 크루즈 일정 섹션 */}
                                                <div className="mb-3">
                                                    <div className="text-xs text-gray-600 mb-1">
                                                        {reservation.checkin && toDateKey(reservation.checkin) ? (
                                                            <div className="font-medium">
                                                                📅 체크인: {toDateKey(reservation.checkin).replace(/-/g, '. ')}
                                                            </div>
                                                        ) : (
                                                            <span className="text-gray-400">일정 미정</span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* 승선 코드 섹션 */}
                                                <div className="mb-3">
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                                        승선 코드
                                                    </label>
                                                    {editingId === reservation.reservation_id ? (
                                                        <div className="space-y-2">
                                                            <input
                                                                type="text"
                                                                value={editingCode}
                                                                onChange={(e) => setEditingCode(e.target.value)}
                                                                placeholder="승선 코드 입력 (이미지 업로드시 코드 대신 이미지 저장)"
                                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
                                                                autoFocus
                                                            />
                                                            <div className="flex items-center gap-2">
                                                                <input
                                                                    type="file"
                                                                    accept="image/*"
                                                                    onChange={async (e) => {
                                                                        const file = e.target.files?.[0];
                                                                        if (!file) return;
                                                                        try {
                                                                            const resized = await resizeImageToDataUrl(file);
                                                                            setEditingImage(resized);
                                                                            setEditingImageName(file.name);
                                                                            setEditingCode('');
                                                                        } catch (imgError) {
                                                                            console.error(imgError);
                                                                            alert('이미지 변환에 실패했습니다. 다른 이미지를 시도해주세요.');
                                                                        }
                                                                    }}
                                                                    className="flex-1 text-xs"
                                                                />
                                                            </div>
                                                            {editingImage && (
                                                                <div className="p-2 rounded bg-blue-50 border border-blue-200">
                                                                    <p className="text-xs text-blue-700 mb-1">
                                                                        이미지로 저장됩니다 {editingImageName ? `(${editingImageName})` : ''}
                                                                    </p>
                                                                    <img src={editingImage} alt="승선코드 미리보기" className="max-h-36 rounded border border-blue-200" />
                                                                </div>
                                                            )}
                                                            <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={() => updateBoardingCode(reservation.reservation_id, editingCode, editingImage)}
                                                                className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                                                            >
                                                                코드 발급
                                                            </button>
                                                            <button
                                                                onClick={cancelEditing}
                                                                className="px-2 py-1 bg-gray-400 text-white rounded text-xs hover:bg-gray-500"
                                                            >
                                                                취소
                                                            </button>
                                                        </div>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center justify-between">
                                                            <div>
                                                                {reservation.boarding_code_image ? (
                                                                    <div className="space-y-1">
                                                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                                            <CheckCircle className="w-3 h-3 mr-1" />
                                                                            이미지로 저장됨
                                                                        </span>
                                                                        <img src={reservation.boarding_code_image} alt="승선코드 이미지" className="max-h-24 rounded border border-green-200" />
                                                                    </div>
                                                                ) : reservation.boarding_code ? (
                                                                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                                        <CheckCircle className="w-3 h-3 mr-1" />
                                                                        {reservation.boarding_code}
                                                                    </span>
                                                                ) : (
                                                                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                                                        <AlertCircle className="w-3 h-3 mr-1" />
                                                                        미발급
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <button
                                                                onClick={() => startEditing(reservation.reservation_id, reservation.boarding_code || '', reservation.boarding_code_image || '')}
                                                                disabled={editingId !== null}
                                                                className="text-xs text-blue-600 hover:text-blue-900 disabled:text-gray-400"
                                                            >
                                                                {(reservation.boarding_code || reservation.boarding_code_image) ? '수정' : '발급'}
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* 예약 상태 섹션 */}
                                                <div className="flex items-center justify-between">
                                                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${reservation.re_status === 'confirmed'
                                                        ? 'bg-green-100 text-green-800'
                                                        : reservation.re_status === 'pending'
                                                            ? 'bg-yellow-100 text-yellow-800'
                                                            : 'bg-gray-100 text-gray-800'
                                                        }`}>
                                                        {reservation.re_status}
                                                    </span>
                                                    <div className="text-xs text-gray-400">
                                                        {toDateKey(reservation.checkin) || '-'}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </React.Fragment>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </ManagerLayout>
    );
};

export default BoardingCodePage;
