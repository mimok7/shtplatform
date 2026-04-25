'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useParams } from 'next/navigation';
import supabase from '@/lib/supabase';
import ManagerLayout from '@/components/ManagerLayout';
import {
    ArrowLeft,
    Save,
    User,
    Calendar,
    Phone,
    Mail,
    FileText,
    Ship,
    Plane,
    Building,
    MapPin,
    Car,
    CheckCircle,
    XCircle,
    Clock,
    AlertTriangle
} from 'lucide-react';

interface ReservationDetail {
    re_id: string;
    re_type: string;
    re_status: string;
    re_created_at: string;
    re_quote_id: string | null;
    re_user_id: string;
    users: {
        id: string;
        name: string;
        email: string;
        phone_number: string;
    } | null;
    quote: {
        title: string;
        status: string;
        total_price: number;
    } | null;
    serviceDetails: any;
}

interface FormData {
    re_status: string;
    serviceDetails: { [key: string]: any };
    admin_note?: string;
}

function ReservationEditContent() {
    const router = useRouter();
    const params = useParams();
    const reservationId = params.id as string;

    const [reservation, setReservation] = useState<ReservationDetail | null>(null);
    const [formData, setFormData] = useState<FormData>({
        re_status: '',
        serviceDetails: {},
        admin_note: ''
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!reservationId) {
            alert('예약 ID가 필요합니다.');
            router.push('/manager/reservations');
            return;
        }
        loadReservationDetail();
    }, [reservationId]);

    const loadReservationDetail = async () => {
        try {
            setLoading(true);

            // 권한 확인
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                router.push('/login');
                return;
            }

            // 예약 원본 조회
            const { data: reservationRow, error: queryError } = await supabase
                .from('reservation')
                .select('*')
                .eq('re_id', reservationId)
                .single();

            if (queryError) {
                throw queryError;
            }

            if (!reservationRow) {
                alert('예약 정보를 찾을 수 없습니다.');
                router.push('/manager/reservations');
                return;
            }

            // 관련 사용자 정보 조회 (있으면)
            let userInfo: ReservationDetail['users'] = null;
            if (reservationRow.re_user_id) {
                const { data: u } = await supabase
                    .from('users')
                    .select('id, name, email, phone_number')
                    .eq('id', reservationRow.re_user_id)
                    .maybeSingle();
                if (u) userInfo = u as any;
            }

            // 연결된 견적 정보 조회 (있으면)
            let quoteInfo: ReservationDetail['quote'] = null;
            if (reservationRow.re_quote_id) {
                const { data: q } = await supabase
                    .from('quote')
                    .select('title, status, total_price')
                    .eq('id', reservationRow.re_quote_id)
                    .maybeSingle();
                if (q) quoteInfo = q as any;
            }

            // 서비스별 상세 정보 조회
            let serviceDetails = null;
            const serviceTableMap: { [key: string]: string } = {
                cruise: 'reservation_cruise',
                airport: 'reservation_airport',
                hotel: 'reservation_hotel',
                tour: 'reservation_tour',
                rentcar: 'reservation_rentcar'
            };

            const tableName = serviceTableMap[reservationRow.re_type];
            if (tableName) {
                const { data: serviceData } = await supabase
                    .from(tableName)
                    .select('*')
                    .eq('reservation_id', reservationId);

                serviceDetails = Array.isArray(serviceData) ? serviceData[0] : (serviceData ?? null);
            }

            const reservationData: ReservationDetail = {
                re_id: reservationRow.re_id,
                re_type: reservationRow.re_type,
                re_status: reservationRow.re_status,
                re_created_at: reservationRow.re_created_at,
                re_quote_id: reservationRow.re_quote_id,
                re_user_id: reservationRow.re_user_id,
                users: userInfo,
                quote: quoteInfo,
                serviceDetails
            };

            setReservation(reservationData);

            // 폼 데이터 초기화
            setFormData({
                re_status: reservationRow.re_status || 'pending',
                serviceDetails: serviceDetails || {},
                admin_note: ''
            });

            setError(null);

        } catch (error) {
            console.error('예약 상세 정보 로드 실패:', error);
            setError('예약 정보를 불러오는 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const handleStatusChange = (status: string) => {
        setFormData(prev => ({
            ...prev,
            re_status: status
        }));
    };

    const handleServiceDetailChange = (field: string, value: any) => {
        setFormData(prev => ({
            ...prev,
            serviceDetails: {
                ...prev.serviceDetails,
                [field]: value
            }
        }));
    };

    const handleSave = async () => {
        if (!reservation) return;

        try {
            setSaving(true);

            // 메인 예약 상태 업데이트
            const { error: reservationError } = await supabase
                .from('reservation')
                .update({
                    re_status: formData.re_status,
                    updated_at: new Date().toISOString()
                })
                .eq('re_id', reservationId);

            if (reservationError) {
                throw reservationError;
            }

            // 서비스 상세 정보 업데이트
            const serviceTableMap: { [key: string]: string } = {
                cruise: 'reservation_cruise',
                airport: 'reservation_airport',
                hotel: 'reservation_hotel',
                tour: 'reservation_tour',
                rentcar: 'reservation_rentcar'
            };

            const tableName = serviceTableMap[reservation.re_type];
            if (tableName && Object.keys(formData.serviceDetails).length > 0) {
                const { error: serviceError } = await supabase
                    .from(tableName)
                    .update(formData.serviceDetails)
                    .eq('reservation_id', reservationId);

                if (serviceError) {
                    console.warn('서비스 상세 정보 업데이트 실패:', serviceError);
                }
            }

            alert('예약 정보가 성공적으로 수정되었습니다.');
            router.push(`/manager/reservations/${reservationId}/view`);

        } catch (error) {
            console.error('예약 수정 실패:', error);
            alert('예약 수정 중 오류가 발생했습니다.');
        } finally {
            setSaving(false);
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'approved': return <CheckCircle className="w-5 h-5 text-blue-600" />;
            case 'confirmed': return <CheckCircle className="w-5 h-5 text-green-600" />;
            case 'completed': return <CheckCircle className="w-5 h-5 text-gray-600" />;
            case 'cancelled': return <XCircle className="w-5 h-5 text-red-600" />;
            default: return <Clock className="w-5 h-5 text-yellow-600" />;
        }
    };

    const getStatusText = (status: string) => {
        switch (status) {
            case 'pending': return '대기중';
            case 'approved': return '승인';
            case 'confirmed': return '확정';
            case 'completed': return '완료';
            case 'cancelled': return '취소됨';
            default: return status;
        }
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'cruise': return <Ship className="w-6 h-6 text-blue-600" />;
            case 'airport': return <Plane className="w-6 h-6 text-green-600" />;
            case 'hotel': return <Building className="w-6 h-6 text-purple-600" />;
            case 'tour': return <MapPin className="w-6 h-6 text-orange-600" />;
            case 'rentcar': return <Car className="w-6 h-6 text-red-600" />;
            default: return <FileText className="w-6 h-6 text-gray-600" />;
        }
    };

    const getTypeName = (type: string) => {
        switch (type) {
            case 'cruise': return '크루즈';
            case 'airport': return '공항';
            case 'hotel': return '호텔';
            case 'tour': return '투어';
            case 'rentcar': return '렌터카';
            default: return type;
        }
    };

    // 서비스 상세 한글 라벨 맵
    const serviceLabelMap: Record<string, Record<string, string>> = {
        cruise: {
            reservation_id: '예약 ID',
            room_price_code: '객실 가격 코드',
            checkin: '체크인',
            guest_count: '탑승객 수',
            unit_price: '단가',
            boarding_assist: '승선 지원',
            room_total_price: '객실 총액',
            request_note: '요청사항',
            created_at: '생성일시',
            updated_at: '수정일시'
        },
        airport: {
            reservation_id: '예약 ID',
            airport_price_code: '공항 가격 코드',
            ra_airport_location: '공항 위치',
            ra_flight_number: '항공편 번호',
            ra_datetime: '일시',
            ra_stopover_location: '경유지',
            ra_stopover_wait_minutes: '경유 대기(분)',
            ra_car_count: '차량 수',
            ra_passenger_count: '승객 수',
            ra_luggage_count: '수하물 수',
            request_note: '요청사항',
            ra_is_processed: '처리 여부',
            created_at: '생성일시',
            updated_at: '수정일시'
        },
        hotel: {
            reservation_id: '예약 ID',
            hotel_price_code: '호텔 가격 코드',
            schedule: '스케줄',
            room_count: '객실 수',
            checkin_date: '체크인',
            breakfast_service: '조식 서비스',
            hotel_category: '호텔 카테고리',
            guest_count: '투숙객 수',
            total_price: '총액',
            request_note: '요청사항',
            created_at: '생성일시',
            updated_at: '수정일시'
        },
        rentcar: {
            reservation_id: '예약 ID',
            rentcar_price_code: '렌터카 가격 코드',
            rentcar_count: '렌터카 수',
            unit_price: '단가',
            car_count: '차량 수',
            passenger_count: '승객 수',
            pickup_datetime: '픽업 일시',
            pickup_location: '픽업 장소',
            destination: '목적지',
            via_location: '경유지',
            via_waiting: '경유 대기',
            luggage_count: '수하물 수',
            total_price: '총액',
            request_note: '요청사항',
            created_at: '생성일시',
            updated_at: '수정일시'
        },
        tour: {
            reservation_id: '예약 ID',
            tour_price_code: '투어 가격 코드',
            tour_capacity: '투어 정원',
            pickup_location: '픽업 장소',
            dropoff_location: '하차 장소',
            total_price: '총액',
            request_note: '요청사항',
            created_at: '생성일시',
            updated_at: '수정일시'
        }
    };

    if (loading) {
        return (
            <ManagerLayout title="예약 수정" activeTab="reservations">
                <div className="flex justify-center items-center h-64">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                        <p className="mt-4 text-gray-600">예약 정보를 불러오는 중...</p>
                    </div>
                </div>
            </ManagerLayout>
        );
    }

    if (!reservation) {
        return (
            <ManagerLayout title="예약 수정" activeTab="reservations">
                <div className="text-center py-12">
                    <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-600">예약 정보를 찾을 수 없습니다</h3>
                </div>
            </ManagerLayout>
        );
    }

    return (
        <ManagerLayout title="예약 수정" activeTab="reservations">
            <div className="space-y-6">

                {/* 헤더 */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => router.push(`/manager/reservations/${reservationId}/view`)}
                            className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
                                {getTypeIcon(reservation.re_type)}
                                {getTypeName(reservation.re_type)} 예약 수정
                            </h1>
                            <p className="text-gray-600 mt-1">예약 ID: {reservation.re_id}</p>
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <button
                            onClick={() => router.push(`/manager/reservations/${reservationId}/view`)}
                            className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
                        >
                            취소
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2 disabled:opacity-50"
                        >
                            <Save className="w-4 h-4" />
                            {saving ? '저장 중...' : '저장'}
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5" />
                        {error}
                    </div>
                )}

                {/* 고객 정보 (읽기 전용) */}
                <div className="bg-gray-50 rounded-lg shadow-sm p-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <User className="w-6 h-6 text-green-600" />
                        고객 정보 (읽기 전용)
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">고객명</label>
                            <input
                                type="text"
                                value={reservation.users?.name || ''}
                                disabled
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">전화번호</label>
                            <input
                                type="text"
                                value={reservation.users?.phone_number || ''}
                                disabled
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
                            <input
                                type="email"
                                value={reservation.users?.email || ''}
                                disabled
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">예약일시</label>
                            <input
                                type="text"
                                value={new Date(reservation.re_created_at).toLocaleString('ko-KR')}
                                disabled
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600"
                            />
                        </div>
                    </div>
                </div>

                {/* 예약 상태 수정 */}
                <div className="bg-white rounded-lg shadow-md p-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <FileText className="w-6 h-6 text-blue-600" />
                        예약 상태 관리
                    </h3>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-3">예약 상태</label>
                            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                                {[
                                    { value: 'pending', label: '대기중', color: 'yellow' },
                                    { value: 'approved', label: '승인', color: 'blue' },
                                    { value: 'confirmed', label: '확정', color: 'green' },
                                    { value: 'completed', label: '완료', color: 'gray' },
                                    { value: 'cancelled', label: '취소됨', color: 'red' }
                                ].map(status => (
                                    <button
                                        key={status.value}
                                        onClick={() => handleStatusChange(status.value)}
                                        className={`p-3 rounded-lg border-2 transition-colors flex items-center gap-2 ${formData.re_status === status.value
                                            ? `border-${status.color}-500 bg-${status.color}-50 text-${status.color}-700`
                                            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                                            }`}
                                    >
                                        {getStatusIcon(status.value)}
                                        <span className="font-medium">{status.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">관리자 메모</label>
                            <textarea
                                value={formData.admin_note}
                                onChange={(e) => setFormData(prev => ({ ...prev, admin_note: e.target.value }))}
                                placeholder="예약 관련 메모를 입력하세요..."
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                rows={3}
                            />
                        </div>
                    </div>
                </div>

                {/* 서비스 상세 정보 수정 */}
                {reservation.serviceDetails && (
                    <div className="bg-white rounded-lg shadow-md p-6">
                        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                            {getTypeIcon(reservation.re_type)}
                            {getTypeName(reservation.re_type)} 서비스 상세 수정
                        </h3>

                        <div className="space-y-4">
                            {/* 공통 필드들 - 한글 라벨 및 숨김 키 필터 */}
                            {Object.entries(formData.serviceDetails)
                                .filter(([key]) => {
                                    if (key === 'id' || key === 'reservation_id') return false;
                                    if (key.endsWith('_id') || key.endsWith('_price_code')) return false;
                                    if (key === 'created_at' || key === 'updated_at') return false;
                                    return true;
                                })
                                .map(([key, value]) => {
                                    const label = serviceLabelMap[reservation.re_type]?.[key] || key;
                                    const isTextArea = key.includes('note') || key.includes('memo') || key.includes('comment') || key.includes('request');
                                    const isDateTime = key.includes('date') || key.includes('time') || key.includes('datetime');
                                    return (
                                        <div key={key}>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                {label}
                                            </label>
                                            {isTextArea ? (
                                                <textarea
                                                    value={value || ''}
                                                    onChange={(e) => handleServiceDetailChange(key, e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                    rows={3}
                                                />
                                            ) : (
                                                <input
                                                    type={isDateTime ? 'datetime-local' : 'text'}
                                                    value={value || ''}
                                                    onChange={(e) => handleServiceDetailChange(key, e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                />
                                            )}
                                        </div>
                                    );
                                })}

                            {Object.keys(formData.serviceDetails).length === 0 && (
                                <div className="text-center py-6 text-gray-500">
                                    <p>수정 가능한 서비스 상세 정보가 없습니다.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* 변경 사항 미리보기 */}
                <div className="bg-yellow-50 rounded-lg border border-yellow-200 p-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <AlertTriangle className="w-6 h-6 text-yellow-600" />
                        변경 사항 미리보기
                    </h3>

                    <div className="space-y-2 text-sm">
                        <div>
                            <span className="text-gray-600">현재 상태:</span>
                            <span className={`ml-2 px-2 py-1 rounded text-xs ${reservation.re_status === 'confirmed' ? 'bg-green-100 text-green-800' :
                                reservation.re_status === 'approved' ? 'bg-blue-100 text-blue-800' :
                                    reservation.re_status === 'completed' ? 'bg-gray-100 text-gray-800' :
                                        reservation.re_status === 'cancelled' ? 'bg-red-100 text-red-800' :
                                            'bg-yellow-100 text-yellow-800'
                                }`}>
                                {getStatusText(reservation.re_status)}
                            </span>
                        </div>
                        <div>
                            <span className="text-gray-600">변경 후:</span>
                            <span className={`ml-2 px-2 py-1 rounded text-xs ${formData.re_status === 'confirmed' ? 'bg-green-100 text-green-800' :
                                formData.re_status === 'approved' ? 'bg-blue-100 text-blue-800' :
                                    formData.re_status === 'completed' ? 'bg-gray-100 text-gray-800' :
                                        formData.re_status === 'cancelled' ? 'bg-red-100 text-red-800' :
                                            'bg-yellow-100 text-yellow-800'
                                }`}>
                                {getStatusText(formData.re_status)}
                            </span>
                        </div>

                        {formData.re_status !== reservation.re_status && (
                            <div className="mt-3 p-3 bg-blue-100 rounded-lg">
                                <p className="text-blue-800 font-medium">
                                    ⚠️ 예약 상태가 변경됩니다. 저장하시겠습니까?
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </ManagerLayout>
    );
}

export default function ReservationEditPage() {
    return (
        <Suspense fallback={
            <ManagerLayout title="예약 수정" activeTab="reservations">
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                </div>
            </ManagerLayout>
        }>
            <ReservationEditContent />
        </Suspense>
    );
}
