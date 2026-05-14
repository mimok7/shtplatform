'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '@/lib/supabase';
import { saveAdditionalFeeTemplateFromInput } from '@/lib/additionalFeeTemplate';
import { recordReservationChange } from '@/lib/reservationChangeTracker';
import { calculateReservationPricing } from '@sht/domain/pricing';
import ManagerLayout from '../_components/MobileReservationLayout';
import {
    Save,
    ArrowLeft,
    Calendar,
    Hotel,
    MapPin,
    Users,
    User,
    Phone,
    Mail
} from 'lucide-react';

interface HotelReservation {
    reservation_id: string;
    hotel_price_code: string;
    checkin_date: string;
    nights: number;
    guest_count: number;
    request_note: string;
    unit_price: number;
    total_price: number;
    // 추가 정보
    reservation: {
        re_id: string;
        re_status: string;
        re_created_at: string;
        users: {
            name: string;
            email: string;
            phone: string;
        };
        quote: {
            title: string;
        } | null;
    };
    hotel_price: {
        hotel_price_code: string;
        hotel_code: string;
        hotel_name: string;
        room_type: string;
        room_name: string;
        room_category?: string;
        base_price: number;
        conditions?: string;
        notes?: string;
    } | null;
}

function HotelReservationEditContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const reservationId = searchParams.get('id');

    const [reservation, setReservation] = useState<HotelReservation | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [additionalFee, setAdditionalFee] = useState(0);
    const [additionalFeeDetail, setAdditionalFeeDetail] = useState('');
    const [feeTemplates, setFeeTemplates] = useState<{ id: number; name: string; amount: number }[]>([]);
    const [formData, setFormData] = useState({
        checkin_date: '',
        schedule: '',
        room_count: 1,
        guest_count: 0,
        unit_price: 0,
        request_note: ''
    });

    const getNightsFromSchedule = (schedule: string) => {
        const matched = String(schedule || '').match(/(\d+)/);
        const nights = matched ? parseInt(matched[1], 10) : 1;
        return Number.isNaN(nights) || nights <= 0 ? 1 : nights;
    };

    const hotelBaseTotal = getNightsFromSchedule(formData.schedule) * (formData.room_count || 1) * formData.unit_price;
    const hotelFinalTotal = hotelBaseTotal + additionalFee;

    useEffect(() => {
        if (reservationId) {
            loadReservation();
        } else {
            router.push('/reservation-edit');
        }
    }, [reservationId]);

    useEffect(() => {
        supabase
            .from('additional_fee_template')
            .select('id, name, amount')
            .or('service_type.is.null,service_type.eq.hotel')
            .eq('is_active', true)
            .order('sort_order')
            .then(({ data }) => { if (data) setFeeTemplates(data); });
    }, []);

    const loadReservation = async () => {
        try {
            console.log('🔄 호텔 예약 데이터 로드 시작...', reservationId);
            setLoading(true);

            // 1) 서비스 상세
            const { data: hotelRow, error: hotelErr } = await supabase
                .from('reservation_hotel')
                .select('*')
                .eq('reservation_id', reservationId)
                .single();
            if (hotelErr || !hotelRow) throw hotelErr || new Error('예약 없음');

            // 2) 예약 기본 정보 조회 (manager_reservations 대신 reservation 테이블 사용)
            const { data: resRow, error: resErr } = await supabase
                .from('reservation')
                .select('re_id, re_status, re_created_at, re_quote_id, re_user_id, manual_additional_fee, manual_additional_fee_detail')
                .eq('re_id', reservationId)
                .single();

            if (resErr || !resRow) throw resErr || new Error('예약 기본 정보 접근 실패');

            // 2.5) 고객 정보 조회
            let customerInfo = { name: '정보 없음', email: '', phone: '' };
            if (resRow.re_user_id) {
                const { data: userRow, error: userErr } = await supabase
                    .from('users')
                    .select('name, email, phone_number')
                    .eq('id', resRow.re_user_id)
                    .single();

                if (userRow) {
                    customerInfo = { ...customerInfo, ...userRow, phone: userRow.phone_number };
                }
            }

            // 3) 견적 타이틀
            let quoteInfo = null as { title: string } | null;
            if (resRow.re_quote_id) {
                const { data: q, error: qErr } = await supabase
                    .from('quote')
                    .select('title')
                    .eq('id', resRow.re_quote_id)
                    .single();
                if (!qErr && q) quoteInfo = q;
            }

            // 4) 호텔 가격 정보
            let hotelPriceInfo = null as any;
            if (hotelRow.hotel_price_code) {
                // 먼저 모든 컬럼을 조회해서 실제 데이터 구조 확인
                const { data: hp, error: hpErr } = await supabase
                    .from('hotel_price')
                    .select('*')
                    .eq('hotel_price_code', hotelRow.hotel_price_code)
                    .single();

                console.log('🏨 호텔 가격 정보 조회 (전체):', {
                    hotel_price_code: hotelRow.hotel_price_code,
                    result: hp,
                    error: hpErr
                });

                if (hpErr) {
                    console.warn('⚠️ 호텔 가격 정보 조회 실패:', hpErr);

                    // hotel_price_code로 검색해도 없으면 전체 테이블에서 비슷한 코드 찾기
                    const { data: allHotels, error: allErr } = await supabase
                        .from('hotel_price')
                        .select('hotel_price_code, hotel_name, room_name')
                        .ilike('hotel_price_code', `%${hotelRow.hotel_price_code}%`)
                        .limit(5);

                    console.log('🔍 비슷한 호텔 코드 검색:', allHotels);
                } else if (hp) {
                    hotelPriceInfo = hp;
                } else {
                    console.warn('⚠️ 호텔 가격 정보를 찾을 수 없습니다:', hotelRow.hotel_price_code);
                }
            } const fullReservation: HotelReservation = {
                ...hotelRow,
                reservation: {
                    re_id: resRow.re_id,
                    re_status: resRow.re_status,
                    re_created_at: resRow.re_created_at,
                    users: {
                        name: customerInfo.name,
                        email: customerInfo.email,
                        phone: customerInfo.phone,
                    },
                    quote: quoteInfo,
                },
                hotel_price: hotelPriceInfo,
            };

            setReservation(fullReservation);
            setFormData({
                checkin_date: hotelRow.checkin_date || '',
                schedule: hotelRow.schedule || '1박',
                room_count: hotelRow.room_count || 1,
                guest_count: hotelRow.guest_count || 1,
                unit_price: hotelRow.unit_price || hotelPriceInfo?.base_price || 0,
                request_note: hotelRow.request_note || ''
            });
            setAdditionalFee(Number(resRow.manual_additional_fee || 0));
            setAdditionalFeeDetail(String(resRow.manual_additional_fee_detail || ''));

        } catch (error) {
            console.error('❌ 호텔 예약 로드 실패:', error);
            alert('호텔 예약 정보를 불러오는데 실패했습니다.');
            router.push('/reservation-edit');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!reservation) return;

        try {
            setSaving(true);
            console.log('💾 호텔 예약 수정 저장 시작...');

            // schedule에서 숫자 추출 (예: "3박" -> 3)
            const nightsNum = getNightsFromSchedule(formData.schedule);
            const roomCount = Math.max(1, formData.room_count || 1);
            const totalPrice = nightsNum * roomCount * formData.unit_price;
            const pricing = calculateReservationPricing({
                serviceType: 'hotel',
                baseTotal: totalPrice,
                additionalFee,
                additionalFeeDetail,
                lineItems: [{
                    label: '호텔 객실',
                    code: formData.checkin_date || reservation.hotel_price_code,
                    unit_price: formData.unit_price,
                    quantity: nightsNum * roomCount,
                    total: totalPrice,
                    metadata: {
                        nights: nightsNum,
                        room_count: roomCount,
                        guest_count: formData.guest_count || 0,
                    },
                }],
                metadata: {
                    hotel_price_code: reservation.hotel_price_code,
                    checkin_date: formData.checkin_date || null,
                    schedule: formData.schedule || null,
                    request_note: formData.request_note || null,
                },
            });

            // 1. 예약 호텔 테이블 업데이트
            const { error: hotelError } = await supabase
                .from('reservation_hotel')
                .update({
                    checkin_date: formData.checkin_date,
                    schedule: formData.schedule,
                    room_count: roomCount,
                    guest_count: formData.guest_count,
                    unit_price: formData.unit_price,
                    total_price: totalPrice,
                    request_note: formData.request_note
                })
                .eq('reservation_id', reservationId);

            if (hotelError) {
                console.error('❌ 예약 호텔 테이블 저장 실패:', hotelError);
                throw hotelError;
            }

            console.log('✅ 1. 예약 호텔 테이블 저장 완료');

            // 2. 메인 예약 테이블 동기화 (총 금액 + 인원수 + 예약일 + 타임스탬프)
            const { error: reservationError } = await supabase
                .from('reservation')
                .update({
                    total_amount: pricing.total_amount,
                    pax_count: formData.guest_count || 0,
                    reservation_date: formData.checkin_date || null,
                    price_breakdown: pricing.price_breakdown,
                    manual_additional_fee: additionalFee,
                    manual_additional_fee_detail: additionalFeeDetail || null,
                    re_update_at: new Date().toISOString(),
                })
                .eq('re_id', reservationId);

            if (reservationError) {
                console.error('❌ 예약 테이블 저장 실패:', reservationError);
                throw reservationError;
            }

            console.log('✅ 2. 예약 테이블 동기화 완료 (총 금액, 인원수, 예약일)');

            await saveAdditionalFeeTemplateFromInput({
                serviceType: 'hotel',
                detail: additionalFeeDetail,
                amount: additionalFee,
            });

            // 3. 변경 추적 기록
            try {
                await recordReservationChange({
                    reservationId: reservationId!,
                    reType: 'hotel',
                    rows: {
                        hotel: [{
                            hotel_price_code: reservation.hotel_price_code,
                            checkin_date: formData.checkin_date,
                            schedule: formData.schedule,
                            room_count: roomCount,
                            guest_count: formData.guest_count,
                            unit_price: formData.unit_price,
                            total_price: totalPrice,
                            request_note: formData.request_note,
                        }],
                    },
                    managerNote: '호텔 예약 매니저 직접 수정',
                    snapshotData: {
                        price_breakdown: pricing.price_breakdown,
                        total_amount: pricing.total_amount,
                        manual_additional_fee: additionalFee,
                    },
                });
            } catch (trackErr) {
                console.warn('⚠️ 변경 추적 기록 실패(저장은 계속):', trackErr);
            }

            console.log('✅ 모든 테이블 저장 완료');
            alert('호텔 예약이 성공적으로 수정되었습니다.');

            // 데이터 다시 로드 + Next.js 라우터 캐시 무효화 (상세 모달 최신화)
            router.refresh();
            await loadReservation();

        } catch (error) {
            console.error('❌ 저장 오류:', error);
            alert('저장 중 오류가 발생했습니다.');
        } finally {
            setSaving(false);
        }
    };

    const getCheckoutDate = () => {
        if (formData.checkin_date) {
            const nights = getNightsFromSchedule(formData.schedule);
            const checkin = new Date(formData.checkin_date);
            const checkout = new Date(checkin);
            checkout.setDate(checkout.getDate() + nights);
            return checkout.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
        }
        return '';
    };

    if (loading) {
        return (
            <ManagerLayout title="🏨 호텔 예약 수정" activeTab="reservation-edit-hotel">
                <div className="flex justify-center items-center h-64">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                        <p className="mt-4 text-gray-600">호텔 예약 데이터를 불러오는 중...</p>
                    </div>
                </div>
            </ManagerLayout>
        );
    }

    if (!reservation) {
        return (
            <ManagerLayout title="🏨 호텔 예약 수정" activeTab="reservation-edit-hotel">
                <div className="text-center py-12">
                    <Hotel className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">예약을 찾을 수 없습니다</h3>
                    <p className="text-gray-600 mb-4">요청하신 호텔 예약 정보를 찾을 수 없습니다.</p>
                    <button
                        onClick={() => router.push('/reservation-edit')}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        예약 목록으로 돌아가기
                    </button>
                </div>
            </ManagerLayout>
        );
    }

    return (
        <ManagerLayout title="🏨 호텔 예약 수정" activeTab="reservation-edit-hotel">
            <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* 좌측: 예약 정보 */}
                    <div className="lg:col-span-2 space-y-6">
{/* 호텔 정보 */}
                        <div className="bg-white rounded-lg shadow-sm p-4">
                            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
                                <Hotel className="w-5 h-5" />
                                호텔 정보
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">호텔코드</label>
                                    <div className="text-sm text-gray-500 font-mono">
                                        {reservation.hotel_price_code}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">호텔명</label>
                                    <div className="text-gray-900 font-medium">
                                        {reservation.hotel_price?.hotel_name || '호텔명 정보 없음'}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">객실명</label>
                                    <div className="text-gray-900">
                                        {reservation.hotel_price?.room_name || '객실명 정보 없음'}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">객실타입</label>
                                    <div className="text-gray-900">
                                        {reservation.hotel_price?.room_type || reservation.hotel_price?.room_category || '객실타입 정보 없음'}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">기본 1박 가격</label>
                                    <div className="text-gray-900 font-medium text-blue-600">
                                        {reservation.hotel_price?.base_price ?
                                            `${reservation.hotel_price.base_price.toLocaleString()}동` :
                                            '가격 정보 없음'
                                        }
                                    </div>
                                </div>
                                {(reservation.hotel_price?.conditions || reservation.hotel_price?.notes) && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">조건</label>
                                        <div className="text-sm text-gray-600">
                                            {reservation.hotel_price.conditions || reservation.hotel_price?.notes}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 수정 가능한 필드들 */}
                        <div className="bg-white rounded-lg shadow-sm p-4">
                            <h3 className="text-lg font-medium text-gray-900 mb-4">예약 세부사항 수정</h3>
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            <Calendar className="inline w-4 h-4 mr-1" />
                                            체크인 날짜
                                        </label>
                                        <input
                                            type="date"
                                            value={formData.checkin_date}
                                            onChange={(e) => setFormData(prev => ({
                                                ...prev,
                                                checkin_date: e.target.value
                                            }))}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            숙박 일정
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.schedule}
                                            onChange={(e) => setFormData(prev => ({
                                                ...prev,
                                                schedule: e.target.value
                                            }))}
                                            placeholder="예: 2박3일, 3박"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            객실 수
                                        </label>
                                        <input
                                            type="number"
                                            min="1"
                                            max="20"
                                            value={formData.room_count}
                                            onChange={(e) => setFormData(prev => ({
                                                ...prev,
                                                room_count: parseInt(e.target.value) || 1
                                            }))}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        />
                                    </div>
                                </div>

                                {getCheckoutDate() && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            체크아웃 날짜 (자동 계산)
                                        </label>
                                        <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-700">
                                            {getCheckoutDate()}
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        <Users className="inline w-4 h-4 mr-1" />
                                        투숙객 수
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="10"
                                        value={formData.guest_count}
                                        onChange={(e) => setFormData(prev => ({
                                            ...prev,
                                            guest_count: parseInt(e.target.value) || 0
                                        }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        💰 1박당 가격 (단가)
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            min="0"
                                            step="1000"
                                            value={formData.unit_price}
                                            onChange={(e) => setFormData(prev => ({
                                                ...prev,
                                                unit_price: parseInt(e.target.value) || 0
                                            }))}
                                            className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            placeholder="1박당 가격을 입력하세요"
                                        />
                                        <span className="absolute right-3 top-2 text-gray-500 text-sm">동</span>
                                    </div>
                                    {reservation.hotel_price?.base_price && formData.unit_price !== reservation.hotel_price.base_price && (
                                        <div className="mt-1 text-xs text-orange-600">
                                            기본 가격: {reservation.hotel_price.base_price.toLocaleString()}동
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        요청사항
                                    </label>
                                    <textarea
                                        rows={4}
                                        value={formData.request_note}
                                        onChange={(e) => setFormData(prev => ({
                                            ...prev,
                                            request_note: e.target.value
                                        }))}
                                        placeholder="룸 타입, 특별 요청사항, 추가 서비스 등을 입력하세요..."
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 우측: 요금/추가내역 */}
                    <div className="space-y-6">
                        {/* 요금/추가내역 */}
                        <div className="bg-white rounded-lg shadow-sm p-4">
                            <h3 className="text-lg font-medium text-gray-900 mb-4">요금/추가내역</h3>
                            <div className="space-y-3">
                                <div className="pt-4 mt-4 border-t border-gray-100 space-y-4">
                                    <div>
                                        <h4 className="text-sm font-semibold text-gray-800">추가내역 / 추가요금</h4>
                                        <p className="text-xs text-gray-500 mt-1">추가요금을 조정하면 최종 합계를 바로 확인할 수 있습니다.</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">추가내역 선택</label>
                                        <select
                                            title="추가내역 선택"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                                            value=""
                                            onChange={(e) => {
                                                const tpl = feeTemplates.find(t => String(t.id) === e.target.value);
                                                if (tpl) { setAdditionalFee(tpl.amount); setAdditionalFeeDetail(tpl.name); }
                                            }}
                                        >
                                            <option value="">-- 추가내역 선택 --</option>
                                            {feeTemplates.map(t => (
                                                <option key={t.id} value={t.id}>{t.name} ({t.amount.toLocaleString()}동)</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">추가요금 (VND)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={additionalFee}
                                            onChange={(e) => setAdditionalFee(parseInt(e.target.value, 10) || 0)}
                                            title="추가요금"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">추가요금 내역</label>
                                        <textarea
                                            value={additionalFeeDetail}
                                            onChange={(e) => setAdditionalFeeDetail(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            rows={2}
                                            placeholder="추가요금 사유 또는 내역을 입력하세요"
                                        />
                                    </div>
                                </div>
                                {(hotelBaseTotal > 0 || additionalFee > 0) && (
                                    <div className="pt-4 mt-4 border-t border-gray-100 space-y-2">
                                        <div className="flex justify-between text-sm text-gray-700">
                                            <span>기본 호텔 금액</span>
                                            <span className="font-semibold">{hotelBaseTotal.toLocaleString()}동</span>
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            {formData.room_count}실 × {formData.schedule || '-'} × {formData.unit_price.toLocaleString()}동/박
                                        </div>
                                        <div className="flex justify-between text-sm text-orange-600">
                                            <span>추가요금</span>
                                            <span className="font-semibold">+{additionalFee.toLocaleString()}동</span>
                                        </div>
                                        {additionalFeeDetail.trim() && (
                                            <div className="text-xs text-gray-500 whitespace-pre-wrap">{additionalFeeDetail}</div>
                                        )}
                                        <div className="pt-2 border-t border-gray-200">
                                            <label className="block text-sm font-medium text-gray-700">최종 총 금액</label>
                                            <div className="text-xl font-bold text-green-600">
                                                {hotelFinalTotal.toLocaleString()}동
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 저장 버튼 */}
                        <div className="bg-white rounded-lg shadow-sm p-4">
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {saving ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                        저장 중...
                                    </>
                                ) : (
                                    <>
                                        <Save className="w-4 h-4" />
                                        수정사항 저장
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </ManagerLayout>
    );
}

export default function HotelReservationEditPage() {
    return (
        <Suspense fallback={
            <ManagerLayout title="🏨 호텔 예약 수정" activeTab="reservation-edit-hotel">
                <div className="flex justify-center items-center h-64">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                        <p className="mt-4 text-gray-600">페이지를 불러오는 중...</p>
                    </div>
                </div>
            </ManagerLayout>
        }>
            <HotelReservationEditContent />
        </Suspense>
    );
}
