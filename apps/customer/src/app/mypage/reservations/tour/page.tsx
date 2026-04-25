'use client';

import { useState, useEffect, useMemo, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '@/lib/supabase';
import { getFastAuthUser, getFastAuthUserWithMemberRole } from '@/lib/reservationAuth';
import { normalizeLocationEnglishUpper } from '@/lib/locationInput';
import PageWrapper from '@/components/PageWrapper';
import SectionBox from '@/components/SectionBox';

function TourReservationContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const quoteId = searchParams.get('quoteId');
    const reservationId = searchParams.get('reservationId');

    // 투어 데이터
    const [tours, setTours] = useState<any[]>([]);
    const [pricingData, setPricingData] = useState<any[]>([]);
    const [paymentPricingData, setPaymentPricingData] = useState<any[]>([]);
    const [inclusionsData, setInclusionsData] = useState<any[]>([]);
    const [cruiseIntegrationData, setCruiseIntegrationData] = useState<any[]>([]);

    // 선택된 값들
    const [selectedTourId, setSelectedTourId] = useState('');
    const [guestCount, setGuestCount] = useState(1);
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('');

    // 폼 상태
    const [form, setForm] = useState({
        tour_date: '',
        pickup_location: '',
        dropoff_location: '',
        request_note: ''
    });

    // 데이터 상태
    const [loading, setLoading] = useState(false);
    const [existingReservation, setExistingReservation] = useState<any>(null);
    const [isEditMode, setIsEditMode] = useState(false);

    // 투어 목록 로드
    const loadTours = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('tour')
                .select('tour_id, tour_code, tour_name, category, duration, location, program_type, is_cruise_addon, description, overview')
                .eq('is_active', true)
                .order('category')
                .order('tour_name');
            if (error) throw error;
            setTours(data || []);
        } catch (error) {
            console.error('투어 목록 로드 실패:', error);
        }
    }, []);

    // 선택된 투어의 상세 데이터 로드
    const loadTourDetails = useCallback(async (tourId: string) => {
        try {
            const [pricingRes, paymentRes, inclusionsRes, cruiseRes] = await Promise.all([
                supabase.from('tour_pricing').select('*').eq('tour_id', tourId).order('min_guests'),
                supabase.from('tour_payment_pricing').select('*').eq('tour_id', tourId).eq('is_active', true),
                supabase.from('tour_inclusions').select('*').eq('tour_id', tourId).order('order_seq'),
                supabase.from('tour_cruise_integration').select('*').eq('tour_id', tourId).eq('is_active', true)
            ]);

            setPricingData(pricingRes.data || []);
            setPaymentPricingData(paymentRes.data || []);
            setInclusionsData(inclusionsRes.data || []);
            setCruiseIntegrationData(cruiseRes.data || []);

            if (paymentRes.data && paymentRes.data.length > 0) {
                setSelectedPaymentMethod(paymentRes.data[0].payment_method);
            }
        } catch (error) {
            console.error('투어 상세 로드 실패:', error);
        }
    }, []);

    useEffect(() => {
        loadTours();
        if (quoteId) {
            checkExistingReservation();
        }
    }, [quoteId, loadTours]);

    // 선택된 투어 변경 시 상세 데이터 로드
    useEffect(() => {
        if (selectedTourId) {
            loadTourDetails(selectedTourId);
        } else {
            setPricingData([]);
            setPaymentPricingData([]);
            setInclusionsData([]);
            setCruiseIntegrationData([]);
            setSelectedPaymentMethod('');
        }
    }, [selectedTourId, loadTourDetails]);

    // 기존 예약 확인 (중복 방지)
    const checkExistingReservation = async () => {
        try {
            const { user } = await getFastAuthUser();
            if (!user) return;

            let query = supabase
                .from('reservation')
                .select(`*, reservation_tour (*)`)
                .eq('re_user_id', user.id)
                .eq('re_type', 'tour');

            if (quoteId) {
                query = query.eq('re_quote_id', quoteId);
            } else {
                query = query.is('re_quote_id', null);
            }

            const { data: existingRes } = await query.maybeSingle();

            if (existingRes) {
                setExistingReservation(existingRes);
                setIsEditMode(true);

                // 기존 데이터로 폼 초기화
                if (existingRes.reservation_tour && existingRes.reservation_tour.length > 0) {
                    const tourData = existingRes.reservation_tour[0];

                    // tour_price_code로 투어 찾기 (tour_pricing에서 조회)
                    if (tourData.tour_price_code) {
                        const { data: pricingInfo } = await supabase
                            .from('tour_pricing')
                            .select('tour_id')
                            .eq('pricing_id', tourData.tour_price_code)
                            .maybeSingle();
                        if (pricingInfo) {
                            const matchedTour = tours.find(t => t.tour_id === pricingInfo.tour_id);
                            if (matchedTour) {
                                setSelectedTourId(matchedTour.tour_id);
                            }
                        }
                    }

                    setGuestCount(tourData.tour_capacity || 1);

                    setForm({
                        tour_date: tourData.usage_date ? new Date(tourData.usage_date).toISOString().split('T')[0] : '',
                        pickup_location: tourData.pickup_location || '',
                        dropoff_location: tourData.dropoff_location || '',
                        request_note: tourData.request_note || ''
                    });
                }
            }
        } catch (error) {
            console.error('기존 예약 확인 오류:', error);
        }
    };

    // 파생 값들
    const selectedTour = useMemo(() => tours.find(t => t.tour_id === selectedTourId), [tours, selectedTourId]);

    const matchedPricing = useMemo(() => {
        return pricingData.find(p => guestCount >= p.min_guests && guestCount <= p.max_guests);
    }, [pricingData, guestCount]);

    const matchedPaymentPrice = useMemo(() => {
        if (!selectedPaymentMethod || paymentPricingData.length === 0) return null;
        return paymentPricingData.find(p => p.payment_method === selectedPaymentMethod);
    }, [paymentPricingData, selectedPaymentMethod]);

    const finalPrice = useMemo(() => {
        if (matchedPaymentPrice) return Number(matchedPaymentPrice.price);
        if (matchedPricing) return Number(matchedPricing.price_per_person);
        return 0;
    }, [matchedPricing, matchedPaymentPrice]);

    const guestRangeOptions = useMemo(() => {
        if (pricingData.length === 0) return [];
        const min = Math.min(...pricingData.map(p => p.min_guests));
        const max = Math.max(...pricingData.map(p => p.max_guests));
        return Array.from({ length: max - min + 1 }, (_, i) => min + i);
    }, [pricingData]);

    const paymentMethodLabel = (method: string) => {
        const labels: Record<string, string> = { 'card': '💳 신용카드', 'wire': '🏦 국제송금(Wire)', 'cash': '💵 현금', 'other': '기타' };
        return labels[method] || method;
    };

    // 예약 제출/수정
    const handleSubmit = async () => {
        if (!selectedTour || !matchedPricing) {
            alert('투어와 인원수를 선택해주세요.');
            return;
        }
        if (!form.tour_date) {
            alert('투어 날짜를 선택해주세요.');
            return;
        }

        setLoading(true);

        try {
            const { user, error: userError } = await getFastAuthUserWithMemberRole();
            if (userError || !user) {
                router.push(`/mypage/reservations?quoteId=${quoteId}`);
                return;
            }

            let reservationData;
            const totalPrice = finalPrice * guestCount;

            if (isEditMode && existingReservation) {
                // 수정 모드: 기존 예약 사용
                reservationData = existingReservation;

                await supabase
                    .from('reservation_tour')
                    .delete()
                    .eq('reservation_id', existingReservation.re_id);
            } else {
                // 새 예약 생성 (중복 확인)
                let duplicateQuery = supabase
                    .from('reservation')
                    .select('re_id')
                    .eq('re_user_id', user.id)
                    .eq('re_type', 'tour');

                if (quoteId) {
                    duplicateQuery = duplicateQuery.eq('re_quote_id', quoteId);
                } else {
                    duplicateQuery = duplicateQuery.is('re_quote_id', null);
                }

                const { data: duplicateCheck } = await duplicateQuery.maybeSingle();

                if (duplicateCheck) {
                    reservationData = { re_id: duplicateCheck.re_id };
                    await supabase
                        .from('reservation_tour')
                        .delete()
                        .eq('reservation_id', duplicateCheck.re_id);
                } else {
                    const { data: newReservation, error: reservationError } = await supabase
                        .from('reservation')
                        .insert({
                            re_user_id: user.id,
                            re_quote_id: quoteId || null,
                            re_type: 'tour',
                            re_status: 'pending',
                            re_created_at: new Date().toISOString()
                        })
                        .select()
                        .single();

                    if (reservationError) {
                        alert('예약 생성 중 오류가 발생했습니다.');
                        return;
                    }
                    reservationData = newReservation;
                }
            }

            // 투어 예약 상세 저장
            const { error: tourError } = await supabase
                .from('reservation_tour')
                .insert({
                    reservation_id: reservationData.re_id,
                    tour_price_code: matchedPricing?.pricing_id || null,
                    tour_capacity: guestCount,
                    pickup_location: form.pickup_location || null,
                    dropoff_location: form.dropoff_location || null,
                    usage_date: form.tour_date,
                    unit_price: finalPrice,
                    total_price: totalPrice,
                    request_note: form.request_note || null
                });

            if (tourError) {
                alert(`투어 예약 저장 오류: ${tourError.message}`);
                return;
            }

            alert(isEditMode ? '투어 서비스 예약이 성공적으로 수정되었습니다!' : '투어 서비스 예약이 성공적으로 저장되었습니다!');
            router.push(`/mypage/reservations?quoteId=${quoteId}`);

        } catch (error) {
            console.error('투어서비스 예약 처리 오류:', error);
            alert('예약 저장 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <PageWrapper>
            <div className="space-y-6">
                {/* 헤더 */}
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-lg font-bold text-gray-800">
                            🗺️ 투어 서비스 {isEditMode ? '수정' : '예약'}
                        </h1>
                        {isEditMode && (
                            <p className="text-sm text-blue-600 mt-1">📝 기존 예약을 수정하고 있습니다</p>
                        )}
                    </div>
                </div>

                {/* 투어 선택 */}
                <SectionBox title="투어 선택">
                    <div className="space-y-6">
                        {/* 1단계: 투어 선택 */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">🎯 투어 선택 *</label>
                            <select
                                value={selectedTourId}
                                onChange={(e) => { setSelectedTourId(e.target.value); setGuestCount(1); }}
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                required
                            >
                                <option value="">투어를 선택하세요</option>
                                {tours.map(tour => (
                                    <option key={tour.tour_id} value={tour.tour_id}>
                                        {tour.tour_name} ({tour.category}) {tour.program_type ? `[${tour.program_type}]` : ''} {tour.is_cruise_addon ? '🚢' : ''}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* 투어 설명 */}
                        {selectedTour && (
                            <div className="bg-gray-50 p-4 rounded-lg border">
                                <h4 className="font-semibold text-gray-800 mb-2">{selectedTour.tour_name}</h4>
                                <p className="text-sm text-gray-600 mb-2">{selectedTour.description}</p>
                                <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                                    <span>📍 {selectedTour.location}</span>
                                    <span>⏱ {selectedTour.duration}</span>
                                    {selectedTour.program_type && <span>🕐 {selectedTour.program_type}</span>}
                                    {selectedTour.is_cruise_addon && <span>🚢 크루즈 추가상품</span>}
                                </div>
                                {inclusionsData.length > 0 && (
                                    <div className="mt-3 pt-3 border-t">
                                        <p className="text-xs font-medium text-green-700 mb-1">포함사항:</p>
                                        <div className="flex flex-wrap gap-1">
                                            {inclusionsData.map((inc, i) => (
                                                <span key={i} className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded">{inc.icon} {inc.description}</span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {cruiseIntegrationData.length > 0 && (
                                    <div className="mt-3 pt-3 border-t">
                                        <p className="text-xs font-medium text-blue-700 mb-1">🚢 크루즈 연계 정보:</p>
                                        <p className="text-xs text-blue-600">{cruiseIntegrationData[0].cruise_linking_note}</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* 2단계: 인원수 선택 */}
                        {selectedTourId && pricingData.length > 0 && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">👥 참가 인원수 *</label>
                                <select
                                    value={guestCount}
                                    onChange={(e) => setGuestCount(parseInt(e.target.value))}
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                    required
                                >
                                    {guestRangeOptions.map(n => (
                                        <option key={n} value={n}>{n}명</option>
                                    ))}
                                </select>
                                <div className="mt-3 bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                                    <p className="text-xs font-medium text-yellow-800 mb-2">💰 인원별 가격표</p>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                        {pricingData.map((p, i) => (
                                            <div key={i} className={`text-xs p-2 rounded ${guestCount >= p.min_guests && guestCount <= p.max_guests ? 'bg-purple-100 border border-purple-300 font-bold' : 'bg-white border'}`}>
                                                <div>{p.min_guests === p.max_guests ? `${p.min_guests}명` : `${p.min_guests}-${p.max_guests}명`}</div>
                                                <div className="text-purple-600">{Number(p.price_per_person).toLocaleString()}동/인</div>
                                                {p.vehicle_type && <div className="text-gray-400">{p.vehicle_type}</div>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 3단계: 결제방식 선택 */}
                        {paymentPricingData.length > 0 && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">💳 결제방식 선택</label>
                                <div className="flex flex-wrap gap-3">
                                    {paymentPricingData.map(pp => (
                                        <button key={pp.payment_method} type="button" onClick={() => setSelectedPaymentMethod(pp.payment_method)}
                                            className={`px-4 py-3 rounded-lg font-medium transition-all text-sm ${selectedPaymentMethod === pp.payment_method ? 'bg-purple-600 text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border'}`}>
                                            <div>{paymentMethodLabel(pp.payment_method)}</div>
                                            <div className="text-xs mt-1">{Number(pp.price).toLocaleString()}동</div>
                                            {pp.price_adjustment && <div className={`text-xs ${selectedPaymentMethod === pp.payment_method ? 'text-green-200' : 'text-green-600'}`}>({pp.price_adjustment > 0 ? '+' : ''}{Number(pp.price_adjustment).toLocaleString()}동)</div>}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </SectionBox>

                {/* 투어 상세 정보 입력 */}
                {selectedTour && matchedPricing && (
                    <SectionBox title="투어 상세 정보">
                        <div className="space-y-6">
                            <div className="bg-purple-50 rounded-lg p-4">
                                <h4 className="text-md font-medium text-purple-800 mb-3">투어 기본 정보</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">투어 날짜 *</label>
                                        <input
                                            type="date"
                                            value={form.tour_date}
                                            onChange={(e) => setForm({ ...form, tour_date: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">참가 인원</label>
                                        <input
                                            type="number"
                                            value={guestCount}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50"
                                            readOnly
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">픽업 장소</label>
                                        <input
                                            type="text"
                                            value={form.pickup_location}
                                            onChange={(e) => setForm({ ...form, pickup_location: normalizeLocationEnglishUpper(e.target.value) })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                            placeholder="영문 대문자로 입력해 주세요"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">드롭오프 장소</label>
                                        <input
                                            type="text"
                                            value={form.dropoff_location}
                                            onChange={(e) => setForm({ ...form, dropoff_location: normalizeLocationEnglishUpper(e.target.value) })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                            placeholder="영문 대문자로 입력해 주세요"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* 가격 요약 */}
                            <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                                <h4 className="text-md font-medium text-green-800 mb-2">💰 가격 요약</h4>
                                <div className="text-green-700 space-y-1 text-sm">
                                    <div>1인당 가격: {finalPrice.toLocaleString()}동</div>
                                    <div>참가 인원: {guestCount}명</div>
                                    {selectedPaymentMethod && <div>결제방식: {paymentMethodLabel(selectedPaymentMethod)}</div>}
                                    <div className="pt-2 border-t border-green-200 text-lg font-bold">
                                        총 가격: {(finalPrice * guestCount).toLocaleString()}동
                                    </div>
                                </div>
                            </div>

                            {/* 특별 요청사항 */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">특별 요청사항</label>
                                <textarea
                                    value={form.request_note}
                                    onChange={(e) => setForm({ ...form, request_note: e.target.value })}
                                    rows={4}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                    placeholder="투어 관련 기타 요청사항을 입력해주세요..."
                                />
                            </div>
                        </div>
                    </SectionBox>
                )}

                {/* 예약 버튼 */}
                <div className="flex justify-end">
                    <button
                        onClick={handleSubmit}
                        disabled={loading || !selectedTour || !matchedPricing || !form.tour_date}
                        className="bg-purple-500 text-white px-6 py-3 rounded-lg hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? (isEditMode ? '수정 처리 중...' : '예약 처리 중...') : (isEditMode ? '예약 수정' : '예약 추가')}
                    </button>
                </div>
            </div>
        </PageWrapper>
    );
}

export default function TourReservationPage() {
    return (
        <Suspense fallback={
            <PageWrapper>
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
                    <p className="mt-4 text-gray-600 ml-3">로딩 중...</p>
                </div>
            </PageWrapper>
        }>
            <TourReservationContent />
        </Suspense>
    );
}
