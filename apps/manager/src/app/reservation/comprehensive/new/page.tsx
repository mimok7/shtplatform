'use client';

import React from 'react';
import PageWrapper from '@/components/PageWrapper';
import SectionBox from '@/components/SectionBox';
import ComprehensiveReservationForm from '@/components/ComprehensiveReservationForm';

export default function NewReservationPage() {
  return (
    <PageWrapper>
      <div className="max-w-4xl mx-auto">
        <SectionBox title="🎯 종합 예약 신청">
          <div className="mb-6">
            <p className="text-gray-600">
              크루즈, 공항, 호텔 등 모든 서비스를 한 번에 예약 신청할 수 있습니다.
            </p>
            <p className="text-sm text-orange-600 mt-2">
              ⚠️ 모든 서비스를 추가한 후 예약 신청을 완료해주세요.
            </p>
          </div>
          
          <ComprehensiveReservationForm />
        </SectionBox>
      </div>
    </PageWrapper>
  );
}
