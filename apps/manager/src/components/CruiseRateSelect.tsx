'use client';

import React, { useEffect, useState } from 'react';
import supabase from '@/lib/supabase';
import { getCruiseList } from '@/lib/cruiseRateCard';

type Props = {
    // scheduleCode는 더 이상 필요 없지만 호환성 위해 남겨둘 수 있음.
    // 대신 scheduleType (1N2D, 2N3D, DAY)을 받아서 필터링하면 좋음.
    scheduleType?: '1N2D' | '2N3D' | 'DAY';
    checkinDate?: string;
    value: string;
    onChange: (val: string) => void;
    year?: number;
};

export default function CruiseRateSelect({
    scheduleType,
    checkinDate,
    value,
    onChange,
    year = 2026,
}: Props) {
    const [options, setOptions] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const loadCruises = async () => {
            setLoading(true);
            try {
                // use utility function from lib/cruiseRateCard
                // scheduleType 필터링은 추후 추가 가능
                const cruiseNames = await getCruiseList(year);

                // 만약 scheduleType이 있다면, 해당 일정의 데이터가 실제 존재하는지 한 번 더 체크 가능
                // 하지만 여기선 일단 전체 목록 표시 (속도 위해)
                setOptions(cruiseNames);
            } catch (error) {
                console.error('Failed to load cruises:', error);
            } finally {
                setLoading(false);
            }
        };

        loadCruises();
    }, [year, scheduleType]);

    return (
        <div className="mb-3">
            <label className="block text-sm font-medium mb-1">
                🛳️ 승선을 원하는 크루즈를 선택하세요. (2026 요금표 기준)
            </label>

            <select
                className="w-full border rounded px-2 py-1"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={loading}
            >
                <option value="">
                    {loading ? '로딩 중...' : '크루즈를 선택하세요'}
                </option>
                {options.map((name) => (
                    <option key={name} value={name}>
                        {name}
                    </option>
                ))}
            </select>
        </div>
    );
}
