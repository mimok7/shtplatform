'use client';

import React from 'react';
import ManagerLayout from '@/components/ManagerLayout';
import Link from 'next/link';

export default function AirportDispatchCodesPage() {
    return (
        <ManagerLayout title="공항 배차 코드" activeTab="dispatch-codes-vehicle">
            <div className="p-6">
                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
                    <div className="flex">
                        <div className="ml-3">
                            <p className="text-sm text-yellow-700">
                                공항 배차 코드 관리는 통합되었습니다.
                                <Link href="/manager/dispatch-codes/vehicle" className="font-medium underline hover:text-yellow-600 ml-1">
                                    차량 코드 관리
                                </Link>
                                메뉴를 이용해주세요.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </ManagerLayout>
    );
}
