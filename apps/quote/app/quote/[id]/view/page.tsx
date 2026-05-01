'use client';
import React from 'react';

import { useEffect, useState } from 'react';
import { useParams, useRouter, notFound } from 'next/navigation';
import supabase from '@/lib/supabase';

// Lucide 아이콘 가져오기
import {
  FileText,
  CalendarCheck,
  Ship,
  CreditCard,
  Percent,
  Clock,
  BedDouble,
  Car,
  ListOrdered,
  BadgeCheck,
  CircleAlert,
} from 'lucide-react';

export default function QuoteViewPage() {
  const { id } = useParams();
  const router = useRouter();
  const [quote, setQuote] = useState<any>(null);
  const [error, setError] = useState<any>(null);

  useEffect(() => {
    const fetchQuote = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        alert('로그인이 필요합니다.');
        return router.push('/login');
      }

      const { data, error } = await supabase
        .from('quote')
        .select(
          `
          *,
          quote_price_summary(*),
          cruise_info(name),
          payment_info(name),
          quote_room(*, room_info(name)),
          quote_car(*, car_info(name))
        `
        )
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

      if (error) {
        setError(error);
        return;
      }

      setQuote(data);
    };

    fetchQuote();
  }, [id]);

  if (error) return notFound();
  if (!quote) return <div className="text-center p-10">견적을 불러오는 중입니다...</div>;

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold mb-2 flex items-center gap-2">
        <FileText className="w-6 h-6 text-gray-700" />
        견적서
      </h1>

      <div className="border rounded p-4 space-y-2 bg-white shadow-sm">
        <p className="flex items-center gap-2">
          <CalendarCheck className="w-5 h-5 text-gray-600" />
          체크인: {quote.checkin}
        </p>
        <p className="flex items-center gap-2">
          <Ship className="w-5 h-5 text-gray-600" />
          크루즈: {quote.cruise_info?.name || quote.cruise_code}
        </p>
        <p className="flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-gray-600" />
          결제방식: {quote.payment_info?.name || quote.payment_code}
        </p>
        <p className="flex items-center gap-2">
          <Percent className="w-5 h-5 text-gray-600" />
          할인율: {quote.discount_rate}%
        </p>
        <p className="flex items-center gap-2">
          <BadgeCheck className="w-5 h-5 text-gray-600" />
          상태: {quote.is_confirmed ? '확정됨' : '미확정'}
        </p>
        <p className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-gray-600" />
          작성일: {new Date(quote.created_at).toLocaleString()}
        </p>
      </div>

      <div className="border rounded p-4 bg-gray-50">
        <h2 className="font-semibold mb-2 flex items-center gap-2">
          <BedDouble className="w-5 h-5 text-gray-700" />
          객실 구성
        </h2>
        {quote.quote_room?.length > 0 ? (
          quote.quote_room.map((room: any, index: number) => (
            <div key={room.id} className="mb-3">
              <p>
                👉 객실 {index + 1}: {room.room_info?.name || room.room_code}
              </p>
              <p>인원수: {room.person_count}명</p>
              <p>객실 금액: {room.room_total_price?.toLocaleString()}₩</p>
            </div>
          ))
        ) : (
          <p className="flex items-center gap-2 text-gray-500">
            <CircleAlert className="w-4 h-4" />
            객실 정보 없음
          </p>
        )}
      </div>

      <div className="border rounded p-4 bg-gray-50">
        <h2 className="font-semibold mb-2 flex items-center gap-2">
          <Car className="w-5 h-5 text-gray-700" />
          차량 구성
        </h2>
        {quote.quote_car?.length > 0 ? (
          quote.quote_car.map((car: any, index: number) => (
            <div key={car.id} className="mb-3">
              <p>
                👉 차량 {index + 1}: {car.car_info?.name || car.vehicle_code}
              </p>
              <p>차량 수: {car.car_count}대</p>
              <p>차량 금액: {car.car_total_price?.toLocaleString()}₩</p>
            </div>
          ))
        ) : (
          <p className="flex items-center gap-2 text-gray-500">
            <CircleAlert className="w-4 h-4" />
            차량 정보 없음
          </p>
        )}
      </div>

      <div className="border rounded p-4 bg-white shadow-sm">
        <h2 className="font-semibold mb-2 flex items-center gap-2">
          <ListOrdered className="w-5 h-5 text-gray-700" />
          견적 총계
        </h2>
        <p>총 객실 금액: {quote.quote_price_summary?.total_room_price?.toLocaleString()}₩</p>
        <p>총 차량 금액: {quote.quote_price_summary?.total_car_price?.toLocaleString()}₩</p>
        <p>견적 합계: {quote.quote_price_summary?.grand_total?.toLocaleString()}₩</p>
        <p className="font-bold text-lg">
          최종 결제 금액: {quote.quote_price_summary?.final_total?.toLocaleString()}₩
        </p>
      </div>
    </div>
  );
}
