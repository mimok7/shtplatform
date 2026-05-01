import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';

interface QuoteFormProps {
  mode?: string;
  initialData?: any;
}

export default function QuoteForm({ mode = 'new', initialData = null }: QuoteFormProps) {
  const [checkin, setCheckin] = useState(initialData?.checkin || '');
  const [scheduleCode, setScheduleCode] = useState(initialData?.schedule_code || '');
  const [cruiseCode, setCruiseCode] = useState(initialData?.cruise_code || '');
  const [paymentCode, setPaymentCode] = useState(initialData?.payment_code || '');
  const [discountRate, setDiscountRate] = useState(initialData?.discount_rate || 0);
  const [rooms, setRooms] = useState(initialData?.quote_room || []);
  const [cars, setCars] = useState(initialData?.quote_car || []);
  const router = useRouter();

  const handleSubmit = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return alert('로그인이 필요합니다.');

    try {
      // 1. quote 새로 저장 (복사/수정 모두 새로 생성)
      const { data: newQuote, error } = await supabase
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

      if (error) throw error;

      const quoteId = newQuote.id;

      // 2. 요약 테이블
      await supabase.from('quote_price_summary').insert({
        quote_id: quoteId,
        checkin,
        discount_rate: discountRate,
      });

      // 3. 객실 저장
      const roomRows = rooms.map((r: any) => ({
        quote_id: quoteId,
        room_code: r.room_code,
        category: r.category,
        person_count: r.person_count,
        room_price_code: null,
        room_unit_price: 0,
        room_total_price: 0,
      }));
      await supabase.from('quote_room').insert(roomRows);

      // 4. 차량 저장
      const carRows = cars.map((c: any) => ({
        quote_id: quoteId,
        vehicle_code: c.vehicle_code,
        car_category_code: c.car_category_code,
        passenger_type: c.passenger_type,
        car_count: c.car_count || 1,
        car_price_code: null,
        car_unit_price: 0,
        car_total_price: 0,
      }));
      await supabase.from('quote_car').insert(carRows);

      alert('견적이 복사/수정되어 저장되었습니다.');
      router.push(`/quote/${quoteId}/view`);
    } catch (err: any) {
      alert('저장 실패: ' + err.message);
    }
  };

  return (
    <div className="space-y-4">
      {/* 체크인, 일정, 크루즈, 결제 방식 등은 여기서 */}
      {/* QuoteRoomSection, CarSection 등 그대로 재사용 */}
      <button onClick={handleSubmit} className="btn btn-primary w-full">
        {mode === 'edit' ? '수정 후 저장하기' : '저장하기'}
      </button>
    </div>
  );
}
