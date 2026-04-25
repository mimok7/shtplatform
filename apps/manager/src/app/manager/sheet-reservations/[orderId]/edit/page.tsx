'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import supabase from '@/lib/supabase';
import ManagerLayout from '@/components/ManagerLayout';
import { Save, ArrowLeft, Loader2, User, Ship, Car, Users, Plane, Building, MapPin } from 'lucide-react';

interface ShMData {
    id: number;
    order_id: string;
    reservation_date: string;
    email: string;
    korean_name: string;
    english_name: string;
    nickname: string;
    member_grade: string;
    name: string;
    phone: string;
    plan: string;
    payment_method: string;
    request_note: string;
    kakao_id: string;
    special_note: string;
    memo: string;
    discount_code: string;
}

interface ShRData {
    id: number;
    order_id: string;
    cruise_name: string;
    division: string;
    room_type: string;
    room_code: string;
    checkin_date: string;
    time: string;
    adult: string;
    child: string;
    toddler: string;
    amount: string;
    total: string;
    room_note: string;
    email: string;
}

interface ShPData {
    id: number;
    order_id: string;
    category: string;
    route: string;
    vehicle_type: string;
    date: string;
    time: string;
    airport_name: string;
    flight_number: string;
    passenger_count: string;
    location_name: string;
    amount: string;
    total: string;
    email: string;
}

interface ShHData {
    id: number;
    order_id: string;
    hotel_name: string;
    room_name: string;
    room_type: string;
    checkin_date: string;
    checkout_date: string;
    adult: string;
    child: string;
    toddler: string;
    amount: string;
    total: string;
    email: string;
}

interface ShTData {
    id: number;
    order_id: string;
    tour_name: string;
    tour_type: string;
    start_date: string;
    end_date: string;
    pickup_location: string;
    amount: string;
    total: string;
    memo: string;
    email: string;
}

interface ShRCData {
    id: number;
    order_id: string;
    category: string;
    route: string;
    vehicle_type: string;
    boarding_date: string;
    boarding_time: string;
    boarding_location: string;
    destination: string;
    passenger_count: string;
    usage_period: string;
    amount: string;
    total: string;
    memo: string;
    email: string;
}

interface ShCData {
    id: number;
    order_id: string;
    division: string;
    category: string;
    cruise_name: string;
    vehicle_type: string;
    vehicle_code: string;
    vehicle_count: string;
    passenger_count: string;
    boarding_datetime: string;
    boarding_location: string;
    dropoff_location: string;
    amount: string;
    total: string;
    email: string;
}

interface ShCCData {
    id: number;
    order_id: string;
    boarding_date: string;
    division: string;
    category: string;
    vehicle_number: string;
    seat_number: string;
    name: string;
    email: string;
}

export default function SheetReservationEditPage() {
    const router = useRouter();
    const params = useParams();
    const orderId = params?.orderId as string;

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [shMData, setShMData] = useState<ShMData | null>(null);
    const [shRList, setShRList] = useState<ShRData[]>([]);
    const [shPList, setShPList] = useState<ShPData[]>([]);
    const [shHList, setShHList] = useState<ShHData[]>([]);
    const [shTList, setShTList] = useState<ShTData[]>([]);
    const [shRCList, setShRCList] = useState<ShRCData[]>([]);
    const [shCList, setShCList] = useState<ShCData[]>([]);
    const [shCCList, setShCCList] = useState<ShCCData[]>([]);

    useEffect(() => {
        if (orderId) {
            loadData();
        }
    }, [orderId]);

    const loadData = async () => {
        try {
            setLoading(true);

            // SH_M 데이터 로드
            const { data: shM, error: shMError } = await supabase
                .from('sh_m')
                .select('*')
                .eq('order_id', orderId)
                .single();

            if (shMError) throw shMError;
            setShMData(shM);

            // 모든 서비스 데이터 병렬 로드
            const [shRRes, shPRes, shHRes, shTRes, shRCRes, shCRes, shCCRes] = await Promise.all([
                supabase.from('sh_r').select('*').eq('order_id', orderId).order('id', { ascending: true }),
                supabase.from('sh_p').select('*').eq('order_id', orderId).order('id', { ascending: true }),
                supabase.from('sh_h').select('*').eq('order_id', orderId).order('id', { ascending: true }),
                supabase.from('sh_t').select('*').eq('order_id', orderId).order('id', { ascending: true }),
                supabase.from('sh_rc').select('*').eq('order_id', orderId).order('id', { ascending: true }),
                supabase.from('sh_c').select('*').eq('order_id', orderId).order('id', { ascending: true }),
                supabase.from('sh_cc').select('*').eq('order_id', orderId).order('id', { ascending: true }),
            ]);

            setShRList(shRRes.data || []);
            setShPList(shPRes.data || []);
            setShHList(shHRes.data || []);
            setShTList(shTRes.data || []);
            setShRCList(shRCRes.data || []);
            setShCList(shCRes.data || []);
            setShCCList(shCCRes.data || []);

        } catch (error) {
            console.error('데이터 로드 실패:', error);
            alert('데이터를 불러오는데 실패했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!shMData) {
            alert('저장할 데이터가 없습니다.');
            return;
        }

        try {
            setSaving(true);

            // SH_M 업데이트
            const { error: shMError } = await supabase
                .from('sh_m')
                .update({
                    korean_name: shMData.korean_name,
                    english_name: shMData.english_name,
                    phone: shMData.phone,
                    email: shMData.email,
                    plan: shMData.plan,
                    payment_method: shMData.payment_method,
                    request_note: shMData.request_note,
                    special_note: shMData.special_note,
                    memo: shMData.memo,
                    kakao_id: shMData.kakao_id,
                    discount_code: shMData.discount_code,
                })
                .eq('id', shMData.id);

            if (shMError) throw shMError;

            // SH_R (크루즈) 업데이트
            for (const shR of shRList) {
                const { error } = await supabase
                    .from('sh_r')
                    .update({
                        cruise_name: shR.cruise_name,
                        division: shR.division,
                        room_type: shR.room_type,
                        checkin_date: shR.checkin_date,
                        time: shR.time,
                        adult: shR.adult,
                        child: shR.child,
                        toddler: shR.toddler,
                        amount: shR.amount,
                        total: shR.total,
                        room_note: shR.room_note,
                    })
                    .eq('id', shR.id);
                if (error) throw error;
            }

            // SH_P (공항) 업데이트
            for (const shP of shPList) {
                const { error } = await supabase
                    .from('sh_p')
                    .update({
                        category: shP.category,
                        route: shP.route,
                        vehicle_type: shP.vehicle_type,
                        date: shP.date,
                        time: shP.time,
                        airport_name: shP.airport_name,
                        flight_number: shP.flight_number,
                        passenger_count: shP.passenger_count,
                        location_name: shP.location_name,
                        amount: shP.amount,
                        total: shP.total,
                    })
                    .eq('id', shP.id);
                if (error) throw error;
            }

            // SH_H (호텔) 업데이트
            for (const shH of shHList) {
                const { error } = await supabase
                    .from('sh_h')
                    .update({
                        hotel_name: shH.hotel_name,
                        room_name: shH.room_name,
                        room_type: shH.room_type,
                        checkin_date: shH.checkin_date,
                        checkout_date: shH.checkout_date,
                        adult: shH.adult,
                        child: shH.child,
                        toddler: shH.toddler,
                        amount: shH.amount,
                        total: shH.total,
                    })
                    .eq('id', shH.id);
                if (error) throw error;
            }

            // SH_T (투어) 업데이트
            for (const shT of shTList) {
                const { error } = await supabase
                    .from('sh_t')
                    .update({
                        tour_name: shT.tour_name,
                        tour_type: shT.tour_type,
                        start_date: shT.start_date,
                        end_date: shT.end_date,
                        pickup_location: shT.pickup_location,
                        amount: shT.amount,
                        total: shT.total,
                        memo: shT.memo,
                    })
                    .eq('id', shT.id);
                if (error) throw error;
            }

            // SH_RC (렌트카) 업데이트
            for (const shRC of shRCList) {
                const { error } = await supabase
                    .from('sh_rc')
                    .update({
                        category: shRC.category,
                        route: shRC.route,
                        vehicle_type: shRC.vehicle_type,
                        boarding_date: shRC.boarding_date,
                        boarding_time: shRC.boarding_time,
                        boarding_location: shRC.boarding_location,
                        destination: shRC.destination,
                        passenger_count: shRC.passenger_count,
                        usage_period: shRC.usage_period,
                        amount: shRC.amount,
                        total: shRC.total,
                        memo: shRC.memo,
                    })
                    .eq('id', shRC.id);
                if (error) throw error;
            }

            // SH_C 업데이트
            for (const shC of shCList) {
                const { error } = await supabase
                    .from('sh_c')
                    .update({
                        division: shC.division,
                        category: shC.category,
                        cruise_name: shC.cruise_name,
                        vehicle_type: shC.vehicle_type,
                        vehicle_count: shC.vehicle_count,
                        passenger_count: shC.passenger_count,
                        boarding_datetime: shC.boarding_datetime,
                        boarding_location: shC.boarding_location,
                        dropoff_location: shC.dropoff_location,
                        amount: shC.amount,
                        total: shC.total,
                    })
                    .eq('id', shC.id);

                if (error) throw error;
            }

            // SH_CC 업데이트
            for (const shCC of shCCList) {
                const { error } = await supabase
                    .from('sh_cc')
                    .update({
                        boarding_date: shCC.boarding_date,
                        division: shCC.division,
                        category: shCC.category,
                        vehicle_number: shCC.vehicle_number,
                        seat_number: shCC.seat_number,
                        name: shCC.name,
                    })
                    .eq('id', shCC.id);

                if (error) throw error;
            }

            alert('저장되었습니다.');
            router.back();

        } catch (error) {
            console.error('저장 실패:', error);
            alert('저장에 실패했습니다.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <ManagerLayout title="시트 예약 수정" activeTab="schedule">
                <div className="flex items-center justify-center h-64">
                    <Loader2 className="w-12 h-12 animate-spin text-blue-500" />
                    <p className="ml-4 text-gray-600">데이터를 불러오는 중...</p>
                </div>
            </ManagerLayout>
        );
    }

    if (!shMData) {
        return (
            <ManagerLayout title="시트 예약 수정" activeTab="schedule">
                <div className="text-center py-12">
                    <p className="text-gray-600">해당 주문을 찾을 수 없습니다.</p>
                    <button
                        onClick={() => router.back()}
                        className="mt-4 px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
                    >
                        돌아가기
                    </button>
                </div>
            </ManagerLayout>
        );
    }

    return (
        <ManagerLayout title={`시트 예약 수정 - ${orderId}`} activeTab="schedule">
            <div className="max-w-7xl mx-auto">
                {/* 헤더 액션 버튼 */}
                <div className="flex justify-between items-center mb-6">
                    <button
                        onClick={() => router.back()}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        돌아가기
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors disabled:bg-gray-400"
                    >
                        {saving ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                저장 중...
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4" />
                                저장
                            </>
                        )}
                    </button>
                </div>

                {/* SH_M 고객 정보 섹션 */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
                    <div className="flex items-center gap-2 mb-4 pb-4 border-b">
                        <User className="w-6 h-6 text-blue-600" />
                        <h2 className="text-xl font-bold text-gray-800">고객 정보 (SH_M)</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-semibold text-gray-600 mb-1">한글 이름</label>
                            <input
                                type="text"
                                value={shMData.korean_name || ''}
                                onChange={(e) => setShMData({ ...shMData, korean_name: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-600 mb-1">영문 이름</label>
                            <input
                                type="text"
                                value={shMData.english_name || ''}
                                onChange={(e) => setShMData({ ...shMData, english_name: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-600 mb-1">전화번호</label>
                            <input
                                type="text"
                                value={shMData.phone || ''}
                                onChange={(e) => setShMData({ ...shMData, phone: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-600 mb-1">이메일</label>
                            <input
                                type="email"
                                value={shMData.email || ''}
                                onChange={(e) => setShMData({ ...shMData, email: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-600 mb-1">카카오ID</label>
                            <input
                                type="text"
                                value={shMData.kakao_id || ''}
                                onChange={(e) => setShMData({ ...shMData, kakao_id: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-600 mb-1">요금제</label>
                            <input
                                type="text"
                                value={shMData.plan || ''}
                                onChange={(e) => setShMData({ ...shMData, plan: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-600 mb-1">결제 방식</label>
                            <input
                                type="text"
                                value={shMData.payment_method || ''}
                                onChange={(e) => setShMData({ ...shMData, payment_method: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-600 mb-1">할인 코드</label>
                            <input
                                type="text"
                                value={shMData.discount_code || ''}
                                onChange={(e) => setShMData({ ...shMData, discount_code: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-semibold text-gray-600 mb-1">요청사항</label>
                            <textarea
                                value={shMData.request_note || ''}
                                onChange={(e) => setShMData({ ...shMData, request_note: e.target.value })}
                                rows={3}
                                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-semibold text-gray-600 mb-1">특이사항</label>
                            <textarea
                                value={shMData.special_note || ''}
                                onChange={(e) => setShMData({ ...shMData, special_note: e.target.value })}
                                rows={2}
                                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-semibold text-gray-600 mb-1">메모</label>
                            <textarea
                                value={shMData.memo || ''}
                                onChange={(e) => setShMData({ ...shMData, memo: e.target.value })}
                                rows={2}
                                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    </div>
                </div>

                {/* SH_R 크루즈 객실 섹션 */}
                {shRList.length > 0 && (
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
                        <div className="flex items-center gap-2 mb-4 pb-4 border-b">
                            <Ship className="w-6 h-6 text-blue-600" />
                            <h2 className="text-xl font-bold text-gray-800">크루즈 객실 (SH_R) - {shRList.length}건</h2>
                        </div>
                        <div className="space-y-6">
                            {shRList.map((shR, index) => (
                                <div key={shR.id} className="border border-blue-200 rounded-lg p-4 bg-blue-50">
                                    <h3 className="font-bold text-blue-800 mb-3">객실 #{index + 1}</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">크루즈명</label>
                                            <input
                                                type="text"
                                                value={shR.cruise_name || ''}
                                                onChange={(e) => {
                                                    const updated = [...shRList];
                                                    updated[index].cruise_name = e.target.value;
                                                    setShRList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">객실 타입</label>
                                            <input
                                                type="text"
                                                value={shR.room_type || ''}
                                                onChange={(e) => {
                                                    const updated = [...shRList];
                                                    updated[index].room_type = e.target.value;
                                                    setShRList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">체크인 날짜</label>
                                            <input
                                                type="text"
                                                value={shR.checkin_date || ''}
                                                onChange={(e) => {
                                                    const updated = [...shRList];
                                                    updated[index].checkin_date = e.target.value;
                                                    setShRList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">시간</label>
                                            <input
                                                type="text"
                                                value={shR.time || ''}
                                                onChange={(e) => {
                                                    const updated = [...shRList];
                                                    updated[index].time = e.target.value;
                                                    setShRList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">성인</label>
                                            <input
                                                type="text"
                                                value={shR.adult || ''}
                                                onChange={(e) => {
                                                    const updated = [...shRList];
                                                    updated[index].adult = e.target.value;
                                                    setShRList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">아동</label>
                                            <input
                                                type="text"
                                                value={shR.child || ''}
                                                onChange={(e) => {
                                                    const updated = [...shRList];
                                                    updated[index].child = e.target.value;
                                                    setShRList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">유아</label>
                                            <input
                                                type="text"
                                                value={shR.toddler || ''}
                                                onChange={(e) => {
                                                    const updated = [...shRList];
                                                    updated[index].toddler = e.target.value;
                                                    setShRList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">금액</label>
                                            <input
                                                type="text"
                                                value={shR.amount || ''}
                                                onChange={(e) => {
                                                    const updated = [...shRList];
                                                    updated[index].amount = e.target.value;
                                                    setShRList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">총액</label>
                                            <input
                                                type="text"
                                                value={shR.total || ''}
                                                onChange={(e) => {
                                                    const updated = [...shRList];
                                                    updated[index].total = e.target.value;
                                                    setShRList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div className="md:col-span-3">
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">객실 메모</label>
                                            <textarea
                                                value={shR.room_note || ''}
                                                onChange={(e) => {
                                                    const updated = [...shRList];
                                                    updated[index].room_note = e.target.value;
                                                    setShRList(updated);
                                                }}
                                                rows={2}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* SH_P 공항 서비스 섹션 */}
                {shPList.length > 0 && (
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
                        <div className="flex items-center gap-2 mb-4 pb-4 border-b">
                            <Plane className="w-6 h-6 text-green-600" />
                            <h2 className="text-xl font-bold text-gray-800">공항 서비스 (SH_P) - {shPList.length}건</h2>
                        </div>
                        <div className="space-y-6">
                            {shPList.map((shP, index) => (
                                <div key={shP.id} className="border border-green-200 rounded-lg p-4 bg-green-50">
                                    <h3 className="font-bold text-green-800 mb-3">공항 #{index + 1}</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">카테고리</label>
                                            <input
                                                type="text"
                                                value={shP.category || ''}
                                                onChange={(e) => {
                                                    const updated = [...shPList];
                                                    updated[index].category = e.target.value;
                                                    setShPList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">경로</label>
                                            <input
                                                type="text"
                                                value={shP.route || ''}
                                                onChange={(e) => {
                                                    const updated = [...shPList];
                                                    updated[index].route = e.target.value;
                                                    setShPList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">차량 타입</label>
                                            <input
                                                type="text"
                                                value={shP.vehicle_type || ''}
                                                onChange={(e) => {
                                                    const updated = [...shPList];
                                                    updated[index].vehicle_type = e.target.value;
                                                    setShPList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">날짜</label>
                                            <input
                                                type="text"
                                                value={shP.date || ''}
                                                onChange={(e) => {
                                                    const updated = [...shPList];
                                                    updated[index].date = e.target.value;
                                                    setShPList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">시간</label>
                                            <input
                                                type="text"
                                                value={shP.time || ''}
                                                onChange={(e) => {
                                                    const updated = [...shPList];
                                                    updated[index].time = e.target.value;
                                                    setShPList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">공항명</label>
                                            <input
                                                type="text"
                                                value={shP.airport_name || ''}
                                                onChange={(e) => {
                                                    const updated = [...shPList];
                                                    updated[index].airport_name = e.target.value;
                                                    setShPList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">항공편</label>
                                            <input
                                                type="text"
                                                value={shP.flight_number || ''}
                                                onChange={(e) => {
                                                    const updated = [...shPList];
                                                    updated[index].flight_number = e.target.value;
                                                    setShPList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">인원 수</label>
                                            <input
                                                type="text"
                                                value={shP.passenger_count || ''}
                                                onChange={(e) => {
                                                    const updated = [...shPList];
                                                    updated[index].passenger_count = e.target.value;
                                                    setShPList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">위치명</label>
                                            <input
                                                type="text"
                                                value={shP.location_name || ''}
                                                onChange={(e) => {
                                                    const updated = [...shPList];
                                                    updated[index].location_name = e.target.value;
                                                    setShPList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">금액</label>
                                            <input
                                                type="text"
                                                value={shP.amount || ''}
                                                onChange={(e) => {
                                                    const updated = [...shPList];
                                                    updated[index].amount = e.target.value;
                                                    setShPList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">총액</label>
                                            <input
                                                type="text"
                                                value={shP.total || ''}
                                                onChange={(e) => {
                                                    const updated = [...shPList];
                                                    updated[index].total = e.target.value;
                                                    setShPList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* SH_H 호텔 섹션 */}
                {shHList.length > 0 && (
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
                        <div className="flex items-center gap-2 mb-4 pb-4 border-b">
                            <Building className="w-6 h-6 text-orange-600" />
                            <h2 className="text-xl font-bold text-gray-800">호텔 (SH_H) - {shHList.length}건</h2>
                        </div>
                        <div className="space-y-6">
                            {shHList.map((shH, index) => (
                                <div key={shH.id} className="border border-orange-200 rounded-lg p-4 bg-orange-50">
                                    <h3 className="font-bold text-orange-800 mb-3">호텔 #{index + 1}</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">호텔명</label>
                                            <input
                                                type="text"
                                                value={shH.hotel_name || ''}
                                                onChange={(e) => {
                                                    const updated = [...shHList];
                                                    updated[index].hotel_name = e.target.value;
                                                    setShHList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">객실명</label>
                                            <input
                                                type="text"
                                                value={shH.room_name || ''}
                                                onChange={(e) => {
                                                    const updated = [...shHList];
                                                    updated[index].room_name = e.target.value;
                                                    setShHList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">객실 타입</label>
                                            <input
                                                type="text"
                                                value={shH.room_type || ''}
                                                onChange={(e) => {
                                                    const updated = [...shHList];
                                                    updated[index].room_type = e.target.value;
                                                    setShHList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">체크인</label>
                                            <input
                                                type="text"
                                                value={shH.checkin_date || ''}
                                                onChange={(e) => {
                                                    const updated = [...shHList];
                                                    updated[index].checkin_date = e.target.value;
                                                    setShHList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">체크아웃</label>
                                            <input
                                                type="text"
                                                value={shH.checkout_date || ''}
                                                onChange={(e) => {
                                                    const updated = [...shHList];
                                                    updated[index].checkout_date = e.target.value;
                                                    setShHList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">성인</label>
                                            <input
                                                type="text"
                                                value={shH.adult || ''}
                                                onChange={(e) => {
                                                    const updated = [...shHList];
                                                    updated[index].adult = e.target.value;
                                                    setShHList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">아동</label>
                                            <input
                                                type="text"
                                                value={shH.child || ''}
                                                onChange={(e) => {
                                                    const updated = [...shHList];
                                                    updated[index].child = e.target.value;
                                                    setShHList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">유아</label>
                                            <input
                                                type="text"
                                                value={shH.toddler || ''}
                                                onChange={(e) => {
                                                    const updated = [...shHList];
                                                    updated[index].toddler = e.target.value;
                                                    setShHList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">금액</label>
                                            <input
                                                type="text"
                                                value={shH.amount || ''}
                                                onChange={(e) => {
                                                    const updated = [...shHList];
                                                    updated[index].amount = e.target.value;
                                                    setShHList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">총액</label>
                                            <input
                                                type="text"
                                                value={shH.total || ''}
                                                onChange={(e) => {
                                                    const updated = [...shHList];
                                                    updated[index].total = e.target.value;
                                                    setShHList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* SH_T 투어 섹션 */}
                {shTList.length > 0 && (
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
                        <div className="flex items-center gap-2 mb-4 pb-4 border-b">
                            <MapPin className="w-6 h-6 text-pink-600" />
                            <h2 className="text-xl font-bold text-gray-800">투어 (SH_T) - {shTList.length}건</h2>
                        </div>
                        <div className="space-y-6">
                            {shTList.map((shT, index) => (
                                <div key={shT.id} className="border border-pink-200 rounded-lg p-4 bg-pink-50">
                                    <h3 className="font-bold text-pink-800 mb-3">투어 #{index + 1}</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">투어명</label>
                                            <input
                                                type="text"
                                                value={shT.tour_name || ''}
                                                onChange={(e) => {
                                                    const updated = [...shTList];
                                                    updated[index].tour_name = e.target.value;
                                                    setShTList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">투어 타입</label>
                                            <input
                                                type="text"
                                                value={shT.tour_type || ''}
                                                onChange={(e) => {
                                                    const updated = [...shTList];
                                                    updated[index].tour_type = e.target.value;
                                                    setShTList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">시작일</label>
                                            <input
                                                type="text"
                                                value={shT.start_date || ''}
                                                onChange={(e) => {
                                                    const updated = [...shTList];
                                                    updated[index].start_date = e.target.value;
                                                    setShTList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">종료일</label>
                                            <input
                                                type="text"
                                                value={shT.end_date || ''}
                                                onChange={(e) => {
                                                    const updated = [...shTList];
                                                    updated[index].end_date = e.target.value;
                                                    setShTList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">픽업 위치</label>
                                            <input
                                                type="text"
                                                value={shT.pickup_location || ''}
                                                onChange={(e) => {
                                                    const updated = [...shTList];
                                                    updated[index].pickup_location = e.target.value;
                                                    setShTList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">금액</label>
                                            <input
                                                type="text"
                                                value={shT.amount || ''}
                                                onChange={(e) => {
                                                    const updated = [...shTList];
                                                    updated[index].amount = e.target.value;
                                                    setShTList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">총액</label>
                                            <input
                                                type="text"
                                                value={shT.total || ''}
                                                onChange={(e) => {
                                                    const updated = [...shTList];
                                                    updated[index].total = e.target.value;
                                                    setShTList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div className="md:col-span-3">
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">메모</label>
                                            <textarea
                                                value={shT.memo || ''}
                                                onChange={(e) => {
                                                    const updated = [...shTList];
                                                    updated[index].memo = e.target.value;
                                                    setShTList(updated);
                                                }}
                                                rows={2}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* SH_RC 렌트카 섹션 */}
                {shRCList.length > 0 && (
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
                        <div className="flex items-center gap-2 mb-4 pb-4 border-b">
                            <Car className="w-6 h-6 text-indigo-600" />
                            <h2 className="text-xl font-bold text-gray-800">렌트카 (SH_RC) - {shRCList.length}건</h2>
                        </div>
                        <div className="space-y-6">
                            {shRCList.map((shRC, index) => (
                                <div key={shRC.id} className="border border-indigo-200 rounded-lg p-4 bg-indigo-50">
                                    <h3 className="font-bold text-indigo-800 mb-3">렌트카 #{index + 1}</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">카테고리</label>
                                            <input
                                                type="text"
                                                value={shRC.category || ''}
                                                onChange={(e) => {
                                                    const updated = [...shRCList];
                                                    updated[index].category = e.target.value;
                                                    setShRCList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">경로</label>
                                            <input
                                                type="text"
                                                value={shRC.route || ''}
                                                onChange={(e) => {
                                                    const updated = [...shRCList];
                                                    updated[index].route = e.target.value;
                                                    setShRCList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">차량 타입</label>
                                            <input
                                                type="text"
                                                value={shRC.vehicle_type || ''}
                                                onChange={(e) => {
                                                    const updated = [...shRCList];
                                                    updated[index].vehicle_type = e.target.value;
                                                    setShRCList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">승차일</label>
                                            <input
                                                type="text"
                                                value={shRC.boarding_date || ''}
                                                onChange={(e) => {
                                                    const updated = [...shRCList];
                                                    updated[index].boarding_date = e.target.value;
                                                    setShRCList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">승차 시간</label>
                                            <input
                                                type="text"
                                                value={shRC.boarding_time || ''}
                                                onChange={(e) => {
                                                    const updated = [...shRCList];
                                                    updated[index].boarding_time = e.target.value;
                                                    setShRCList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">승차 위치</label>
                                            <input
                                                type="text"
                                                value={shRC.boarding_location || ''}
                                                onChange={(e) => {
                                                    const updated = [...shRCList];
                                                    updated[index].boarding_location = e.target.value;
                                                    setShRCList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">목적지</label>
                                            <input
                                                type="text"
                                                value={shRC.destination || ''}
                                                onChange={(e) => {
                                                    const updated = [...shRCList];
                                                    updated[index].destination = e.target.value;
                                                    setShRCList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">인원 수</label>
                                            <input
                                                type="text"
                                                value={shRC.passenger_count || ''}
                                                onChange={(e) => {
                                                    const updated = [...shRCList];
                                                    updated[index].passenger_count = e.target.value;
                                                    setShRCList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">사용 기간</label>
                                            <input
                                                type="text"
                                                value={shRC.usage_period || ''}
                                                onChange={(e) => {
                                                    const updated = [...shRCList];
                                                    updated[index].usage_period = e.target.value;
                                                    setShRCList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">금액</label>
                                            <input
                                                type="text"
                                                value={shRC.amount || ''}
                                                onChange={(e) => {
                                                    const updated = [...shRCList];
                                                    updated[index].amount = e.target.value;
                                                    setShRCList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">총액</label>
                                            <input
                                                type="text"
                                                value={shRC.total || ''}
                                                onChange={(e) => {
                                                    const updated = [...shRCList];
                                                    updated[index].total = e.target.value;
                                                    setShRCList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div className="md:col-span-3">
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">메모</label>
                                            <textarea
                                                value={shRC.memo || ''}
                                                onChange={(e) => {
                                                    const updated = [...shRCList];
                                                    updated[index].memo = e.target.value;
                                                    setShRCList(updated);
                                                }}
                                                rows={2}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* SH_C 차량 서비스 섹션 */}
                {shCList.length > 0 && (
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
                        <div className="flex items-center gap-2 mb-4 pb-4 border-b">
                            <Car className="w-6 h-6 text-purple-600" />
                            <h2 className="text-xl font-bold text-gray-800">차량 서비스 (SH_C) - {shCList.length}건</h2>
                        </div>
                        <div className="space-y-6">
                            {shCList.map((shC, index) => (
                                <div key={shC.id} className="border border-purple-200 rounded-lg p-4 bg-purple-50">
                                    <h3 className="font-bold text-purple-800 mb-3">차량 #{index + 1}</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">구분</label>
                                            <input
                                                type="text"
                                                value={shC.division || ''}
                                                onChange={(e) => {
                                                    const updated = [...shCList];
                                                    updated[index].division = e.target.value;
                                                    setShCList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">카테고리</label>
                                            <input
                                                type="text"
                                                value={shC.category || ''}
                                                onChange={(e) => {
                                                    const updated = [...shCList];
                                                    updated[index].category = e.target.value;
                                                    setShCList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">크루즈명</label>
                                            <input
                                                type="text"
                                                value={shC.cruise_name || ''}
                                                onChange={(e) => {
                                                    const updated = [...shCList];
                                                    updated[index].cruise_name = e.target.value;
                                                    setShCList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">차량 타입</label>
                                            <input
                                                type="text"
                                                value={shC.vehicle_type || ''}
                                                onChange={(e) => {
                                                    const updated = [...shCList];
                                                    updated[index].vehicle_type = e.target.value;
                                                    setShCList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">차량 수</label>
                                            <input
                                                type="text"
                                                value={shC.vehicle_count || ''}
                                                onChange={(e) => {
                                                    const updated = [...shCList];
                                                    updated[index].vehicle_count = e.target.value;
                                                    setShCList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">인원 수</label>
                                            <input
                                                type="text"
                                                value={shC.passenger_count || ''}
                                                onChange={(e) => {
                                                    const updated = [...shCList];
                                                    updated[index].passenger_count = e.target.value;
                                                    setShCList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">승차 일시</label>
                                            <input
                                                type="text"
                                                value={shC.boarding_datetime || ''}
                                                onChange={(e) => {
                                                    const updated = [...shCList];
                                                    updated[index].boarding_datetime = e.target.value;
                                                    setShCList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">승차 위치</label>
                                            <input
                                                type="text"
                                                value={shC.boarding_location || ''}
                                                onChange={(e) => {
                                                    const updated = [...shCList];
                                                    updated[index].boarding_location = e.target.value;
                                                    setShCList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">하차 위치</label>
                                            <input
                                                type="text"
                                                value={shC.dropoff_location || ''}
                                                onChange={(e) => {
                                                    const updated = [...shCList];
                                                    updated[index].dropoff_location = e.target.value;
                                                    setShCList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">금액</label>
                                            <input
                                                type="text"
                                                value={shC.amount || ''}
                                                onChange={(e) => {
                                                    const updated = [...shCList];
                                                    updated[index].amount = e.target.value;
                                                    setShCList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">총액</label>
                                            <input
                                                type="text"
                                                value={shC.total || ''}
                                                onChange={(e) => {
                                                    const updated = [...shCList];
                                                    updated[index].total = e.target.value;
                                                    setShCList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* SH_CC 차량 배정 섹션 */}
                {shCCList.length > 0 && (
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
                        <div className="flex items-center gap-2 mb-4 pb-4 border-b">
                            <Users className="w-6 h-6 text-teal-600" />
                            <h2 className="text-xl font-bold text-gray-800">차량 배정 (SH_CC) - {shCCList.length}건</h2>
                        </div>
                        <div className="space-y-4">
                            {shCCList.map((shCC, index) => (
                                <div key={shCC.id} className="border border-teal-200 rounded-lg p-4 bg-teal-50">
                                    <h3 className="font-bold text-teal-800 mb-3">배정 #{index + 1}</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">승차일</label>
                                            <input
                                                type="text"
                                                value={shCC.boarding_date || ''}
                                                onChange={(e) => {
                                                    const updated = [...shCCList];
                                                    updated[index].boarding_date = e.target.value;
                                                    setShCCList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">구분</label>
                                            <input
                                                type="text"
                                                value={shCC.division || ''}
                                                onChange={(e) => {
                                                    const updated = [...shCCList];
                                                    updated[index].division = e.target.value;
                                                    setShCCList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">카테고리</label>
                                            <input
                                                type="text"
                                                value={shCC.category || ''}
                                                onChange={(e) => {
                                                    const updated = [...shCCList];
                                                    updated[index].category = e.target.value;
                                                    setShCCList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">차량번호</label>
                                            <input
                                                type="text"
                                                value={shCC.vehicle_number || ''}
                                                onChange={(e) => {
                                                    const updated = [...shCCList];
                                                    updated[index].vehicle_number = e.target.value;
                                                    setShCCList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">좌석번호</label>
                                            <input
                                                type="text"
                                                value={shCC.seat_number || ''}
                                                onChange={(e) => {
                                                    const updated = [...shCCList];
                                                    updated[index].seat_number = e.target.value;
                                                    setShCCList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-600 mb-1">이름</label>
                                            <input
                                                type="text"
                                                value={shCC.name || ''}
                                                onChange={(e) => {
                                                    const updated = [...shCCList];
                                                    updated[index].name = e.target.value;
                                                    setShCCList(updated);
                                                }}
                                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* 하단 저장 버튼 */}
                <div className="flex justify-end mt-6">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 px-8 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:bg-gray-400 text-lg font-semibold"
                    >
                        {saving ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                저장 중...
                            </>
                        ) : (
                            <>
                                <Save className="w-5 h-5" />
                                저장
                            </>
                        )}
                    </button>
                </div>
            </div>
        </ManagerLayout>
    );
}
