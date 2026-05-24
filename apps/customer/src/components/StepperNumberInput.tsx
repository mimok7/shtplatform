'use client';

import React from 'react';

type StepperNumberInputProps = {
    value: number;
    min?: number;
    max?: number;
    onChange: (value: number) => void;
    className?: string;
    inputClassName?: string;
    buttonClassName?: string;
    ariaLabel?: string;
};

export default function StepperNumberInput({
    value,
    min = 0,
    max,
    onChange,
    className = '',
    inputClassName = '',
    buttonClassName = '',
    ariaLabel = '숫자 선택',
}: StepperNumberInputProps) {
    const clamp = (next: number) => {
        if (Number.isNaN(next)) return min;
        let nextValue = next;
        if (nextValue < min) nextValue = min;
        if (typeof max === 'number' && nextValue > max) nextValue = max;
        return nextValue;
    };

    return (
        <div className={`flex items-center justify-center gap-3 ${className}`}>
            <button
                type="button"
                onClick={() => onChange(clamp((value || 0) - 1))}
                className={`w-9 h-9 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100 text-lg leading-none ${buttonClassName}`}
                aria-label={`${ariaLabel} 감소`}
            >
                -
            </button>
            <span className={`w-10 text-center font-semibold text-gray-800 ${inputClassName}`}>{value || 0}</span>
            <button
                type="button"
                onClick={() => onChange(clamp((value || 0) + 1))}
                className={`w-9 h-9 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100 text-lg leading-none ${buttonClassName}`}
                aria-label={`${ariaLabel} 증가`}
            >
                +
            </button>
        </div>
    );
}
