'use client';
import React from 'react';
import { useEffect, useState } from 'react';
import supabase from '@/lib/supabase';

export default function CodeSelect({
  table,
  label,
  placeholder,
  value,
  onChange,
}: {
  table: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [options, setOptions] = useState<{ code: string; name: string }[]>([]);

  useEffect(() => {
    const fetchOptions = async () => {
      const { data } = await supabase.from(table).select('code, name');
      if (data) setOptions(data);
    };
    fetchOptions();
  }, [table]);

  return (
    <div className="mb-3">
      <label className="block text-sm font-medium mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border rounded px-2 py-1"
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.code} value={opt.code}>
            {opt.name}
          </option>
        ))}
      </select>
    </div>
  );
}
