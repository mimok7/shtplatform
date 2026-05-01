'use client';
import React from 'react';
// components/RoomSelect.tsx
import { useEffect, useState } from 'react';
import supabase from '@/lib/supabase';

interface Props {
  scheduleCode: string;
  checkinDate: string;
  cruiseCode: string;
  paymentCode: string;
  value: string;
  onChange: (val: string) => void;
}

export default function RoomSelect({
  scheduleCode,
  checkinDate,
  cruiseCode,
  paymentCode,
  value,
  onChange,
}: Props) {
  const [options, setOptions] = useState<{ code: string; name: string }[]>([]);

  useEffect(() => {
    const fetchOptions = async () => {
      if (!scheduleCode || !checkinDate || !cruiseCode || !paymentCode) return;

      const { data, error } = await supabase
        .from('cruise_rate_card')
        .select('id, room_type')
        .eq('schedule_type', scheduleCode)
        .eq('cruise_name', cruiseCode)
        .eq('is_active', true)
        .lte('valid_from', checkinDate)
        .gte('valid_to', checkinDate);

      setOptions((data || []).map((d: any) => ({ code: d.room_type, name: d.room_type })));
    };

    fetchOptions();
  }, [scheduleCode, checkinDate, cruiseCode, paymentCode]);

  return (
    <div>
      <label className="block text-sm font-medium mb-1">🏨 객실 선택</label>
      <select
        className="w-full border px-2 py-1 rounded"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">객실을 선택하세요</option>
        {options.map((opt) => (
          <option key={opt.code} value={opt.code}>
            {opt.name}
          </option>
        ))}
      </select>
    </div>
  );
}
