'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '@/lib/supabase';
import PageWrapper from '@/components/PageWrapper';
import SectionBox from '@/components/SectionBox';
import SelectableButton from '@/components/SelectableButton';

// TypeScript 인터페이스
interface CruiseFormData {
  cruise_name: string;
  departure_date: string;
  return_date: string;
  departure_port: string;
  room_type: string;
  adult_count: number;
  child_count: number;
  infant_count: number;
  special_requests: string;
  schedule_code: string;
  cruise_code: string;
  payment_code: string;
  discount_rate: number;
  rooms_detail: string;
  vehicle_detail: string;
}

interface Room {
  room_code: string;
  category: string;
  adult_count: number;
  child_count: number;
  infant_count: number;
  extra_adult_count: number;
  extra_child_count: number;
  additional_categories: Array<{category: string, count: number}>;
}

interface Vehicle {
  car_code: string;
  count: number;
}

export default function CruiseQuotePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const quoteId = searchParams.get('quote_id');

  // 상태 관리
  const [loading, setLoading] = useState(false);
  const [cruiseOptions, setCruiseOptions] = useState<any[]>([]);
  const [scheduleOptions, setScheduleOptions] = useState<any[]>([]);
  const [paymentOptions, setPaymentOptions] = useState<any[]>([]);
  const [roomOptions, setRoomOptions] = useState<any[]>([]);
  const [carOptions, setCarOptions] = useState<any[]>([]);
  const [vehicleCategoryOptions, setVehicleCategoryOptions] = useState<any[]>([]);
  const [selectedVehicleCategory, setSelectedVehicleCategory] = useState('');

  // 폼 상태
  const [form, setForm] = useState({
    checkin: '',
    schedule: '',
    cruise_code: '',
    payment_code: '',
    discount_rate: 0,
    rooms: [{
      room_code: '',
      category: '',
      adult_count: 0,
      child_count: 0,
      infant_count: 0,
      extra_adult_count: 0,
      extra_child_count: 0,
      additional_categories: [] as Array<{category: string, count: number}>
    }] as Room[]
  });

  const [vehicleForm, setVehicleForm] = useState<Vehicle[]>([
    { car_code: '', count: 1 }
  ]);

  // 초기 데이터 로드
  useEffect(() => {
    if (!quoteId) {
      alert('견적 ID가 필요합니다.');
      router.push('/mypage');
      return;
    }

    const fetchInitialData = async () => {
      try {
        // 기본 옵션들 로드
        const [cruiseRes, scheduleRes, paymentRes, roomRes, carRes, vehicleCatRes] = await Promise.all([
          supabase.from('cruise_info').select('*').order('name'),
          supabase.from('schedule_info').select('*').order('days'),
          supabase.from('payment_info').select('*').order('code'),
          supabase.from('room_code').select('*').order('name'),
          supabase.from('car_code').select('*').order('name'),
          supabase.from('car_category').select('*').order('name')
        ]);

        if (cruiseRes.data) setCruiseOptions(cruiseRes.data);
        if (scheduleRes.data) setScheduleOptions(scheduleRes.data);
        if (paymentRes.data) setPaymentOptions(paymentRes.data);
        if (roomRes.data) setRoomOptions(roomRes.data);
        if (carRes.data) setCarOptions(carRes.data);
        if (vehicleCatRes.data) setVehicleCategoryOptions(vehicleCatRes.data);

      } catch (error) {
        console.error('초기 데이터 로드 오류:', error);
      }
    };

    fetchInitialData();
  }, [quoteId, router]);

  // 코드 조회 함수들 (투어 페이지와 동일한 방식)
  const getCruiseCodeFromConditions = async (schedule: string, cruise: string, payment: string, roomType: string, checkin: string) => {
    try {
      const { data, error } = await supabase
        .from('room_price')
        .select('room_code')
        .eq('schedule', schedule)
        .eq('cruise', cruise)
        .eq('payment', payment)
        .eq('room_type', roomType)
        .lte('start_date', checkin)
        .gte('end_date', checkin)
        .single();

      if (error) throw error;
      return data.room_code;
    } catch (error) {
      console.error('❌ 크루즈 코드 조회 실패:', error);
      return '';
    }
  };

  const getCarCodeFromConditions = async (schedule: string, cruise: string, carCategory: string, carType: string) => {
    try {
      const { data, error } = await supabase
        .from('car_price')
        .select('car_code')
        .eq('schedule', schedule)
        .eq('cruise', cruise)
        .eq('car_category', carCategory)
        .eq('car_type', carType)
        .single();

      if (error) throw error;
      return data.car_code;
    } catch (error) {
      console.error('❌ 차량 코드 조회 실패:', error);
      return '';
    }
  };

  // handleSubmit - 투어 페이지 방식으로 간단화
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!quoteId) {
      alert('견적 ID가 없습니다.');
      return;
    }

    if (!form.checkin || !form.schedule || !form.cruise_code || !form.payment_code) {
      alert('필수 항목을 모두 입력해주세요.');
      return;
    }

    setLoading(true);
    try {
      console.log('🔍 크루즈 및 관련 서비스 생성 시도...');
      
      // 1. 크루즈 서비스 생성
      const cruiseFormData: CruiseFormData = {
        cruise_name: form.cruise_code,
        departure_date: form.checkin,
        return_date: form.checkin,
        departure_port: '',
        room_type: form.rooms[0]?.room_code || '',
        adult_count: form.rooms.reduce((sum, room) => sum + (room.adult_count || 0), 0),
        child_count: form.rooms.reduce((sum, room) => sum + (room.child_count || 0), 0),
        infant_count: form.rooms.reduce((sum, room) => sum + (room.infant_count || 0), 0),
        special_requests: `일정: ${form.schedule}, 크루즈: ${form.cruise_code}, 결제방식: ${form.payment_code}`,
        schedule_code: form.schedule,
        cruise_code: form.cruise_code,
        payment_code: form.payment_code,
        discount_rate: form.discount_rate,
        rooms_detail: JSON.stringify(form.rooms),
        vehicle_detail: JSON.stringify(vehicleForm)
      };

      const { data: cruiseData, error: cruiseError } = await supabase
        .from('cruise')
        .insert(cruiseFormData)
        .select()
        .single();

      if (cruiseError) {
        console.error('❌ 크루즈 서비스 생성 오류:', cruiseError);
        alert(`크루즈 서비스 생성 실패: ${cruiseError.message}`);
        return;
      }

      console.log('✅ 크루즈 서비스 생성 성공:', cruiseData);

      // 2. 크루즈 견적 아이템 생성
      const { data: itemData, error: itemError } = await supabase
        .from('quote_item')
        .insert({
          quote_id: quoteId,
          service_type: 'cruise',
          service_ref_id: cruiseData.id,
          quantity: 1,
          unit_price: 0,
          total_price: 0
        })
        .select()
        .single();

      if (itemError) {
        console.error('❌ 견적 아이템 생성 오류:', itemError);
        alert(`견적 아이템 생성 실패: ${itemError.message}`);
        return;
      }

      console.log('✅ 견적 아이템 생성 성공:', itemData);

      // 3. 객실 정보 저장 (투어 방식과 동일하게 간단화)
      for (let i = 0; i < form.rooms.length; i++) {
        const room = form.rooms[i];
        if (room.room_code) {
          console.log(`🏨 객실 ${i+1} 저장 시도...`);
          
          // 실시간으로 크루즈 코드 조회 (투어 방식과 동일)
          const finalRoomCode = await getCruiseCodeFromConditions(
            form.schedule, 
            form.cruise_code, 
            form.payment_code, 
            room.room_code, 
            form.checkin
          ) || room.room_code;
          
          console.log(`✅ 사용할 room_code: ${finalRoomCode}`);
          
          const roomData = {
            quote_id: quoteId,
            room_code: finalRoomCode,
            room_type: room.room_code,
            category: room.category,
            adult_count: room.adult_count,
            child_count: room.child_count,
            infant_count: room.infant_count,
            extra_adult_count: room.extra_adult_count,
            extra_child_count: room.extra_child_count,
            base_price: 0
          };

          const { data: roomResult, error: roomError } = await supabase
            .from('room')
            .insert([roomData])
            .select()
            .single();

          if (roomError) {
            console.error(`❌ 객실 ${i+1} 생성 오류:`, roomError);
          } else {
            console.log(`✅ 객실 ${i+1} 생성 성공:`, roomResult);

            // room 서비스에 대한 quote_item 생성
            const { data: roomItemData, error: roomItemError } = await supabase
              .from('quote_item')
              .insert({
                quote_id: quoteId,
                service_type: 'room',
                service_ref_id: roomResult.id,
                quantity: 1,
                unit_price: 0,
                total_price: 0
              })
              .select()
              .single();

            if (roomItemError) {
              console.error(`❌ 객실 ${i+1} quote_item 생성 오류:`, roomItemError);
            } else {
              console.log(`✅ 객실 ${i+1} quote_item 생성 성공:`, roomItemData);
            }
          }
        }
      }

      // 4. 차량 정보 저장 (투어 방식과 동일하게 간단화)
      for (let i = 0; i < vehicleForm.length; i++) {
        const vehicle = vehicleForm[i];
        if (vehicle.car_code) {
          console.log(`🚗 차량 ${i+1} 저장 시도...`);
          
          // 실시간으로 차량 코드 조회 (투어 방식과 동일)
          const finalCarCode = await getCarCodeFromConditions(
            form.schedule, 
            form.cruise_code, 
            selectedVehicleCategory, 
            vehicle.car_code
          ) || vehicle.car_code;
          
          console.log(`✅ 사용할 car_code: ${finalCarCode}`);
          
          const carData = {
            quote_id: quoteId,
            car_code: finalCarCode,
            car_category: selectedVehicleCategory,
            car_type: vehicle.car_code,
            passenger_count: vehicle.count,
            base_price: 0
          };

          const { data: carResult, error: carError } = await supabase
            .from('car')
            .insert([carData])
            .select()
            .single();

          if (carError) {
            console.error(`❌ 차량 ${i+1} 생성 오류:`, carError);
          } else {
            console.log(`✅ 차량 ${i+1} 생성 성공:`, carResult);

            // car 서비스에 대한 quote_item 생성
            const { data: carItemData, error: carItemError } = await supabase
              .from('quote_item')
              .insert({
                quote_id: quoteId,
                service_type: 'car',
                service_ref_id: carResult.id,
                quantity: vehicle.count,
                unit_price: 0,
                total_price: 0
              })
              .select()
              .single();

            if (carItemError) {
              console.error(`❌ 차량 ${i+1} quote_item 생성 오류:`, carItemError);
            } else {
              console.log(`✅ 차량 ${i+1} quote_item 생성 성공:`, carItemData);
            }
          }
        }
      }

      alert('크루즈 견적이 추가되었습니다!');
      router.push(`/mypage/quotes/${quoteId}/view`);

    } catch (error) {
      console.error('❌ 크루즈 견적 추가 중 오류:', error);
      alert('오류가 발생했습니다: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // UI 핸들러들
  const handleAddRoom = () => {
    if (form.rooms.length < 3) {
      setForm({
        ...form,
        rooms: [...form.rooms, {
          room_code: '',
          category: '',
          adult_count: 0,
          child_count: 0,
          infant_count: 0,
          extra_adult_count: 0,
          extra_child_count: 0,
          additional_categories: []
        }]
      });
    }
  };

  const handleRemoveRoom = (index: number) => {
    if (form.rooms.length > 1) {
      const newRooms = form.rooms.filter((_, i) => i !== index);
      setForm({ ...form, rooms: newRooms });
    }
  };

  const handleRoomChange = (index: number, field: string, value: any) => {
    const newRooms = form.rooms.map((room, i) =>
      i === index ? { ...room, [field]: value } : room
    );
    setForm({ ...form, rooms: newRooms });
  };

  const handleAddVehicle = () => {
    if (vehicleForm.length < 3) {
      setVehicleForm([...vehicleForm, { car_code: '', count: 1 }]);
    }
  };

  const handleRemoveVehicle = (index: number) => {
    if (vehicleForm.length > 1) {
      setVehicleForm(vehicleForm.filter((_, i) => i !== index));
    }
  };

  const handleVehicleChange = (index: number, field: string, value: any) => {
    const updated = vehicleForm.map((vehicle, i) =>
      i === index ? { ...vehicle, [field]: value } : vehicle
    );
    setVehicleForm(updated);
  };

  // 로딩 상태
  if (loading) {
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
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-3xl font-bold mb-8 text-center">크루즈 견적 추가</h1>
        
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-lg p-8">
          {/* 기본 정보 */}
          <SectionBox title="크루즈 기본 정보">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  체크인 날짜 *
                </label>
                <input
                  type="date"
                  value={form.checkin}
                  onChange={(e) => setForm({ ...form, checkin: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  일정 *
                </label>
                <select
                  value={form.schedule}
                  onChange={(e) => setForm({ ...form, schedule: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">일정을 선택하세요</option>
                  {scheduleOptions.map((schedule) => (
                    <option key={schedule.code} value={schedule.code}>
                      {schedule.name} ({schedule.days}일)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  크루즈 *
                </label>
                <select
                  value={form.cruise_code}
                  onChange={(e) => setForm({ ...form, cruise_code: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">크루즈를 선택하세요</option>
                  {cruiseOptions.map((cruise) => (
                    <option key={cruise.code} value={cruise.code}>
                      {cruise.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  결제 방식 *
                </label>
                <select
                  value={form.payment_code}
                  onChange={(e) => setForm({ ...form, payment_code: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">결제방식을 선택하세요</option>
                  {paymentOptions.map((payment) => (
                    <option key={payment.code} value={payment.code}>
                      {payment.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </SectionBox>

          {/* 객실 정보 */}
          <SectionBox title="객실 정보">
            {form.rooms.map((room, index) => (
              <div key={index} className="border rounded-lg p-4 mb-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold">객실 {index + 1}</h3>
                  {form.rooms.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveRoom(index)}
                      className="text-red-500 hover:text-red-700"
                    >
                      삭제
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      객실 타입
                    </label>
                    <select
                      value={room.room_code}
                      onChange={(e) => handleRoomChange(index, 'room_code', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">객실 타입 선택</option>
                      {roomOptions.map((roomOption) => (
                        <option key={roomOption.code} value={roomOption.code}>
                          {roomOption.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      성인 수
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={room.adult_count}
                      onChange={(e) => handleRoomChange(index, 'adult_count', parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      아동 수
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={room.child_count}
                      onChange={(e) => handleRoomChange(index, 'child_count', parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      유아 수
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={room.infant_count}
                      onChange={(e) => handleRoomChange(index, 'infant_count', parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            ))}

            {form.rooms.length < 3 && (
              <button
                type="button"
                onClick={handleAddRoom}
                className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-500 hover:text-blue-500"
              >
                + 객실 추가
              </button>
            )}
          </SectionBox>

          {/* 차량 정보 */}
          <SectionBox title="차량 정보">
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                차량 카테고리
              </label>
              <select
                value={selectedVehicleCategory}
                onChange={(e) => setSelectedVehicleCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">차량 카테고리 선택</option>
                {vehicleCategoryOptions.map((category) => (
                  <option key={category.code} value={category.code}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            {vehicleForm.map((vehicle, index) => (
              <div key={index} className="border rounded-lg p-4 mb-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold">차량 {index + 1}</h3>
                  {vehicleForm.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveVehicle(index)}
                      className="text-red-500 hover:text-red-700"
                    >
                      삭제
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      차량 타입
                    </label>
                    <select
                      value={vehicle.car_code}
                      onChange={(e) => handleVehicleChange(index, 'car_code', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">차량 타입 선택</option>
                      {carOptions.map((carOption) => (
                        <option key={carOption.code} value={carOption.code}>
                          {carOption.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      차량 수
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={vehicle.count}
                      onChange={(e) => handleVehicleChange(index, 'count', parseInt(e.target.value) || 1)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            ))}

            {vehicleForm.length < 3 && (
              <button
                type="button"
                onClick={handleAddVehicle}
                className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-500 hover:text-blue-500"
              >
                + 차량 추가
              </button>
            )}
          </SectionBox>

          {/* 제출 버튼 */}
          <div className="flex justify-end gap-4 mt-8">
            <button
              type="button"
              onClick={() => router.back()}
              className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
            >
              {loading ? '저장 중...' : '크루즈 견적 추가'}
            </button>
          </div>
        </form>
      </div>
    </PageWrapper>
  );
}
