'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import PageWrapper from '@/components/PageWrapper';

const CANCEL_APP_URL = process.env.NEXT_PUBLIC_CANCEL_APP_URL || 'https://cancel.stayhalong.com';

export default function ReservationCancelGuidePage() {
    const params = useParams();
    const reservationId = params?.id as string;

    return (
        <PageWrapper>
            <div className="mx-auto max-w-xl space-y-4 p-4 md:p-6">
                <h1 className="text-xl font-bold">예약 취소 안내</h1>
                <div className="rounded-lg border bg-yellow-50 p-4 text-sm text-yellow-900">
                    <p>예약 취소는 <strong>별도 취소 전용 페이지</strong>에서만 처리됩니다.</p>
                    <p className="mt-2">아래 버튼으로 이동하여 본인확인 후 신청해 주세요. 비밀번호를 잊으셨더라도 이름과 이메일만으로 신청이 가능합니다.</p>
                </div>

                <div className="space-y-2 rounded-lg border bg-white p-4 text-sm">
                    <p><strong>예약 ID:</strong> {reservationId}</p>
                    <p className="text-gray-500">취소 신청 페이지 주소: <code>{CANCEL_APP_URL}</code></p>
                </div>

                <div className="flex flex-col gap-2">
                    <a
                        href={CANCEL_APP_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block rounded bg-red-600 px-4 py-3 text-center text-sm font-medium text-white"
                    >
                        취소 전용 페이지로 이동
                    </a>
                    <a
                        href="/mypage/reservations"
                        className="block rounded border px-4 py-3 text-center text-sm text-gray-700"
                    >
                        예약 목록으로 돌아가기
                    </a>
                </div>

                <p className="text-xs text-gray-500">
                    ※ 취소 신청 접수 후 매니저가 사유(자연재해/단순변심/기타)에 따라 검토하며, 환불 가능 여부는 약관에 따릅니다.
                </p>
            </div>
        </PageWrapper>
    );
}

