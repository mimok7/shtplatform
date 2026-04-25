'use client';
import React from 'react';
// app/quote/[id]/view/loading.tsx
export default function Loading() {
  return (
    <div className="p-6 text-center text-gray-500 animate-pulse">
      🔄 견적 정보를 불러오는 중입니다...
    </div>
  );
}
