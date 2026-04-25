'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ManagerLayout from '@/components/ManagerLayout';
import supabase from '@/lib/supabase';
import { Calendar, Car, MapPin, Clock, User, Phone, FileText, Filter, Copy } from 'lucide-react';

interface ShtDispatchItem {
    id: string;
    reservation_id?: string;
    usage_date: string;
    vehicle_number?: string;
    seat_number?: string;
    sht_category?: string;
    pickup_location?: string;
    dropoff_location?: string;
    pickup_datetime?: string;
    booker_name?: string;
    booker_email?: string;
    booker_phone?: string;
    pier_location?: string;
    cruise_name?: string;
    dispatch_code?: string;
    status?: string;
    pickup_confirmed_at?: string | null;
    dispatch_memo?: string | null;
    car_type?: string | null;
    car_price_code?: string | null;
    re_type?: string | null; // 예약 타입 (cruise, package 등)
}

export default function ShtCarDispatchPage() {
    const router = useRouter();

    const [loading, setLoading] = useState(false);
    const [items, setItems] = useState<ShtDispatchItem[]>([]);
    const [stats, setStats] = useState<{ pickup: number; dropoff: number; total: number }>({ pickup: 0, dropoff: 0, total: 0 });
    const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [endDate, setEndDate] = useState(() => new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
    const [filterCategory, setFilterCategory] = useState<'all' | 'pickup' | 'dropoff'>('all');

    useEffect(() => {
        loadShtDispatchData();
    }, [startDate, endDate, filterCategory]);

    // checkAuth 제거됨 - useAuth 훅 사용

    const labelCategory = (cat?: string) => {
        if (!cat) return '스하차량';
        const norm = cat.toLowerCase();
        if (norm === 'pickup') return '픽업';
        if (norm === 'dropoff' || norm === 'drop-off' || norm === 'drop off' || norm === 'drop') return '드랍';
        return cat;
    };

    const loadShtDispatchData = async () => {
        try {
            const startDateTime = new Date(startDate);
            startDateTime.setHours(0, 0, 0, 0);
            const endDateTime = new Date(endDate);
            endDateTime.setHours(23, 59, 59, 999);

            // SHT 좌석 테이블 조회
            const { data: shtData, error: shtError } = await supabase
                .from('reservation_car_sht')
                .select(`
                    id, reservation_id, pickup_datetime, vehicle_number, seat_number,
                    sht_category, pickup_location, dropoff_location,
                    dispatch_code, pickup_confirmed_at, dispatch_memo, car_price_code
                `)
                .gte('pickup_datetime', startDateTime.toISOString())
                .lte('pickup_datetime', endDateTime.toISOString())
                .order('pickup_datetime', { ascending: true });

            if (shtError) {
                console.error('스하 차량 데이터 로드 오류:', shtError);
                return;
            }

            // 중복 제거
            const dedup = new Map<string, any>();
            (shtData || []).forEach((r: any) => {
                if (r && r.id && !dedup.has(r.id)) dedup.set(r.id, r);
            });
            const uniqueData = Array.from(dedup.values());

            // 배차 정보는 reservation_car_sht 행 자체에 포함

            // 차종 정보 로드
            const priceCodes = Array.from(new Set(uniqueData.map((d: any) => d.car_price_code).filter(Boolean)));
            let carTypeInfoMap = new Map<string, string>();
            if (priceCodes.length > 0) {
                const { data: carTypes, error: carTypeErr } = await supabase
                    .from('rentcar_price')
                    .select('rent_code, vehicle_type')
                    .in('rent_code', priceCodes);
                if (!carTypeErr && carTypes) {
                    carTypeInfoMap = new Map<string, string>(carTypes.map((c: any) => [c.rent_code, c.vehicle_type]));
                }
            }

            // 예약 타입 정보 로드 (패키지 표시용)
            const reservationIds = Array.from(new Set(uniqueData.map((r: any) => r.reservation_id).filter(Boolean)));
            let reTypeMap = new Map<string, string>();
            let reservationQuoteMap = new Map<string, string>();
            if (reservationIds.length > 0) {
                const { data: reservations } = await supabase
                    .from('reservation')
                    .select('re_id, re_type, re_quote_id')
                    .in('re_id', reservationIds);
                if (reservations) {
                    reTypeMap = new Map(reservations.map((r: any) => [String(r.re_id), r.re_type]));
                    reservationQuoteMap = new Map(
                        reservations
                            .filter((r: any) => r.re_quote_id)
                            .map((r: any) => [String(r.re_id), String(r.re_quote_id)])
                    );
                }
            }

            // quote/user 정보 로드 (예약자 표시용)
            const quoteIds = Array.from(new Set(
                uniqueData.map((r: any) => reservationQuoteMap.get(String(r.reservation_id))).filter(Boolean)
            ));

            let quoteUserMap = new Map<string, string>();
            if (quoteIds.length > 0) {
                const { data: quoteRows } = await supabase
                    .from('quote')
                    .select('id, user_id, title')
                    .in('id', quoteIds as string[]);

                if (quoteRows) {
                    quoteUserMap = new Map(
                        quoteRows
                            .filter((q: any) => q.id && q.user_id)
                            .map((q: any) => [String(q.id), String(q.user_id)])
                    );
                }
            }

            const userIds = Array.from(new Set(Array.from(quoteUserMap.values()).filter(Boolean)));
            let userMap = new Map<string, any>();
            if (userIds.length > 0) {
                const { data: userRows } = await supabase
                    .from('users')
                    .select('id, name, email, phone_number')
                    .in('id', userIds);

                if (userRows) {
                    userMap = new Map(userRows.map((u: any) => [String(u.id), u]));
                }
            }

            // 데이터 매핑
            const mappedItems: ShtDispatchItem[] = uniqueData.map((r: any) => {
                const quoteId = reservationQuoteMap.get(String(r.reservation_id));
                const userId = quoteId ? quoteUserMap.get(String(quoteId)) : null;
                const user = userId ? userMap.get(String(userId)) : null;

                return {
                    id: String(r.id),
                    reservation_id: r.reservation_id,
                    usage_date: r.pickup_datetime,
                    vehicle_number: r.vehicle_number,
                    seat_number: r.seat_number,
                    sht_category: r.sht_category,
                    pickup_location: r.pickup_location || '',
                    dropoff_location: r.dropoff_location || '',
                    pickup_datetime: r.pickup_datetime,
                    booker_name: user?.name || '',
                    booker_email: user?.email || '',
                    booker_phone: user?.phone_number || '',
                    dispatch_code: r.dispatch_code || '',
                    status: 'pending',
                    pickup_confirmed_at: r.pickup_confirmed_at || null,
                    dispatch_memo: r.dispatch_memo || null,
                    car_type: carTypeInfoMap.get(r.car_price_code) || null,
                    car_price_code: r.car_price_code || null,
                    re_type: reTypeMap.get(String(r.reservation_id)) || null,
                };
            });

            // 전체 통계
            const pickupCount = mappedItems.filter(item => isPickup(item)).length;
            const dropoffCount = mappedItems.filter(item => isDropoff(item)).length;
            setStats({ pickup: pickupCount, dropoff: dropoffCount, total: mappedItems.length });

            // 필터링 적용
            let filteredData = mappedItems;
            if (filterCategory === 'pickup') {
                filteredData = mappedItems.filter(item => isPickup(item));
            } else if (filterCategory === 'dropoff') {
                filteredData = mappedItems.filter(item => isDropoff(item));
            }

            setItems(filteredData);
        } catch (error) {
            console.error('데이터 로드 오류:', error);
        }
    };

    const isPickup = (item: ShtDispatchItem) => {
        const combined = `${item.sht_category || ''} ${item.pickup_location || ''}`.toLowerCase();
        return /pickup|픽업|pick/i.test(combined) || Boolean(item.pickup_location);
    };

    const isDropoff = (item: ShtDispatchItem) => {
        const combined = `${item.sht_category || ''} ${item.dropoff_location || ''}`.toLowerCase();
        return /drop|dropoff|드랍|하차/i.test(combined) || Boolean(item.dropoff_location);
    };

    const formatTime = (datetime?: string) => {
        if (!datetime) return '-';
        try {
            return new Date(datetime).toLocaleTimeString('ko-KR', {
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch {
            return datetime;
        }
    };

    const formatDate = (date: string) => {
        try {
            return new Date(date).toLocaleDateString('ko-KR', {
                month: 'short',
                day: 'numeric',
                weekday: 'short'
            });
        } catch {
            return date;
        }
    };

    const getCategoryColor = (category?: string) => {
        const cat = category?.toLowerCase();
        if (cat?.includes('pickup')) return 'bg-green-100 text-green-800';
        if (cat?.includes('drop')) return 'bg-red-100 text-red-800';
        return 'bg-blue-100 text-blue-800';
    };

    const savePickupConfirm = async (item: ShtDispatchItem) => {
        const now = new Date().toISOString();
        setItems(prev => prev.map(it => it.id === item.id ? { ...it, pickup_confirmed_at: now } : it));

        const { error } = await supabase
            .from('reservation_car_sht')
            .update({ pickup_confirmed_at: now })
            .eq('id', item.id);

        if (error) {
            console.error('승차 확인 저장 오류:', error);
        }
    };

    const saveDispatchMemo = async (item: ShtDispatchItem, memo: string) => {
        setItems(prev => prev.map(it => it.id === item.id ? { ...it, dispatch_memo: memo } : it));

        const { error } = await supabase
            .from('reservation_car_sht')
            .update({ dispatch_memo: memo })
            .eq('id', item.id);

        if (error) {
            console.error('배차 메모 저장 오류:', error);
        }
    };

    // 날짜별 그룹화 함수
    const groupItemsByDate = (items: ShtDispatchItem[]) => {
        const grouped: { [key: string]: ShtDispatchItem[] } = {};
        items.forEach(item => {
            const date = item.usage_date ? new Date(item.usage_date).toISOString().slice(0, 10) : 'unknown';
            if (!grouped[date]) {
                grouped[date] = [];
            }
            grouped[date].push(item);
        });
        return grouped;
    };

    const groupedItems = groupItemsByDate(items);

    // 배차 정보 복사 함수
    const copyDispatchInfo = async (item: ShtDispatchItem) => {
        const info = [
            `🚗 스하차량 배차 정보`,
            `📅 날짜: ${formatDate(item.usage_date)}`,
            `⏰ 시간: ${formatTime(item.pickup_datetime)}`,
            `🏷️ 유형: ${labelCategory(item.sht_category)}`,
            `🚙 차량: ${item.vehicle_number || '미배정'}`,
            `💺 좌석: ${item.seat_number || '-'}`,
            `👤 예약자: ${item.booker_name || item.booker_email || '정보 없음'}`,
            item.booker_phone ? `📞 연락처: ${item.booker_phone}` : '',
            item.pickup_datetime ? `🕐 사용일시: ${new Date(item.pickup_datetime).toLocaleString('ko-KR')}` : '',
            isPickup(item) && item.pickup_location ? `📍 승차위치: ${item.pickup_location}` : '',
            isPickup(item) && item.pier_location ? `⚓ 선착장: ${item.pier_location}` : '',
            isDropoff(item) && item.pier_location ? `⚓ 선착장: ${item.pier_location}` : '',
            isDropoff(item) && item.dropoff_location ? `📍 하차위치: ${item.dropoff_location}` : '',
            item.cruise_name ? `🛳️ 크루즈: ${item.cruise_name}` : '',
            item.dispatch_code ? `🔢 배차코드: #${item.dispatch_code}` : '',
            item.dispatch_memo ? `📝 메모: ${item.dispatch_memo}` : '',
            item.pickup_confirmed_at ? `✅ 승차확인: ${new Date(item.pickup_confirmed_at).toLocaleString('ko-KR')}` : '❌ 승차 미확인'
        ].filter(Boolean).join('\n');

        try {
            await navigator.clipboard.writeText(info);
            alert('배차 정보가 클립보드에 복사되었습니다.');
        } catch (error) {
            console.error('복사 실패:', error);
            // 폴백: 텍스트 영역을 만들어 복사
            const textArea = document.createElement('textarea');
            textArea.value = info;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            alert('배차 정보가 클립보드에 복사되었습니다.');
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                    <p className="text-gray-600">로딩 중...</p>
                </div>
            </div>
        );
    }

    return (
        <ManagerLayout title="스하차량 배차" activeTab="dispatch-sht-car">
            <div className="space-y-6">
                {/* 필터 섹션 */}
                <div className="bg-white border-b px-4 py-3">
                    <div className="space-y-3">
                        {/* 날짜 선택 */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="flex items-center space-x-3">
                                <Calendar className="w-5 h-5 text-gray-500" />
                                <div className="flex-1">
                                    <label className="block text-xs text-gray-600 mb-1">시작일</label>
                                    <input
                                        type="date"
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>
                            </div>
                            <div className="flex items-center space-x-3">
                                <Calendar className="w-5 h-5 text-gray-500" />
                                <div className="flex-1">
                                    <label className="block text-xs text-gray-600 mb-1">종료일</label>
                                    <input
                                        type="date"
                                        value={endDate}
                                        onChange={(e) => setEndDate(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* 카테고리 필터 */}
                        <div className="flex items-start gap-2">
                            <Filter className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" />
                            <div className="flex space-x-2 overflow-x-auto pb-1">
                                {[
                                    { label: '전체', value: 'all' },
                                    { label: '픽업', value: 'pickup' },
                                    { label: '드랍', value: 'dropoff' },
                                ].map((option) => (
                                    <button
                                        key={option.value}
                                        onClick={() => setFilterCategory(option.value as typeof filterCategory)}
                                        className={`px-3 py-1 rounded-full text-sm whitespace-nowrap ${filterCategory === option.value
                                            ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                            : 'bg-gray-100 text-gray-700 border border-gray-200'
                                            }`}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* 통계 카드 */}
                <div className="px-3 py-2">
                    <div className="flex gap-2">
                        <div className="flex-1 min-w-0 bg-white rounded-md p-2 text-center border border-gray-100">
                            <div className="text-base font-semibold text-green-600">{stats.pickup}</div>
                            <div className="text-[11px] text-gray-500">픽업</div>
                        </div>
                        <div className="flex-1 min-w-0 bg-white rounded-md p-2 text-center border border-gray-100">
                            <div className="text-base font-semibold text-red-600">{stats.dropoff}</div>
                            <div className="text-[11px] text-gray-500">드랍</div>
                        </div>
                        <div className="flex-1 min-w-0 bg-white rounded-md p-2 text-center border border-gray-100">
                            <div className="text-base font-medium text-gray-700">{stats.total}</div>
                            <div className="text-[11px] text-gray-500">총 배차</div>
                        </div>
                    </div>
                </div>

                {/* 배차 목록 */}
                <div className="px-4 pb-6">
                    {items.length === 0 ? (
                        <div className="bg-white rounded-lg p-8 text-center">
                            <Car className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                            <p className="text-gray-500">
                                {filterCategory === 'all' ?
                                    `${formatDate(startDate)} ~ ${formatDate(endDate)} 기간에 스하차량 배차 정보가 없습니다.` :
                                    `선택된 조건에 맞는 배차 정보가 없습니다.`
                                }
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {Object.entries(groupedItems)
                                .sort(([a], [b]) => a.localeCompare(b))
                                .map(([date, dateItems]) => (
                                    <div key={date} className="space-y-3">
                                        {/* 날짜 헤더 */}
                                        <div className="flex items-center space-x-3 px-3 py-2 bg-blue-50 rounded-lg border border-blue-200">
                                            <Calendar className="w-5 h-5 text-blue-600" />
                                            <div className="flex-1">
                                                <h3 className="text-lg font-semibold text-blue-900">
                                                    {formatDate(date)}
                                                </h3>
                                                <p className="text-sm text-blue-700">
                                                    {dateItems.length}건 배차
                                                </p>
                                            </div>
                                        </div>

                                        {/* 날짜별 배차 카드들 */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                            {dateItems.map((item) => (
                                                <div key={item.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                                                    {/* 카드 헤더 */}
                                                    <div className="flex items-center justify-between p-3 bg-gray-50 border-b">
                                                        <div className="flex items-center space-x-2">
                                                            <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700">스하차량</span>
                                                            <span className="text-sm font-medium text-gray-900">
                                                                {formatTime(item.pickup_datetime)}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center space-x-2">
                                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getCategoryColor(item.sht_category)}`}>
                                                                {labelCategory(item.sht_category)}
                                                            </span>
                                                            <button
                                                                onClick={() => copyDispatchInfo(item)}
                                                                className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                                                                title="배차 정보 복사"
                                                            >
                                                                <Copy className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* 카드 본문 */}
                                                    <div className="p-3 space-y-3">
                                                        {/* 차량 정보 */}
                                                        <div className="flex items-center space-x-3">
                                                            <Car className="w-5 h-5 text-blue-400" />
                                                            <div className="flex-1">
                                                                <div className="text-sm font-medium text-gray-900">
                                                                    {item.vehicle_number || '차량 미배정'}
                                                                </div>
                                                                <div className="text-xs text-gray-500">
                                                                    좌석: {item.seat_number || '-'}
                                                                </div>
                                                                {item.car_type && (
                                                                    <div className="text-sm font-medium text-blue-700 mt-0.5">
                                                                        차종: {item.car_type}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            {item.dispatch_code && (
                                                                <div className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-800">
                                                                    #{item.dispatch_code}
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* 예약자 정보 */}
                                                        <div className="flex items-center space-x-3">
                                                            <User className="w-5 h-5 text-gray-400" />
                                                            <div className="flex-1">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-sm font-medium text-gray-900">
                                                                        {item.booker_name || item.booker_email || '예약자 정보 없음'}
                                                                    </span>
                                                                    {item.re_type === 'package' && (
                                                                        <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">📦 패키지</span>
                                                                    )}
                                                                </div>
                                                                {item.booker_phone && (
                                                                    <div className="text-xs text-gray-500 flex items-center space-x-1">
                                                                        <Phone className="w-3 h-3" />
                                                                        <span>{item.booker_phone}</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* 위치 정보 */}
                                                        <div className="space-y-2">
                                                            {item.pickup_datetime && (
                                                                <div className="flex items-start space-x-3">
                                                                    <Clock className="w-5 h-5 text-gray-500 mt-0.5" />
                                                                    <div className="flex-1">
                                                                        <div className="text-xs text-gray-500">사용일시</div>
                                                                        <div className="text-sm text-gray-900">
                                                                            {new Date(item.pickup_datetime).toLocaleString('ko-KR')}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* 픽업인 경우: 승차위치 → 선착장 순서 */}
                                                            {isPickup(item) && (
                                                                <>
                                                                    {item.pickup_location && (
                                                                        <div className="flex items-start space-x-3">
                                                                            <MapPin className="w-5 h-5 text-green-500 mt-0.5" />
                                                                            <div className="flex-1">
                                                                                <div className="text-xs text-gray-500">승차위치</div>
                                                                                <div className="text-sm text-gray-900">{item.pickup_location}</div>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                    {item.pier_location && (
                                                                        <div className="flex items-start space-x-3">
                                                                            <MapPin className="w-5 h-5 text-blue-500 mt-0.5" />
                                                                            <div className="flex-1">
                                                                                <div className="text-xs text-gray-500">선착장</div>
                                                                                <div className="text-sm text-gray-900">{item.pier_location}</div>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </>
                                                            )}

                                                            {/* 드랍인 경우: 선착장 → 하차위치 순서 */}
                                                            {isDropoff(item) && !isPickup(item) && (
                                                                <>
                                                                    {item.pier_location && (
                                                                        <div className="flex items-start space-x-3">
                                                                            <MapPin className="w-5 h-5 text-blue-500 mt-0.5" />
                                                                            <div className="flex-1">
                                                                                <div className="text-xs text-gray-500">선착장</div>
                                                                                <div className="text-sm text-gray-900">{item.pier_location}</div>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                    {item.dropoff_location && (
                                                                        <div className="flex items-start space-x-3">
                                                                            <MapPin className="w-5 h-5 text-red-500 mt-0.5" />
                                                                            <div className="flex-1">
                                                                                <div className="text-xs text-gray-500">하차위치</div>
                                                                                <div className="text-sm text-gray-900">{item.dropoff_location}</div>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </>
                                                            )}

                                                            {item.cruise_name && (
                                                                <div className="flex items-start space-x-3">
                                                                    <FileText className="w-5 h-5 text-purple-500 mt-0.5" />
                                                                    <div className="flex-1">
                                                                        <div className="text-xs text-gray-500">크루즈</div>
                                                                        <div className="text-sm text-gray-900">{item.cruise_name}</div>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* 확인/메모 */}
                                                        <div className="pt-2 border-t space-y-2">
                                                            <div className="flex items-center justify-between">
                                                                <div className="text-xs text-gray-600">
                                                                    {item.pickup_confirmed_at
                                                                        ? `승차 확인: ${new Date(item.pickup_confirmed_at).toLocaleString('ko-KR')}`
                                                                        : '승차 미확인'
                                                                    }
                                                                </div>
                                                                {!item.pickup_confirmed_at && (
                                                                    <button
                                                                        onClick={() => savePickupConfirm(item)}
                                                                        className="bg-blue-600 text-white py-1.5 px-3 rounded text-xs font-medium hover:bg-blue-700"
                                                                    >
                                                                        승차 확인
                                                                    </button>
                                                                )}
                                                            </div>
                                                            <div>
                                                                <label className="block text-xs text-gray-600 mb-1">배차 메모</label>
                                                                <textarea
                                                                    defaultValue={item.dispatch_memo || ''}
                                                                    onBlur={(e) => saveDispatchMemo(item, e.currentTarget.value)}
                                                                    placeholder="메모를 입력하세요"
                                                                    className="w-full border border-gray-200 rounded p-2 text-sm"
                                                                    rows={2}
                                                                />
                                                                <div className="text-[11px] text-gray-400 mt-1">포커스가 벗어나면 자동 저장됩니다.</div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                        </div>
                    )}
                </div>

                <style>
                    {`
                @media print {
                    .sticky { position: static !important; }
                    button { display: none !important; }
                    .print\\:hidden { display: none !important; }
                }
                `}
                </style>
            </div>
        </ManagerLayout>
    );
}