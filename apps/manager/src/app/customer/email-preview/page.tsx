'use client';
import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '@/lib/supabase';

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

function CustomerEmailPreviewClient() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const quoteId = searchParams.get('quote_id');
    const token = searchParams.get('token');

    const [quoteData, setQuoteData] = useState<QuoteData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (quoteId && token) {
            loadQuoteData();
        } else {
            setError('올바르지 않은 접근입니다. 견적 ID와 토큰이 필요합니다.');
            setLoading(false);
        }
    }, [quoteId, token]);

    const loadQuoteData = async () => {
        try {
            setLoading(true);
            console.log('🔍 견적 데이터 로드 시작:', quoteId);

            // 1. 기본 정보들을 병렬로 조회 (최적화됨)
            const [quoteResult, reservationsResult] = await Promise.all([
                // 견적 정보 조회 (id 필드로 조회)
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

            // 서비스 상세 정보 맵 생성
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

    const openConfirmationPage = () => {
        const confirmationUrl = `/customer/confirmation?quote_id=${quoteData?.quote_id}&token=${token}`;
        window.open(confirmationUrl, '_blank');
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
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto mb-4"></div>
                    <p className="text-gray-600">이메일을 준비하는 중...</p>
                    <p className="text-sm text-gray-500 mt-2">견적 데이터를 불러오고 있습니다</p>
                </div>
            </div>
        );
    }

    if (error || !quoteData) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center max-w-md mx-auto">
                    <div className="text-6xl mb-6">❌</div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-4">접근 오류</h2>
                    <p className="text-gray-600 mb-6">{error || '예약 정보를 찾을 수 없습니다.'}</p>
                    <div className="space-y-3">
                        <button
                            onClick={() => window.history.back()}
                            className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                            이전 페이지로
                        </button>
                        <button
                            onClick={() => window.close()}
                            className="w-full px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                        >
                            창 닫기
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const paymentBadge = getPaymentStatusBadge(quoteData.payment_status);

    return (
        <div className="min-h-screen" style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            fontFamily: 'Arial, sans-serif'
        }}>
            {/* 상단 고정 바 (미리보기 컨트롤) */}
            <div className="bg-white bg-opacity-95 shadow-sm border-b sticky top-0 z-10 print:hidden">
                <div className="max-w-4xl mx-auto px-6 py-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <div className="text-xl">📧</div>
                            <div>
                                <h1 className="text-lg font-bold text-gray-900">이메일 미리보기</h1>
                                <p className="text-sm text-gray-600">예약확인서 #{quoteData.quote_id.slice(-8)}</p>
                            </div>
                        </div>
                        <div className="flex items-center space-x-3">
                            <button
                                onClick={openConfirmationPage}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
                            >
                                <span>📄</span>
                                <span>상세 확인서</span>
                            </button>
                            <button
                                onClick={() => window.close()}
                                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                            >
                                닫기
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="container mx-auto py-8 px-4">
                <div className="max-w-2xl mx-auto bg-white rounded-xl overflow-hidden shadow-2xl">
                    {/* 이메일 헤더 */}
                    <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white text-center py-12 px-8">
                        <div className="text-5xl mb-4">🌊</div>
                        <h1 className="text-3xl font-bold mb-3">예약이 확정되었습니다!</h1>
                        <p className="text-lg opacity-90 mb-4">베트남 하롱베이 크루즈 여행이 성공적으로 예약되었습니다</p>
                        <div className="bg-white bg-opacity-20 rounded-lg px-4 py-2 inline-block">
                            <span className="text-sm font-medium">예약번호: {quoteData.quote_id}</span>
                        </div>
                    </div>

                    {/* 이메일 본문 */}
                    <div className="p-8">
                        {/* 인사말 */}
                        <div className="text-lg text-gray-700 mb-8 leading-relaxed">
                            안녕하세요, <strong className="text-blue-600">{quoteData.user_name}</strong>님!<br /><br />
                            스테이하롱 크루즈를 선택해 주셔서 진심으로 감사드립니다.
                            <strong className="text-blue-700"> {quoteData.title}</strong> 예약이 성공적으로 완료되었으며,
                            아래와 같이 예약 상세 내역을 확인해 드립니다.
                        </div>

                        {/* 예약 기본 정보 박스 */}
                        <div className="bg-gray-50 border-l-4 border-blue-500 p-6 mb-8 rounded-r-lg">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                                📋 예약 기본 정보
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-3">
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
                                <div className="space-y-3">
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
                                        <span className="text-2xl font-bold text-red-600">{quoteData.total_price.toLocaleString()}동</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 예약 서비스 목록 - 표 형태로 개선 */}
                        <div className="mb-8">
                            <h3 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
                                🎯 예약 서비스 내역 ({quoteData.reservations.length}개)
                            </h3>
                            {quoteData.reservations.length > 0 ? (
                                <div className="overflow-hidden border border-gray-200 rounded-lg">
                                    <table className="w-full">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-green-800 uppercase tracking-wider w-12">
                                                    No.
                                                </th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-green-800 uppercase tracking-wider">
                                                    서비스 종류
                                                </th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-green-800 uppercase tracking-wider">
                                                    상세 정보
                                                </th>
                                                <th className="px-4 py-3 text-center text-xs font-medium text-green-800 uppercase tracking-wider w-20">
                                                    상태
                                                </th>
                                                <th className="px-4 py-3 text-right text-xs font-medium text-green-800 uppercase tracking-wider w-28">
                                                    금액
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {quoteData.reservations.map((reservation, index) => (
                                                <tr key={reservation.reservation_id} className="hover:bg-gray-50 transition-colors">
                                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                                                        {index + 1}
                                                    </td>
                                                    <td className="px-4 py-4 whitespace-nowrap">
                                                        <div className="flex items-center">
                                                            <div className="text-sm font-medium text-blue-600">
                                                                {getServiceTypeName(reservation.service_type)}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <div className="text-sm text-gray-900 leading-relaxed">
                                                            {getServiceDescription(reservation.service_type, reservation.service_details)}
                                                        </div>
                                                        <div className="text-xs text-gray-500 mt-1">
                                                            예약ID: {reservation.reservation_id.slice(-8)}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-4 whitespace-nowrap text-center">
                                                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${reservation.status === 'confirmed'
                                                                ? 'bg-green-100 text-green-800' :
                                                                reservation.status === 'pending'
                                                                    ? 'bg-yellow-100 text-yellow-800' :
                                                                    'bg-gray-100 text-gray-800'
                                                            }`}>
                                                            {reservation.status === 'confirmed' ? '✅ 확정' :
                                                                reservation.status === 'pending' ? '⏳ 대기' : reservation.status}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-4 whitespace-nowrap text-right">
                                                        <div className="text-sm font-bold text-blue-600">
                                                            {reservation.amount > 0 ? `${reservation.amount.toLocaleString()}동` : '포함'}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="bg-blue-50">
                                            <tr>
                                                <td colSpan={4} className="px-4 py-3 text-right text-sm font-medium text-gray-700">
                                                    총 예약 금액:
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap text-right">
                                                    <div className="text-lg font-bold text-red-600">
                                                        {quoteData.total_price.toLocaleString()}동
                                                    </div>
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            ) : (
                                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
                                    <div className="text-3xl mb-2">📋</div>
                                    <p className="text-yellow-700 font-medium">예약 서비스 상세 정보가 준비 중입니다.</p>
                                    <p className="text-yellow-600 text-sm mt-1">곧 상세 내역을 안내해 드리겠습니다.</p>
                                </div>
                            )}
                        </div>

                        {/* 여행 준비사항 */}
                        <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-8">
                            <h3 className="text-lg font-semibold text-green-800 mb-4 flex items-center">
                                📋 여행 준비사항
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <h4 className="font-medium text-green-700 mb-2">🎒 필수 준비물</h4>
                                    <ul className="text-green-600 space-y-1 text-sm">
                                        <li>• 여권 (유효기간 6개월 이상)</li>
                                        <li>• 본 예약확인서 출력본</li>
                                        <li>• 개인 상비약 및 세면용품</li>
                                        <li>• 편안한 복장 및 운동화</li>
                                    </ul>
                                </div>
                                <div>
                                    <h4 className="font-medium text-green-700 mb-2">⚠️ 주의사항</h4>
                                    <ul className="text-green-600 space-y-1 text-sm">
                                        <li>• 출발 30분 전 집결 완료</li>
                                        <li>• 여행자보험 가입 권장</li>
                                        <li>• 날씨에 따라 일정 변경 가능</li>
                                        <li>• 귀중품 분실 주의</li>
                                    </ul>
                                </div>
                            </div>
                        </div>

                        {/* 변경/취소 안내 */}
                        {quoteData.payment_status === 'paid' && (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
                                <h3 className="text-lg font-semibold text-blue-800 mb-4 flex items-center">
                                    📞 변경 및 취소 안내
                                </h3>
                                <div className="text-blue-700 text-sm space-y-2">
                                    <p>• <strong>변경/취소 기한:</strong> 여행 출발 3일 전까지 가능</p>
                                    <p>• <strong>취소 수수료:</strong> 출발일 기준으로 차등 적용</p>
                                    <p>• <strong>환불 처리:</strong> 영업일 기준 3-5일 소요</p>
                                    <p>• <strong>변경 문의:</strong> 고객센터 1588-1234</p>
                                </div>
                            </div>
                        )}

                        {/* 긴급연락처 */}
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-8">
                            <h3 className="text-lg font-semibold text-yellow-800 mb-4 text-center">🚨 긴급연락처 및 고객지원</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="text-center">
                                    <div className="text-2xl mb-2">📞</div>
                                    <div className="font-semibold text-gray-700 mb-1">고객센터</div>
                                    <div className="text-2xl font-bold text-blue-600 mb-1">1588-1234</div>
                                    <div className="text-xs text-gray-600">평일 09:00-18:00</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-2xl mb-2">🚨</div>
                                    <div className="font-semibold text-gray-700 mb-1">24시간 긴급</div>
                                    <div className="text-2xl font-bold text-red-600 mb-1">010-9999-1234</div>
                                    <div className="text-xs text-gray-600">여행 중 응급상황</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-2xl mb-2">💬</div>
                                    <div className="font-semibold text-gray-700 mb-1">카카오톡</div>
                                    <div className="text-lg font-bold text-yellow-600 mb-1">@스테이하롱</div>
                                    <div className="text-xs text-gray-600">실시간 상담</div>
                                </div>
                            </div>
                        </div>

                        {/* 상세 확인서 버튼 */}
                        <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg p-6 text-center mb-8">
                            <div className="text-3xl mb-3">🌟</div>
                            <p className="text-lg font-semibold mb-2">베트남 하롱베이에서 특별한 추억을 만들어보세요!</p>
                            <p className="text-sm opacity-90 mb-6">
                                더 자세한 예약 정보와 일정표는 아래 버튼을 클릭하여 상세 확인서를 확인해 주세요.
                            </p>
                            <button
                                onClick={openConfirmationPage}
                                className="bg-white text-blue-600 px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors inline-flex items-center space-x-2 shadow-lg"
                            >
                                <span>📄</span>
                                <span>상세 예약확인서 보기</span>
                            </button>
                        </div>

                        {/* 감사 메시지 */}
                        <div className="text-center text-gray-600 mb-6">
                            <div className="text-2xl mb-3">🙏</div>
                            <p className="font-medium text-lg text-gray-700 mb-2">소중한 선택에 감사드립니다</p>
                            <p className="text-sm">스테이하롱 크루즈와 함께 최고의 하롱베이 여행을 경험하세요!</p>
                        </div>
                    </div>

                    {/* 이메일 푸터 */}
                    <div className="bg-gray-100 text-center p-8 border-t">
                        <div className="text-xl font-bold text-blue-600 mb-3 flex items-center justify-center">
                            <span className="mr-2">🌊</span>
                            스테이하롱 크루즈
                        </div>
                        <div className="text-sm text-gray-600 space-y-1 max-w-lg mx-auto">
                            <div className="flex items-center justify-center space-x-4 mb-3">
                                <span>📍 서울특별시 강남구 테헤란로 123</span>
                                <span>📞 1588-1234</span>
                            </div>
                            <div className="flex items-center justify-center space-x-4">
                                <span>📧 support@stayhalong.com</span>
                                <span>🌐 www.stayhalong.com</span>
                            </div>
                            <div className="text-gray-400 mt-3 text-xs">
                                © 2024 StayHalong Cruise. All rights reserved. | 관광사업자등록번호: 2024-서울강남-001
                            </div>
                        </div>
                    </div>
                </div>

                {/* 이메일 하단 안내 */}
                <div className="max-w-2xl mx-auto mt-6 text-center">
                    <div className="bg-white bg-opacity-90 rounded-lg p-4 text-gray-700">
                        <div className="flex items-center justify-center space-x-4 text-sm">
                            <span>ℹ️ 이 이메일은 예약 확정 알림입니다</span>
                            <span>•</span>
                            <span>문의사항이 있으시면 고객센터로 연락주세요</span>
                        </div>
                        {quoteData.confirmed_at && (
                            <div className="text-xs text-gray-500 mt-2">
                                발송일시: {formatDateTime(quoteData.confirmed_at)}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export const dynamic = 'force-dynamic';

export default function CustomerEmailPreviewPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto mb-4"></div>
                    <p className="text-gray-600">페이지를 불러오는 중...</p>
                </div>
            </div>
        }>
            <CustomerEmailPreviewClient />
        </Suspense>
    );
}
