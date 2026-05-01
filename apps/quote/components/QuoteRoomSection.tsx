'use client';
import React from 'react';
import { useEffect, useState } from 'react';
import CodeSelect from './CodeSelect';
import CategoryInputRow from './CategoryInputRow';

const categories = ['성인', '아동', '싱글차지', '엑스트라 성인', '엑스트라 아동'];

export default function QuoteRoomSection({
  index,
  room,
  setRoom,
}: {
  index: number;
  room: any;
  setRoom: (val: any) => void;
}) {
  const [categoryCounts, setCategoryCounts] = useState(
    Object.fromEntries(categories.map((cat) => [cat, room.categoryCounts?.[cat] ?? 0]))
  );

  useEffect(() => {
    setRoom({ ...room, categoryCounts });
  }, [categoryCounts]);

  return (
    <div className="border p-4 mb-4 rounded bg-gray-50">
      <h4 className="text-md font-semibold mb-2">🏨 객실 {index + 1}</h4>

      <CodeSelect
        table="room_info"
        label="객실 선택"
        placeholder="객실을 선택하세요"
        value={room.room_code || ''}
        onChange={(val) => setRoom({ ...room, room_code: val })}
      />

      <CodeSelect
        table="car_info"
        label="차량 선택"
        placeholder="차량을 선택하세요"
        value={room.vehicle_code || ''}
        onChange={(val) => setRoom({ ...room, vehicle_code: val })}
      />

      <CodeSelect
        table="category_info"
        label="차량 구분"
        placeholder="왕복/편도/추가 선택"
        value={room.vehicle_category_code || ''}
        onChange={(val) => setRoom({ ...room, vehicle_category_code: val })}
      />

      <div className="mt-3">
        <p className="text-sm font-medium mb-1">👥 인동 구성</p>
        {categories.map((cat) => (
          <CategoryInputRow
            key={cat}
            category={cat}
            value={categoryCounts[cat]}
            onChange={(val) => setCategoryCounts((prev) => ({ ...prev, [cat]: val }))}
          />
        ))}
      </div>
    </div>
  );
}

