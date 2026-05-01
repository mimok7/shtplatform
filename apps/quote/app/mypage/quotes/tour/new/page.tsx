'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '@/lib/supabase';

function NewTourQuoteContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const quoteId = searchParams.get('quoteId');

    const [loading, setLoading] = useState(false);
    const [quote, setQuote] = useState<any>(null);

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

    const [formData, setFormData] = useState({
        tour_date: '',
        special_requests: ''
    });

    useEffect(() => {
        if (!quoteId) {
            alert('견적 ID가 필요합니다.');
            router.push('/mypage/quotes');
            return;
        }
        loadTours();
        loadQuote();
    }, [quoteId, router]);

    // 선택된 투어 변경 시 관련 데이터 로드
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
    }, [selectedTourId]);

    // 투어 목록 로드 (tour 테이블에서)
    const loadTours = async () => {
        try {
            const { data, error } = await supabase
                .from('tour')
                .select('tour_id, tour_code, tour_name, category, duration, location, program_type, is_cruise_addon, description, overview, contact_info, payment_notes')
                .eq('is_active', true)
                .order('category')
                .order('tour_name');

            if (error) throw error;
            setTours(data || []);
        } catch (error) {
            console.error('투어 목록 로드 실패:', error);
        }
    };

    // 선택된 투어의 상세 데이터 로드 (가격, 결제방식, 포함사항, 크루즈통합)
    const loadTourDetails = async (tourId: string) => {
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

            // 결제방식이 있으면 첫번째 자동 선택
            if (paymentRes.data && paymentRes.data.length > 0) {
                setSelectedPaymentMethod(paymentRes.data[0].payment_method);
            }
        } catch (error) {
            console.error('투어 상세 로드 실패:', error);
        }
    };

    const loadQuote = async () => {
        if (!quoteId) return;
        try {
            const { data, error } = await supabase
                .from('quote').select('*').eq('id', quoteId).single();
            if (error) throw error;
            setQuote(data);
        } catch (error) {
            console.error('견적 정보 로드 실패:', error);
            router.push('/mypage/quotes');
        }
    };

    // 선택된 투어 객체
    const selectedTour = useMemo(() => tours.find(t => t.tour_id === selectedTourId), [tours, selectedTourId]);

    // 인원수에 해당하는 가격 행
    const matchedPricing = useMemo(() => {
        return pricingData.find(p => guestCount >= p.min_guests && guestCount <= p.max_guests);
    }, [pricingData, guestCount]);

    // 결제방식별 가격
    const matchedPaymentPrice = useMemo(() => {
        if (!selectedPaymentMethod || paymentPricingData.length === 0) return null;
        return paymentPricingData.find(p => p.payment_method === selectedPaymentMethod);
    }, [paymentPricingData, selectedPaymentMethod]);

    // 최종 1인당 가격 계산 (결제방식 가격 우선, 없으면 기본 가격)
    const finalPrice = useMemo(() => {
        if (matchedPaymentPrice) return Number(matchedPaymentPrice.price);
        if (matchedPricing) return Number(matchedPricing.price_per_person);
        return 0;
    }, [matchedPricing, matchedPaymentPrice]);

    // 인원수 범위 옵션
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedTour || !matchedPricing) { alert('투어와 인원수를 선택해주세요.'); return; }
        if (!formData.tour_date) { alert('투어 날짜를 선택해주세요.'); return; }

        setLoading(true);
        try {
            const tourServiceData = {
                tour_code: selectedTour.tour_code,
                tour_date: formData.tour_date,
                guest_count: guestCount,
                payment_method: selectedPaymentMethod || null,
                ...(formData.special_requests && { special_requests: formData.special_requests })
            };

            const { data: tourData, error: tourError } = await supabase
                .from('tour').insert([tourServiceData]).select().single();
            if (tourError) { alert(`투어 서비스 생성 실패: ${tourError.message}`); return; }

            const totalPrice = finalPrice * guestCount;
            const { error: itemError } = await supabase
                .from('quote_item').insert({
                    quote_id: quoteId,
                    service_type: 'tour',
                    service_ref_id: tourData.id,
                    quantity: guestCount,
                    unit_price: finalPrice,
                    total_price: totalPrice,
                    usage_date: formData.tour_date || null
                });
            if (itemError) { alert(`견적 아이템 생성 실패: ${itemError.message}`); return; }

            alert('투어가 견적에 추가되었습니다!');
            router.push(`/mypage/quotes/${quoteId}/view`);
        } catch (error) {
            alert('오류가 발생했습니다: ' + (error as Error).message);
        } finally {
            setLoading(false);
        }
    };

    const isFormValid = selectedTourId && matchedPricing && formData.tour_date;

    if (!quote) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="bg-gradient-to-br from-blue-200 via-purple-200 to-indigo-100 text-gray-900">
                <div className="container mx-auto px-4 py-8">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h1 className="text-3xl font-bold mb-2">🎯 투어 견적 신청</h1>
                            <p className="text-lg opacity-90">투어 여행을 위한 견적을 작성해주세요.</p>
                        </div>
                        <button onClick={() => router.back()} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">← 뒤로</button>
                    </div>
                    <div className="bg-white/70 backdrop-blur rounded-lg p-4 mb-6">
                        <h3 className="font-semibold text-gray-800 mb-2">현재 견적 정보</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                            <div>견적명: <span className="font-semibold text-blue-600">{quote.title}</span></div>
                            <div>상태: {quote.status === 'draft' ? '작성 중' : quote.status}</div>
                            <div>작성일: {new Date(quote.created_at).toLocaleDateString('ko-KR')}</div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="container mx-auto px-4 py-8">
                <div className="max-w-4xl mx-auto">
                    <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-lg p-8">
                        <h2 className="text-2xl font-bold text-gray-800 mb-6">투어 정보 입력</h2>
                        <div className="bg-blue-600 rounded-lg p-6 mb-6">
                            <h3 className="text-white text-lg font-semibold mb-2">📝 견적안내</h3>
                            <p className="text-white/90 text-sm">투어를 선택하고 인원수, 결제방식을 입력하시면 자동으로 가격이 계산됩니다.</p>
                        </div>

                        <div className="space-y-6">
                            {/* 1단계: 투어 선택 */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">🎯 투어 선택 *</label>
                                <select
                                    value={selectedTourId}
                                    onChange={(e) => { setSelectedTourId(e.target.value); setGuestCount(1); }}
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                                                <div key={i} className={`text-xs p-2 rounded ${guestCount >= p.min_guests && guestCount <= p.max_guests ? 'bg-blue-100 border border-blue-300 font-bold' : 'bg-white border'}`}>
                                                    <div>{p.min_guests === p.max_guests ? `${p.min_guests}명` : `${p.min_guests}-${p.max_guests}명`}</div>
                                                    <div className="text-blue-600">{Number(p.price_per_person).toLocaleString()}동/인</div>
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
                                                className={`px-4 py-3 rounded-lg font-medium transition-all text-sm ${selectedPaymentMethod === pp.payment_method ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border'}`}>
                                                <div>{paymentMethodLabel(pp.payment_method)}</div>
                                                <div className="text-xs mt-1">{Number(pp.price).toLocaleString()}동</div>
                                                {pp.price_adjustment && <div className={`text-xs ${selectedPaymentMethod === pp.payment_method ? 'text-green-200' : 'text-green-600'}`}>({pp.price_adjustment > 0 ? '+' : ''}{Number(pp.price_adjustment).toLocaleString()}동)</div>}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* 투어 날짜 */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">📅 투어 날짜 *</label>
                                <input type="date" value={formData.tour_date} onChange={(e) => setFormData({ ...formData, tour_date: e.target.value })}
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" required />
                            </div>

                            {/* 특별 요청사항 */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">📝 특별 요청사항</label>
                                <textarea value={formData.special_requests} onChange={(e) => setFormData({ ...formData, special_requests: e.target.value })}
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    rows={4} placeholder="특별한 요청사항이 있으시면 입력해주세요" />
                            </div>

                            {/* 선택 요약 */}
                            {isFormValid && (
                                <div className="bg-green-50 p-6 rounded-lg border border-green-200">
                                    <h3 className="font-semibold text-green-800 mb-3">✅ 선택 요약</h3>
                                    <div className="text-green-700 space-y-2">
                                        <div><strong>투어:</strong> {selectedTour?.tour_name}</div>
                                        <div><strong>카테고리:</strong> {selectedTour?.category}</div>
                                        {selectedTour?.program_type && <div><strong>프로그램:</strong> {selectedTour.program_type}</div>}
                                        <div><strong>참가 인원:</strong> {guestCount}명</div>
                                        {matchedPricing?.vehicle_type && <div><strong>차량:</strong> {matchedPricing.vehicle_type}</div>}
                                        {selectedPaymentMethod && <div><strong>결제방식:</strong> {paymentMethodLabel(selectedPaymentMethod)}</div>}
                                        <div><strong>1인당 가격:</strong> {finalPrice.toLocaleString()}동</div>
                                        <div className="pt-2 border-t border-green-200"><strong className="text-lg">총 가격: {(finalPrice * guestCount).toLocaleString()}동</strong></div>
                                        <div><strong>투어 날짜:</strong> {new Date(formData.tour_date).toLocaleDateString('ko-KR')}</div>
                                        {formData.special_requests && <div><strong>특별 요청:</strong> {formData.special_requests}</div>}
                                        <div className="pt-2 border-t border-green-200 text-xs">
                                            <strong>투어 코드:</strong> <span className="bg-yellow-100 px-2 py-0.5 rounded font-mono">{selectedTour?.tour_code}</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-center space-x-4 pt-6 mt-8">
                            <button type="button" onClick={() => router.back()} className="px-6 py-3 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400">취소</button>
                            <button type="submit" disabled={!isFormValid || loading}
                                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed">
                                {loading ? '처리 중...' : '견적에 추가'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}

export default function NewTourQuotePage() {
    return (
        <Suspense fallback={<div className="flex justify-center items-center h-64">로딩 중...</div>}>
            <NewTourQuoteContent />
        </Suspense>
    );
}
