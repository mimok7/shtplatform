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

  const [hotelDetails, setHotelDetails] = useState<any>(null)
  const [hotelCardsData, setHotelCardsData] = useState<any[]>([])
  const [roomCardsData, setRoomCardsData] = useState<any[]>([])

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
          .eq('hotel_price_code', serviceData.hotel_code)
          .single();

        if (priceError || !priceData) {
          console.error('호텔 가격 정보 조회 오류:', priceError);
          setSelectedHotelCode(serviceData.hotel_code);
        } else {
          setSelectedHotelCode(priceData.hotel_price_code);
          setSelectedHotel(priceData);
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
      console.error('견적 정보 로드 실패:', error)
      alert('견적 정보를 불러올 수 없습니다.')
      router.push('/mypage/quotes')
    }
  }

  useEffect(() => {
    if (!quoteId) {
      alert('견적 ID가 필요합니다.')
      router.push('/mypage/quotes')
      return
    }
    loadQuote()

    // 수정 모드인 경우 기존 데이터 로드
    if (mode === 'edit' && itemId && serviceRefId) {
      setIsEditMode(true);
      loadExistingQuoteData();
    }
  }, [quoteId, router, mode, itemId, serviceRefId])

  // 체크인/체크아웃 날짜가 설정되면 호텔 카드 데이터 로드
  useEffect(() => {
    if (formData.checkin_date && formData.checkout_date) {
      loadHotelNameOptions()
    } else {
      setHotelNameOptions([])
      setHotelCardsData([])
      setSelectedHotelName('')
      setRoomCardsData([])
      setSelectedRoomName('')
      setSelectedHotel(null)
      setSelectedHotelCode('')
    }
  }, [formData.checkin_date, formData.checkout_date])

  // 호텔 선택 시 객실 카드 로드
  useEffect(() => {
    if (selectedHotelName && formData.checkin_date && formData.checkout_date) {
      loadRoomCards(selectedHotelName)
    } else {
      setRoomCardsData([])
      setSelectedRoomName('')
      setSelectedHotel(null)
      setSelectedHotelCode('')
    }
  }, [selectedHotelName, formData.checkin_date, formData.checkout_date])

  // 요일 계산 함수
  const getWeekdayFromDate = useCallback((dateString: string) => {
    const date = new Date(dateString)
    const weekdays = ['일', '월', '화', '수', '목', '금', '토']
    return weekdays[date.getDay()]
  }, [])

  const loadHotelNameOptions = useCallback(async () => {
    try {
      // 1. hotel_price에서 체크인 날짜에 해당하는 호텔 코드 조회
      const { data: priceData, error: priceError } = await supabase
        .from('hotel_price')
        .select('hotel_code')
        .lte('start_date', formData.checkin_date)
        .gte('end_date', formData.checkin_date);

      if (priceError) throw priceError;

      const uniqueCodes = [...new Set((priceData || []).map((p: any) => p.hotel_code))];
      if (uniqueCodes.length === 0) {
        setHotelNameOptions([]);
        setHotelCardsData([]);
        return;
      }

      // 2. hotel_info에서 호텔 상세 정보 조회
      const { data: hotelData, error: hotelError } = await supabase
        .from('hotel_info')
        .select('*')
        .in('hotel_code', uniqueCodes)
        .eq('active', true)
        .order('hotel_name');

      if (hotelError) throw hotelError;

      setHotelNameOptions((hotelData || []).map((h: any) => h.hotel_name));
      setHotelCardsData(hotelData || []);
    } catch (error) {
      console.error('호텔 옵션 로드 실패:', error)
    }
  }, [formData.checkin_date, formData.checkout_date])

  const loadRoomCards = useCallback(async (hotelName: string) => {
    try {
      // hotel_price에서 해당 호텔의 이용 가능한 객실 + 가격 조회
      const hotelInfo = hotelCardsData.find((h: any) => h.hotel_name === hotelName)
      if (!hotelInfo) { setRoomCardsData([]); return }

      const { data: priceRows, error } = await supabase
        .from('hotel_price')
        .select('*')
        .eq('hotel_code', hotelInfo.hotel_code)
        .lte('start_date', formData.checkin_date)
        .gte('end_date', formData.checkin_date)
        .order('base_price')

      if (error) throw error

      // 체크인 요일에 맞는 weekday_type 필터링
      const checkinDate = new Date(formData.checkin_date)
      const dayOfWeek = checkinDate.getDay()
      const isWeekend = dayOfWeek === 5 || dayOfWeek === 6

      const filteredRows = (priceRows || []).filter((p: any) => {
        if (p.weekday_type === 'ALL') return true
        if (isWeekend && p.weekday_type === 'WEEKEND') return true
        if (!isWeekend && p.weekday_type === 'WEEKDAY') return true
        return false
      })

      // room_type별 그룹화 (WEEKDAY/WEEKEND가 ALL보다 우선)
      const roomMap = new Map()
      filteredRows.forEach((p: any) => {
        const existing = roomMap.get(p.room_type)
        if (!existing) {
          roomMap.set(p.room_type, p)
        } else if (p.weekday_type !== 'ALL' && existing.weekday_type === 'ALL') {
          roomMap.set(p.room_type, p)
        }
      })

      setRoomCardsData(Array.from(roomMap.values()))
    } catch (error) {
      console.error('객실 카드 로드 실패:', error)
      setRoomCardsData([])
    }
  }, [formData.checkin_date, formData.checkout_date, hotelCardsData])

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
      alert('견적 ID가 없습니다.');
      return;
    }

    setLoading(true);

    try {
      const hotelData = {
        hotel_code: selectedHotel.hotel_price_code,
        checkin_date: formData.checkin_date,
        checkout_date: formData.checkout_date,
        base_price: 0,
        ...(formData.special_requests && { special_requests: formData.special_requests })
      };

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

      // 2. 견적 아이템 생성
      const { data: itemData, error: itemError } = await supabase
        .from('quote_item')
        .insert({
          quote_id: quoteId,
          service_type: 'hotel',
          service_ref_id: hotelServiceData.id,
          quantity: 1,
          unit_price: parseInt(selectedHotel.base_price) || 0,
          total_price: parseInt(selectedHotel.base_price) || 0,
          usage_date: formData.checkin_date || null
        })
        .select()
        .single()

      if (itemError) {
        console.error('❌ 견적 아이템 생성 오류:', itemError)
        alert(`견적 아이템 생성 실패: ${itemError.message}`)
        return
      }

      alert('호텔이 견적에 추가되었습니다!')
      router.push(`/mypage/quotes/new?quoteId=${quoteId}`);

    } catch (error) {
      console.error('❌ 호텔 견적 추가 중 오류:', error)
      alert('오류가 발생했습니다: ' + (error as Error)?.message || '알 수 없는 오류')
    } finally {
      setLoading(false);
    }
  }

  const isFormValid = formData.checkin_date && formData.checkout_date && selectedHotel

  // 객실 카테고리 한글 변환
  const getRoomCategoryLabel = (category: string) => {
    switch (category) {
      case 'SUITE': return '스위트'
      case 'FAMILY_ROOM': return '패밀리'
      case 'VILLA': return '빌라'
      case 'DAY_PASS': return '데이패스'
      default: return '스탠다드'
    }
  }

  if (!quote) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
          <p className="mt-4 text-gray-600">견적 정보를 불러오는 중...</p>
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
              <h1 className="text-3xl font-bold mb-2">🏨 호텔 견적 신청</h1>
              <p className="text-lg opacity-90">
                호텔 숙박을 위한 견적을 작성해주세요.
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
            <h3 className="font-semibold text-gray-800 mb-2">현재 견적 정보</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>견적명: <span className="font-semibold text-blue-600">{quote.title}</span></div>
              <div>상태: {quote.status === 'draft' ? '작성 중' : quote.status}</div>
              <div>작성일: {new Date(quote.created_at).toLocaleDateString('ko-KR')}</div>
            </div>
          </div>
        </div>
      </div>

      {/* 폼 */}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-5xl mx-auto">
          <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-lg p-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">호텔 정보 입력</h2>

            {/* 호텔 안내 카드 */}
            <div className="bg-blue-600 rounded-lg p-6 mb-6 border border-blue-700">
              <h3 className="text-white text-lg font-semibold mb-2">📝 견적안내</h3>
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

              {/* 1단계: 호텔 선택 (드롭다운) */}
              {hotelNameOptions.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    🏨 호텔 선택 * <span className="text-gray-400 font-normal text-xs">({hotelNameOptions.length}개 이용 가능)</span>
                  </label>
                  <select
                    value={selectedHotelName}
                    onChange={(e) => setSelectedHotelName(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">호텔을 선택해주세요</option>
                    {hotelNameOptions.map(name => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* 선택된 호텔 정보 카드 */}
              {selectedHotelName && (
                <div>
                  {(() => {
                    const info = hotelCardsData.find((h: any) => h.hotel_name === selectedHotelName)
                    if (!info) return null
                    return (
                      <div className="p-5 rounded-xl border-2 border-blue-200 bg-blue-50 shadow-md">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <h3 className="font-bold text-gray-900 text-lg">{selectedHotelName}</h3>
                            {info?.star_rating && (
                              <span className="text-yellow-500 text-sm">{'⭐'.repeat(info.star_rating)} {info.star_rating}성급</span>
                            )}
                          </div>
                        </div>
                        {info?.location && (
                          <p className="text-gray-600 text-sm mb-3">📍 {info.location}</p>
                        )}
                        <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
                          {info?.check_in_time && (
                            <div className="text-gray-600">체크인: <span className="font-medium">{info.check_in_time?.slice(0, 5)}</span></div>
                          )}
                          {info?.check_out_time && (
                            <div className="text-gray-600">체크아웃: <span className="font-medium">{info.check_out_time?.slice(0, 5)}</span></div>
                          )}
                        </div>
                        {info?.product_type && info.product_type !== 'HOTEL' && (
                          <div className="mb-2">
                            <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-xs font-medium">
                              {info.product_type === 'RESORT_ONSEN' ? '온천 리조트' : info.product_type === 'VILLA_RESORT' ? '빌라 리조트' : info.product_type === 'VILLA_POOL' ? '풀빌라' : info.product_type}
                            </span>
                          </div>
                        )}
                        {info?.notes && (
                          <p className="text-xs text-gray-500 mt-2 line-clamp-3">{info.notes}</p>
                        )}
                      </div>
                    )
                  })()}
                </div>
              )}

              {/* 2단계: 객실 선택 (카드 + 가격 비교) */}
              {selectedHotelName && roomCardsData.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    🛏️ 객실 선택 * <span className="text-gray-400 font-normal text-xs">({roomCardsData.length}개 객실)</span>
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {roomCardsData.map((room: any) => (
                      <div
                        key={room.hotel_price_code}
                        onClick={() => {
                          setSelectedRoomName(room.room_name)
                          setSelectedHotel(room)
                          setSelectedHotelCode(room.hotel_price_code || '')
                        }}
                        className={`cursor-pointer p-4 rounded-xl border-2 transition-all hover:shadow-lg ${selectedRoomName === room.room_name
                          ? 'border-green-500 bg-green-50 shadow-md ring-2 ring-green-200'
                          : 'border-gray-200 bg-white hover:border-green-300'
                          }`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="font-bold text-gray-900 text-sm">{room.room_name}</h4>
                          <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ml-2">
                            {getRoomCategoryLabel(room.room_category)}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600 mb-2">
                          {room.occupancy_max && <div>👥 최대 {room.occupancy_max}명</div>}
                          {room.season_name && <div>📅 {room.season_name}</div>}
                          {room.weekday_type && room.weekday_type !== 'ALL' && <div>📆 {room.weekday_type === 'WEEKDAY' ? '평일' : '주말'}</div>}
                        </div>
                        <div className="text-[11px] text-gray-500 mb-2">
                          <span className={`inline-block px-1.5 py-0.5 rounded mr-1 ${room.include_breakfast ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                            {room.include_breakfast ? '🍳 조식포함' : '조식 미포함'}
                          </span>
                          {room.child_policy && (
                            <div className="text-gray-400 truncate mt-1">👶 {room.child_policy}</div>
                          )}
                        </div>
                        {room.notes && (
                          <p className="text-[10px] text-gray-400 line-clamp-2 mb-1">{room.notes}</p>
                        )}
                        <div className="pt-2 border-t border-gray-100 flex items-end justify-end">
                          {selectedRoomName === room.room_name && (
                            <span className="text-green-600 text-xs font-semibold">✓ 선택됨</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
                    <div><strong>객실:</strong> {selectedRoomName}</div>
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
                {loading ? '처리 중...' : '견적에 추가'}
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

