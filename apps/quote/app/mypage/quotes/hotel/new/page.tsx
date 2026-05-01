'use client'

import React, { useState, useEffect, Suspense, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import supabase from '@/lib/supabase'

function NewHotelQuoteContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const quoteId = searchParams.get('quoteId')

  const [loading, setLoading] = useState(false)
  const [quote, setQuote] = useState<any>(null)

  // hotel_price + hotel_info 기반 상태
  const [hotelOptions, setHotelOptions] = useState<any[]>([])
  const [roomOptions, setRoomOptions] = useState<any[]>([])
  const [pricingOptions, setPricingOptions] = useState<any[]>([])

  // 선택된 값들
  const [selectedHotelId, setSelectedHotelId] = useState('')
  const [selectedHotelName, setSelectedHotelName] = useState('')
  const [selectedRoomId, setSelectedRoomId] = useState('')
  const [selectedPricingId, setSelectedPricingId] = useState('')
  const [selectedHotel, setSelectedHotel] = useState<any>(null)

  const [formData, setFormData] = useState({
    checkin_date: '',
    checkout_date: '',
    guest_count: 1,
    special_requests: ''
  })

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
  }, [quoteId, router])

  // 체크인/체크아웃 날짜가 설정되면 호텔 옵션 업데이트
  useEffect(() => {
    if (formData.checkin_date && formData.checkout_date) {
      loadHotelOptions()
    } else {
      setHotelOptions([])
      setSelectedHotelId('')
      setSelectedHotelName('')
    }
  }, [formData.checkin_date, formData.checkout_date])

  // 호텔 선택 시 객실 옵션 업데이트
  useEffect(() => {
    if (selectedHotelId && formData.checkin_date && formData.checkout_date) {
      loadRoomOptions(selectedHotelId)
    } else {
      setRoomOptions([])
      setSelectedRoomId('')
    }
  }, [selectedHotelId, formData.checkin_date, formData.checkout_date])

  // 객실 선택 시 가격 옵션 로드
  useEffect(() => {
    if (selectedHotelId && selectedRoomId && formData.checkin_date && formData.checkout_date) {
      loadPricingOptions(selectedHotelId, selectedRoomId)
    } else {
      setPricingOptions([])
      setSelectedPricingId('')
      setSelectedHotel(null)
    }
  }, [selectedHotelId, selectedRoomId, formData.checkin_date, formData.checkout_date])

  // 요일 계산 함수
  const getWeekdayFromDate = useCallback((dateString: string) => {
    const date = new Date(dateString)
    const weekdays = ['일', '월', '화', '수', '목', '금', '토']
    return weekdays[date.getDay()]
  }, [])

  const loadHotelOptions = useCallback(async () => {
    try {
      const { data: priceData, error: priceError } = await supabase
        .from('hotel_price')
        .select('hotel_code')
        .lte('start_date', formData.checkin_date)
        .gte('end_date', formData.checkin_date)

      if (priceError) throw priceError

      const uniqueCodes = [...new Set((priceData || []).map((p: any) => p.hotel_code))];
      if (uniqueCodes.length === 0) { setHotelOptions([]); return; }

      const { data: hotelData, error: hotelError } = await supabase
        .from('hotel_info')
        .select('*')
        .in('hotel_code', uniqueCodes)
        .eq('active', true)
        .order('hotel_name')

      if (hotelError) throw hotelError
      setHotelOptions(hotelData || [])
    } catch (error) {
      console.error('호텔 옵션 로드 실패:', error)
    }
  }, [formData.checkin_date, formData.checkout_date])

  const loadRoomOptions = useCallback(async (hotelCode: string) => {
    try {
      const { data, error } = await supabase
        .from('hotel_price')
        .select('room_type, room_name, room_category')
        .eq('hotel_code', hotelCode)
        .lte('start_date', formData.checkin_date)
        .gte('end_date', formData.checkin_date)

      if (error) throw error

      const uniqueRooms = new Map();
      (data || []).forEach((item: any) => {
        if (!uniqueRooms.has(item.room_type)) {
          uniqueRooms.set(item.room_type, item);
        }
      });
      const sortedRooms = Array.from(uniqueRooms.values()).sort((a: any, b: any) =>
        (a.room_name || '').localeCompare(b.room_name || '', 'ko')
      );
      setRoomOptions(sortedRooms)
    } catch (error) {
      console.error('객실 옵션 로드 실패:', error)
    }
  }, [formData.checkin_date, formData.checkout_date])

  const loadPricingOptions = useCallback(async (hotelCode: string, roomType: string) => {
    try {
      const { data, error } = await supabase
        .from('hotel_price')
        .select('*')
        .eq('hotel_code', hotelCode)
        .eq('room_type', roomType)
        .lte('start_date', formData.checkin_date)
        .gte('end_date', formData.checkin_date)
        .order('base_price')

      if (error) throw error

      setPricingOptions(data || [])
      if (data && data.length > 0) {
        setSelectedPricingId(data[0].hotel_price_code)
        setSelectedHotel({ hotel_price_code: data[0].hotel_price_code, base_price: data[0].base_price, season_name: data[0].season_name, weekday_type: data[0].weekday_type })
      } else {
        setSelectedPricingId('')
        setSelectedHotel(null)
      }
    } catch (error) {
      console.error('가격 옵션 로드 실패:', error)
      setPricingOptions([])
      setSelectedPricingId('')
      setSelectedHotel(null)
    }
  }, [formData.checkin_date, formData.checkout_date])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (!formData.checkin_date || !formData.checkout_date) {
      alert('체크인/체크아웃 날짜를 선택해주세요.')
      return
    }

    if (!selectedHotel) {
      alert('호텔을 선택해주세요.')
      return
    }

    if (!quoteId) {
      alert('견적 ID가 없습니다.')
      return
    }

    setLoading(true)

    try {
      // 호텔 폼 데이터 구성
      const hotelData = {
        hotel_code: selectedHotel.hotel_price_code,
        checkin_date: formData.checkin_date,
        checkout_date: formData.checkout_date,
        guest_count: formData.guest_count,
        base_price: 0,
        ...(formData.special_requests && { special_requests: formData.special_requests })
      }

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
          unit_price: parseInt(selectedHotel.base_price) || 0,
          total_price: parseInt(selectedHotel.base_price) || 0
        })
        .select()
        .single()

      if (itemError) {
        console.error('❌ 견적 아이템 생성 오류:', itemError)
        alert(`견적 아이템 생성 실패: ${itemError.message}`)
        return
      }

      console.log('✅ 견적 아이템 생성 성공:', itemData)

      alert('호텔이 견적에 추가되었습니다!')
      router.push(`/mypage/quotes/${quoteId}/view`)

    } catch (error) {
      console.error('❌ 호텔 견적 추가 중 오류:', error)
      alert('오류가 발생했습니다: ' + (error as Error)?.message || '알 수 없는 오류')
    } finally {
      setLoading(false)
    }
  }

  const isFormValid = formData.checkin_date && formData.checkout_date && selectedHotel

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
        <div className="max-w-4xl mx-auto">
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

              {/* 1단계: 호텔명 선택 */}
              {hotelOptions.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    🏨 호텔명 *
                  </label>
                  <select
                    value={selectedHotelId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSelectedHotelId(id);
                      const hotel = hotelOptions.find((h: any) => h.hotel_code === id);
                      setSelectedHotelName(hotel?.hotel_name || '');
                    }}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  >
                    <option value="">호텔을 선택하세요</option>
                    {hotelOptions.map((hotel: any) => (
                      <option key={hotel.hotel_code} value={hotel.hotel_code}>{hotel.hotel_name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* 2단계: 객실 선택 */}
              {selectedHotelId && roomOptions.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    🛏️ 객실 *
                  </label>
                  <select
                    value={selectedRoomId}
                    onChange={(e) => setSelectedRoomId(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  >
                    <option value="">객실을 선택하세요</option>
                    {roomOptions.map((room: any) => (
                      <option key={room.room_type} value={room.room_type}>{room.room_name} ({room.room_category})</option>
                    ))}
                  </select>
                </div>
              )}

              {/* 3단계: 가격 옵션 선택 */}
              {pricingOptions.length > 1 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    🏷️ 가격 옵션 *
                  </label>
                  <select
                    value={selectedPricingId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSelectedPricingId(id);
                      const p = pricingOptions.find((opt: any) => opt.hotel_price_code === id);
                      if (p) setSelectedHotel({ hotel_price_code: p.hotel_price_code, base_price: p.base_price, season_name: p.season_name, weekday_type: p.weekday_type });
                    }}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {pricingOptions.map((p: any) => (
                      <option key={p.hotel_price_code} value={p.hotel_price_code}>
                        {p.season_name} / {p.weekday_type === 'WEEKDAY' ? '평일' : p.weekday_type === 'WEEKEND' ? '주말' : p.weekday_type}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* 투숙 인동 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  👥 투숙 인동 *
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={formData.guest_count}
                  onChange={(e) => setFormData({ ...formData, guest_count: parseInt(e.target.value) || 1 })}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

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
                    <div><strong>체크인:</strong> {new Date(formData.checkin_date).toLocaleDateString('ko-KR')}</div>
                    <div><strong>체크아웃:</strong> {new Date(formData.checkout_date).toLocaleDateString('ko-KR')}</div>
                    <div><strong>호텔:</strong> {selectedHotelName}</div>
                    <div><strong>객실:</strong> {roomOptions.find((r: any) => r.room_type === selectedRoomId)?.room_name || ''}</div>
                    <div><strong>투숙 인원:</strong> {formData.guest_count}명</div>
                    {selectedPricingId && (
                      <div className="pt-2 border-t border-green-200">
                        <strong>🔍 가격 코드:</strong> <span className="bg-yellow-100 px-2 py-1 rounded font-mono text-sm">{selectedPricingId}</span>
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

