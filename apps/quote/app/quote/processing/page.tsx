'use client';
import React from 'react';
// app/quote/processing/page.tsx
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

export default function QuoteProcessingPage() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.push('/mypage/quotes'); // 또는 `/quote/123/view`
    }, 3000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-white px-6 text-center">
      <Image
        src="/images/thank-you.png"
        alt="감사 이미지"
        width={200}
        height={200}
        className="mb-6"
      />
      <p className="text-gray-600 mb-6">견적이 처리되는 중입니다. 잠시만 기다려주세요...</p>
      <p className="text-sm text-gray-400">잠시 후 자동으로 이동합니다.</p>
    </div>
  );
}
