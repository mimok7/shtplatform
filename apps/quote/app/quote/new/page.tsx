'use client';

import QuoteForm from '@/components/QuoteForm';

export default function QuoteNewPage() {
  return (
    <div className="max-w-3xl mx-auto p-4">
      <h2 className="text-lg font-bold mb-4">
        비교 견적이 필요하시면 각각 따로 신청을 하셔야 합니다.
      </h2>
      <QuoteForm mode="new" />
    </div>
  );
}
