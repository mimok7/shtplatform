'use client';
import React from 'react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import PageWrapper from '@/components/PageWrapper';
import SectionBox from '@/components/SectionBox';
import CodeSelect from './CodeSelect';
import QuoteRoomSection from './QuoteRoomSection';

export default function ComprehensiveQuoteForm({
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

  useEffect(() => {
    if (mode === 'edit' && initialData) {
      setCheckin(initialData.checkin ?? '');
      setScheduleCode(initialData.schedule_code ?? '');
      setCruiseCode(initialData.cruise_code ?? '');
      setPaymentCode(initialData.payment_code ?? '');
      setDiscountRate(initialData.discount_rate ?? 0);

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

  const handleAddRoom = () => {
    if (rooms.length < 3) setRooms([...rooms, {}]);
  };

  const handleSubmit = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return alert('로그인 필요');

    let quoteId = initialData?.id;
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
      quoteId = quote.id;
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

      if (roomErr || !roomRow) continue;

      const roomDetails = Object.entries(room.categoryCounts || {})
        .filter(([, count]) => (count as number) > 0)
        .map(([category, count]) => ({
          quote_id: quoteId,
          quote_room_id: roomRow.id,
          category,
          person_count: count as number,
        }));

      if (roomDetails.length > 0) {
        await supabase.from('quote_room_detail').insert(roomDetails);
      }
    }

    alert(mode === 'new' ? '견적이 저장되었습니다!' : '견적이 수정되었습니다!');
    router.push('/mypage/quotes');
  };

  return (
    <PageWrapper>
      <SectionBox title="📋 종합 견적 작성">
        <div className="space-y-6">
          {/* 기본 일정 정보 */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block mb-2 font-medium">체크인 날짜</label>
              <input
                type="date"
                value={checkin}
                onChange={(e) => setCheckin(e.target.value)}
                className="w-full px-3 py-2 rounded border"
              />
            </div>
            <div>
              <label className="block mb-2 font-medium">할인율 (%)</label>
              <input
                type="number"
                value={discountRate}
                onChange={(e) => setDiscountRate(Number(e.target.value))}
                className="w-full px-3 py-2 rounded border"
                min="0"
                max="100"
              />
            </div>
          </div>

          {/* 코드 선택 섹션 */}
          <div className="grid md:grid-cols-3 gap-4">
            <CodeSelect
              table="schedule_code"
              label="여행 일정"
              placeholder="일정을 선택하세요"
              value={scheduleCode}
              onChange={setScheduleCode}
            />
            <CodeSelect
              table="cruise_code"
              label="크루즈 선택"
              placeholder="크루즈를 선택하세요"
              value={cruiseCode}
              onChange={setCruiseCode}
            />
            <CodeSelect
              table="payment_code"
              label="결제 방식"
              placeholder="결제 방식을 선택하세요"
              value={paymentCode}
              onChange={setPaymentCode}
            />
          </div>

          {/* 객실 정보 섹션 */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">🏨 객실 정보</h3>
              <button
                onClick={handleAddRoom}
                className="bg-green-300 text-white px-4 py-2 rounded hover:bg-green-400"
                disabled={rooms.length >= 3}
              >
                ➕ 객실 추가
              </button>
            </div>
            
            {rooms.map((room, index) => (
              <QuoteRoomSection
                key={index}
                index={index}
                room={room}
                setRoom={(updatedRoom) => {
                  const newRooms = [...rooms];
                  newRooms[index] = updatedRoom;
                  setRooms(newRooms);
                }}
              />
            ))}
          </div>

          {/* 저장 버튼 */}
          <div className="flex gap-3 pt-6">
            <button
              onClick={handleSubmit}
              className="btn bg-blue-300 text-white px-6 py-3 hover:bg-blue-400"
            >
              💾 {mode === 'new' ? '견적 저장' : '견적 수정'}
            </button>
            <button
              onClick={() => router.push('/mypage/quotes')}
              className="btn bg-gray-300 text-white px-6 py-3 hover:bg-gray-400"
            >
              📝 목록으로
            </button>
          </div>
        </div>
      </SectionBox>
    </PageWrapper>
  );
}
