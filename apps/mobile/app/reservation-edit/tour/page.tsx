'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '@/lib/supabase';
import { saveAdditionalFeeTemplateFromInput } from '@/lib/additionalFeeTemplate';
import { recordReservationChange } from '@/lib/reservationChangeTracker';
import { calculateReservationPricing } from '@/lib/pricing';
import ManagerLayout from '../_components/MobileReservationLayout';
import {
    Save,
    ArrowLeft,
    Calendar,
    MapPin,
    Users,
    User,
    Phone,
    Mail,
    Clock,
    Target
} from 'lucide-react';

interface TourReservation {
    reservation_id: string;
    tour_price_code: string;
    tour_date: string;
    tour_capacity: number;
    pickup_location: string;
    dropoff_location: string;
    unit_price: number;
    total_price: number;
    request_note: string;
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
    tour_pricing: {
        pricing_id: string;
        tour_id?: string;
        tour: {
            tour_name: string;
            description: string;
            duration: string;
            location: string;
        } | null;
        price_per_person: number;
        vehicle_type: string;
    } | null;
}

function TourReservationEditContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const reservationId = searchParams.get('id');

    const [reservation, setReservation] = useState<TourReservation | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [additionalFee, setAdditionalFee] = useState(0);
    const [additionalFeeDetail, setAdditionalFeeDetail] = useState('');
    const [feeTemplates, setFeeTemplates] = useState<{ id: number; name: string; amount: number }[]>([]);
    const [formData, setFormData] = useState({
        tour_date: '',
        tour_capacity: 0,
        pickup_location: '',
        dropoff_location: '',
        unit_price: 0,
        total_price: 0,
        request_note: ''
    });
    const tourFinalTotal = (formData.total_price || 0) + additionalFee;

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
            .or('service_type.is.null,service_type.eq.tour')
            .eq('is_active', true)
            .order('sort_order')
            .then(({ data }) => { if (data) setFeeTemplates(data); });
    }, []);

    const loadReservation = async () => {
        try {
            console.log('🔄 투어 예약 데이터 로드 시작...', reservationId);
            setLoading(true);

            // 1) 예약 기본 정보 조회
            const { data: resRow, error: resErr } = await supabase
                .from('reservation')
                .select('re_id, re_type, re_status, re_created_at, re_quote_id, re_user_id, manual_additional_fee, manual_additional_fee_detail')
                .eq('re_id', reservationId)
                .single();

            if (resErr || !resRow) throw resErr || new Error('예약 기본 정보 접근 실패');

            // 2) 고객 정보 조회
            let customerInfo = { name: '정보 없음', email: '', phone: '' };
            if (resRow.re_user_id) {
                const { data: userRow } = await supabase
                    .from('users')
                    .select('name, email, phone_number')
                    .eq('id', resRow.re_user_id)
                    .single();
                if (userRow) {
                    customerInfo = { ...customerInfo, ...userRow, phone: userRow.phone_number };
                }
            }

            // 3) 서비스 상세 (투어)
            const { data: tourRow, error: tourErr } = await supabase
                .from('reservation_tour')
                .select('*')
                .eq('reservation_id', reservationId)
                .limit(1)
                .maybeSingle();

            if (tourErr) {
                console.warn('⚠️ 투어 예약 상세 조회 실패:', tourErr);
            }

            // 4) 견적 타이틀
            let quoteInfo = null as { title: string } | null;
            if (resRow.re_quote_id) {
                const { data: q, error: qErr } = await supabase
                    .from('quote')
                    .select('title')
                    .eq('id', resRow.re_quote_id)
                    .single();
                if (!qErr && q) quoteInfo = q;
            }

            // 5) 가격 정보
            let tourPriceInfo = null as any;
            if (tourRow?.tour_price_code) {
                const { data: tp, error: tpErr } = await supabase
                    .from('tour_pricing')
                    .select('pricing_id, tour_id, price_per_person, vehicle_type')
                    .eq('pricing_id', tourRow.tour_price_code)
                    .single();

                if (!tpErr && tp) {
                    let tourInfo = null;
                    if (tp.tour_id) {
                        const { data: t } = await supabase
                            .from('tour')
                            .select('tour_name, description, duration, location')
                            .eq('tour_id', tp.tour_id)
                            .maybeSingle();
                        tourInfo = t || null;
                    }

                    tourPriceInfo = {
                        ...tp,
                        tour: tourInfo,
                    };
                }
            }

            const defaultTourInfo = {
                reservation_id: reservationId,
                tour_price_code: '',
                tour_date: '',
                tour_capacity: 0,
                pickup_location: '',
                dropoff_location: '',
                unit_price: 0,
                total_price: 0,
                request_note: ''
            };

            const fullReservation: TourReservation = {
                ...(tourRow || defaultTourInfo),
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
                tour_pricing: tourPriceInfo,
            };

            setReservation(fullReservation);
            setFormData({
                tour_date: tourRow?.usage_date || tourRow?.tour_date || '',
                tour_capacity: tourRow?.tour_capacity || 0,
                pickup_location: tourRow?.pickup_location || '',
                dropoff_location: tourRow?.dropoff_location || '',
                unit_price: tourRow?.unit_price || tourPriceInfo?.price_per_person || 0,
                total_price: tourRow?.total_price || (tourRow?.tour_capacity * (tourRow?.unit_price || tourPriceInfo?.price_per_person || 0)) || 0,
                request_note: tourRow?.request_note || ''
            });
            setAdditionalFee(Number(resRow.manual_additional_fee || 0));
            setAdditionalFeeDetail(String(resRow.manual_additional_fee_detail || ''));

        } catch (error) {
            console.error('❌ 투어 예약 로드 실패:', error);
            alert('투어 예약 정보를 불러오는데 실패했습니다.');
            router.push('/reservation-edit');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteTour = async () => {
        if (!reservation) return;
        if (!window.confirm('투어 서비스를 삭제하시겠습니까?')) return;
        try {
            setLoading(true);
            const { error } = await supabase
                .from('reservation_tour')
                .delete()
                .eq('reservation_id', reservationId);
            if (error) throw error;
            alert('투어 서비스가 삭제되었습니다.');
            setFormData({ tour_date: '', tour_capacity: 0, pickup_location: '', dropoff_location: '', unit_price: 0, total_price: 0, request_note: '' });
        } catch (error) {
            console.error('❌ 삭제 오류:', error);
            alert('삭제 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!reservation) return;

        try {
            setSaving(true);
            console.log('💾 투어 예약 수정 저장 시작...');

            const payload = {
                usage_date: formData.tour_date || null,
                tour_capacity: formData.tour_capacity,
                pickup_location: formData.pickup_location,
                dropoff_location: formData.dropoff_location,
                unit_price: formData.unit_price,
                total_price: formData.total_price,
                request_note: formData.request_note,
            };
            const pricing = calculateReservationPricing({
                serviceType: 'tour',
                baseTotal: formData.total_price,
                additionalFee,
                additionalFeeDetail,
                lineItems: [{
                    label: '투어',
                    code: reservation.tour_price_code || null,
                    unit_price: formData.unit_price,
                    quantity: formData.tour_capacity || 1,
                    total: formData.total_price || 0,
                    metadata: {
                        usage_date: formData.tour_date || null,
                        pickup_location: formData.pickup_location || null,
                        dropoff_location: formData.dropoff_location || null,
                    },
                }],
                metadata: {
                    request_note: formData.request_note || null,
                },
            });

            // 1. Update 시도
            const { data: updatedData, error: updateError } = await supabase
                .from('reservation_tour')
                .update(payload)
                .eq('reservation_id', reservationId)
                .select();

            if (updateError) throw updateError;

            // 1.5. 메인 예약 테이블 동기화 (총 금액 + 인원수 + 예약일 + 타임스탬프)
            const { error: reservationError } = await supabase
                .from('reservation')
                .update({
                    total_amount: pricing.total_amount,
                    pax_count: formData.tour_capacity || 0,
                    reservation_date: formData.tour_date || null,
                    price_breakdown: pricing.price_breakdown,
                    manual_additional_fee: additionalFee,
                    manual_additional_fee_detail: additionalFeeDetail || null,
                    re_update_at: new Date().toISOString(),
                })
                .eq('re_id', reservationId);

            if (reservationError) {
                console.error('⚠️ 예약 테이블 동기화 실패:', reservationError);
            }

            await saveAdditionalFeeTemplateFromInput({
                serviceType: 'tour',
                detail: additionalFeeDetail,
                amount: additionalFee,
            });

            // 변경 추적 기록
            try {
                await recordReservationChange({
                    reservationId: reservationId!,
                    reType: 'tour',
                    rows: {
                        tour: [{
                            tour_price_code: reservation.tour_price_code || null,
                            usage_date: formData.tour_date || null,
                            tour_capacity: formData.tour_capacity,
                            pickup_location: formData.pickup_location,
                            dropoff_location: formData.dropoff_location,
                            unit_price: formData.unit_price,
                            total_price: formData.total_price,
                            request_note: formData.request_note,
                        }],
                    },
                    managerNote: '투어 예약 매니저 직접 수정',
                    snapshotData: {
                        price_breakdown: pricing.price_breakdown,
                        total_amount: pricing.total_amount,
                        manual_additional_fee: additionalFee,
                    },
                });
            } catch (trackErr) {
                console.warn('⚠️ 변경 추적 기록 실패(저장은 계속):', trackErr);
            }

            // 2. Insert fallback
            if (!updatedData || updatedData.length === 0) {
                console.log('⚠️ 기존 데이터 없음, 신규 삽입...');
                const { error: insertError } = await supabase
                    .from('reservation_tour')
                    .insert({
                        reservation_id: reservationId,
                        ...payload
                    });
                if (insertError) throw insertError;
            }

            console.log('✅ 투어 예약 수정 완료');
            alert('투어 예약이 성공적으로 수정되었습니다.');

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

    if (loading) {
        return (
            <ManagerLayout title="🎯 투어 예약 수정" activeTab="reservation-edit-tour">
                <div className="flex justify-center items-center h-64">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                        <p className="mt-4 text-gray-600">투어 예약 데이터를 불러오는 중...</p>
                    </div>
                </div>
            </ManagerLayout>
        );
    }

    if (!reservation) {
        return (
            <ManagerLayout title="🎯 투어 예약 수정" activeTab="reservation-edit-tour">
                <div className="text-center py-12">
                    <Target className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">예약을 찾을 수 없습니다</h3>
                    <p className="text-gray-600 mb-4">요청하신 투어 예약 정보를 찾을 수 없습니다.</p>
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
        <ManagerLayout title="🎯 투어 예약 수정" activeTab="reservation-edit-tour">
            <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* 좌측: 예약 정보 */}
                    <div className="lg:col-span-2 space-y-6">
{/* 투어 정보 */}
                        <div className="bg-white rounded-lg shadow-sm p-4">
                            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
                                <Target className="w-5 h-5" />
                                투어 정보
                            </h3>
                            <div className="rounded-lg bg-white px-3 py-2 space-y-1 text-sm text-gray-700 border border-gray-100 shadow-sm">
                                <p>
                                    <span className="font-semibold text-blue-600">투어명:</span> {reservation.tour_pricing?.tour?.tour_name || reservation.tour_price_code}
                                </p>
                                <p>
                                    <span className="font-semibold text-blue-600">위치:</span> {reservation.tour_pricing?.tour?.location || '위치 정보 없음'}
                                </p>
                                <p>
                                    <span className="font-semibold text-blue-600">소요시간:</span> {reservation.tour_pricing?.tour?.duration || '정보 없음'}
                                </p>
                                <p>
                                    <span className="font-semibold text-blue-600">1인 가격:</span> {reservation.tour_pricing?.price_per_person?.toLocaleString() || '0'}동
                                </p>
                                <p>
                                    <span className="font-semibold text-blue-600">차량:</span> {reservation.tour_pricing?.vehicle_type || '정보 없음'}
                                </p>
                            </div>
                        </div>

                        {/* 수정 가능한 필드들 */}
                        <div className="bg-white rounded-lg shadow-sm p-4">
                            <h3 className="text-lg font-medium text-gray-900 mb-4">예약 세부사항 수정</h3>
                            <div className="space-y-4">
                                {/* 투어 날짜 + 참가자 수 */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            <Calendar className="inline w-4 h-4 mr-1" />
                                            투어 날짜
                                        </label>
                                        <input
                                            type="date"
                                            value={formData.tour_date}
                                            onChange={(e) => setFormData(prev => ({
                                                ...prev,
                                                tour_date: e.target.value
                                            }))}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            <Users className="inline w-4 h-4 mr-1" />
                                            참가자 수
                                        </label>
                                        <input
                                            type="number"
                                            min="1"
                                            max="50"
                                            value={formData.tour_capacity}
                                            onChange={(e) => {
                                                const count = parseInt(e.target.value) || 0;
                                                setFormData(prev => ({
                                                    ...prev,
                                                    tour_capacity: count,
                                                    total_price: count * prev.unit_price
                                                }));
                                            }}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        />
                                    </div>
                                </div>

                                {/* 픽업 장소 + 드롭오프 장소 */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            <MapPin className="inline w-4 h-4 mr-1" />
                                            픽업 장소
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.pickup_location}
                                            onChange={(e) => setFormData(prev => ({
                                                ...prev,
                                                pickup_location: e.target.value
                                            }))}
                                            placeholder="예: 호텔 로비, 하노이 구시가지 등"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            드롭오프 장소
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.dropoff_location}
                                            onChange={(e) => setFormData(prev => ({
                                                ...prev,
                                                dropoff_location: e.target.value
                                            }))}
                                            placeholder="예: 호텔 로비, 공항 등"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        />
                                    </div>
                                </div>

                                {/* 단가 + 총 금액 */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            단가 (동)
                                        </label>
                                        <input
                                            type="number"
                                            value={formData.unit_price}
                                            onChange={(e) => {
                                                const price = parseInt(e.target.value) || 0;
                                                setFormData(prev => ({
                                                    ...prev,
                                                    unit_price: price,
                                                    total_price: prev.tour_capacity * price
                                                }));
                                            }}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            총 금액 (동)
                                        </label>
                                        <input
                                            type="number"
                                            value={formData.total_price}
                                            onChange={(e) => setFormData(prev => ({
                                                ...prev,
                                                total_price: parseInt(e.target.value) || 0
                                            }))}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-bold text-green-600"
                                        />
                                    </div>
                                </div>

                                {/* 요청사항 */}
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
                                        placeholder="언어 가이드, 특별 요청사항, 추가 옵션 등을 입력하세요..."
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
                                {(formData.total_price > 0 || additionalFee > 0) && (
                                    <div className="pt-4 mt-4 border-t border-gray-100 space-y-2">
                                        <div className="flex justify-between text-sm text-gray-700">
                                            <span>기본 투어 금액</span>
                                            <span className="font-semibold">{formData.total_price.toLocaleString()}동</span>
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            {formData.tour_capacity}명 × {formData.unit_price.toLocaleString()}동
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
                                                {tourFinalTotal.toLocaleString()}동
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 저장/삭제 버튼 */}
                        <div className="bg-white rounded-lg shadow-sm p-4">
                            <div className="flex items-center justify-between gap-2">
                                <button
                                    type="button"
                                    onClick={handleDeleteTour}
                                    disabled={saving}
                                    className="inline-flex h-9 w-24 items-center justify-center gap-1.5 px-2 py-1.5 rounded-md border border-red-200 bg-red-50 text-red-600 text-xs hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    투어 삭제
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="inline-flex h-9 w-24 items-center justify-center gap-1.5 px-2 py-1.5 bg-blue-600 text-white text-xs rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {saving ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                            저장 중...
                                        </>
                                    ) : (
                                        <>
                                            <Save className="w-4 h-4" />
                                            수정저장
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </ManagerLayout>
    );
}

export default function TourReservationEditPage() {
    return (
        <Suspense fallback={
            <ManagerLayout title="🎯 투어 예약 수정" activeTab="reservation-edit-tour">
                <div className="flex justify-center items-center h-64">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                        <p className="mt-4 text-gray-600">페이지를 불러오는 중...</p>
                    </div>
                </div>
            </ManagerLayout>
        }>
            <TourReservationEditContent />
        </Suspense>
    );
}
