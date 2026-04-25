'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import PageWrapper from '@/components/PageWrapper';
import SectionBox from '@/components/SectionBox';

export default function QuotesHubPage() {
  const actions = useMemo(() => [
    { icon: '📝', label: '새 견적', href: '/mypage/quotes/new' },
    { icon: '📑', label: '견적 목록', href: '/mypage/quotes/list' },
  ], []);

  return (
    <PageWrapper title="견적">
      <SectionBox title="원하는 작업을 선택하세요">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {actions.map((action, index) => (
            <Link key={index} href={action.href} className="group">
              <div className="bg-white border border-gray-200 rounded-lg p-6 text-center hover:border-blue-500 hover:shadow-md transition-all duration-200">
                <div className="text-4xl mb-3 transform group-hover:scale-110 transition-transform duration-200">
                  {action.icon}
                </div>
                <div className="text-sm font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                  {action.label}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </SectionBox>
    </PageWrapper>
  );
}
