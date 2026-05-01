'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import QuoteForm from '@/components/QuoteForm';

export default function QuoteEditPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const [quoteData, setQuoteData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchQuote = async () => {
      const { data, error } = await supabase
        .from('quote')
        .select(`
          *,
          quote_room(*, quote_room_detail(*)),
          quote_car(*)
        `)
        .eq('id', id)
        .single();

      if (error || !data) {
        alert('견적을 불러올 수 없습니다.');
        router.replace('/'); // 홈으로 리다이렉트
      } else {
        setQuoteData(data);
        setLoading(false);
      }
    };

    fetchQuote();
  }, [id, router]);

  if (loading) {
    return <p className="p-6 text-center">⏳ 불러오는 중...</p>;
  }

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h2 className="text-lg font-bold mb-4">✏️ 견적 수정</h2>
      <QuoteForm mode="edit" initialData={quoteData} />
    </div>
  );
}
