'use client';
import React from 'react';
import { useEffect, useState } from 'react';
import supabase from '@/lib/supabase';

type SelectProps = {
  scheduleCode: string;
  cruiseCode: string;
  categoryCode?: string; // for CarInfoSelect only
  value: string;
  onChange: (value: string) => void;
};

// 🚐 차량 구분
export function CarCategorySelect({ scheduleCode, cruiseCode, value, onChange }: SelectProps) {
  const [options, setOptions] = useState<{ code: string; name: string }[]>([]);

  useEffect(() => {
    if (scheduleCode && cruiseCode) {
      supabase
        .from('car_price')
        .select('car_category_code')
        .eq('schedule_code', scheduleCode)
        .eq('cruise_code', cruiseCode)
        .then(({ data, error }) => {
          if (!error && data) {
            const uniqueCodes = Array.from(new Set(data.map((row) => row.car_category_code)));
            if (uniqueCodes.length > 0) {
              supabase
                .from('category_info')
                .select('code, name')
                .in('code', uniqueCodes)
                .then(({ data }) => setOptions(data || []));
            }
          }
        });
    } else {
      setOptions([]);
    }
  }, [scheduleCode, cruiseCode]);

  return (
    <div>
      <label className="block text-sm font-medium mb-1">🚐 운행 방식을 선택하세요</label>
      <select
        className="w-full border px-2 py-1 rounded"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">선택하세요</option>
        {options.map((opt) => (
          <option key={opt.code} value={opt.code}>
            {opt.name}
          </option>
        ))}
      </select>
    </div>
  );
}

// 🚗 차량 선택
export function CarInfoSelect({
  scheduleCode,
  cruiseCode,
  categoryCode,
  value,
  onChange,
}: SelectProps) {
  const [options, setOptions] = useState<{ code: string; name: string }[]>([]);

  useEffect(() => {
    if (scheduleCode && cruiseCode && categoryCode) {
      supabase
        .from('car_price')
        .select('car_code')
        .eq('schedule_code', scheduleCode)
        .eq('cruise_code', cruiseCode)
        .eq('car_category_code', categoryCode)
        .then(({ data, error }) => {
          if (!error && data) {
            const uniqueCodes = Array.from(new Set(data.map((row) => row.car_code)));
            if (uniqueCodes.length > 0) {
              supabase
                .from('car_info')
                .select('code, name')
                .in('code', uniqueCodes)
                .then(({ data }) => setOptions(data || []));
            }
          }
        });
    } else {
      setOptions([]);
    }
  }, [scheduleCode, cruiseCode, categoryCode]);

  return (
    <div>
      <label className="block text-sm font-medium mb-1">🚗 차량을 선택 하세요</label>
      <select
        className="w-full border px-2 py-1 rounded"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">선택하세요</option>
        {options.map((opt) => (
          <option key={opt.code} value={opt.code}>
            {opt.name}
          </option>
        ))}
      </select>
    </div>
  );
}
