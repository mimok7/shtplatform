'use client';
import React from 'react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import CodeSelect from './CodeSelect';
import QuoteRoomSection from './QuoteRoomSection';
import { setBasePriceAndSyncQuoteItem } from '@/lib/setBasePriceOnCreate';

export default function QuoteForm({
  mode = 'new',
  initialData,
}: {
  mode?: 'new' | 'edit';
  initialData?: any;
}) {
  const router = useRouter();
  const [checkin, setCheckin] = useState('');
  const [scheduleCode, setScheduleCode] = useState('');
  const [cruiseCode, setCruiseCode] = useState('');
  const [paymentCode, setPaymentCode] = useState('');
  const [discountRate, setDiscountRate] = useState(0);
  const [rooms, setRooms] = useState<any[]>([{}]);
  const [quoteId, setQuoteId] = useState<string | null>(null);

  useEffect(() => {
    if (mode === 'edit' && initialData) {
      setCheckin(initialData.checkin ?? '');
      setScheduleCode(initialData.schedule_code ?? '');
      setCruiseCode(initialData.cruise_code ?? '');
      setPaymentCode(initialData.payment_code ?? '');
      setDiscountRate(initialData.discount_rate ?? 0);
      setQuoteId(initialData.id?.toString() ?? null);

      const parsedRooms = (initialData.quote_room ?? []).map((room: any) => ({
        room_code: room.room_code,
        vehicle_code: room.vehicle_code,
        vehicle_category_code: room.vehicle_category_code,
        categoryCounts: (room.quote_room_detail ?? []).reduce((acc: any, r: any) => {
          acc[r.category] = r.person_count;
          return acc;
        }, {}),
      }));

      setRooms(parsedRooms.length > 0 ? parsedRooms : [{}]);
    }
  }, [mode, initialData]);

  const handleSubmit = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return alert('로그인 필요');

    let currentQuoteId = quoteId;
    if (mode === 'new') {
      const { data: quote, error } = await supabase
        .from('quote')
        .insert({
          user_id: user.id,
          checkin,
          schedule_code: scheduleCode,
          cruise_code: cruiseCode,
          payment_code: paymentCode,
          discount_rate: discountRate,
        })
        .select()
        .single();
      if (error || !quote) return alert('견적 저장 실패');
      currentQuoteId = quote.id.toString();
      setQuoteId(quote.id.toString());
    } else {
      // 수정: quote 테이블만 업데이트
      await supabase
        .from('quote')
        .update({
          checkin,
          schedule_code: scheduleCode,
          cruise_code: cruiseCode,
          payment_code: paymentCode,
          discount_rate: discountRate,
        })
        .eq('id', quoteId);
      // 기존 quote_room + detail 삭제
      await supabase.from('quote_room_detail').delete().eq('quote_id', quoteId);
      await supabase.from('quote_room').delete().eq('quote_id', quoteId);
    }

    for (const room of rooms) {
      const { data: roomRow, error: roomErr } = await supabase
        .from('quote_room')
        .insert({
          quote_id: quoteId,
          room_code: room.room_code,
          vehicle_code: room.vehicle_code,
          vehicle_category_code: room.vehicle_category_code,
        })
        .select()
        .single();

      if (!roomRow || roomErr) continue;

      for (const [category, count] of Object.entries(room.categoryCounts || {})) {
        if ((count as number) > 0) {
          await supabase.from('quote_room_detail').insert({
            quote_id: quoteId,
            category,
            person_count: count as number,
            passenger_type: category,
            car_count: 1,
          });
        }
      }
    }

    alert('저장 완료');
    router.push('/mypage');
  };

  // Room 코드 변경 시 자동 가격 업데이트
  const handleRoomCodeChange = async (roomIndex: number, newRoomCode: string) => {
    // 1. 폼 상태 업데이트
    const updatedRooms = [...rooms];
    updatedRooms[roomIndex].room_code = newRoomCode;

    setRooms(updatedRooms);

    // 2. 견적이 저장되어 있고 room_code가 유효한 경우 가격 업데이트
    if (quoteId && newRoomCode) {
      try {
        // room 테이블에서 해당 인덱스의 room 찾기
        const { data: roomData, error: roomError } = await supabase
          .from('room')
          .select('id')
          .eq('quote_id', quoteId)
          .order('created_at');

        if (roomError || !roomData || !roomData[roomIndex]) return;
        const targetRoom = roomData[roomIndex];

        // 베이스 가격 설정 및 동기화
        const result = await setBasePriceAndSyncQuoteItem(
          'room',
          targetRoom.id,
          newRoomCode,
          quoteId!,
          1
        );

        if (result.success) {
          console.log(`Room ${roomIndex + 1} 가격 업데이트 완료: ${result.basePrice}`);
        }
      } catch (error) {
        console.error('Room 가격 업데이트 오류:', error);
      }
    }
  };

  // Car 코드 변경 시 자동 가격 업데이트
  const handleCarCodeChange = async (carIndex: number, newCarCode: string) => {
    // 1. 폼 상태 업데이트
    const updatedCars = [...rooms];
    updatedCars[carIndex].car_code = newCarCode;

    setRooms(updatedCars);

    // 2. 견적이 저장되어 있고 car_code가 유효한 경우 가격 업데이트
    if (quoteId && newCarCode) {
      try {
        const { data: carData, error: carError } = await supabase
          .from('car')
          .select('id')
          .eq('quote_id', quoteId)
          .order('created_at');

        if (carError || !carData || !carData[carIndex]) return;
        const targetCar = carData[carIndex];

        const result = await setBasePriceAndSyncQuoteItem(
          'car',
          targetCar.id,
          newCarCode,
          quoteId!,
          1
        );

        if (result.success) {
          console.log(`Car ${carIndex + 1} 가격 업데이트 완료: ${result.basePrice}`);
        }
      } catch (error) {
        console.error('Car 가격 업데이트 오류:', error);
      }
    }
  };

  // Room 추가 시 체크인 날짜와 함께 자동 베이스 가격 설정
  const handleAddRoom = async () => {
    if (rooms.length >= 3) {
      alert('객실은 최대 3개까지 추가할 수 있습니다.');
      return;
    }

    try {
      const newRoom = {
        room_code: '',
        categoryCounts: { 성인: 0, 아동: 0, 유아: 0 },
        checkin_date: checkin || '', // 견적의 체크인 날짜 사용
      };

      // 1. 견적이 이미 저장된 경우에만 실제 room 데이터 생성
      if (quoteId) {
        const { data: roomData, error: roomError } = await supabase
          .from('room')
          .insert({
            quote_id: quoteId,
            room_code: newRoom.room_code,
            adult_count: newRoom.categoryCounts.성인,
            child_count: newRoom.categoryCounts.아동,
            infant_count: newRoom.categoryCounts.유아,
            checkin_date: newRoom.checkin_date,
          })
          .select()
          .single();

        if (roomError) {
          alert('객실 추가 중 오류가 발생했습니다.');
          return;
        }

        // 2. 베이스 가격 설정 및 quote_item 동기화 (사용일자 포함)
        if (newRoom.room_code) {
          const result = await setBasePriceAndSyncQuoteItem(
            'room',
            roomData.id,
            newRoom.room_code,
            quoteId,
            1
          );

          if (result.success) {
            console.log(`Room 가격 및 사용일자 업데이트 완료: ${result.basePrice}, ${result.usageDate}`);
          }
        }
      }

      // 3. 폼 상태 업데이트
      setRooms((prev) => [...prev, newRoom]);
    } catch (error) {
      console.error('객실 추가 오류:', error);
      alert('객실 추가 중 오류가 발생했습니다.');
    }
  };

  // Car 추가 시 자동 베이스 가격 설정
  const handleAddCar = async () => {
    if (rooms.length >= 3) {
      alert('차량은 최대 3개까지 추가할 수 있습니다.');
      return;
    }

    try {
      const newCar = {
        car_code: '',
        categoryCounts: { 성인: 0, 아동: 0, 유아: 0 },
      };

      // 1. 견적이 이미 저장된 경우에만 실제 car 데이터 생성
      if (quoteId) {
        const { data: carData, error: carError } = await supabase
          .from('car')
          .insert({
            quote_id: quoteId,
            car_code: newCar.car_code,
            adult_count: newCar.categoryCounts.성인,
            child_count: newCar.categoryCounts.아동,
            infant_count: newCar.categoryCounts.유아,
          })
          .select()
          .single();

        if (carError) {
          alert('차량 추가 중 오류가 발생했습니다.');
          return;
        }

        // 2. 베이스 가격 설정 및 quote_item 동기화
        if (newCar.car_code) {
          await setBasePriceAndSyncQuoteItem(
            'car',
            carData.id,
            newCar.car_code,
            quoteId,
            1
          );
        }
      }

      // 3. 폼 상태 업데이트
      setRooms((prev) => [...prev, newCar]);
    } catch (error) {
      console.error('차량 추가 오류:', error);
      alert('차량 추가 중 오류가 발생했습니다.');
    }
  };

  return (
    <div>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <CodeSelect
          table="schedule_info"
          label="일정"
          placeholder="일정을 선택하세요"
          value={scheduleCode}
          onChange={setScheduleCode}
        />
        <CodeSelect
          table="cruise_info"
          label="크루즈"
          placeholder="크루즈를 선택하세요"
          value={cruiseCode}
          onChange={setCruiseCode}
        />
        <CodeSelect
          table="payment_info"
          label="결제 방식"
          placeholder="결제 방식을 선택하세요"
          value={paymentCode}
          onChange={setPaymentCode}
        />
        <div>
          <label className="block text-sm font-medium mb-1">체크인 날짜</label>
          <input
            type="date"
            className="w-full border px-2 py-1 rounded"
            value={checkin}
            onChange={(e) => setCheckin(e.target.value)}
          />
        </div>
      </div>

      {rooms.map((room, idx) => (
        <QuoteRoomSection
          key={idx}
          index={idx}
          room={room}
          setRoom={(updated) => setRooms((prev) => prev.map((r, i) => (i === idx ? updated : r)))}
        />
      ))}

      <button onClick={handleAddRoom} className="text-blue-500 underline mt-2">
        ➕ 객실 추가
      </button>

      <button onClick={handleSubmit} className="mt-6 bg-blue-600 text-white px-4 py-2 rounded">
        저장하기
      </button>
    </div>
  );
}
