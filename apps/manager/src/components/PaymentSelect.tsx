'use client';
import React from 'react';
// components/PaymentSelect.tsx
import { useEffect, useState } from 'react';
import supabase from '@/lib/supabase';

interface Props {
  scheduleCode: string;
  checkinDate: string;
  cruiseCode: string;
  value: string;
  onChange: (val: string) => void;
}

export default function PaymentSelect({
  scheduleCode,
  checkinDate,
  cruiseCode,
  value,
  onChange,
}: Props) {
  const [options, setOptions] = useState<{ code: string; name: string }[]>([]);

  useEffect(() => {
    const fetchOptions = async () => {
      if (!scheduleCode || !checkinDate || !cruiseCode) return;

      // cruise_rate_card에는 결제방식 컨럼이 없으므로 기본 결제 옵션 제공
      setOptions([
        { code: 'card', name: '신용카드' },
        { code: 'wire', name: '계좌이체' },
        { code: 'cash', name: '현금' }
      ]);
    };

    fetchOptions();
  }, [scheduleCode, checkinDate, cruiseCode]);

  return (
    <div>
      <label className="block text-sm font-medium mb-1">💳 결제 방식</label>
      <select
        className="w-full border px-2 py-1 rounded"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">결제 방식을 선택하세요</option>
        {options.map((opt) => (
          <option key={opt.code} value={opt.code}>
            {opt.name}
          </option>
        ))}
      </select>
    </div>
  );
}
