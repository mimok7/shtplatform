'use client'

import React, { useState, useEffect, Suspense, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import supabase from '@/lib/supabase'

function NewHotelQuoteContent() {
    const router = useRouter()
    const searchParams = useSearchParams();
    const quoteId = searchParams.get('quoteId');
    const itemId = searchParams.get('itemId');
    const serviceRefId = searchParams.get('serviceRefId');
    const mode = searchParams.get('mode');

    const [loading, setLoading] = useState(false)
    const [quote, setQuote] = useState<any>(null)
    const [isEditMode, setIsEditMode] = useState(false)
    const [hotelNameOptions, setHotelNameOptions] = useState<string[]>([])
    const [roomNameOptions, setRoomNameOptions] = useState<string[]>([])
    const [roomTypeOptions, setRoomTypeOptions] = useState<string[]>([])
    const [filteredHotels, setFilteredHotels] = useState<any[]>([])

    // 선택된 값들
    const [selectedHotelName, setSelectedHotelName] = useState('')
    const [selectedRoomName, setSelectedRoomName] = useState('')
    const [selectedRoomType, setSelectedRoomType] = useState('')
    const [selectedHotel, setSelectedHotel] = useState<any>(null)
    const [selectedHotelCode, setSelectedHotelCode] = useState('')

    const [formData, setFormData] = useState({
        checkin_date: '',
        checkout_date: '',
        special_requests: ''
    })

    // 기존 견적 데이터 로드 (수정 모드용)
    const loadExistingQuoteData = async () => {
        try {
            setLoading(true);

            const { data: serviceData, error: serviceError } = await supabase
                .from('hotel')
                .select('*')
                .eq('id', serviceRefId)
                .single();

            if (serviceError || !serviceData) {
                console.error('서비스 데이터 조회 오류:', serviceError);
                alert('서비스 데이터를 찾을 수 없습니다.');
                return;
            }

            // 호텔 데이터로 폼 초기화
            setFormData(prev => ({
                ...prev,
                checkin_date: serviceData.checkin_date || '',
                checkout_date: serviceData.checkout_date || '',
                nights: serviceData.nights || 1,
                guest_count: serviceData.guest_count || 1,
                special_requests: serviceData.special_requests || ''
            }));

            // hotel_code를 통해 hotel_price에서 호텔 정보를 역으로 찾기
            if (serviceData.hotel_code) {
                const { data: priceData, error: priceError } = await supabase
                    .from('hotel_price')
                    .select('*')
                    .eq('hotel_code', serviceData.hotel_code)
                    .single();

                if (priceError || !priceData) {
                    console.error('호텔 가격 정보 조회 오류:', priceError);
                    // fallback: 저장된 코드만 설정
                    setSelectedHotelCode(serviceData.hotel_code);
                } else {
                    // 가격 정보에서 호텔 정보를 복원
                    setSelectedHotelCode(priceData.hotel_code);
                    setSelectedHotel(priceData); // 전체 가격 정보를 selectedHotel로 설정
                }
            }

            console.log('기존 호텔 견적 데이터 로드 완료:', serviceData);
        } catch (error) {
            console.error('기존 견적 데이터 로드 오류:', error);
            alert('기존 견적 데이터를 불러오는 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const loadQuote = async () => {
        if (!quoteId) return

        try {
            const { data, error } = await supabase
                .from('quote')
                .select('*')
                .eq('id', quoteId)
                .single()

            if (error) throw error
            setQuote(data)
        } catch (error) {
            console.error('가격 정보 로드 실패:', error)
            alert('가격 정보를 불러올 수 없습니다.')
            router.push('/mypage/quotes')
        }
    }

    useEffect(() => {
        if (!quoteId) {
            alert('가격 ID가 필요합니다.')
            router.push('/mypage')
            return
        }
        loadQuote()

        // 수정 모드인 경우 기존 데이터 로드
        if (mode === 'edit' && itemId && serviceRefId) {
            setIsEditMode(true);
            loadExistingQuoteData();
        }
    }, [quoteId, router, mode, itemId, serviceRefId])

    // 체크인/체크아웃 날짜가 설정되면 호텔명 옵션 업데이트
    useEffect(() => {
        if (formData.checkin_date && formData.checkout_date) {
            loadHotelNameOptions()
        } else {
            setHotelNameOptions([])
            setSelectedHotelName('')
        }
    }, [formData.checkin_date, formData.checkout_date])

    // 호텔명 선택 시 객실명 옵션 업데이트
    useEffect(() => {
        if (selectedHotelName && formData.checkin_date && formData.checkout_date) {
            loadRoomNameOptions(selectedHotelName)
        } else {
            setRoomNameOptions([])
            setSelectedRoomName('')
        }
    }, [selectedHotelName, formData.checkin_date, formData.checkout_date])

    // 호텔명과 객실명이 선택될 때 객실 타입 목록 업데이트
    useEffect(() => {
        if (selectedHotelName && selectedRoomName && formData.checkin_date && formData.checkout_date) {
            loadRoomTypeOptions(selectedHotelName, selectedRoomName)
        } else {
            setRoomTypeOptions([])
            setSelectedRoomType('')
        }
    }, [selectedHotelName, selectedRoomName, formData.checkin_date, formData.checkout_date])

    // 모든 조건이 선택되면 최종 호텔 옵션 검색
    useEffect(() => {
        if (selectedHotelName && selectedRoomName && selectedRoomType && formData.checkin_date && formData.checkout_date) {
            searchFinalHotels()
        } else {
            setFilteredHotels([])
            setSelectedHotel(null)
            setSelectedHotelCode('')
        }
    }, [selectedHotelName, selectedRoomName, selectedRoomType, formData.checkin_date, formData.checkout_date])

    // 요일 계산 함수
    const getWeekdayFromDate = useCallback((dateString: string) => {
        const date = new Date(dateString)
        const weekdays = ['일', '월', '화', '수', '목', '금', '토']
        return weekdays[date.getDay()]
    }, [])

    const loadHotelNameOptions = useCallback(async () => {
        try {
            const checkinWeekday = getWeekdayFromDate(formData.checkin_date)
            console.log('🏨 체크인 요일:', checkinWeekday)

            const { data, error } = await supabase
                .from('hotel_price')
                .select('hotel_name')
                .lte('start_date', formData.checkin_date)
                .gte('end_date', formData.checkout_date)
                .like('weekday_type', `%${checkinWeekday}%`)
                .order('hotel_name')

            if (error) throw error

            // 중복 제거
            const rows = (data as any[]) || [];
            const uniqueHotelNames = [...new Set(rows.map((item: any) => String(item.hotel_name || '')).filter(Boolean))] as string[];
            setHotelNameOptions(uniqueHotelNames)

            console.log('🏨 필터링된 호텔명 옵션:', uniqueHotelNames)
        } catch (error) {
            console.error('호텔명 옵션 로드 실패:', error)
        }
    }, [formData.checkin_date, formData.checkout_date, getWeekdayFromDate])

    const loadRoomNameOptions = useCallback(async (hotelName: string) => {
        try {
            const checkinWeekday = getWeekdayFromDate(formData.checkin_date)

            const { data, error } = await supabase
                .from('hotel_price')
                .select('room_name')
                .eq('hotel_name', hotelName)
                .lte('start_date', formData.checkin_date)
                .gte('end_date', formData.checkout_date)
                .like('weekday_type', `%${checkinWeekday}%`)
                .order('room_name')

            if (error) throw error

            const rows = (data as any[]) || [];
            const uniqueRoomNames = [...new Set(rows.map((item: any) => String(item.room_name || '')).filter(Boolean))] as string[];
            setRoomNameOptions(uniqueRoomNames)

            console.log('🏨 필터링된 객실명 옵션:', uniqueRoomNames)
        } catch (error) {
            console.error('객실명 옵션 로드 실패:', error)
        }
    }, [formData.checkin_date, formData.checkout_date, getWeekdayFromDate])

    const loadRoomTypeOptions = useCallback(async (hotelName: string, roomName: string) => {
        try {
            const checkinWeekday = getWeekdayFromDate(formData.checkin_date)

            const { data, error } = await supabase
                .from('hotel_price')
                .select('room_type')
                .eq('hotel_name', hotelName)
                .eq('room_name', roomName)
                .lte('start_date', formData.checkin_date)
                .gte('end_date', formData.checkout_date)
                .like('weekday_type', `%${checkinWeekday}%`)
                .order('room_type')

            if (error) throw error

            const rows = (data as any[]) || [];
            const uniqueRoomTypes = [...new Set(rows.map((item: any) => String(item.room_type || '')).filter(Boolean))] as string[];
            setRoomTypeOptions(uniqueRoomTypes)

            console.log('🏨 필터링된 객실 타입 옵션:', uniqueRoomTypes)
        } catch (error) {
            console.error('객실 타입 옵션 로드 실패:', error)
        }
    }, [formData.checkin_date, formData.checkout_date, getWeekdayFromDate])

    // searchFinalHotels 함수 수정
    const searchFinalHotels = useCallback(async () => {
        try {
            const checkinWeekday = getWeekdayFromDate(formData.checkin_date)
            console.log('🔍 체크인 요일 검색:', checkinWeekday)

            const { data, error } = await supabase
                .from('hotel_price')
                .select('hotel_code, hotel_name, room_name, room_type, price, weekday_type')
                .eq('hotel_name', selectedHotelName)
                .eq('room_name', selectedRoomName)
                .eq('room_type', selectedRoomType)
                .lte('start_date', formData.checkin_date)
                .gte('end_date', formData.checkout_date)
                .like('weekday_type', `%${checkinWeekday}%`)
                .order('hotel_code')

            if (error) throw error

            // weekday_type에 체크인 요일이 포함된 행만 필터링
            const rows = (data as any[]) || [];
            const filteredData = rows.filter((hotel: any) =>
                hotel.weekday_type && hotel.weekday_type.includes(checkinWeekday)
            )

            console.log('🏨 요일 필터링된 호텔들:', filteredData)

            setFilteredHotels(filteredData)

            // 호텔이 있으면 첫 번째 항목 자동 선택
            if (filteredData.length > 0) {
                setSelectedHotel(filteredData[0])
                setSelectedHotelCode(filteredData[0].hotel_code)
                console.log(`✅ 선택된 호텔 코드: ${filteredData[0].hotel_code}, 적용 요일: ${filteredData[0].weekday_type}`)
            } else {
                setSelectedHotel(null)
                setSelectedHotelCode('')
            }
        } catch (error) {
            console.error('최종 호텔 검색 실패:', error)
            setFilteredHotels([])
            setSelectedHotel(null)
            setSelectedHotelCode('')
        }
    }, [formData.checkin_date, formData.checkout_date, selectedHotelName, selectedRoomName, selectedRoomType, getWeekdayFromDate])

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        if (!formData.checkin_date || !formData.checkout_date) {
            alert('체크인/체크아웃 날짜를 선택해주세요.');
            return;
        }

        if (!selectedHotel) {
            alert('호텔을 선택해주세요.');
            return;
        }

        if (!quoteId) {
            alert('가격 ID가 없습니다.');
            return;
        } setLoading(true);

        try {
            // 호텔 폼 데이터 구성 (투숙객 수 제외)
            const hotelData = {
                hotel_code: selectedHotel.hotel_code,
                checkin_date: formData.checkin_date,
                checkout_date: formData.checkout_date,
                base_price: 0,
                ...(formData.special_requests && { special_requests: formData.special_requests })
            };

            console.log('🏨 호텔 데이터:', hotelData)

            // 1. 호텔 서비스 생성
            const { data: hotelServiceData, error: hotelError } = await supabase
                .from('hotel')
                .insert([hotelData])
                .select()
                .single()

            if (hotelError) {
                console.error('❌ 호텔 서비스 생성 오류:', hotelError)
                alert(`호텔 서비스 생성 실패: ${hotelError.message}`)
                return
            }

            console.log('✅ 호텔 서비스 생성 성공:', hotelServiceData)

            // 2. 견적 아이템 생성
            const { data: itemData, error: itemError } = await supabase
                .from('quote_item')
                .insert({
                    quote_id: quoteId,
                    service_type: 'hotel',
                    service_ref_id: hotelServiceData.id,
                    quantity: 1,
                    unit_price: parseInt(selectedHotel.price) || 0,
                    total_price: parseInt(selectedHotel.price) || 0,
                    usage_date: formData.checkin_date || null
                })
                .select()
                .single()

            if (itemError) {
                console.error('❌ 견적 아이템 생성 오류:', itemError)
                alert(`견적 아이템 생성 실패: ${itemError.message}`)
                return
            }

            console.log('✅ 견적 아이템 생성 성공:', itemData)

            alert('호텔이 가격에 추가되었습니다! 이제 예약 단계로 이동합니다.')
            // 직접 예약이므로 2단계(예약)로 바로 이동
            router.push(`/mypage/direct-booking/hotel/2?quoteId=${quoteId}`)

        } catch (error: any) {
            console.error('❌ 호텔 견적 추가 중 오류:', error)
            alert('오류가 발생했습니다: ' + error.message)
        } finally {
            setLoading(false);
        }
    }

    const isFormValid = formData.checkin_date && formData.checkout_date && selectedHotel

    if (!quote) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
                    <p className="mt-4 text-gray-600">가격 정보를 불러오는 중...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* 헤더 */}
            <div className="bg-gradient-to-br from-blue-200 via-purple-200 to-indigo-100 text-gray-900">
                <div className="container mx-auto px-4 py-8">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h1 className="text-3xl font-bold mb-2">🏨 호텔 가격 신청</h1>
                            <p className="text-lg opacity-90">
                                호텔 숙박을 위한 가격을 작성해주세요.
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => router.back()}
                                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                            >
                                ← 뒤로
                            </button>
                        </div>
                    </div>

                    {/* 견적 정보 */}
                    <div className="bg-white/70 backdrop-blur rounded-lg p-4 mb-6">
                        <h3 className="font-semibold text-gray-800 mb-2">현재 가격 정보</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                            <div>여행명: <span className="font-semibold text-blue-600">{quote.title}</span></div>
                            <div>상태: {quote.status === 'draft' ? '작성 중' : quote.status}</div>
                            <div>작성일: {new Date(quote.created_at).toLocaleDateString('ko-KR')}</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 폼 */}
            <div className="container mx-auto px-4 py-8">
                <div className="max-w-4xl mx-auto">
                    <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-lg p-8">
                        <h2 className="text-2xl font-bold text-gray-800 mb-6">호텔 정보 입력</h2>

                        {/* 호텔 안내 카드 */}
                        <div className="bg-blue-600 rounded-lg p-6 mb-6 border border-blue-700">
                            <h3 className="text-white text-lg font-semibold mb-2">📝 가격안내</h3>
                            <p className="text-white/90 text-sm">호텔 예약을 위해 아래 정보를 순서대로 입력해 주세요.<br />체크인/체크아웃 날짜를 먼저 선택하시면 해당 날짜에 예약 가능한 호텔 목록이 표시됩니다.</p>
                        </div>

                        {/* 호텔 선택 폼 */}
                        <div className="space-y-6">
                            {/* 투숙 기간 */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        📅 체크인 날짜 *
                                    </label>
                                    <input
                                        type="date"
                                        value={formData.checkin_date}
                                        onChange={(e) => setFormData({ ...formData, checkin_date: e.target.value })}
                                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        required
                                    />
                                    {formData.checkin_date && (
                                        <p className="text-sm text-gray-500 mt-1">
                                            요일: {getWeekdayFromDate(formData.checkin_date)}요일
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        📅 체크아웃 날짜 *
                                    </label>
                                    <input
                                        type="date"
                                        value={formData.checkout_date}
                                        onChange={(e) => setFormData({ ...formData, checkout_date: e.target.value })}
                                        min={formData.checkin_date}
                                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        required
                                    />
                                </div>
                            </div>

                            {/* 1단계: 호텔명 선택 */}
                            {hotelNameOptions.length > 0 && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        🏨 호텔명 *
                                    </label>
                                    <select
                                        value={selectedHotelName}
                                        onChange={(e) => setSelectedHotelName(e.target.value)}
                                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        required
                                    >
                                        <option value="">호텔을 선택하세요</option>
                                        {hotelNameOptions.map(hotel => (
                                            <option key={hotel} value={hotel}>{hotel}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* 2단계: 객실명 선택 */}
                            {selectedHotelName && roomNameOptions.length > 0 && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        🛏️ 객실명 *
                                    </label>
                                    <select
                                        value={selectedRoomName}
                                        onChange={(e) => setSelectedRoomName(e.target.value)}
                                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        required
                                    >
                                        <option value="">객실을 선택하세요</option>
                                        {roomNameOptions.map(room => (
                                            <option key={room} value={room}>{room}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* 3단계: 객실 타입 선택 */}
                            {selectedHotelName && selectedRoomName && roomTypeOptions.length > 0 && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        🏷️ 객실 타입 *
                                    </label>
                                    <select
                                        value={selectedRoomType}
                                        onChange={(e) => setSelectedRoomType(e.target.value)}
                                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        required
                                    >
                                        <option value="">객실 타입을 선택하세요</option>
                                        {roomTypeOptions.map(type => (
                                            <option key={type} value={type}>{type}</option>
                                        ))}
                                    </select>
                                    {/* 객실 타입 아래에 위크데이 타입 컬럼 값 표시 */}
                                    {filteredHotels.length > 0 && filteredHotels[0].weekday_type && (
                                        <div className="mt-2 text-sm text-blue-600">
                                            <span className="font-medium">적용 요일:</span> {filteredHotels[0].weekday_type}
                                            <span className="ml-2 bg-yellow-100 px-2 py-1 rounded font-mono text-xs">
                                                {getWeekdayFromDate(formData.checkin_date)}요일 포함
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* 4단계: 최종 호텔 선택 */}

                            {/* 특별 요청사항 */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    📝 특별 요청사항
                                </label>
                                <textarea
                                    value={formData.special_requests}
                                    onChange={(e) => setFormData({ ...formData, special_requests: e.target.value })}
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    rows={4}
                                    placeholder="특별한 요청사항이 있으시면 입력해주세요"
                                />
                            </div>

                            {/* 선택 요약 */}
                            {isFormValid && (
                                <div className="bg-green-50 p-6 rounded-lg border border-green-200">
                                    <h3 className="font-semibold text-green-800 mb-3">✅ 선택 요약</h3>
                                    <div className="text-green-700 space-y-2">
                                        <div><strong>체크인:</strong> {new Date(formData.checkin_date).toLocaleDateString('ko-KR')} ({getWeekdayFromDate(formData.checkin_date)}요일)</div>
                                        <div><strong>체크아웃:</strong> {new Date(formData.checkout_date).toLocaleDateString('ko-KR')}</div>
                                        <div><strong>호텔:</strong> {selectedHotelName}</div>
                                        <div><strong>객실:</strong> {selectedRoomName} - {selectedRoomType}</div>
                                        {selectedHotelCode && (
                                            <div className="pt-2 border-t border-green-200">
                                                <strong>🔍 선택된 호텔 코드:</strong> <span className="bg-yellow-100 px-2 py-1 rounded font-mono text-sm">{selectedHotelCode}</span>
                                            </div>
                                        )}
                                        {formData.special_requests && <div><strong>특별 요청:</strong> {formData.special_requests}</div>}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* 제출 버튼 */}
                        <div className="flex justify-center space-x-4 pt-6 mt-8">
                            <button
                                type="button"
                                onClick={() => router.back()}
                                className="px-6 py-3 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
                            >
                                취소
                            </button>
                            <button
                                type="submit"
                                disabled={!isFormValid || loading}
                                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                            >
                                {loading ? '처리 중...' : '가격에 추가'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}

export default function NewHotelQuotePage() {
    return (
        <Suspense fallback={<div className="flex justify-center items-center h-64">로딩 중...</div>}>
            <NewHotelQuoteContent />
        </Suspense>
    );
}

