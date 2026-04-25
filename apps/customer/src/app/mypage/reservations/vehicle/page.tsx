'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '@/lib/supabase';
import { getFastAuthUser, getFastAuthUserWithMemberRole } from '@/lib/reservationAuth';
import { isLocationFieldKey, normalizeLocationEnglishUpper } from '@/lib/locationInput';
import PageWrapper from '@/components/PageWrapper';
import SectionBox from '@/components/SectionBox';

function VehicleReservationContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const quoteId = searchParams.get('quoteId');
    const reservationId = searchParams.get('reservationId');
    const mode = searchParams.get('mode');

    // 폼 상태 - reservation_car_sht 테이블 컬럼 기반
    const [form, setForm] = useState({
        vehicle_number: '',
        seat_number: '',
        sht_category: '',
        usage_date: '',
        car_price_code: '',
        pickup_location: '',
        dropoff_location: '',
        passenger_count: 1
    });

    // 옵션 데이터
    const [vehicleData, setVehicleData] = useState<any[]>([]);

    // 로딩 상태
    const [loading, setLoading] = useState(false);
    const [quote, setQuote] = useState<any>(null);

    // 중복 방지 상태
    const [existingReservation, setExistingReservation] = useState<any>(null);
    const [isEditMode, setIsEditMode] = useState(false);

    useEffect(() => {
        if (!quoteId) {
            alert('견적 ID가 필요합니다.');
            router.push('/mypage/reservations');
            return;
        }
        loadQuote();
        loadQuoteLinkedData();
        checkExistingReservation();
    }, [quoteId, router]);

    // 견적 정보 로드
    const loadQuote = async () => {
        try {
            const { data: quoteData, error } = await supabase
                .from('quote')
                .select('id, title, status')
                .eq('id', quoteId)
                .single();

            if (error || !quoteData) {
                alert('견적을 찾을 수 없습니다.');
                router.push('/mypage/reservations');
                return;
            }

            setQuote(quoteData);
        } catch (error) {
            console.error('견적 로드 오류:', error);
            alert('견적 정보를 불러오는 중 오류가 발생했습니다.');
        }
    };

    // 견적에 연결된 차량 데이터 로드
    const loadQuoteLinkedData = async () => {
        try {
            // 견적에 연결된 quote_item들 조회 (usage_date 포함)
            const { data: quoteItems } = await supabase
                .from('quote_item')
                .select('service_type, service_ref_id, quantity, unit_price, total_price, usage_date')
                .eq('quote_id', quoteId)
                .eq('service_type', 'vehicle');

            if (quoteItems && quoteItems.length > 0) {
                await loadAllVehicleInfo(quoteItems);
            }
        } catch (error) {
            console.error('견적 연결 데이터 로드 오류:', error);
        }
    };

    // 모든 차량 정보 로드
    const loadAllVehicleInfo = async (vehicleItems: any[]) => {
        try {
            const allVehicleData = [];

            // 각 vehicle item에 대해 정보 조회
            for (const vehicleItem of vehicleItems) {
                // vehicle 테이블에서 차량 정보 조회
                const { data: vehicleData } = await supabase
                    .from('vehicle')
                    .select('*')
                    .eq('id', vehicleItem.service_ref_id)
                    .single();

                if (vehicleData) {
                    // quote_item 정보와 함께 저장
                    allVehicleData.push({
                        ...vehicleData,
                        quoteItem: vehicleItem
                    });
                }
            }

            setVehicleData(allVehicleData);

            // 첫 번째 차량 정보로 폼 기본값 설정
            if (allVehicleData.length > 0) {
                const firstVehicle = allVehicleData[0];
                const quoteItem = firstVehicle.quoteItem;
                setForm(prev => ({
                    ...prev,
                    vehicle_number: firstVehicle.vehicle_number || '',
                    seat_number: firstVehicle.seat_number || '',
                    sht_category: firstVehicle.category || '',
                    usage_date: quoteItem?.usage_date || '',
                    car_price_code: firstVehicle.car_code || '',
                    pickup_location: firstVehicle.pickup_location || '',
                    dropoff_location: firstVehicle.dropoff_location || ''
                }));
            }

        } catch (error) {
            console.error('차량 정보 로드 오류:', error);
        }
    };

    // 기존 예약 확인 (중복 방지)
    const checkExistingReservation = async () => {
        try {
            const { user, error: userError } = await getFastAuthUser();
            if (userError || !user) return;

            const { data: existingRes } = await supabase
                .from('reservation')
                .select(`
                    *,
                    reservation_car_sht (
                        vehicle_number,
                        seat_number,
                        sht_category,
                        pickup_datetime,
                        car_price_code,
                        pickup_location,
                        dropoff_location,
                        passenger_count,
                        color_label
                    )
                `)
                .eq('re_user_id', user.id)
                .eq('re_quote_id', quoteId)
                .eq('re_type', 'sht')
                .maybeSingle();

            if (existingRes && Array.isArray(existingRes.reservation_car_sht) && existingRes.reservation_car_sht.length > 0) {
                setExistingReservation(existingRes);
                setIsEditMode(true);

                // 기존 예약 데이터를 폼에 채우기
                const vehicleData = existingRes.reservation_car_sht[0];
                setForm({
                    vehicle_number: vehicleData.vehicle_number || '',
                    seat_number: vehicleData.seat_number || '',
                    sht_category: vehicleData.sht_category || '',
                    usage_date: vehicleData.pickup_datetime || '',
                    car_price_code: vehicleData.car_price_code || '',
                    pickup_location: vehicleData.pickup_location || '',
                    dropoff_location: vehicleData.dropoff_location || '',
                    passenger_count: vehicleData.passenger_count || 1
                });
            }
        } catch (error) {
            console.error('기존 예약 확인 오류:', error);
        }
    };

    // 예약 제출 처리
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            // 유효성 검사
            if (!form.vehicle_number) {
                alert('차량 번호는 필수 입력 항목입니다.');
                return;
            }

            // 먼저 reservation 테이블에 메인 예약 데이터 생성
            const { user, error: userError } = await getFastAuthUserWithMemberRole();
            if (userError || !user) {
                router.push(`/mypage/reservations?quoteId=${quoteId}`);
                return;
            }

            // 중복 예약 방지: 기존 예약이 있으면 업데이트, 없으면 새로 생성
            if (existingReservation) {
                // 기존 예약 업데이트
                const reservationVehicleData = {
                    vehicle_number: form.vehicle_number || null,
                    seat_number: form.seat_number || null,
                    sht_category: form.sht_category || null,
                    pickup_datetime: form.usage_date ? new Date(form.usage_date).toISOString() : null,
                    car_price_code: form.car_price_code || null,
                    pickup_location: form.pickup_location || null,
                    dropoff_location: form.dropoff_location || null,
                    passenger_count: form.passenger_count || 1
                };

                // reservation_car_sht 테이블 업데이트
                const { error: updateError } = await supabase
                    .from('reservation_car_sht')
                    .update(reservationVehicleData)
                    .eq('reservation_id', existingReservation.re_id);

                if (updateError) {
                    console.error('차량 예약 업데이트 오류:', updateError);
                    alert('차량 예약 업데이트 중 오류가 발생했습니다.');
                    return;
                }

                alert('차량 예약이 성공적으로 수정되었습니다!');
                router.push(`/mypage/reservations?quoteId=${quoteId}`);
                return;
            }

            // reservation 테이블에 메인 예약 생성
            const { data: reservationData, error: reservationError } = await supabase
                .from('reservation')
                .insert({
                    re_user_id: user.id,
                    re_quote_id: quoteId,
                    re_type: 'sht',
                    re_status: 'pending',
                    re_created_at: new Date().toISOString()
                })
                .select()
                .single();

            if (reservationError) {
                console.error('예약 생성 오류:', reservationError);
                alert('예약 생성 중 오류가 발생했습니다.');
                return;
            }

            // reservation_car_sht 데이터 생성
            const reservationVehicleData = {
                reservation_id: reservationData.re_id,
                vehicle_number: form.vehicle_number || null,
                seat_number: form.seat_number || null,
                sht_category: form.sht_category || null,
                pickup_datetime: form.usage_date ? new Date(form.usage_date).toISOString() : null,
                car_price_code: form.car_price_code || null,
                pickup_location: form.pickup_location || null,
                dropoff_location: form.dropoff_location || null,
                passenger_count: form.passenger_count || 1
            };

            // reservation_car_sht 테이블에 삽입
            const { data: reservationResult, error: vehicleReservationError } = await supabase
                .from('reservation_car_sht')
                .insert(reservationVehicleData)
                .select()
                .single();

            if (vehicleReservationError) {
                console.error('차량 예약 저장 오류:', vehicleReservationError);
                alert('차량 예약 저장 중 오류가 발생했습니다.');
                return;
            }

            alert('차량 예약이 성공적으로 저장되었습니다!');
            router.push(`/mypage/reservations?quoteId=${quoteId}`);

        } catch (error) {
            console.error('예약 저장 오류:', error);
            alert('예약 저장 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (field: string, value: any) => {
        setForm(prev => ({
            ...prev,
            [field]: typeof value === 'string' && isLocationFieldKey(field)
                ? normalizeLocationEnglishUpper(value)
                : value
        }));
    };

    if (!quote) {
        return (
            <PageWrapper>
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                    <p className="mt-4 text-gray-600">데이터를 불러오는 중...</p>
                </div>
            </PageWrapper>
        );
    }

    return (
        <PageWrapper>
            <div className="space-y-6">
                {/* 헤더 */}
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-lg font-bold text-gray-800">
                            🚐 차량 예약 {isEditMode ? '수정' : '등록'}
                        </h1>
                        <p className="text-sm text-gray-600 mt-1">견적: {quote.title}</p>
                    </div>
                    <button
                        onClick={() => router.push('/mypage/reservations')}
                        className="px-3 py-1 bg-gray-50 text-gray-600 rounded border text-sm hover:bg-gray-100"
                    >
                        목록으로
                    </button>
                </div>

                {/* 차량 정보 */}
                {vehicleData.length > 0 && (
                    <SectionBox title="차량 정보">
                        <div className="p-4 bg-indigo-50 rounded-lg border border-indigo-200">
                            <h4 className="text-sm font-medium text-indigo-800 mb-3">🚐 차량 정보</h4>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                {vehicleData.map((vehicle, index) => (
                                    <div key={index} className="space-y-2">
                                        <div><span className="text-gray-600">차량번호:</span> <span className="font-medium">{vehicle.vehicle_number}</span></div>
                                        <div><span className="text-gray-600">좌석번호:</span> <span className="font-medium">{vehicle.seat_number}</span></div>
                                        <div><span className="text-gray-600">색상:</span> <span className="font-medium">{vehicle.color_label}</span></div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </SectionBox>
                )}

                {/* 차량 예약 폼 */}
                <SectionBox title="차량 예약 정보">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* 차량 기본 정보 */}
                        <div className="bg-indigo-50 rounded-lg p-6">
                            <h3 className="text-lg font-bold text-indigo-900 mb-4">차량 기본 정보</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        차량 번호
                                    </label>
                                    <input
                                        type="text"
                                        value={form.vehicle_number}
                                        onChange={(e) => handleInputChange('vehicle_number', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                        placeholder="예: 12가 3456"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        좌석 번호
                                    </label>
                                    <input
                                        type="text"
                                        value={form.seat_number}
                                        onChange={(e) => handleInputChange('seat_number', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                        placeholder="예: A1, B2"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* 제출 버튼 */}
                        <div className="flex justify-between">
                            <button
                                type="button"
                                onClick={() => router.push('/mypage/reservations')}
                                className="bg-gray-500 text-white px-6 py-3 rounded-lg hover:bg-gray-600"
                            >
                                취소
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="bg-indigo-500 text-white px-6 py-3 rounded-lg hover:bg-indigo-600 disabled:opacity-50"
                            >
                                {loading ? '처리 중...' : (isEditMode ? '차량 예약 수정' : '차량 예약 완료')}
                            </button>
                        </div>
                    </form>
                </SectionBox>
            </div>
        </PageWrapper>
    );
}

export default function VehicleReservationPage() {
    return (
        <Suspense fallback={<div className="flex justify-center items-center h-64">로딩 중...</div>}>
            <VehicleReservationContent />
        </Suspense>
    );
}
