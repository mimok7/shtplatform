'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PartnerLayout from '@/components/PartnerLayout';
import SectionBox from '@/components/SectionBox';

// 호텔 카테고리는 별도 시스템(스테이하롱 호텔/크루즈)에서 관리되므로
// 제휴업체 호텔 전용 리스트 페이지는 운영 중단. 자동으로 전체 카테고리로 리다이렉트.
export default function BookingListPage() {
    const router = useRouter();
    useEffect(() => {
        try { sessionStorage.removeItem('app:session:cache'); } catch { /* noop */ }
        try { sessionStorage.removeItem('app:auth:cache'); } catch { /* noop */ }
        try { localStorage.removeItem('sht_partner_user_cache'); } catch { /* noop */ }

        const t = setTimeout(() => router.replace('/partner/browse'), 1500);
        return () => clearTimeout(t);
    }, [router]);

    return (
        <PartnerLayout title="안내" requiredRoles={['member', 'partner', 'manager', 'admin']}>
            <SectionBox title="페이지가 이동되었습니다">
                <div className="py-6 text-center text-sm text-gray-600">
                    호텔은 별도 예약 시스템에서 관리됩니다.<br />
                    제휴업체 전체 카테고리 둘러보기로 이동합니다…
                </div>
            </SectionBox>
        </PartnerLayout>
    );
}
