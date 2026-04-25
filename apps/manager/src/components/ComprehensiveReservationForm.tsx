'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import SectionBox from '@/components/SectionBox';
import RoomSelect from '@/components/RoomSelect';
import { CarCategorySelect } from '@/components/CarSelectComponents';
import PaymentSelect from '@/components/PaymentSelect';
import CategoryInputRow from '@/components/CategoryInputRow';
import {
  Ship,
  Plane,
  Building,
  Car,
  User,
  Calendar,
  MapPin,
  Phone,
  Mail
} from 'lucide-react';

interface ReservationFormData {
  // 신청자 정보
  applicant_name: string;
  applicant_email: string;
  applicant_phone: string;

  // 크루즈 기본 정보
  cruise_code: string;
  schedule_code: string;
  payment_code: string;
  departure_date: string;
  return_date: string;
  departure_port: string;
  special_requests: string;

  // 객실 정보 (배열)
  rooms: Array<{
    room_code: string;
    categoryCounts: { [key: string]: number };
  }>;

  // 차량 정보 (배열)
  cars: Array<{
    car_code: string;
    categoryCounts: { [key: string]: number };
  }>;

  // 공항 서비스
  airport_services: Array<{
    airport_code: string;
    passenger_count: number;
    special_requests: string;
  }>;

  // 호텔 서비스
  hotel_services: Array<{
    hotel_code: string;
    special_requests: string;
  }>;
}

export default function ComprehensiveReservationForm() {
  const router = useRouter();
  const [formData, setFormData] = useState<ReservationFormData>({
    applicant_name: '',
    applicant_email: '',
    applicant_phone: '',
    cruise_code: '',
    schedule_code: '',
    payment_code: '',
    departure_date: '',
    return_date: '',
    departure_port: '',
    special_requests: '',
    rooms: [{ room_code: '', categoryCounts: {} }],
    cars: [{ car_code: '', categoryCounts: {} }],
    airport_services: [],
    hotel_services: []
  });

  const [loading, setLoading] = useState(false);
  const [showServices, setShowServices] = useState({
    cruise: true,
    airport: false,
    hotel: false
  });

  // 현재 사용자 정보 자동 입력
  useEffect(() => {
    loadUserInfo();
  }, []);

  const loadUserInfo = async () => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) return;

      // 사용자 정보가 있으면 자동 입력
      setFormData(prev => ({
        ...prev,
        applicant_email: user.email || '',
      }));

      // users 테이블에서 추가 정보 조회
      const { data: userData, error: profileError } = await supabase
        .from('users')
        .select('name, phone')
        .eq('id', user.id)
        .single();

      if (!profileError && userData) {
        setFormData(prev => ({
          ...prev,
          applicant_name: userData.name || '',
          applicant_phone: userData.phone || '',
        }));
      }
    } catch (error) {
      console.error('사용자 정보 로딩 실패:', error);
    }
  };

  const handleRoomChange = (index: number, field: string, value: any) => {
    const updatedRooms = [...formData.rooms];
    if (field === 'categoryCounts') {
      updatedRooms[index] = { ...updatedRooms[index], categoryCounts: value };
    } else {
      updatedRooms[index] = { ...updatedRooms[index], [field]: value };
    }
    setFormData({ ...formData, rooms: updatedRooms });
  };

  const handleCarChange = (index: number, field: string, value: any) => {
    const updatedCars = [...formData.cars];
    if (field === 'categoryCounts') {
      updatedCars[index] = { ...updatedCars[index], categoryCounts: value };
    } else {
      updatedCars[index] = { ...updatedCars[index], [field]: value };
    }
    setFormData({ ...formData, cars: updatedCars });
  };

  const addRoom = () => {
    if (formData.rooms.length < 3) {
      setFormData({
        ...formData,
        rooms: [...formData.rooms, { room_code: '', categoryCounts: {} }]
      });
    }
  };

  const removeRoom = (index: number) => {
    if (formData.rooms.length > 1) {
      const updatedRooms = formData.rooms.filter((_, i) => i !== index);
      setFormData({ ...formData, rooms: updatedRooms });
    }
  };

  const addCar = () => {
    if (formData.cars.length < 3) {
      setFormData({
        ...formData,
        cars: [...formData.cars, { car_code: '', categoryCounts: {} }]
      });
    }
  };

  const removeCar = (index: number) => {
    if (formData.cars.length > 1) {
      const updatedCars = formData.cars.filter((_, i) => i !== index);
      setFormData({ ...formData, cars: updatedCars });
    }
  };

  const addAirportService = () => {
    setFormData({
      ...formData,
      airport_services: [...formData.airport_services, {
        airport_code: '',
        passenger_count: 1,
        special_requests: ''
      }]
    });
  };

  const removeAirportService = (index: number) => {
    const updatedServices = formData.airport_services.filter((_, i) => i !== index);
    setFormData({ ...formData, airport_services: updatedServices });
  };

  const addHotelService = () => {
    setFormData({
      ...formData,
      hotel_services: [...formData.hotel_services, {
        hotel_code: '',
        special_requests: ''
      }]
    });
  };

  const removeHotelService = (index: number) => {
    const updatedServices = formData.hotel_services.filter((_, i) => i !== index);
    setFormData({ ...formData, hotel_services: updatedServices });
  };

  const validateForm = () => {
    if (!formData.applicant_name) {
      alert('신청자 이름을 입력해주세요.');
      return false;
    }
    if (!formData.applicant_email) {
      alert('신청자 이메일을 입력해주세요.');
      return false;
    }
    if (!formData.cruise_code) {
      alert('크루즈를 선택해주세요.');
      return false;
    }
    if (!formData.departure_date) {
      alert('출발 날짜를 선택해주세요.');
      return false;
    }

    // 객실 검증
    for (let i = 0; i < formData.rooms.length; i++) {
      const room = formData.rooms[i];
      if (!room.room_code) {
        alert(`${i + 1}번째 객실 타입을 선택해주세요.`);
        return false;
      }
      const totalCount = Object.values(room.categoryCounts).reduce((sum, count) => sum + count, 0);
      if (totalCount === 0) {
        alert(`${i + 1}번째 객실의 인원을 입력해주세요.`);
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setLoading(true);

    try {
      // 1. 현재 사용자 확인
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        alert('로그인이 필요합니다.');
        router.push('/login');
        return;
      }

      // 2. 사용자가 users 테이블에 등록되어 있는지 확인 (예약자로 등록)
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .single();

      if (!existingUser) {
        // 예약 시점에 users 테이블에 등록
        await supabase.from('users').insert({
          id: user.id,
          email: user.email,
          role: 'member',
          name: formData.applicant_name,
          phone: formData.applicant_phone,
          created_at: new Date().toISOString()
        });
      }

      // 3. 메인 예약 생성
      const reservationId = crypto.randomUUID();
      const { error: reservationError } = await supabase
        .from('reservation')
        .insert({
          re_id: reservationId,
          re_user_id: user.id,
          re_type: 'cruise',
          re_status: 'pending',
          re_created_at: new Date().toISOString(),
          re_quote_id: null, // 필요시 견적 연결
          // 신청자 정보 저장
          applicant_name: formData.applicant_name,
          applicant_email: formData.applicant_email,
          applicant_phone: formData.applicant_phone,
          application_datetime: new Date().toISOString()
        });

      if (reservationError) {
        throw new Error('예약 생성 실패: ' + reservationError.message);
      }

      // 4. 크루즈 서비스 생성
      const { error: cruiseError } = await supabase
        .from('reservation_cruise')
        .insert({
          reservation_id: reservationId,
          cruise_code: formData.cruise_code,
          schedule_code: formData.schedule_code,
          payment_code: formData.payment_code,
          departure_date: formData.departure_date,
          return_date: formData.return_date,
          departure_port: formData.departure_port,
          special_requests: formData.special_requests,
          checkin: formData.departure_date,
          guest_count: formData.rooms.reduce((total, room) =>
            total + Object.values(room.categoryCounts).reduce((sum, count) => sum + count, 0), 0
          )
        });

      if (cruiseError) {
        throw new Error('크루즈 서비스 생성 실패: ' + cruiseError.message);
      }

      // 5. 객실 서비스들 생성
      for (const room of formData.rooms) {
        if (room.room_code) {
          const { error: roomError } = await supabase
            .from('reservation_room')
            .insert({
              reservation_id: reservationId,
              room_code: room.room_code,
              room_price_code: '', // 가격 코드는 별도 업데이트
              guest_count: Object.values(room.categoryCounts).reduce((sum, count) => sum + count, 0),
              category_details: room.categoryCounts
            });

          if (roomError) {
            throw new Error('객실 서비스 생성 실패: ' + roomError.message);
          }
        }
      }

      // 6. 차량 서비스들 생성
      for (const car of formData.cars) {
        if (car.car_code) {
          const { error: carError } = await supabase
            .from('reservation_car')
            .insert({
              reservation_id: reservationId,
              car_code: car.car_code,
              car_price_code: '', // 가격 코드는 별도 업데이트
              car_count: Object.values(car.categoryCounts).reduce((sum, count) => sum + count, 0),
              category_details: car.categoryCounts
            });

          if (carError) {
            throw new Error('차량 서비스 생성 실패: ' + carError.message);
          }
        }
      }

      // 7. 공항 서비스들 생성
      for (const airport of formData.airport_services) {
        if (airport.airport_code) {
          const { error: airportError } = await supabase
            .from('reservation_airport')
            .insert({
              ra_reservation_id: reservationId,
              airport_code: airport.airport_code,
              ra_passenger_count: airport.passenger_count,
              request_note: airport.special_requests
            });

          if (airportError) {
            throw new Error('공항 서비스 생성 실패: ' + airportError.message);
          }
        }
      }

      // 8. 호텔 서비스들 생성
      for (const hotel of formData.hotel_services) {
        if (hotel.hotel_code) {
          const { error: hotelError } = await supabase
            .from('reservation_hotel')
            .insert({
              reservation_id: reservationId,
              hotel_code: hotel.hotel_code,
              special_requests: hotel.special_requests
            });

          if (hotelError) {
            console.warn('호텔 서비스 생성 실패:', hotelError.message);
          }
        }
      }

      alert('예약 신청이 완료되었습니다!\n담당자 확인 후 연락드리겠습니다.');
      router.push('/mypage/reservations');

    } catch (error) {
      console.error('예약 신청 실패:', error);
      alert('예약 신청 중 오류가 발생했습니다: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 신청자 정보 */}
      <SectionBox title="신청자 정보">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2 flex items-center gap-2">
              <User className="w-4 h-4" />
              신청자 이름 *
            </label>
            <input
              type="text"
              value={formData.applicant_name}
              onChange={(e) => setFormData({ ...formData, applicant_name: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="이름을 입력하세요"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2 flex items-center gap-2">
              <Mail className="w-4 h-4" />
              이메일 *
            </label>
            <input
              type="email"
              value={formData.applicant_email}
              onChange={(e) => setFormData({ ...formData, applicant_email: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="이메일을 입력하세요"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2 flex items-center gap-2">
              <Phone className="w-4 h-4" />
              연락처
            </label>
            <input
              type="tel"
              value={formData.applicant_phone}
              onChange={(e) => setFormData({ ...formData, applicant_phone: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="연락처를 입력하세요"
            />
          </div>
        </div>
      </SectionBox>

      {/* 서비스 선택 */}
      <SectionBox title="예약 서비스 선택">
        <div className="grid md:grid-cols-3 gap-4">
          <label className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
            <input
              type="checkbox"
              checked={showServices.cruise}
              onChange={(e) => setShowServices({ ...showServices, cruise: e.target.checked })}
              className="rounded"
            />
            <Ship className="w-5 h-5 text-blue-600" />
            <span>크루즈 예약</span>
          </label>
          <label className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
            <input
              type="checkbox"
              checked={showServices.airport}
              onChange={(e) => setShowServices({ ...showServices, airport: e.target.checked })}
              className="rounded"
            />
            <Plane className="w-5 h-5 text-green-600" />
            <span>공항 서비스</span>
          </label>
          <label className="flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
            <input
              type="checkbox"
              checked={showServices.hotel}
              onChange={(e) => setShowServices({ ...showServices, hotel: e.target.checked })}
              className="rounded"
            />
            <Building className="w-5 h-5 text-purple-600" />
            <span>호텔 예약</span>
          </label>
        </div>
      </SectionBox>

      {/* 크루즈 예약 */}
      {showServices.cruise && (
        <>
          <SectionBox title="크루즈 정보">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">크루즈 *</label>
                <select
                  value={formData.cruise_code}
                  onChange={(e) => setFormData({ ...formData, cruise_code: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="">크루즈 선택</option>
                  <option value="VOYAGER">보이저호</option>
                  <option value="SPECTRUM">스펙트럼호</option>
                  <option value="QUANTUM">퀀텀호</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">스케줄</label>
                <select
                  value={formData.schedule_code}
                  onChange={(e) => setFormData({ ...formData, schedule_code: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="">스케줄 선택</option>
                  <option value="4N5D">4박5일</option>
                  <option value="5N6D">5박6일</option>
                  <option value="7N8D">7박8일</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">출발일 *</label>
                <input
                  type="date"
                  value={formData.departure_date}
                  onChange={(e) => setFormData({ ...formData, departure_date: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">귀항일</label>
                <input
                  type="date"
                  value={formData.return_date}
                  onChange={(e) => setFormData({ ...formData, return_date: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">출발항</label>
                <select
                  value={formData.departure_port}
                  onChange={(e) => setFormData({ ...formData, departure_port: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="">출발항 선택</option>
                  <option value="인천">인천항</option>
                  <option value="부산">부산항</option>
                  <option value="제주">제주항</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">결제방식</label>
                <select
                  value={formData.payment_code}
                  onChange={(e) => setFormData({ ...formData, payment_code: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="">결제방식 선택</option>
                  <option value="CARD">카드결제</option>
                  <option value="BANK">무통장입금</option>
                  <option value="INSTALLMENT">할부결제</option>
                </select>
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium mb-2">특별 요청사항</label>
              <textarea
                value={formData.special_requests}
                onChange={(e) => setFormData({ ...formData, special_requests: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                rows={3}
                placeholder="특별한 요청사항이 있으시면 입력해주세요"
              />
            </div>
          </SectionBox>

          {/* 객실 정보 */}
          <SectionBox title="객실 정보">
            {formData.rooms.map((room, index) => (
              <div key={index} className="border rounded-lg p-4 mb-4">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-medium">객실 {index + 1}</h4>
                  {formData.rooms.length > 1 && (
                    <button
                      onClick={() => removeRoom(index)}
                      className="text-red-500 hover:text-red-700"
                    >
                      삭제
                    </button>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">객실 타입</label>
                  <select
                    value={room.room_code}
                    onChange={(e) => handleRoomChange(index, 'room_code', e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="">객실 선택</option>
                    <option value="IS">내부객실</option>
                    <option value="OS">해측객실</option>
                    <option value="BS">발코니객실</option>
                    <option value="SU">스위트룸</option>
                  </select>
                </div>
                <div className="mt-4">
                  <label className="block text-sm font-medium mb-2">인동 구성</label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {['성인', '아동', '싱글차지', '엑스트라 성인', '엑스트라 아동'].map((category) => (
                      <div key={category}>
                        <CategoryInputRow
                          category={category}
                          value={room.categoryCounts[category] || 0}
                          onChange={(val) => {
                            const newCounts = { ...room.categoryCounts, [category]: val };
                            handleRoomChange(index, 'categoryCounts', newCounts);
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
            {formData.rooms.length < 3 && (
              <button
                onClick={addRoom}
                className="w-full bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600"
              >
                + 객실 추가
              </button>
            )}
          </SectionBox>

          {/* 차량 정보 */}
          <SectionBox title="차량 정보">
            {formData.cars.map((car, index) => (
              <div key={index} className="border rounded-lg p-4 mb-4">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-medium">차량 {index + 1}</h4>
                  {formData.cars.length > 1 && (
                    <button
                      onClick={() => removeCar(index)}
                      className="text-red-500 hover:text-red-700"
                    >
                      삭제
                    </button>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">차량 타입</label>
                  <select
                    value={car.car_code}
                    onChange={(e) => handleCarChange(index, 'car_code', e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="">차량 선택</option>
                    <option value="SEDAN">승용차</option>
                    <option value="VAN">승합차</option>
                    <option value="BUS">버스</option>
                    <option value="MINIBUS">미니버스</option>
                  </select>
                </div>
                <div className="mt-4">
                  <label className="block text-sm font-medium mb-2">이용 인동</label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {['성인', '아동', '싱글차지', '엑스트라 성인', '엑스트라 아동'].map((category) => (
                      <div key={category}>
                        <CategoryInputRow
                          category={category}
                          value={car.categoryCounts[category] || 0}
                          onChange={(val) => {
                            const newCounts = { ...car.categoryCounts, [category]: val };
                            handleCarChange(index, 'categoryCounts', newCounts);
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
            {formData.cars.length < 3 && (
              <button
                onClick={addCar}
                className="w-full bg-green-500 text-white py-2 rounded-lg hover:bg-green-600"
              >
                + 차량 추가
              </button>
            )}
          </SectionBox>
        </>
      )}

      {/* 공항 서비스 */}
      {showServices.airport && (
        <SectionBox title="공항 서비스">
          {formData.airport_services.map((service, index) => (
            <div key={index} className="border rounded-lg p-4 mb-4">
              <div className="flex justify-between items-center mb-3">
                <h4 className="font-medium">공항 서비스 {index + 1}</h4>
                <button
                  onClick={() => removeAirportService(index)}
                  className="text-red-500 hover:text-red-700"
                >
                  삭제
                </button>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">공항</label>
                  <select
                    value={service.airport_code}
                    onChange={(e) => {
                      const updated = [...formData.airport_services];
                      updated[index].airport_code = e.target.value;
                      setFormData({ ...formData, airport_services: updated });
                    }}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="">공항 선택</option>
                    <option value="ICN">인천국제공항</option>
                    <option value="GMP">김포공항</option>
                    <option value="PUS">김해국제공항</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">이용인동</label>
                  <input
                    type="number"
                    min="1"
                    value={service.passenger_count}
                    onChange={(e) => {
                      const updated = [...formData.airport_services];
                      updated[index].passenger_count = Number(e.target.value);
                      setFormData({ ...formData, airport_services: updated });
                    }}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>
              <div className="mt-4">
                <label className="block text-sm font-medium mb-2">요청사항</label>
                <textarea
                  value={service.special_requests}
                  onChange={(e) => {
                    const updated = [...formData.airport_services];
                    updated[index].special_requests = e.target.value;
                    setFormData({ ...formData, airport_services: updated });
                  }}
                  className="w-full px-3 py-2 border rounded-lg"
                  rows={2}
                />
              </div>
            </div>
          ))}
          <button
            onClick={addAirportService}
            className="w-full bg-green-500 text-white py-2 rounded-lg hover:bg-green-600"
          >
            + 공항 서비스 추가
          </button>
        </SectionBox>
      )}

      {/* 호텔 서비스 */}
      {showServices.hotel && (
        <SectionBox title="호텔 예약">
          {formData.hotel_services.map((service, index) => (
            <div key={index} className="border rounded-lg p-4 mb-4">
              <div className="flex justify-between items-center mb-3">
                <h4 className="font-medium">호텔 {index + 1}</h4>
                <button
                  onClick={() => removeHotelService(index)}
                  className="text-red-500 hover:text-red-700"
                >
                  삭제
                </button>
              </div>
              <div className="grid md:grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">호텔</label>
                  <select
                    value={service.hotel_code}
                    onChange={(e) => {
                      const updated = [...formData.hotel_services];
                      updated[index].hotel_code = e.target.value;
                      setFormData({ ...formData, hotel_services: updated });
                    }}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="">호텔 선택</option>
                    <option value="LOTTE">롯데호텔</option>
                    <option value="HYATT">하얏트호텔</option>
                    <option value="SHERATON">쉐라톤호텔</option>
                  </select>
                </div>
              </div>
              <div className="mt-4">
                <label className="block text-sm font-medium mb-2">요청사항</label>
                <textarea
                  value={service.special_requests}
                  onChange={(e) => {
                    const updated = [...formData.hotel_services];
                    updated[index].special_requests = e.target.value;
                    setFormData({ ...formData, hotel_services: updated });
                  }}
                  className="w-full px-3 py-2 border rounded-lg"
                  rows={2}
                />
              </div>
            </div>
          ))}
          <button
            onClick={addHotelService}
            className="w-full bg-purple-500 text-white py-2 rounded-lg hover:bg-purple-600"
          >
            + 호텔 추가
          </button>
        </SectionBox>
      )}

      {/* 예약 신청 버튼 */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
        >
          {loading ? '예약 신청 중...' : '🎯 예약 신청하기'}
        </button>
        <p className="text-sm text-gray-600 mt-2 text-center">
          신청 후 담당자 확인을 거쳐 최종 예약이 확정됩니다.
        </p>
      </div>
    </div>
  );
}

