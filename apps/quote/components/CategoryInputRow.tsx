'use client';
import React from 'react';
export default function CategoryInputRow({
  category,
  value,
  onChange,
}: {
  category: string;
  value: number;
  onChange: (val: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="w-32 text-sm">{category}</span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-24 border px-2 py-1 rounded"
      />
    </div>
  );
}
