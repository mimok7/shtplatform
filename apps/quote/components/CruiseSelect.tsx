'use client';
import React from 'react';
import { useEffect, useState } from 'react';
import supabase from '@/lib/supabase';

type Props = {
  scheduleCode: string;
  checkinDate: string;
  value: string;
  onChange: (val: string) => void;
};

export default function CruiseSelect({ scheduleCode, checkinDate, value, onChange }: Props) {
  const [options, setOptions] = useState<{ code: string; name: string }[]>([]);

  useEffect(() => {
    const loadCruises = async () => {
      if (!scheduleCode || !checkinDate) return;

      const { data: rateCards } = await supabase
        .from('cruise_rate_card')
        .select('cruise_name')
        .eq('schedule_type', scheduleCode)
        .eq('is_active', true)
        .lte('valid_from', checkinDate)
        .gte('valid_to', checkinDate);

      const uniqueNames: string[] = [...new Set<string>((rateCards || []).map((rc: any) => String(rc.cruise_name || '')).filter(Boolean))];
      setOptions(uniqueNames.map(name => ({ code: name, name })));
    };

    loadCruises();
  }, [scheduleCode, checkinDate]);

  return (
    <div className="mb-3">
      <label className="block text-sm font-medium mb-1">
        🛳️ 승선을 원하는 크루즈를 선택하세요.
      </label>

      <select
        className="w-full border rounded px-2 py-1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">크루즈를 선택하세요</option>
        {options.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}
