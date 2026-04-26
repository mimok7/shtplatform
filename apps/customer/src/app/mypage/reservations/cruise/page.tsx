'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '@/lib/supabase';
import { getFastAuthUser, getFastAuthUserWithMemberRole } from '@/lib/reservationAuth';
import { isLocationFieldKey, normalizeLocationEnglishUpper } from '@/lib/locationInput';
import PageWrapper from '@/components/PageWrapper';
import SectionBox from '@/components/SectionBox';
import ShtCarSeatMap from '@/components/ShtCarSeatMap';

function CruiseReservationContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const quoteId = searchParams.get('quoteId');
    const reservationId = searchParams.get('reservationId');
    const mode = searchParams.get('mode');

    // 폼 상태 - reservation_cruise 테이블 컬럼 기반 (요청사항 분리)
    const [form, setForm] = useState({
        room_price_code: '',
        checkin: '',
        guest_count: 0,
        unit_price: 0,
        car_price_code: '',
        car_count: 0,
        passenger_count: 0,
        pickup_datetime: '',
        pickup_location: '',
        dropoff_location: '',
        room_total_price: 0,
        car_total_price: 0,
        room_request_note: '', // 객실 요청사항
        car_request_note: ''   // 차량 요청사항
    });

    // 옵션 데이터
    const [roomPriceInfo, setRoomPriceInfo] = useState<any[]>([]);
    const [carPriceInfo, setCarPriceInfo] = useState<any>(null);
    const [roomsData, setRoomsData] = useState<any[]>([]);

    // 로딩 상태
    const [loading, setLoading] = useState(false);
    const [quote, setQuote] = useState<any>(null);
    const [existingReservation, setExistingReservation] = useState<any>(null);
    const [isEditMode, setIsEditMode] = useState(false);

    // SHT 차량 좌석도 모달 상태
    const [isShtCarModalOpen, setIsShtCarModalOpen] = useState(false);

    useEffect(() => {
        if (!quoteId) {
            alert('견적 ID가 필요합니다.');
            router.push('/mypage/reservations');
            return;
        }
        loadQuote();
        loadQuoteLinkedData();

        // 수정 모드인 경우 특정 예약 데이터 로드
        if (mode === 'edit' && reservationId) {
            loadExistingReservation(reservationId);
        } else {
            checkExistingReservation();
        }
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

    // 특정 예약 ID로 데이터 로드 (수정 모드용)
    const loadExistingReservation = async (reservationId: string) => {
        try {
            const { user } = await getFastAuthUser();
            if (!user) return;

            const { data: existingRes } = await supabase
                .from('reservation')
                .select(`
                    *,
                    reservation_cruise (*),
                    reservation_cruise_car (*)
                `)
                .eq('re_id', reservationId)
                .eq('re_user_id', user.id)
                .single();

            if (existingRes) {
                setExistingReservation(existingRes);
                setIsEditMode(true);

                // 크루즈 객실 데이터로 폼 초기화
                if (existingRes.reservation_cruise && existingRes.reservation_cruise.length > 0) {
                    const cruiseRows = existingRes.reservation_cruise;

                    // 객실 총 가격 계산 (모든 행의 room_total_price 합산)
                    const totalRoomPrice = cruiseRows.reduce((sum: number, row: any) => sum + (row.room_total_price || 0), 0);

                    // 총 투숙객 수 계산 (모든 행의 guest_count 합산)
                    const totalGuestCount = cruiseRows
                        .filter((row: any) => row.room_price_code)
                        .reduce((sum: number, row: any) => sum + (row.guest_count || 0), 0);

                    setForm(prev => ({
                        ...prev,
                        room_price_code: cruiseRows[0]?.room_price_code || '',
                        checkin: cruiseRows[0]?.checkin || '',
                        guest_count: totalGuestCount,
                        unit_price: cruiseRows[0]?.unit_price || 0,
                        room_total_price: totalRoomPrice,
                        room_request_note: cruiseRows[0]?.request_note || ''
                    }));
                }

                // 별도 차량 데이터로 폼 초기화
                if (existingRes.reservation_cruise_car && existingRes.reservation_cruise_car.length > 0) {
                    const carData = existingRes.reservation_cruise_car[0]; // 차량은 보통 단일 행

                    setForm(prev => ({
                        ...prev,
                        car_price_code: carData.car_price_code || '',
                        car_count: carData.car_count || 0,
                        passenger_count: carData.passenger_count || 0,
                        pickup_datetime: carData.pickup_datetime || '',
                        pickup_location: carData.pickup_location || '',
                        dropoff_location: carData.dropoff_location || '',
                        car_total_price: carData.car_total_price || 0,
                        car_request_note: carData.request_note || ''
                    }));
                }
            } else {
                alert('해당 예약을 찾을 수 없습니다.');
                router.push('/mypage/reservations');
            }
        } catch (error) {
            console.error('예약 데이터 로드 오류:', error);
            alert('예약 데이터를 불러오는 중 오류가 발생했습니다.');
        }
    };

    // 기존 예약 확인 (중복 방지) - 차량 분리 구조 지원
    const checkExistingReservation = async () => {
        try {
            const { user } = await getFastAuthUser();
            if (!user) return;

            const { data: existingRes } = await supabase
                .from('reservation')
                .select(`
                    *,
                    reservation_cruise (*),
                    reservation_cruise_car (*)
                `)
                .eq('re_user_id', user.id)
                .eq('re_quote_id', quoteId)
                .eq('re_type', 'cruise')
                .maybeSingle();

            if (existingRes) {
                setExistingReservation(existingRes);
                setIsEditMode(true);

                // 크루즈 객실 데이터로 폼 초기화
                if (existingRes.reservation_cruise && existingRes.reservation_cruise.length > 0) {
                    const cruiseRows = existingRes.reservation_cruise;

                    // 객실 총 가격 계산 (모든 행의 room_total_price 합산)
                    const totalRoomPrice = cruiseRows.reduce((sum: number, row: any) => sum + (row.room_total_price || 0), 0);

                    // 총 투숙객 수 계산 (모든 행의 guest_count 합산)
                    const totalGuestCount = cruiseRows
                        .filter((row: any) => row.room_price_code)
                        .reduce((sum: number, row: any) => sum + (row.guest_count || 0), 0);

                    setForm(prev => ({
                        ...prev,
                        room_price_code: cruiseRows[0]?.room_price_code || '',
                        checkin: cruiseRows[0]?.checkin || '',
                        guest_count: totalGuestCount,
                        unit_price: cruiseRows[0]?.unit_price || 0,
                        room_total_price: totalRoomPrice,
                        room_request_note: cruiseRows[0]?.request_note || ''
                    }));
                }

                // 별도 차량 데이터로 폼 초기화
                if (existingRes.reservation_cruise_car && existingRes.reservation_cruise_car.length > 0) {
                    const carData = existingRes.reservation_cruise_car[0]; // 차량은 보통 단일 행

                    setForm(prev => ({
                        ...prev,
                        car_price_code: carData.car_price_code || '',
                        car_count: carData.car_count || 0,
                        passenger_count: carData.passenger_count || 0,
                        pickup_datetime: carData.pickup_datetime || '',
                        pickup_location: carData.pickup_location || '',
                        dropoff_location: carData.dropoff_location || '',
                        car_total_price: carData.car_total_price || 0,
                        car_request_note: carData.request_note || ''
                    }));
                }
            }
        } catch (error) {
            console.error('기존 예약 확인 오류:', error);
        }
    };

    // 견적에 연결된 룸/차량 데이터 로드
    const loadQuoteLinkedData = async () => {
        try {
            // 견적에 연결된 quote_item들 조회 (usage_date 포함)
            const { data: quoteItems } = await supabase
                .from('quote_item')
                .select('service_type, service_ref_id, quantity, unit_price, total_price, usage_date')
                .eq('quote_id', quoteId);

            if (quoteItems) {
                // 룸 정보 로드 (모든 객실 처리)
                const roomItems = quoteItems.filter(item => item.service_type === 'room');
                if (roomItems.length > 0) {
                    await loadAllRoomInfo(roomItems);

                    // 첫 번째 룸 아이템에서 체크인 날짜 설정
                    const firstRoomUsageDate = roomItems[0]?.usage_date;
                    if (firstRoomUsageDate) {
                        setForm(prev => ({
                            ...prev,
                            checkin: firstRoomUsageDate
                        }));
                    }
                }

                // 차량 정보 로드
                const carItems = quoteItems.filter(item => item.service_type === 'car');
                if (carItems.length > 0) {
                    await loadCarInfo(carItems[0].service_ref_id, carItems[0]);
                }
            }
        } catch (error) {
            console.error('견적 연결 데이터 로드 오류:', error);
        }
    };

    // 모든 룸 정보 로드 및 중복 제거 (N+1 → 2 batched queries)
    const loadAllRoomInfo = async (roomItems: any[]) => {
        try {
            // 1) 모든 room id를 한 번에 조회
            const roomIds = Array.from(new Set(roomItems.map((r: any) => r.service_ref_id).filter(Boolean)));
            if (roomIds.length === 0) {
                setRoomsData([]);
                setRoomPriceInfo([]);
                return;
            }
            const { data: roomRows } = await supabase
                .from('room')
                .select('*')
                .in('id', roomIds);
            const roomMap: Record<string, any> = {};
            (roomRows || []).forEach((r: any) => { if (r?.id) roomMap[r.id] = r; });

            // 2) 모든 rate card 정보를 한 번에 조회
            const roomCodes = Array.from(new Set((roomRows || []).map((r: any) => r.room_code).filter(Boolean)));
            const rateMap: Record<string, any[]> = {};
            if (roomCodes.length > 0) {
                const { data: rateRows } = await supabase
                    .from('cruise_rate_card')
                    .select('*')
                    .in('id', roomCodes);
                (rateRows || []).forEach((rc: any) => {
                    const key = String(rc.id);
                    if (!rateMap[key]) rateMap[key] = [];
                    rateMap[key].push(rc);
                });
            }

            // 3) 메모리 상에서 조립
            const allRoomsData: any[] = [];
            const roomPriceDataList: any[] = [];
            for (const roomItem of roomItems) {
                const roomData = roomMap[roomItem.service_ref_id];
                if (!roomData) continue;
                const rateCardData = rateMap[roomData.room_code] || [];
                if (rateCardData.length > 0) {
                    allRoomsData.push({
                        ...roomData,
                        quoteItem: roomItem,
                        priceInfo: rateCardData[0],
                    });
                    roomPriceDataList.push(...rateCardData);
                }
            }

            // 중복 제거된 객실 데이터 생성
            const uniqueRooms = deduplicateRooms(allRoomsData);
            setRoomsData(uniqueRooms);

            // 중복 제거된 가격 정보 설정
            const uniquePriceInfo = deduplicatePriceInfo(roomPriceDataList);
            setRoomPriceInfo(uniquePriceInfo);

            // 첫 번째 객실 정보로 폼 기본값 설정
            if (uniqueRooms.length > 0) {
                // 체크인 날짜는 견적 아이템의 usage_date에서만 가져옴
                // uniqueRooms에는 usage_date가 없으므로, roomItems[0]?.usage_date를 사용
                const totalGuestCount = uniqueRooms.reduce((sum, room) => sum + (room.adult_count || 0) + (room.child_count || 0) + (room.extra_count || 0), 0);
                const totalPrice = uniqueRooms.reduce((sum, room) => sum + (room.quoteItem?.total_price || 0), 0);

                setForm(prev => ({
                    ...prev,
                    room_price_code: uniqueRooms[0].room_code,
                    unit_price: uniqueRooms[0].quoteItem?.unit_price || uniqueRooms[0].priceInfo?.price || 0,
                    guest_count: totalGuestCount,
                    room_total_price: totalPrice,
                    checkin: roomItems[0]?.usage_date || ''
                }));
            }

        } catch (error) {
            console.error('룸 정보 로드 오류:', error);
        }
    };

    // 객실 데이터 중복 제거 함수
    const deduplicateRooms = (rooms: any[]) => {
        const roomMap = new Map();

        rooms.forEach(room => {
            const key = room.room_code;
            if (roomMap.has(key)) {
                // 같은 room_code가 있으면 인원수 합산
                const existing = roomMap.get(key);
                existing.adult_count += room.adult_count || 0;
                existing.child_count += room.child_count || 0;
                existing.extra_count += room.extra_count || 0;
                existing.totalPrice += room.quoteItem?.total_price || 0;
                existing.roomCount += 1;
                existing.allQuoteItems.push(room.quoteItem);
            } else {
                // 새로운 room_code면 추가
                roomMap.set(key, {
                    ...room,
                    totalPrice: room.quoteItem?.total_price || 0,
                    roomCount: 1,
                    allQuoteItems: [room.quoteItem]
                });
            }
        });

        return Array.from(roomMap.values());
    };

    // 가격 정보 중복 제거 함수
    const deduplicatePriceInfo = (priceList: any[]) => {
        const priceMap = new Map();

        priceList.forEach(price => {
            const key = `${price.room_code}_${price.cruise}_${price.room_type}_${price.schedule}`;
            if (!priceMap.has(key)) {
                priceMap.set(key, price);
            }
        });

        return Array.from(priceMap.values());
    };

    // 차량 정보 로드
    const loadCarInfo = async (carId: string, quoteItem?: any) => {
        try {
            // car 테이블에서 차량 정보 조회
            const { data: carData } = await supabase
                .from('car')
                .select('car_code')
                .eq('id', carId)
                .single();

            if (carData?.car_code) {
                // rentcar_price 테이블에서 가격 정보 조회
                const { data: carPriceData } = await supabase
                    .from('rentcar_price')
                    .select('*')
                    .eq('rent_code', carData.car_code)
                    .maybeSingle();

                if (carPriceData) {
                    setCarPriceInfo(carPriceData);
                    // 폼에 차량 코드와 기본 차량 가격 설정 (단순 car_code만 저장)
                    const quantity = quoteItem?.quantity || 1;
                    setForm(prev => ({
                        ...prev,
                        car_price_code: carPriceData.car_code,
                        car_count: quantity,
                        car_total_price: quoteItem?.total_price || (carPriceData.price * quantity)
                    }));
                }
            }
        } catch (error) {
            console.error('차량 정보 로드 오류:', error);
        }
    };    // 폼 입력 핸들러
    const handleInputChange = (field: string, value: any) => {
        setForm(prev => {
            const updated = {
                ...prev,
                [field]: typeof value === 'string' && isLocationFieldKey(field)
                    ? normalizeLocationEnglishUpper(value)
                    : value
            };

            // 가격 관련 필드가 변경되면 총 가격 자동 계산
            if (field === 'unit_price' || field === 'guest_count') {
                updated.room_total_price = (updated.unit_price || 0) * (updated.guest_count || 1);
            }

            if (field === 'car_count' && carPriceInfo?.price) {
                updated.car_total_price = (carPriceInfo.price || 0) * (updated.car_count || 0);
            }

            return updated;
        });
    };

    // 인원수 변경 핸들러
    const handleCountChange = (field: string, increment: boolean) => {
        setForm(prev => {
            const updated = {
                ...prev,
                [field]: Math.max(0, (prev[field as keyof typeof prev] as number) + (increment ? 1 : -1))
            };

            // 투숙객 수 변경 시 룸 총 가격 재계산
            if (field === 'guest_count') {
                updated.room_total_price = (updated.unit_price || 0) * (updated.guest_count || 1);
            }

            // 차량 수 변경 시 차량 총 가격 재계산
            if (field === 'car_count' && carPriceInfo?.price) {
                updated.car_total_price = (carPriceInfo.price || 0) * (updated.car_count || 0);
            }

            return updated;
        });
    };

    // 폼 제출/수정 (카테고리별 다중 행 저장 + 차량 분리)
    const handleSubmit = async () => {
        try {
            setLoading(true);

            // 필수 필드 검증
            if (!form.checkin) {
                alert('체크인 날짜는 필수 입력 항목입니다.');
                return;
            }

            // 사용자 인증 및 역할 확인
            const { user, error: userError } = await getFastAuthUserWithMemberRole();
            if (userError || !user) {
                router.push(`/mypage/reservations?quoteId=${quoteId}`);
                return;
            }

            let reservationData;

            if (isEditMode && existingReservation) {
                // 수정 모드: 기존 예약 사용
                reservationData = existingReservation;

                // 기존 reservation_cruise 모든 행 삭제
                console.log('🗑️ 기존 크루즈 예약 데이터 삭제 중...');
                await supabase
                    .from('reservation_cruise')
                    .delete()
                    .eq('reservation_id', existingReservation.re_id);

                // 기존 reservation_cruise_car 모든 행 삭제
                console.log('🗑️ 기존 크루즈 차량 예약 데이터 삭제 중...');
                await supabase
                    .from('reservation_cruise_car')
                    .delete()
                    .eq('reservation_id', existingReservation.re_id);
            } else {
                // 새 예약 생성 (중복 확인)
                const { data: duplicateCheck } = await supabase
                    .from('reservation')
                    .select('re_id')
                    .eq('re_user_id', user.id)
                    .eq('re_quote_id', quoteId)
                    .eq('re_type', 'cruise')
                    .maybeSingle();

                if (duplicateCheck) {
                    // 기존 예약이 있으면 업데이트 모드로 전환
                    console.log('🔄 기존 크루즈 예약 발견 - 업데이트 모드로 전환');
                    reservationData = { re_id: duplicateCheck.re_id };

                    // 기존 크루즈 예약 데이터 모든 행 삭제
                    await supabase
                        .from('reservation_cruise')
                        .delete()
                        .eq('reservation_id', duplicateCheck.re_id);

                    // 기존 크루즈 차량 예약 데이터 모든 행 삭제
                    await supabase
                        .from('reservation_cruise_car')
                        .delete()
                        .eq('reservation_id', duplicateCheck.re_id);
                } else {
                    // 완전히 새로운 예약 생성
                    const { data: newReservation, error: reservationError } = await supabase
                        .from('reservation')
                        .insert({
                            re_user_id: user.id,
                            re_quote_id: quoteId,
                            re_type: 'cruise',
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
                    reservationData = newReservation;
                }
            }

            // 🎯 카테고리별 다중 행 저장 (객실만)
            let errors = [];

            // 1. 객실 예약 - 카테고리별 다중 행 저장 (차량 정보 제외)
            console.log('🏨 객실 예약 데이터 저장 중...');
            for (const roomData of roomsData) {
                // 각 객실 카테고리별로 별도 행 생성 (차량 정보 제거됨)
                const roomReservationData = {
                    reservation_id: reservationData.re_id,
                    room_price_code: roomData.room_code,
                    checkin: form.checkin,
                    guest_count: (roomData.adult_count || 0) + (roomData.child_count || 0) + (roomData.extra_count || 0),
                    unit_price: roomData.priceInfo?.price || 0,
                    room_total_price: roomData.quoteItem?.total_price || 0,
                    request_note: form.room_request_note || null
                };

                console.log(`📋 ${roomData.room_code} 객실 데이터:`, roomReservationData);
                const { error: roomError } = await supabase
                    .from('reservation_cruise')
                    .insert(roomReservationData);

                if (roomError) {
                    console.error(`${roomData.room_code} 객실 저장 오류:`, roomError);
                    errors.push(`객실 ${roomData.room_code} 저장 오류: ${roomError.message}`);
                }
            }

            // 2. 차량 예약 - 별도 테이블에 저장 (reservation_cruise_car)
            if (form.car_price_code && form.car_count > 0) {
                console.log('🚗 차량 예약 데이터 저장 중...');
                const carReservationData = {
                    reservation_id: reservationData.re_id,
                    car_price_code: form.car_price_code,
                    car_count: form.car_count,
                    passenger_count: form.passenger_count,
                    pickup_datetime: form.pickup_datetime ? new Date(form.pickup_datetime).toISOString() : null,
                    pickup_location: form.pickup_location,
                    dropoff_location: form.dropoff_location,
                    car_total_price: form.car_total_price,
                    request_note: form.car_request_note || null
                };

                console.log('🚗 차량 예약 데이터:', carReservationData);
                const { error: carError } = await supabase
                    .from('reservation_cruise_car')
                    .insert(carReservationData);

                if (carError) {
                    console.error('차량 예약 저장 오류:', carError);
                    errors.push(`차량 저장 오류: ${carError.message}`);
                }
            }

            // 에러 체크
            if (errors.length > 0) {
                console.error('💥 크루즈 예약 저장 중 오류 발생:', errors);
                alert('크루즈 예약 저장 중 오류가 발생했습니다:\n' + errors.join('\n'));
                return;
            }

            alert(isEditMode ? '크루즈 예약이 성공적으로 수정되었습니다!' : '크루즈 예약이 성공적으로 저장되었습니다!');
            router.push(`/mypage/reservations?quoteId=${quoteId}`);

        } catch (error) {
            console.error('예약 저장 오류:', error);
            alert('예약 저장 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
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
                        <h1 className="text-lg font-bold text-gray-800">🚢 크루즈 예약</h1>
                        <p className="text-sm text-gray-600 mt-1">* 행복 여행 이름: {quote.title}</p>
                    </div>
                    <button
                        onClick={() => router.push('/mypage/reservations')}
                        className="px-3 py-1 bg-gray-50 text-gray-600 rounded border text-sm hover:bg-gray-100"
                    >
                        목록으로
                    </button>
                </div>

                {/* 크루즈 객실 정보 */}
                <SectionBox title="🏨 객실 선택">

                    {/* 객실 견적 정보 (컬럼이 바뀌면 줄바꿈) */}
                    {roomPriceInfo.length > 0 && (
                        <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                            <h4 className="text-sm font-medium text-blue-800 mb-3">📋 객실 견적 정보</h4>
                            {roomPriceInfo.map((priceInfo, index) => {
                                const roomData = roomsData.find(room => room.room_code === priceInfo.room_code);
                                const totalGuests = roomData?.person_count || 0;
                                const roomCount = roomData?.roomCount || 1;
                                const totalPrice = roomData?.totalPrice || 0;
                                return (
                                    <div key={index} className="bg-white p-3 rounded border mb-2">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 text-sm">
                                            <span className="text-gray-600">일정: <span className="font-medium text-gray-800">{priceInfo.schedule || '-'}</span></span>
                                            <span className="text-gray-600">크루즈: <span className="font-medium text-gray-800">{priceInfo.cruise || '-'}</span></span>
                                            <span className="text-gray-600">룸 타입: <span className="font-medium text-gray-800">{priceInfo.room_type || '-'}</span></span>
                                            <span className="text-gray-600">결제: <span className="font-medium text-gray-800">{priceInfo.payment || '-'}</span></span>
                                            <span className="text-gray-600">카테고리: <span className="font-medium text-gray-800">{priceInfo.room_category || '-'}</span></span>
                                            <span className="text-gray-600">총 인원수: <span className="font-medium text-gray-800">{totalGuests}명</span></span>
                                            <span className="text-gray-600">가격: <span className="font-medium text-blue-600">{priceInfo.price ? `${priceInfo.price.toLocaleString()}동` : '-'}</span></span>
                                            <span className="text-gray-600 md:col-span-2">총 금액: <span className="font-bold text-red-600 text-base">{totalPrice.toLocaleString()}동</span></span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                체크인 날짜 (견적 기준)
                            </label>
                            <input
                                type="date"
                                value={form.checkin}
                                readOnly
                                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-600 cursor-not-allowed focus:outline-none"
                            />
                        </div>
                    </div>

                    {/* 객실 요청사항 - 체크인 바로 아래로 이동 */}
                    <div className="mt-6">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            🏨 객실 관련 요청사항
                        </label>
                        <textarea
                            value={form.room_request_note}
                            onChange={(e) => handleInputChange('room_request_note', e.target.value)}
                            placeholder=""
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-vertical"
                        />
                    </div>
                </SectionBox>

                {/* 차량 정보 */}
                <SectionBox title="🚗 차량 선택">
                    {/* 스하차량 버튼 - 차량 정보 섹션 상단에 추가 */}
                    <div className="mb-4 flex justify-between items-center">
                        <h4 className="text-sm font-medium text-gray-700">차량 예약 정보</h4>
                        <button
                            type="button"
                            onClick={() => setIsShtCarModalOpen(true)}
                            className="px-3 py-1 bg-blue-50 text-blue-600 rounded border border-blue-200 text-sm hover:bg-blue-100 transition-colors"
                        >
                            🚐 스하차량 좌석도 보기
                        </button>
                    </div>

                    {carPriceInfo && (
                        <div className="mb-6 p-4 bg-green-50 rounded-lg border border-green-200">
                            <h4 className="text-sm font-medium text-green-800 mb-3">📋 차량 견적 정보</h4>
                            <div className="bg-white p-3 rounded border">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 text-sm">
                                    <span className="text-gray-600">차량 타입: <span className="font-medium text-gray-800">{carPriceInfo.car_type || '-'}</span></span>
                                    <span className="text-gray-600">카테고리: <span className="font-medium text-gray-800">{carPriceInfo.car_category || '-'}</span></span>
                                    <span className="text-gray-600">승객수: <span className="font-medium text-gray-800">{carPriceInfo.passenger_count || '-'}</span></span>
                                    <span className="text-gray-600">가격: <span className="font-medium text-green-600">{carPriceInfo.price ? `${carPriceInfo.price.toLocaleString()}동` : '-'}</span></span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 스테이하롱 셔틀 안내 문구 */}
                    {carPriceInfo && (carPriceInfo.car_type?.includes('스테이하롱 셔틀') || carPriceInfo.car_category?.includes('스테이하롱 셔틀')) && (
                        <div className="mb-6 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <p className="text-sm text-blue-800">
                                💡 <strong>좌석 배정 안내:</strong> 좌석도를 확인하시고 요청사항에 차량번호 좌석번호를 적어주시면 최대한 원하시는 좌석에 배정하도록 하겠습니다. ^^
                            </p>
                        </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                인원 및 차량수
                            </label>
                            <div className="flex items-center space-x-2">
                                <button
                                    type="button"
                                    onClick={() => handleCountChange('car_count', false)}
                                    className="w-6 h-6 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-sm"
                                >
                                    -
                                </button>
                                <span className="text-lg font-semibold w-6 text-center">
                                    {form.car_count}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => handleCountChange('car_count', true)}
                                    className="w-6 h-6 rounded-full bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center text-sm"
                                >
                                    +
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                픽업 일시
                            </label>
                            <input
                                type="datetime-local"
                                value={form.pickup_datetime}
                                onChange={(e) => handleInputChange('pickup_datetime', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                픽업 장소
                            </label>
                            <input
                                type="text"
                                value={form.pickup_location}
                                onChange={(e) => handleInputChange('pickup_location', e.target.value)}
                                placeholder="영문 대문자로 입력해 주세요"
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                드롭오프 장소
                            </label>
                            <input
                                type="text"
                                value={form.dropoff_location}
                                onChange={(e) => handleInputChange('dropoff_location', e.target.value)}
                                placeholder="영문 대문자로 입력해 주세요"
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    </div>

                    {/* 차량 요청사항 - 차량 섹션 내로 이동 */}
                    <div className="mt-6">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            🚗 차량 관련 요청사항
                        </label>
                        <textarea
                            value={form.car_request_note}
                            onChange={(e) => handleInputChange('car_request_note', e.target.value)}
                            placeholder=" "
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 resize-vertical"
                        />
                    </div>
                </SectionBox>

                {/* 총 예약 금액 표시 - 가장 아래로 이동 */}
                <SectionBox title="� 크루즈 예약 금액">
                    <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                        <div className="flex flex-col gap-2 text-sm">
                            <div>
                                <span className="text-gray-600">객실 비용:</span>
                                <span className="font-medium text-blue-600 ml-2">{form.room_total_price?.toLocaleString()}동</span>
                            </div>
                            <div>
                                <span className="text-gray-600">차량 비용:</span>
                                <span className="font-medium text-green-600 ml-2">{form.car_total_price?.toLocaleString()}동</span>
                            </div>
                            <div className="border-t border-yellow-300 pt-2 mt-2">
                                <span className="text-gray-800 font-medium">총 예상 금액:</span>
                                <span className="font-bold text-lg text-red-600 ml-2">{(form.room_total_price + form.car_total_price)?.toLocaleString()}동</span>
                            </div>
                        </div>
                        <p className="mt-3 text-xs text-gray-600">
                            * 위 금액은 견적 기준 예상 금액이며, 실제 결제 금액은 다를 수 있습니다.
                        </p>
                    </div>
                </SectionBox>

                {/* 예약 진행 버튼 */}
                <div className="flex justify-end">
                    <button
                        onClick={async () => {
                            await handleSubmit();
                            // 예약 홈으로 이동할 때 quoteId(견적 ID) 쿼리 파라미터를 유지하여 전달
                            router.push(`/mypage/reservations?quoteId=${quoteId}`);
                        }}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md shadow hover:bg-blue-700 transition-all disabled:opacity-50"
                        disabled={loading}
                    >
                        {loading ? (isEditMode ? '수정 중...' : '예약 중...') : (isEditMode ? '예약 수정' : '예약 추가')}
                    </button>
                </div>

                {/* SHT 차량 좌석도 모달 */}
                {isShtCarModalOpen && (
                    <ShtCarSeatMap
                        isOpen={isShtCarModalOpen}
                        onClose={() => setIsShtCarModalOpen(false)}
                        usageDate={form.checkin} // 체크인 날짜를 사용일로 전달
                    />
                )}
            </div>
        </PageWrapper>
    );
}

export default function Page() {
    return (
        <Suspense
            fallback={
                <PageWrapper>
                    <div className="flex justify-center items-center h-64">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                        <p className="mt-4 text-gray-600">로딩 중...</p>
                    </div>
                </PageWrapper>
            }
        >
            <CruiseReservationContent />
        </Suspense>
    );
}
