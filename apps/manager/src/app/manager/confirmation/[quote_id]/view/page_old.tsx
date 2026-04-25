'use client';
import { Suspense, useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import supabase from '@/lib/supabase';
import ManagerLayout from '@/components/ManagerLayout';
import PageWrapper from '@/components/PageWrapper';
import SectionBox from '@/components/SectionBox';

interface ReservationDetail {
    reservation_id: string;
    service_type: string;
    service_details: any;
    amount: number;
    status: string;
}

interface QuoteData {
    quote_id: string;
    title: string;
    user_name: string;
    user_email: string;
    user_phone: string;
    total_price: number;
    payment_status: string;
    created_at: string;
    confirmed_at?: string;
    reservations: ReservationDetail[];
}

function ManagerConfirmationViewClient() {
    const router = useRouter();
    const params = useParams();
    const quoteId = params.quote_id as string;

    const [quoteData, setQuoteData] = useState<QuoteData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (quoteId) {
            loadQuoteData();
        } else {
            setError('견적 ID가 제공되지 않았습니다.');
            setLoading(false);
        }
    }, [quoteId]);

    const loadQuoteData = async () => {
        try {
            setLoading(true);
            console.log('🔍 견적 데이터 로드 시작:', quoteId);

            // 1. 기본 정보들을 병렬로 조회 (최적화됨)
            const [quoteResult, reservationsResult] = await Promise.all([
                // 견적 정보 조회
                supabase
                    .from('quote')
                    .select('*')
                    .eq('id', quoteId)
                    .single(),

                // 예약 목록 조회
                supabase
                    .from('reservation')
                    .select('*')
                    .eq('re_quote_id', quoteId)
            ]);

            if (quoteResult.error || !quoteResult.data) {
                console.error('견적 조회 실패:', quoteResult.error);
                setError('예약 정보를 찾을 수 없습니다. 견적 번호를 확인해 주세요.');
                return;
            }

            const quote = quoteResult.data;
            const reservations = reservationsResult.data || [];
            const actualQuoteId = quote.id;

            // 2. 사용자 정보와 서비스 상세 정보를 병렬로 조회 (최적화됨)
            const reservationIds = reservations.map(r => r.re_id);

            const [
                userResult,
                cruiseResult,
                airportResult,
                hotelResult,
                rentcarResult,
                tourResult,
                carResult
            ] = await Promise.all([
                // 사용자 정보
                supabase
                    .from('users')
                    .select('name, email, phone')
                    .eq('id', quote.user_id)
                    .single(),

                // 서비스별 상세 정보 (예약 ID가 있는 경우만 조회)
                reservationIds.length > 0 ?
                    supabase.from('reservation_cruise').select('*').in('reservation_id', reservationIds) :
                    Promise.resolve({ data: [] }),

                reservationIds.length > 0 ?
                    supabase.from('reservation_airport').select('*').in('reservation_id', reservationIds) :
                    Promise.resolve({ data: [] }),

                reservationIds.length > 0 ?
                    supabase.from('reservation_hotel').select('*').in('reservation_id', reservationIds) :
                    Promise.resolve({ data: [] }),

                reservationIds.length > 0 ?
                    supabase.from('reservation_rentcar').select('*').in('reservation_id', reservationIds) :
                    Promise.resolve({ data: [] }),

                reservationIds.length > 0 ?
                    supabase.from('reservation_tour').select('*').in('reservation_id', reservationIds) :
                    Promise.resolve({ data: [] }),

                reservationIds.length > 0 ?
                    supabase.from('reservation_car_sht').select('*').in('reservation_id', reservationIds) :
                    Promise.resolve({ data: [] })
            ]);

            // 3. 데이터 매핑 및 최종 구성
            const user = userResult.data;

            // 서비스 상세 정보 맵 생성 (기존과 동일)
            const serviceMap = new Map();
            cruiseResult.data?.forEach(item => serviceMap.set(item.reservation_id, item));
            airportResult.data?.forEach(item => serviceMap.set(item.reservation_id, item));
            hotelResult.data?.forEach(item => serviceMap.set(item.reservation_id, item));
            rentcarResult.data?.forEach(item => serviceMap.set(item.reservation_id, item));
            tourResult.data?.forEach(item => serviceMap.set(item.reservation_id, item));
            carResult.data?.forEach(item => serviceMap.set(item.reservation_id, item));

            // 예약 상세 정보 구성
            const processedReservations: ReservationDetail[] = reservations.map(res => {
                const serviceDetail = serviceMap.get(res.re_id);
                return {
                    reservation_id: res.re_id,
                    service_type: res.re_type,
                    service_details: serviceDetail || {},
                    amount: serviceDetail ? extractAmount(res.re_type, serviceDetail) : 0,
                    status: res.re_status || 'pending'
                };
            });

            // 최종 데이터 설정
            setQuoteData({
                quote_id: actualQuoteId,
                title: quote.title || '제목 없음',
                user_name: user?.name || '알 수 없음',
                user_email: user?.email || '',
                user_phone: user?.phone || '',
                total_price: quote.total_price || 0,
                payment_status: quote.payment_status || 'pending',
                created_at: quote.created_at,
                confirmed_at: quote.confirmed_at,
                reservations: processedReservations
            });

            console.log('✅ 견적 데이터 로드 완료');

        } catch (error) {
            console.error('견적 데이터 로드 실패:', error);
            setError('예약 정보를 불러오는 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const extractAmount = (serviceType: string, serviceDetail: any): number => {
        if (!serviceDetail) return 0;

        // 실제 데이터 구조에 맞는 필드명 사용
        const amountFields = [
            'room_total_price',    // 크루즈
            'total_price',         // 공항 등
            'unit_price',          // 단가
            'price',
            'amount'
        ];

        for (const field of amountFields) {
            const value = serviceDetail[field];
            if (typeof value === 'number' && !isNaN(value) && value > 0) {
                return value;
            }
        }
        return 0;
    };

    const getServiceTypeName = (type: string) => {
        const typeNames = {
            cruise: '🚢 크루즈',
            airport: '✈️ 공항 서비스',
            hotel: '🏨 호텔',
            rentcar: '🚗 렌터카',
            tour: '🎯 투어',
            car: '🚌 차량 서비스'
        };
        return typeNames[type as keyof typeof typeNames] || type;
    };

    const getServiceDescription = (type: string, details: any) => {
        if (!details) return '상세 정보 준비 중';

        switch (type) {
            case 'cruise':
                return `체크인: ${details.checkin || '-'} • ${details.guest_count || 0}명 • 가격코드: ${details.room_price_code || '-'}`;
            case 'airport':
                return `${details.ra_airport_location || '공항'} • ${details.ra_datetime || '-'} • ${details.ra_passenger_count || 0}명 • 편명: ${details.ra_flight_number || '-'}`;
            case 'hotel':
                return `${details.hotel_name || '호텔'} • 체크인: ${details.checkin_date || '-'} • ${details.nights || 0}박 ${details.guest_count || 0}명`;
            case 'rentcar':
                return `${details.car_type || '차량'} • 픽업: ${details.pickup_date || details.pickup_datetime || '-'} • ${details.rental_days || 0}일`;
            case 'tour':
                return `${details.tour_name || '투어'} • ${details.tour_date || '-'} • ${details.participant_count || 0}명`;
            case 'car':
                return `${details.vehicle_number || '차량'} • ${details.seat_number || 0}석 • ${details.color_label || '-'}`;
            default:
                return '상세 정보 확인 중';
        }
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    const formatDateTime = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const generateConfirmation = () => {
        router.push(`/manager/confirmation/${quoteId}/generate`);
    };

    const previewCustomerEmail = () => {
        window.open(`/customer/email-preview?quote_id=${quoteId}&token=manager`, '_blank');
    };

    const viewCustomerConfirmation = () => {
        window.open(`/customer/confirmation?quote_id=${quoteId}&token=manager`, '_blank');
    };

    const getPaymentStatusBadge = (status: string) => {
        switch (status) {
            case 'paid':
                return { bg: 'bg-green-100', text: 'text-green-800', label: '✅ 결제완료' };
            case 'pending':
                return { bg: 'bg-yellow-100', text: 'text-yellow-800', label: '⏳ 결제대기' };
            case 'cancelled':
                return { bg: 'bg-red-100', text: 'text-red-800', label: '❌ 취소됨' };
            default:
                return { bg: 'bg-gray-100', text: 'text-gray-800', label: status };
        }
    };

    if (loading) {
        return (
            <ManagerLayout title="예약확인서 상세보기" activeTab="confirmation">
                <PageWrapper>
                    <div className="flex justify-center items-center h-64">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                        <p className="ml-4 text-gray-600">예약 정보를 불러오는 중...</p>
                    </div>
                </PageWrapper>
            </ManagerLayout>
        );
    }

    if (error || !quoteData) {
        return (
            <ManagerLayout title="예약확인서 상세보기" activeTab="confirmation">
                <PageWrapper>
                    <div className="text-center py-12">
                        <div className="text-6xl mb-6">❌</div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-4">데이터 로드 오류</h2>
                        <p className="text-gray-600 mb-6">{error || '예약 정보를 찾을 수 없습니다.'}</p>
                        <div className="space-x-4">
                            <button
                                onClick={() => router.back()}
                                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                            >
                                이전 페이지로
                            </button>
                            <button
                                onClick={() => router.push('/manager/confirmation')}
                                className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                            >
                                목록으로
                            </button>
                        </div>
                    </div>
                </PageWrapper>
            </ManagerLayout>
        );
    }

    const paymentBadge = getPaymentStatusBadge(quoteData.payment_status);

    return (
        <ManagerLayout title="예약확인서 상세보기" activeTab="confirmation">
            <PageWrapper>
                {/* 헤더 정보 */}
                <SectionBox title="📋 예약 기본 정보">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <span className="font-medium text-gray-600">행복여행 이름</span>
                                <span className="font-bold text-lg text-gray-900">{quoteData.title}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="font-medium text-gray-600">예약번호</span>
                                <span className="font-mono text-gray-900">{quoteData.quote_id}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="font-medium text-gray-600">예약일시</span>
                                <span className="text-gray-900">{formatDateTime(quoteData.created_at)}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="font-medium text-gray-600">예약자명</span>
                                <span className="text-gray-900">{quoteData.user_name}</span>
                            </div>
                        </div>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <span className="font-medium text-gray-600">이메일</span>
                                <span className="text-gray-900">{quoteData.user_email}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="font-medium text-gray-600">연락처</span>
                                <span className="text-gray-900">{quoteData.user_phone || '-'}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="font-medium text-gray-600">결제상태</span>
                                <span className={`inline-block px-3 py-1 text-sm font-semibold rounded-full ${paymentBadge.bg} ${paymentBadge.text}`}>
                                    {paymentBadge.label}
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="font-medium text-gray-600">총 결제금액</span>
                                <span className="text-2xl font-bold text-blue-600">{quoteData.total_price.toLocaleString()}동</span>
                            </div>
                        </div>
                    </div>
                </SectionBox>

                {/* 예약 서비스 목록 */}
                <SectionBox title={`🎯 예약 서비스 내역 (${quoteData.reservations.length}개)`}>
                    {quoteData.reservations.length > 0 ? (
                        <div className="space-y-4">
                            {quoteData.reservations.map((reservation, index) => (
                                <div key={reservation.reservation_id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                    <div className="flex justify-between items-start">
                                        <div className="flex-1">
                                            <div className="font-semibold text-blue-600 text-lg mb-2">
                                                {index + 1}. {getServiceTypeName(reservation.service_type)}
                                            </div>
                                            <div className="text-sm text-gray-600 mb-3">
                                                {getServiceDescription(reservation.service_type, reservation.service_details)}
                                            </div>

                                            {/* 상세 정보 표시 */}
                                            {reservation.service_details && Object.keys(reservation.service_details).length > 0 && (
                                                <div className="bg-white rounded-lg p-3 mt-3">
                                                    <h4 className="font-medium text-gray-700 mb-2">상세 정보</h4>
                                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                                        {Object.entries(reservation.service_details)
                                                            .filter(([key, value]) => value && !key.includes('_id') && !key.includes('reservation_id'))
                                                            .slice(0, 8) // 최대 8개 항목만 표시
                                                            .map(([key, value]) => (
                                                                <div key={key} className="flex justify-between">
                                                                    <span className="text-gray-500 capitalize">{key.replace(/_/g, ' ')}:</span>
                                                                    <span className="text-gray-900 font-medium">
                                                                        {typeof value === 'string' && value.length > 20
                                                                            ? `${value.substring(0, 20)}...`
                                                                            : String(value)}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                    </div>
                                                </div>
                                            )}

                                            <div className="flex items-center space-x-4 text-xs text-gray-500 mt-3">
                                                <span>예약ID: {reservation.reservation_id.slice(-8)}</span>
                                                <span className={`px-2 py-1 rounded ${reservation.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                                                    reservation.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                                        'bg-gray-100 text-gray-700'
                                                    }`}>
                                                    {reservation.status === 'confirmed' ? '확정' :
                                                        reservation.status === 'pending' ? '대기' : reservation.status}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="text-right ml-4">
                                            <div className="text-lg font-bold text-blue-600">
                                                {reservation.amount > 0 ? `${reservation.amount.toLocaleString()}동` : '포함'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
                            <div className="text-3xl mb-2">📋</div>
                            <p className="text-yellow-700 font-medium">예약 서비스 정보가 없습니다.</p>
                            <p className="text-yellow-600 text-sm mt-1">견적 단계이거나 예약이 아직 생성되지 않았습니다.</p>
                        </div>
                    )}
                </SectionBox>

                {/* 발송 상태 */}
                {quoteData.confirmed_at && (
                    <SectionBox title="📧 발송 정보">
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                            <div className="flex items-center space-x-3">
                                <div className="text-2xl">✅</div>
                                <div>
                                    <div className="font-medium text-green-800">고객에게 발송 완료</div>
                                    <div className="text-sm text-green-600">발송일시: {formatDateTime(quoteData.confirmed_at)}</div>
                                </div>
                            </div>
                        </div>
                    </SectionBox>
                )}

                {/* 관리 작업 */}
                <SectionBox title="🛠️ 관리 작업">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <button
                            onClick={generateConfirmation}
                            className="flex items-center justify-center space-x-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            <span>📄</span>
                            <span>확인서 생성</span>
                        </button>
                        <button
                            onClick={previewCustomerEmail}
                            className="flex items-center justify-center space-x-2 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                        >
                            <span>📧</span>
                            <span>이메일 미리보기</span>
                        </button>
                        <button
                            onClick={viewCustomerConfirmation}
                            className="flex items-center justify-center space-x-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                        >
                            <span>👁️</span>
                            <span>고객 확인서</span>
                        </button>
                        <button
                            onClick={() => router.push('/manager/confirmation')}
                            className="flex items-center justify-center space-x-2 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                            <span>📋</span>
                            <span>목록으로</span>
                        </button>
                    </div>
                </SectionBox>

                {/* 주의사항 */}
                <SectionBox title="⚠️ 주의사항">
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                        <ul className="text-sm text-yellow-800 space-y-1">
                            <li>• 예약확인서는 결제 완료 후 생성 가능합니다</li>
                            <li>• 고객 정보가 변경된 경우 새로운 확인서를 생성해야 합니다</li>
                            <li>• 발송된 이메일은 고객의 스팸 폴더도 확인하도록 안내해 주세요</li>
                            <li>• 확인서 PDF는 인쇄 가능한 형태로 제공됩니다</li>
                        </ul>
                    </div>
                </SectionBox>
            </PageWrapper>
        </ManagerLayout>
    );
}

export const dynamic = 'force-dynamic';

export default function ManagerConfirmationViewPage() {
    return (
        <Suspense fallback={
            <ManagerLayout title="예약확인서 상세보기" activeTab="confirmation">
                <PageWrapper>
                    <div className="flex justify-center items-center h-64">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                        <p className="ml-4 text-gray-600">페이지를 불러오는 중...</p>
                    </div>
                </PageWrapper>
            </ManagerLayout>
        }>
            <ManagerConfirmationViewClient />
        </Suspense>
    );
}
