'use client';
import React from 'react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import QuoteForm from '@/components/QuoteForm'; // 재사용 가능한 입력 폼 컴포넌트

export default function QuoteEditPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const [quoteData, setQuoteData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchQuote = async () => {
      const { data, error } = await supabase
        .from('quote')
        .select(`*, quote_room(*), quote_car(*)`)
        .eq('id', id)
        .single();

      if (error || !data) {
        alert('견적을 불러올 수 없습니다.');
        return router.push('/');
      }

      setQuoteData(data);
      setLoading(false);
    };

    fetchQuote();
  }, [id, router]);

  if (loading) return <p className="p-6">⏳ 불러오는 중...</p>;

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="text-xl font-bold mb-4">✏️ 견적 수정</h1>
      <QuoteForm mode="edit" initialData={quoteData} />
    </div>
  );
}
