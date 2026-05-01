'use client';
import React from 'react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';

type CruiseRateCardInfo = {
  id: string;
  cruise_name: string;
  schedule_type: string;
  room_type: string;
  price_adult: number;
  price_child: number | null;
  price_infant: number | null;
  is_active: boolean;
};

export default function QuoteRoomListPage() {
  const router = useRouter();
  const [rateCards, setRateCards] = useState<CruiseRateCardInfo[]>([]);

  useEffect(() => {
    const loadData = async () => {
      const { data } = await supabase
        .from('cruise_rate_card')
        .select('id, cruise_name, schedule_type, room_type, price_adult, price_child, price_infant, is_active')
        .eq('is_active', true)
        .order('cruise_name')
        .order('schedule_type')
        .order('room_type')
        .limit(100);

      setRateCards(data || []);
    };

    loadData();
  }, []);

  const handleSelect = (card: CruiseRateCardInfo) => {
    router.push(`/quote/new?room_code=${card.id}`);
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-4">🛏 객실 선택</h2>

      <table className="w-full border text-sm">
        <thead className="bg-gray-100">
          <tr>
            <th className="border px-2 py-1">크루즈</th>
            <th className="border px-2 py-1">일정</th>
            <th className="border px-2 py-1">객실타입</th>
            <th className="border px-2 py-1">성인가격</th>
            <th className="border px-2 py-1">선택</th>
          </tr>
        </thead>
        <tbody>
          {rateCards.map((rc) => (
            <tr key={rc.id} className="hover:bg-gray-50">
              <td className="border px-2 py-1">{rc.cruise_name}</td>
              <td className="border px-2 py-1">{rc.schedule_type}</td>
              <td className="border px-2 py-1">{rc.room_type}</td>
              <td className="border px-2 py-1 text-right">{rc.price_adult.toLocaleString()} ₩</td>
              <td className="border px-2 py-1 text-center">
                <button onClick={() => handleSelect(rc)} className="text-blue-600 underline">
                  선택
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
