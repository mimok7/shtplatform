'use client';
import { useState, useEffect, Suspense, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '@/lib/supabase';
import {
  CruisePriceCalculator,
  CruiseRateCard,
  CruiseTourOption,
  SelectedTourOption,
  CruisePriceResult,
  formatVND,
  SCHEDULE_MAP,
} from '@/lib/cruisePriceCalculator';

const calculator = new CruisePriceCalculator(supabase);

function CruiseQuoteNewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const quoteId = searchParams.get('quoteId');

  // ── 폼 상태 ──
  const [form, setForm] = useState({
    checkin: '',
    schedule: '',
    cruise_name: '',
    room_type: '',
    // 인원수
    adult_count: 2,
    child_count: 0,
    child_extra_bed_count: 0,
    infant_count: 0,
    extra_bed_count: 0,
    single_count: 0,
  });

  // 차량 폼 상태 (rentcar_price 기준: 이용방식 -> 경로 -> 차량타입)
  const WAY_TYPE_OPTIONS = ['편도', '당일왕복', '다른날왕복'];
  const [vehicles, setVehicles] = useState<any[]>([
    { wayType: '', route: '', carType: '', carTypeOptions: [], count: 1 }
  ]);

  // 옵션 데이터
  const [cruiseOptions, setCruiseOptions] = useState<string[]>([]);
  const [roomTypeCards, setRoomTypeCards] = useState<CruiseRateCard[]>([]);
  const [routeOptions, setRouteOptions] = useState<string[]>([]);

  // cruise_info 상세 정보
  const [cruiseInfoList, setCruiseInfoList] = useState<any[]>([]);
  const [showItinerary, setShowItinerary] = useState(false);
  const [showCancelPolicy, setShowCancelPolicy] = useState(false);

  // 당일투어 옵션
  const [tourOptions, setTourOptions] = useState<CruiseTourOption[]>([]);
  const [selectedTourOptions, setSelectedTourOptions] = useState<SelectedTourOption[]>([]);

  // 패키지 옵션
  const [availablePackages, setAvailablePackages] = useState<any[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<any | null>(null);

  // 일정 옵션
  const scheduleOptions = ['1박2일', '2박3일', '당일'];

  // 특별 요청사항
  const [formData, setFormData] = useState({ special_requests: '' });

  // 가격 계산 결과
  const [priceResult, setPriceResult] = useState<CruisePriceResult | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);

  // 로딩/견적 상태
  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState<any>(null);

  useEffect(() => {
    if (!quoteId) {
      alert('견적 ID가 필요합니다.');
      router.push('/mypage/quotes');
      return;
    }
    loadQuote();
  }, [quoteId, router]);

  // ── 크루즈 옵션 로드 (cruise_rate_card 기반) ──
  useEffect(() => {
    if (form.schedule && form.checkin) {
      loadCruiseOptions();
    } else {
      setCruiseOptions([]);
      if (form.cruise_name) setForm(prev => ({ ...prev, cruise_name: '' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.schedule, form.checkin]);

  // ── 객실 타입 로드 (cruise_rate_card 기반) ──
  useEffect(() => {
    if (form.schedule && form.checkin && form.cruise_name) {
      loadRoomTypes();
      loadPackages();
      loadCruiseInfo();
      // 당일투어인 경우 옵션 로드
      if (form.schedule === '당일') {
        loadTourOptions();
      } else {
        setTourOptions([]);
        setSelectedTourOptions([]);
      }
    } else {
      setRoomTypeCards([]);
      setTourOptions([]);
      setSelectedTourOptions([]);
      setAvailablePackages([]);
      setSelectedPackage(null);
      setCruiseInfoList([]);
      if (form.room_type) setForm(prev => ({ ...prev, room_type: '' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.schedule, form.checkin, form.cruise_name]);

  // ── 가격 자동 계산 ──
  useEffect(() => {
    if (form.cruise_name && form.room_type && form.checkin && form.schedule) {
      calculatePrice();
    } else {
      setPriceResult(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    form.cruise_name, form.room_type, form.checkin, form.schedule,
    form.adult_count, form.child_count, form.child_extra_bed_count,
    form.infant_count, form.extra_bed_count, form.single_count,
    selectedTourOptions,
  ]);

  // ── 차량 옵션은 선택 이벤트 기반으로 로드 ──

  // ── 데이터 로드 함수들 ──

  const loadQuote = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('quote')
        .select('title, status, created_at')
        .eq('id', quoteId)
        .single();

      if (error) throw error;
      setQuote(data);
    } catch (error) {
      console.error('견적 조회 실패:', error);
      alert('견적을 조회할 수 없습니다.');
    } finally {
      setLoading(false);
    }
  };

  const loadCruiseOptions = useCallback(async () => {
    const names = await calculator.getCruiseNames({
      schedule: form.schedule,
      checkin_date: form.checkin,
    });
    setCruiseOptions(names);
  }, [form.schedule, form.checkin]);

  const loadRoomTypes = useCallback(async () => {
    const cards = await calculator.getRoomTypes({
      schedule: form.schedule,
      checkin_date: form.checkin,
      cruise_name: form.cruise_name,
    });
    // 가격이 낮은 순으로 정렬
    const sortedCards = [...cards].sort((a, b) => (a.price_adult || 0) - (b.price_adult || 0));
    setRoomTypeCards(sortedCards);
  }, [form.schedule, form.checkin, form.cruise_name]);

  const loadTourOptions = useCallback(async () => {
    const options = await calculator.getTourOptions(form.cruise_name, form.schedule);
    setTourOptions(options);
  }, [form.cruise_name, form.schedule]);

  // ── cruise_info 로드 (크루즈 상세 정보) ──
  const loadCruiseInfo = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('cruise_info')
        .select('*')
        .eq('cruise_name', form.cruise_name)
        .order('display_order');
      if (error) throw error;
      setCruiseInfoList(data || []);
    } catch (error) {
      console.error('cruise_info 로드 실패:', error);
      setCruiseInfoList([]);
    }
  }, [form.cruise_name]);

  const calculatePrice = useCallback(async () => {
    setPriceLoading(true);
    try {
      const result = await calculator.calculate({
        cruise_name: form.cruise_name,
        schedule: form.schedule,
        room_type: form.room_type,
        checkin_date: form.checkin,
        adult_count: form.adult_count,
        child_count: form.child_count,
        child_extra_bed_count: form.child_extra_bed_count,
        infant_count: form.infant_count,
        extra_bed_count: form.extra_bed_count,
        single_count: form.single_count,
        selected_options: selectedTourOptions,
      });
      setPriceResult(result);
    } catch (error) {
      console.error('가격 계산 실패:', error);
      setPriceResult(null);
    } finally {
      setPriceLoading(false);
    }
  }, [form.cruise_name, form.schedule, form.room_type, form.checkin,
  form.adult_count, form.child_count, form.child_extra_bed_count,
  form.infant_count, form.extra_bed_count, form.single_count, selectedTourOptions]);

  // 차량 관련 (rentcar_price 테이블 사용)
  const loadRouteOptions = useCallback(async (wayType: string) => {
    if (!wayType) return;
    try {
      const { data, error } = await supabase
        .from('rentcar_price')
        .select('route')
        .eq('way_type', wayType)
        .like('route', '%하롱베이%')
        .order('route');

      if (error) throw error;
      const uniqueRoutes = [...new Set((data || []).map((item: any) => item.route).filter(Boolean))] as string[];
      setRouteOptions(uniqueRoutes);
    } catch (error) {
      console.error('렌트카 경로 옵션 로드 실패:', error);
      setRouteOptions([]);
    }
  }, []);

  const fetchCarTypeOptions = useCallback(async (wayType: string, route?: string) => {
    try {
      let query = supabase
        .from('rentcar_price')
        .select('vehicle_type')
        .eq('way_type', wayType);
      if (route) {
        query = query.eq('route', route);
      } else {
        // 경로 없는 경우(당일왕복/다른날왕복): 하롱베이 포함 경로의 차량만
        query = query.like('route', '%하롱베이%');
      }
      const { data, error } = await query.order('vehicle_type');

      if (error) throw error;
      let types = [...new Set((data || []).map((item: any) => item.vehicle_type).filter(Boolean))] as string[];
      // 스테이하롱 셔틀 리무진 A/B/C 변형만 제외 (단돁은 표시)
      types = types.filter(t => !/스테이하롱 셔틀 리무진 [ABC]/.test(t));
      return types;
    } catch (error) {
      console.error('렌트카 차량 타입 옵션 로드 실패:', error);
      return [];
    }
  }, []);

  const getRentPriceInfo = useCallback(async (wayType: string, route: string, carType: string) => {
    let query = supabase
      .from('rentcar_price')
      .select('rent_code, price, rental_type, route')
      .eq('way_type', wayType)
      .eq('vehicle_type', carType);
    if (route) {
      query = query.eq('route', route);
    }
    const { data, error } = await query.limit(1);

    if (error) throw error;
    return data?.[0] || null;
  }, []);

  // ── 선택된 요금 카드 ──
  const selectedRateCard = useMemo(() => {
    return roomTypeCards.find(card => card.room_type === form.room_type) || null;
  }, [roomTypeCards, form.room_type]);

  // ── 객실별 cruise_info 매칭 (한글/영문 room_type 모두 지원) ──
  const getCruiseInfoForRoom = useCallback((roomType: string, roomTypeEn?: string) => {
    if (!cruiseInfoList.length) return null;
    // 1. room_name 정확 매칭
    let found = cruiseInfoList.find(info => info.room_name === roomType);
    if (found) return found;
    // 2. room_type_en으로 정확 매칭
    if (roomTypeEn) {
      found = cruiseInfoList.find(info => info.room_name === roomTypeEn);
      if (found) return found;
      // 3. room_type_en 부분 매칭 - 가장 긴 매칭 우선 (longest match)
      const enLower = roomTypeEn.toLowerCase();
      let bestMatch: (typeof cruiseInfoList)[0] | null = null;
      let bestLen = 0;
      cruiseInfoList.forEach(info => {
        const infoName = (info.room_name || '').toLowerCase();
        if (enLower.includes(infoName) || infoName.includes(enLower)) {
          if (infoName.length > bestLen) {
            bestLen = infoName.length;
            bestMatch = info;
          }
        }
      });
      if (bestMatch) return bestMatch;
    }
    // 4. 한글 room_type 부분 매칭 - 가장 긴 매칭 우선
    const typeLower = roomType.toLowerCase();
    let bestMatchKr: (typeof cruiseInfoList)[0] | null = null;
    let bestLenKr = 0;
    cruiseInfoList.forEach(info => {
      const infoName = (info.room_name || '').toLowerCase();
      if (infoName.includes(typeLower) || typeLower.includes(infoName)) {
        if (infoName.length > bestLenKr) {
          bestLenKr = infoName.length;
          bestMatchKr = info;
        }
      }
    });
    return bestMatchKr || null;
  }, [cruiseInfoList]);

  // ── 크루즈 공통 정보 (첫 번째 행에서 추출) ──
  const cruiseCommonInfo = useMemo(() => {
    if (cruiseInfoList.length === 0) return null;
    const first = cruiseInfoList[0];
    return {
      description: first.description,
      star_rating: first.star_rating,
      capacity: first.capacity,
      awards: first.awards,
      itinerary: first.itinerary,
      cancellation_policy: first.cancellation_policy,
      inclusions: first.inclusions,
      exclusions: first.exclusions,
      facilities: first.facilities,
      features: first.features,
    };
  }, [cruiseInfoList]);

  // ── 차량 핸들러 ──
  const handleAddVehicle = () => {
    if (vehicles.length < 3) {
      setVehicles(prev => [...prev, { wayType: '', route: '', carType: '', carTypeOptions: [], count: 1 }]);
    }
  };

  const handleRemoveVehicle = (index: number) => {
    if (vehicles.length > 1) {
      setVehicles(prev => prev.filter((_, i) => i !== index));
    }
  };

  const handleVehicleChange = async (index: number, field: string, value: any) => {
    const newVehicles = [...vehicles];
    newVehicles[index][field] = value;

    if (field === 'wayType') {
      newVehicles[index].route = '';
      newVehicles[index].carType = '';
      newVehicles[index].carTypeOptions = [];
      await loadRouteOptions(value);
    } else if (field === 'route') {
      const carTypes = await fetchCarTypeOptions(newVehicles[index].wayType, value);
      newVehicles[index].carTypeOptions = carTypes;
      newVehicles[index].carType = '';
    }

    setVehicles(newVehicles);
  };

  // ── 패키지 로드 ──
  const loadPackages = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('package_master')
        .select('*, package_items(*)')
        .eq('is_active', true)
        .order('base_price');

      if (error) throw error;

      // 현재 크루즈에 해당하는 패키지만 필터링
      const filtered = (data || []).filter((pkg: any) => {
        const cruiseNames = pkg.price_config?.cruise_names;
        return Array.isArray(cruiseNames) && cruiseNames.includes(form.cruise_name);
      });
      setAvailablePackages(filtered);
      // 크루즈 변경 시 패키지 선택 초기화
      setSelectedPackage(null);
    } catch (error) {
      console.error('패키지 로드 실패:', error);
      setAvailablePackages([]);
    }
  }, [form.cruise_name]);

  // ── 제출 (견적 저장) ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);

      // 1. 객실 데이터 저장 (cruise_rate_card 기반) - 모든 인원수 정보 저장
      if (priceResult && form.adult_count > 0) {
        const { data: roomData, error: roomError } = await supabase
          .from('room')
          .insert({
            room_code: priceResult.rate_card.id, // cruise_rate_card ID
            person_count: form.adult_count + form.child_count + form.child_extra_bed_count + form.infant_count,
            adult_count: form.adult_count,
            child_count: form.child_count,
            child_extra_bed_count: form.child_extra_bed_count,
            infant_count: form.infant_count,
            extra_bed_count: form.extra_bed_count,
            single_count: form.single_count
          })
          .select()
          .single();
        if (roomError) throw roomError;

        // quote_item에 options jsonb로 모든 인원수 정보 저장
        const { error: itemError } = await supabase
          .from('quote_item')
          .insert({
            quote_id: quoteId,
            service_type: 'room',
            service_ref_id: roomData.id,
            quantity: 1,
            unit_price: priceResult.grand_total,
            total_price: priceResult.grand_total,
            usage_date: form.checkin,
            options: {
              schedule: form.schedule,
              cruise_name: form.cruise_name,
              room_type: form.room_type,
              adult_count: form.adult_count,
              child_count: form.child_count,
              child_extra_bed_count: form.child_extra_bed_count,
              infant_count: form.infant_count,
              extra_bed_count: form.extra_bed_count,
              single_count: form.single_count,
              selected_tour_options: selectedTourOptions,
              price_breakdown: priceResult.price_breakdown,
              selected_package: selectedPackage ? {
                package_id: selectedPackage.id,
                package_code: selectedPackage.package_code,
                package_name: selectedPackage.name,
                package_price: selectedPackage.base_price,
              } : null
            }
          });
        if (itemError) throw itemError;
      }

      // 2. 차량 데이터 저장 (rentcar_price 기준 조회 후 크루즈 차량(service_type='car')로 저장)
      for (const vehicle of vehicles) {
        if (vehicle.wayType && vehicle.route && vehicle.carType && vehicle.count > 0) {
          const rentPriceInfo = await getRentPriceInfo(vehicle.wayType, vehicle.route || '', vehicle.carType);
          if (!rentPriceInfo?.rent_code) continue;

          const { data: carData, error: carError } = await supabase
            .from('car')
            .insert({
              car_code: rentPriceInfo.rent_code,
              car_count: vehicle.count,
              special_requests: formData.special_requests || null
            })
            .select()
            .single();
          if (carError) throw carError;

          const { error: itemError } = await supabase
            .from('quote_item')
            .insert({
              quote_id: quoteId,
              service_type: 'car',
              service_ref_id: carData.id,
              quantity: vehicle.count,
              unit_price: Number(rentPriceInfo.price || 0),
              total_price: Number(rentPriceInfo.price || 0) * Number(vehicle.count || 0),
              usage_date: form.checkin,
              options: {
                way_type: vehicle.wayType,
                route: vehicle.route || rentPriceInfo.route || null,
                vehicle_type: vehicle.carType,
                rentcar_price_code: rentPriceInfo.rent_code,
                rental_type: rentPriceInfo.rental_type || '단독대여',
                source_table: 'rentcar_price',
              }
            });
          if (itemError) throw itemError;
        }
      }

      alert('크루즈 견적이 성공적으로 추가되었습니다.');
      router.push(`/mypage/quotes/new?quoteId=${quoteId}`);
    } catch (error) {
      console.error('저장 실패:', error);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">데이터를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-gradient-to-br from-blue-200 via-purple-200 to-indigo-100 text-gray-900">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold mb-2">🚢 크루즈 견적</h1>
              <p className="text-lg opacity-90">
                크루즈 여행을 위한 객실, 차량 예약 서비스 견적을 작성해주세요.
              </p>
            </div>
            <button
              onClick={() => router.back()}
              className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
            >
              ← 뒤로
            </button>
          </div>

          {/* 견적 정보 */}
          <div className="bg-white/70 backdrop-blur rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-gray-800 mb-2">현재 견적 정보</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>견적명: <span className="font-semibold text-blue-600">{quote?.title || '크루즈 견적'}</span></div>
              <div>상태: <span className="text-orange-600">{quote?.status === 'draft' ? '작성 중' : quote?.status || '작성 중'}</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* 폼 */}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-lg p-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">크루즈 여행 정보 입력</h2>

            <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg p-6 mb-6">
              <h3 className="text-white text-lg font-semibold mb-2">🚢 크루즈 예약 안내</h3>
              <p className="text-white/90 text-sm">
                날짜와 일정을 선택하면 크루즈/객실 옵션이 제공되고 인원별 가격이 자동 계산됩니다.
              </p>
            </div>

            <div className="space-y-6">
              {/* 체크인 날짜 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">📅 체크인 날짜</label>
                <input
                  type="date"
                  value={form.checkin}
                  onChange={e => setForm({ ...form, checkin: e.target.value })}
                  className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              {/* 일정 선택 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">🗓 일정 선택</label>
                <div className="grid grid-cols-3 gap-2">
                  {scheduleOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setForm({ ...form, schedule: option })}
                      className={`border p-3 rounded-lg transition-colors ${form.schedule === option ? 'bg-blue-500 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>

              {/* 크루즈 선택 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">🚢 크루즈 선택</label>
                <select
                  value={form.cruise_name}
                  onChange={e => setForm({ ...form, cruise_name: e.target.value, room_type: '' })}
                  className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="">크루즈를 선택하세요</option>
                  {cruiseOptions.map(cruise => (
                    <option key={cruise} value={cruise}>{cruise}</option>
                  ))}
                </select>
              </div>

              {/* 패키지 선택 (해당 크루즈에 패키지가 있는 경우) */}
              {availablePackages.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">🎁 프로모션 패키지 (선택)</label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {availablePackages.map((pkg: any) => {
                      const config = pkg.price_config || {};
                      const includes = config.includes || {};
                      return (
                        <button
                          key={pkg.id}
                          type="button"
                          onClick={() => setSelectedPackage(selectedPackage?.id === pkg.id ? null : pkg)}
                          className={`border rounded-lg p-4 text-left transition-all ${selectedPackage?.id === pkg.id
                            ? 'border-purple-500 bg-purple-50 ring-2 ring-purple-500'
                            : 'border-gray-200 hover:border-purple-300 hover:bg-purple-50/50'
                            }`}
                        >
                          <div className="font-semibold text-gray-800">{pkg.name}</div>
                          <div className="mt-2 text-lg font-bold text-purple-600">
                            {formatVND(config.price_2_person || pkg.base_price)}
                            <span className="text-xs font-normal text-gray-500 ml-1">(2인)</span>
                          </div>
                          <div className="text-sm text-purple-500">
                            1인당 {formatVND(config.price_per_person || pkg.base_price / 2)}
                          </div>
                          <div className="mt-2 space-y-1 text-xs text-gray-600">
                            <div>🛏 {(config.rooms || []).join(' / ')}</div>
                            <div>🚣 {(includes.activity || []).join(' / ')}</div>
                            <div>🍹 {includes.meal_drinks || '음료 포함'}</div>
                            {includes.transport && <div>🚐 {includes.transport_detail || '셔틀 포함'}</div>}
                            {includes.lobster && <div>🦞 {includes.lobster_detail || '랍스터 포함'}</div>}
                            {includes.vip_seat && <div>⭐ {includes.vip_seat_detail || 'VIP 좌석'}</div>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {selectedPackage && (
                    <div className="mt-2 p-3 bg-purple-50 border border-purple-200 rounded-lg text-sm text-purple-700">
                      ✅ <strong>{selectedPackage.name}</strong> 선택됨 — {selectedPackage.description}
                    </div>
                  )}
                </div>
              )}

              {/* 크루즈 상세 정보 패널 */}
              {cruiseCommonInfo && (
                <div className="border border-indigo-200 rounded-xl bg-gradient-to-br from-indigo-50 to-blue-50 p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <h3 className="text-lg font-bold text-indigo-900">🚢 {form.cruise_name}</h3>
                    {cruiseCommonInfo.star_rating && (
                      <span className="px-2 py-0.5 bg-yellow-400 text-yellow-900 text-xs font-bold rounded-full">{cruiseCommonInfo.star_rating}</span>
                    )}
                    {cruiseCommonInfo.awards && (
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full">🏆 {cruiseCommonInfo.awards}</span>
                    )}
                  </div>
                  {cruiseCommonInfo.description && (
                    <p className="text-sm text-gray-700 mb-3">{cruiseCommonInfo.description}</p>
                  )}
                  {/* 시설 목록 */}
                  {cruiseCommonInfo.facilities && Array.isArray(cruiseCommonInfo.facilities) && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {cruiseCommonInfo.facilities.map((f: string, i: number) => (
                        <span key={i} className="px-2 py-1 bg-white/70 text-indigo-700 text-xs rounded-lg border border-indigo-100">{f}</span>
                      ))}
                    </div>
                  )}
                  {/* 수용인원 */}
                  {cruiseCommonInfo.capacity && (
                    <div className="text-xs text-gray-600 mb-2">👥 수용인원: {cruiseCommonInfo.capacity}</div>
                  )}
                  {/* 포함/불포함 사항 */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                    {cruiseCommonInfo.inclusions && (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                        <div className="text-xs font-semibold text-green-800 mb-1">✅ 포함 사항</div>
                        <div className="text-xs text-green-700">{cruiseCommonInfo.inclusions}</div>
                      </div>
                    )}
                    {cruiseCommonInfo.exclusions && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                        <div className="text-xs font-semibold text-red-800 mb-1">❌ 불포함 사항</div>
                        <div className="text-xs text-red-700">{cruiseCommonInfo.exclusions}</div>
                      </div>
                    )}
                  </div>
                  {/* 일정표 토글 */}
                  {cruiseCommonInfo.itinerary && Array.isArray(cruiseCommonInfo.itinerary) && (
                    <div className="mb-2">
                      <button type="button" onClick={() => setShowItinerary(!showItinerary)}
                        className="text-sm font-medium text-indigo-700 hover:text-indigo-900 flex items-center gap-1">
                        📋 일정표 {showItinerary ? '접기 ▲' : '보기 ▼'}
                      </button>
                      {showItinerary && (
                        <div className="mt-2 space-y-3">
                          {cruiseCommonInfo.itinerary.map((day: any, di: number) => (
                            <div key={di} className="bg-white/80 rounded-lg p-3 border border-indigo-100">
                              <div className="font-semibold text-sm text-indigo-800 mb-2">{day.title}</div>
                              <div className="space-y-1">
                                {day.schedule?.map((item: any, si: number) => (
                                  <div key={si} className="flex gap-2 text-xs text-gray-700">
                                    {item.time && <span className="font-medium text-indigo-600 w-12">{item.time}</span>}
                                    <span>{item.activity}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {/* 취소규정 토글 */}
                  {cruiseCommonInfo.cancellation_policy && Array.isArray(cruiseCommonInfo.cancellation_policy) && (
                    <div>
                      <button type="button" onClick={() => setShowCancelPolicy(!showCancelPolicy)}
                        className="text-sm font-medium text-indigo-700 hover:text-indigo-900 flex items-center gap-1">
                        📜 취소 규정 {showCancelPolicy ? '접기 ▲' : '보기 ▼'}
                      </button>
                      {showCancelPolicy && (
                        <div className="mt-2 bg-white/80 rounded-lg p-3 border border-indigo-100">
                          <div className="space-y-1">
                            {cruiseCommonInfo.cancellation_policy.map((rule: any, ri: number) => (
                              <div key={ri} className="flex justify-between text-xs border-b border-gray-100 py-1 last:border-0">
                                <span className="text-gray-700">{rule.condition}</span>
                                <span className={`font-medium ${rule.penalty === '무료 취소' || rule.penalty === '전액 환불' ? 'text-green-600' : 'text-red-600'}`}>
                                  {rule.penalty}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 객실 선택 (요금 카드 기반 - 카드 형식) */}
              {roomTypeCards.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">🛏 객실 선택</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {roomTypeCards.map((card) => {
                      const info = getCruiseInfoForRoom(card.room_type, card.room_type_en);
                      return (
                        <button
                          key={card.id}
                          type="button"
                          onClick={() => setForm({ ...form, room_type: card.room_type })}
                          className={`border rounded-lg p-4 text-left transition-all ${form.room_type === card.room_type
                            ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500'
                            : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50'
                            }`}
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-gray-800">{card.room_type}</span>
                            {info?.is_recommended && (
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full">★ 추천</span>
                            )}
                            {info?.is_vip && (
                              <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-bold rounded-full">VIP</span>
                            )}
                          </div>
                          {card.room_type_en && (
                            <div className="text-xs text-gray-500">{card.room_type_en}</div>
                          )}
                          {/* 객실 상세 정보 (cruise_info) */}
                          {info && (
                            <div className="mt-2 space-y-1">
                              <div className="flex flex-wrap gap-2 text-xs">
                                {info.room_area && (
                                  <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">📐 {info.room_area}</span>
                                )}
                                {info.bed_type && (
                                  <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">🛏 {info.bed_type}</span>
                                )}
                                {info.max_adults && (
                                  <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">👤 최대 {info.max_guests || info.max_adults}명</span>
                                )}
                                {info.has_balcony && (
                                  <span className="px-1.5 py-0.5 bg-sky-100 text-sky-700 rounded">🌊 발코니</span>
                                )}
                                {info.has_butler && (
                                  <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">🎩 버틀러</span>
                                )}
                                {info.connecting_available && (
                                  <span className="px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded">🔗 커넥팅</span>
                                )}
                              </div>
                              {info.room_description && (
                                <div className="text-xs text-gray-500 mt-1 line-clamp-2">{info.room_description}</div>
                              )}
                              {info.special_amenities && (
                                <div className="text-xs text-indigo-600 mt-1">✨ {info.special_amenities}</div>
                              )}
                              {info.warnings && (
                                <div className="text-xs text-orange-600 mt-1">⚠️ {info.warnings}</div>
                              )}
                            </div>
                          )}
                          <div className="mt-2 text-sm text-blue-600 font-medium">
                            성인 {formatVND(card.price_adult)}/인
                          </div>
                          {card.price_child != null && (
                            <div className="text-xs text-gray-500">
                              아동 {formatVND(card.price_child)}/인
                            </div>
                          )}
                          {card.season_name && (
                            <span className="inline-block mt-1 px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded-full">
                              {card.season_name}
                            </span>
                          )}
                          {card.is_promotion && (
                            <span className="inline-block mt-1 ml-1 px-2 py-0.5 bg-red-100 text-red-600 text-xs rounded-full">
                              프로모션
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 인원수 입력 */}
              {form.room_type && selectedRateCard && (
                <div className="border border-blue-200 rounded-lg p-4 bg-blue-50/50">
                  <h3 className="text-lg font-semibold text-gray-800 mb-3">👥 인원수 입력</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        성인 ({formatVND(selectedRateCard.price_adult)}/인)
                      </label>
                      <input
                        type="number" min="0" max="20"
                        value={form.adult_count || ''}
                        onChange={e => setForm({ ...form, adult_count: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500"
                        placeholder="인원수"
                      />
                    </div>

                    {selectedRateCard.price_child != null && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          아동 5~11세 ({formatVND(selectedRateCard.price_child)}/인)
                        </label>
                        <input
                          type="number" min="0" max="10"
                          value={form.child_count || ''}
                          onChange={e => setForm({ ...form, child_count: parseInt(e.target.value) || 0 })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500"
                          placeholder="인원수"
                        />
                      </div>
                    )}

                    {selectedRateCard.price_child_extra_bed != null && selectedRateCard.extra_bed_available && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          아동 엑스트라베드 ({formatVND(selectedRateCard.price_child_extra_bed)}/인)
                        </label>
                        <input
                          type="number" min="0" max="5"
                          value={form.child_extra_bed_count || ''}
                          onChange={e => setForm({ ...form, child_extra_bed_count: parseInt(e.target.value) || 0 })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500"
                          placeholder="인원수"
                        />
                      </div>
                    )}

                    {selectedRateCard.price_infant != null && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          유아 0~4세 ({formatVND(selectedRateCard.price_infant)}/인)
                        </label>
                        <input
                          type="number" min="0" max="5"
                          value={form.infant_count || ''}
                          onChange={e => setForm({ ...form, infant_count: parseInt(e.target.value) || 0 })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500"
                          placeholder="인원수"
                        />
                      </div>
                    )}

                    {selectedRateCard.price_extra_bed != null && selectedRateCard.extra_bed_available && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          엑스트라베드 ({formatVND(selectedRateCard.price_extra_bed)}/인)
                        </label>
                        <input
                          type="number" min="0" max="5"
                          value={form.extra_bed_count || ''}
                          onChange={e => setForm({ ...form, extra_bed_count: parseInt(e.target.value) || 0 })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500"
                          placeholder="인원수"
                        />
                      </div>
                    )}

                    {selectedRateCard.price_single != null && selectedRateCard.single_available && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          싱글차지 ({formatVND(selectedRateCard.price_single)}/인)
                        </label>
                        <input
                          type="number" min="0" max="5"
                          value={form.single_count || ''}
                          onChange={e => setForm({ ...form, single_count: parseInt(e.target.value) || 0 })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500"
                          placeholder="인원수"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── 당일투어 선택 옵션 ── */}
              {form.schedule === '당일' && tourOptions.length > 0 && form.room_type && (
                <div className="border border-purple-200 rounded-lg p-4 bg-purple-50/50">
                  <h3 className="text-lg font-semibold text-gray-800 mb-3">🎯 선택 옵션</h3>
                  <p className="text-xs text-gray-500 mb-3">원하시는 추가 옵션을 선택하고 수량을 입력하세요.</p>
                  <div className="space-y-3">
                    {tourOptions.map((option) => {
                      const selected = selectedTourOptions.find(so => so.option_id === option.id);
                      const isSelected = !!selected;
                      return (
                        <div
                          key={option.id}
                          className={`border rounded-lg p-3 transition-all cursor-pointer ${isSelected
                            ? 'border-purple-500 bg-purple-50 ring-1 ring-purple-500'
                            : 'border-gray-200 hover:border-purple-300'
                            }`}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedTourOptions(prev => prev.filter(so => so.option_id !== option.id));
                            } else {
                              setSelectedTourOptions(prev => [...prev, {
                                option_id: String(option.id),
                                option_name: option.option_name,
                                quantity: 1,
                                unit_price: option.option_price,
                              }]);
                            }
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                readOnly
                                className="w-4 h-4 text-purple-600 rounded"
                              />
                              <div>
                                <span className="font-medium text-gray-800">{option.option_name}</span>
                                {option.option_name_en && (
                                  <span className="text-xs text-gray-400 ml-2">{option.option_name_en}</span>
                                )}
                                {option.description && (
                                  <p className="text-xs text-gray-500 mt-0.5">{option.description}</p>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-semibold text-purple-700">{formatVND(option.option_price)}</div>
                              <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">
                                {option.option_type === 'upgrade' ? '업그레이드' : '추가'}
                              </span>
                            </div>
                          </div>
                          {isSelected && (
                            <div className="mt-2 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                              <label className="text-xs text-gray-600">수량:</label>
                              <input
                                type="number"
                                min="1"
                                max="10"
                                value={selected!.quantity}
                                onChange={(e) => {
                                  const qty = parseInt(e.target.value) || 1;
                                  setSelectedTourOptions(prev => prev.map(so =>
                                    so.option_id === option.id ? { ...so, quantity: qty } : so
                                  ));
                                }}
                                className="w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-purple-500"
                              />
                              <span className="text-xs text-gray-500">
                                = {formatVND(option.option_price * (selected!.quantity))}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}


              {/* ── 가격 미리보기 ── */}
              {priceResult && (
                <div className="border border-green-200 rounded-lg p-4 bg-green-50">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-lg font-semibold text-gray-800">💰 예상 금액</h3>
                    <button
                      type="button"
                      onClick={calculatePrice}
                      disabled={priceLoading}
                      className="px-3 py-1 text-sm bg-white border border-green-500 text-green-700 rounded hover:bg-green-50 disabled:opacity-50 transition-colors"
                    >
                      {priceLoading ? '계산 중...' : '🔄 재계산'}
                    </button>
                  </div>

                  <div className="space-y-1 mb-3">
                    {priceResult.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-sm">
                        <span className="text-gray-600">{item.label} × {item.count}명</span>
                        <span className="font-medium">{formatVND(item.total)}</span>
                      </div>
                    ))}
                  </div>

                  {priceResult.items.length > 0 && (
                    <div className="flex justify-between text-sm font-medium border-t border-green-200 pt-2">
                      <span>객실 소계</span>
                      <span>{formatVND(priceResult.subtotal)}</span>
                    </div>
                  )}

                  {priceResult.surcharges.length > 0 && (
                    <div className="mt-3 border-t border-green-200 pt-2">
                      <h4 className="text-sm font-medium text-orange-700 mb-1">📅 공휴일 추가요금</h4>
                      {priceResult.surcharges.map((surcharge, idx) => (
                        <div key={idx} className="flex justify-between text-sm">
                          <span className={surcharge.is_confirmed ? 'text-orange-600' : 'text-gray-400'}>
                            {surcharge.holiday_name}
                            {!surcharge.is_confirmed && ' (미정)'}
                          </span>
                          <span className={`font-medium ${surcharge.is_confirmed ? 'text-orange-600' : 'text-gray-400 line-through'}`}>
                            {formatVND(surcharge.total)}
                          </span>
                        </div>
                      ))}
                      {priceResult.surcharge_total > 0 && (
                        <div className="flex justify-between text-sm font-medium mt-1">
                          <span className="text-orange-700">추가요금 소계</span>
                          <span className="text-orange-700">{formatVND(priceResult.surcharge_total)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {priceResult.has_unconfirmed_surcharge && (
                    <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-700">
                      ⚠️ 미확정 추가요금이 있습니다. 최종 금액은 변동될 수 있습니다.
                    </div>
                  )}

                  {priceResult.tour_options && priceResult.tour_options.length > 0 && (
                    <div className="mt-3 border-t border-green-200 pt-2">
                      <h4 className="text-sm font-medium text-purple-700 mb-1">🎯 선택 옵션</h4>
                      {priceResult.tour_options.map((opt, idx) => (
                        <div key={idx} className="flex justify-between text-sm">
                          <span className="text-purple-600">{opt.label} × {opt.count}</span>
                          <span className="font-medium text-purple-600">{formatVND(opt.total)}</span>
                        </div>
                      ))}
                      {priceResult.option_total > 0 && (
                        <div className="flex justify-between text-sm font-medium mt-1">
                          <span className="text-purple-700">옵션 소계</span>
                          <span className="text-purple-700">{formatVND(priceResult.option_total)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {priceResult.rate_card.season_name && (
                    <div className="mt-2 text-xs text-gray-500">
                      🏷️ 적용 시즌: {priceResult.rate_card.season_name}
                      {priceResult.rate_card.is_promotion && ' (프로모션)'}
                    </div>
                  )}

                  <div className="flex justify-between text-lg font-bold mt-3 border-t-2 border-green-300 pt-3">
                    <span className="text-gray-800">총 예상 금액</span>
                    <span className="text-green-700">{formatVND(priceResult.grand_total)}</span>
                  </div>

                  {/* 패키지 선택 시 패키지 가격 표시 */}
                  {selectedPackage && (
                    <div className="mt-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                      <div className="flex justify-between text-sm font-medium text-purple-700 mb-1">
                        <span>🎁 {selectedPackage.name} (2인 기준)</span>
                        <span>{formatVND(selectedPackage.price_config?.price_2_person || selectedPackage.base_price)}</span>
                      </div>
                      <div className="text-xs text-purple-600">
                        ※ 패키지 가격은 2인 정가 기준이며, 객실 요금과 별도로 제공되는 프로모션입니다.
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 차량 선택 영역 */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-800">🚗 차량 선택</h3>
                {vehicles.map((vehicle, vehicleIndex) => (
                  <div key={vehicleIndex} className="border border-green-200 rounded-lg p-4 bg-green-50">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium text-gray-900">차량 {vehicleIndex + 1}</h4>
                      {vehicles.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveVehicle(vehicleIndex)}
                          className="text-red-600 hover:text-red-800 text-sm"
                        >
                          삭제
                        </button>
                      )}
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">이용방식</label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {WAY_TYPE_OPTIONS.map((wt) => (
                            <button
                              key={wt}
                              type="button"
                              onClick={() => handleVehicleChange(vehicleIndex, 'wayType', wt)}
                              className={`p-2 rounded-lg border text-sm font-medium transition-all ${vehicle.wayType === wt
                                ? 'border-blue-500 bg-blue-50 text-blue-700'
                                : 'border-gray-200 bg-white hover:border-blue-300 text-gray-700'
                                }`}
                            >
                              {wt}
                            </button>
                          ))}
                        </div>
                      </div>

                      {vehicle.wayType && (
                        <div>
                          <label className="block text-sm font-medium text-gray-600 mb-1">경로</label>
                          <select
                            value={vehicle.route}
                            onChange={(e) => handleVehicleChange(vehicleIndex, 'route', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-green-500 bg-white"
                          >
                            <option value="">경로를 선택하세요</option>
                            {routeOptions.map(route => (
                              <option key={route} value={route}>{route}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {(vehicle.wayType && vehicle.route) && (
                        <div>
                          <label className="block text-sm font-medium text-gray-600 mb-1">차량타입</label>
                          <select
                            value={vehicle.carType}
                            onChange={(e) => handleVehicleChange(vehicleIndex, 'carType', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-green-500 bg-white"
                          >
                            <option value="">차량타입 선택</option>
                            {vehicle.carTypeOptions.map((carType: string) => (
                              <option key={carType} value={carType}>{carType}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">차량 수량</label>
                        <input
                          type="number" min="1"
                          value={vehicle.count}
                          onChange={(e) => handleVehicleChange(vehicleIndex, 'count', parseInt(e.target.value) || 1)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-green-500"
                        />
                      </div>
                    </div>
                  </div>
                ))}

                {vehicles.length < 3 && (
                  <button
                    type="button"
                    onClick={handleAddVehicle}
                    className="w-full border-2 border-dashed border-green-300 rounded-lg p-4 text-green-600 hover:border-green-400 hover:text-green-700 transition-colors"
                  >
                    + 차량 추가 (최대 3개)
                  </button>
                )}

                {vehicles.some(v => v.wayType && v.route && v.carType) && (
                  <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                    <h4 className="font-semibold text-green-800 mb-2">✅ 차량 선택 요약</h4>
                    <div className="space-y-2 text-sm text-green-700">
                      {vehicles.map((v, idx) => (
                        <div key={idx}>
                          차량 {idx + 1}: {v.wayType || '-'} / {v.route || '-'} / {v.carType || '-'} / 수량 {v.count || 1}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 특별 요청사항 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">특별 요청사항</label>
                <textarea
                  value={formData.special_requests}
                  onChange={(e) => setFormData({ ...formData, special_requests: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="특별한 요청사항이 있으시면 입력해주세요..."
                />
              </div>
            </div>

            {/* 제출 버튼 */}
            <div className="flex justify-end space-x-4 mt-6">
              <button
                type="button"
                onClick={() => router.back()}
                className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {loading ? '저장 중...' : priceResult ? `견적 추가 (${formatVND(priceResult.grand_total)})` : '견적 추가'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function CruiseQuoteNewPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center h-64">로딩 중...</div>}>
      <CruiseQuoteNewContent />
    </Suspense>
  );
}
