'use client';

import React from 'react';

interface SelectableButtonProps {
  label: string;
  value: string;
  selectedValue: string;
  onSelect: (value: string) => void;
}

export default function SelectableButton({
  label,
  value,
  selectedValue,
  onSelect,
}: SelectableButtonProps) {
  const isSelected = value === selectedValue;

  return (
    <button
      onClick={() => onSelect(value)}
      className={`btn ${
        isSelected ? 'bg-blue-400 text-white border border-blue-600 font-bold' : ''
      }`}
    >
      {label}
    </button>
  );
}
