'use client';

import React from 'react';

export interface UnifiedReservationDetail {
    reservation_id: string;
    service_type: string;
    service_details: any;
    amount: number;
    status: string;
}

export interface UnifiedQuoteData {
    id?: string; // modal에서 사용
    quote_id?: string; // 페이지에서 사용
    title: string;
    user_name: string;
    user_phone: string;
    user_email?: string;
    total_price: number;
    created_at?: string;
    reservations: UnifiedReservationDetail[];
}

interface UnifiedConfirmationProps {
    data: UnifiedQuoteData;
}

// 예약자 확인서 양식(고객 화면 기준) - 공용 렌더러
export default function UnifiedConfirmation({ data }: UnifiedConfirmationProps) {
    const formatDateTime = (dateString?: string) => {
        if (!dateString) return '';
        try {
            return new Date(dateString).toLocaleDateString('ko-KR', {
                year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            });
        } catch {
            return String(dateString);
        }
    };

    const typeLabel = (t: string) => ({
        cruise: '크루즈 객실',
        cruise_car: '크루즈 차량',
        airport: '공항 서비스',
        hotel: '호텔',
        rentcar: '렌터카',
        tour: '투어',
        car: '차량(SHT)',
        sht: '차량(SHT)'
    } as Record<string, string>)[t] || t;

    const statusBadge = (s: string) => {
        const cls = s === 'confirmed' ? 'bg-green-100 text-green-700' : s === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-700';
        const label = s === 'confirmed' ? '확정' : s === 'pending' ? '대기' : s;
        return <span className={`px-2 py-1 rounded text-xs ${cls}`}>{label}</span>;
    };

    // key:value 요약 유틸
    const summarize = (obj: any, opts?: { exclude?: string[] }) => {
        if (!obj) return '-';
        const exclude = new Set((opts?.exclude || []).map((k) => String(k)));
        const parts: string[] = [];
        for (const [k, v] of Object.entries(obj)) {
            if (v == null || v === '' || exclude.has(String(k))) continue;
            if (String(k).includes('_id') || String(k).includes('reservation_id')) continue;
            parts.push(`${String(k).replace(/_/g, ' ')}: ${String(v)}`);
        }
        return parts.length ? parts.join(' • ') : '-';
    };

    return (
        <div id="confirmation-letter" className="bg-white">
            {/* 헤더 */}
            <div className="text-center mb-8 border-b-4 border-blue-600 pb-6">
                <div className="mb-4">
                    <h1 className="text-2xl font-bold text-blue-600 mb-2">🌊 베트남 하롱베이 여행 예약확인서 🌊</h1>
                    <p className="text-gray-600">Vietnam Ha Long Bay Travel Reservation Confirmation</p>
                </div>
            </div>

            {/* 고객 정보 */}
            <div className="mb-8">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <span className="w-1 h-6 bg-blue-500 mr-3"></span>
                    고객 정보
                </h3>
                <div className="bg-gray-50 rounded-lg p-6">
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse border border-gray-300">
                            <tbody>
                                <tr>
                                    <th className="w-40 bg-gray-100 border border-gray-300 px-3 py-2 text-left text-sm text-gray-700">행복여행 이름</th>
                                    <td className="border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-900">{data.title}</td>
                                </tr>
                                <tr>
                                    <th className="bg-gray-100 border border-gray-300 px-3 py-2 text-left text-sm text-gray-700">예약자명</th>
                                    <td className="border border-gray-300 px-3 py-2 text-sm text-gray-900">{data.user_name}</td>
                                </tr>
                                <tr>
                                    <th className="bg-gray-100 border border-gray-300 px-3 py-2 text-left text-sm text-gray-700">연락처</th>
                                    <td className="border border-gray-300 px-3 py-2 text-sm text-gray-900">{data.user_phone}</td>
                                </tr>
                                <tr>
                                    <th className="bg-gray-100 border border-gray-300 px-3 py-2 text-left text-sm text-gray-700">예약번호</th>
                                    <td className="border border-gray-300 px-3 py-2 text-sm font-mono text-blue-700">{data.id || data.quote_id}</td>
                                </tr>
                                <tr>
                                    <th className="bg-gray-100 border border-gray-300 px-3 py-2 text-left text-sm text-gray-700">발급일</th>
                                    <td className="border border-gray-300 px-3 py-2 text-sm text-gray-900">{formatDateTime(new Date().toISOString())}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* 서비스 내역 */}
            <div className="mb-8">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <span className="w-1 h-6 bg-green-500 mr-3"></span>
                    예약 서비스 상세 내역
                </h3>
                {data.reservations?.length ? (
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse border border-gray-300">
                            <thead>
                                <tr className="bg-blue-600 text-white">
                                    <th className="border border-gray-300 px-3 py-3 text-center font-semibold w-16">No</th>
                                    <th className="border border-gray-300 px-3 py-3 text-left font-semibold w-40">서비스 구분</th>
                                    <th className="border border-gray-300 px-3 py-3 text-left font-semibold">주요 정보</th>
                                    <th className="border border-gray-300 px-3 py-3 text-left font-semibold w-[28%]">세부 정보</th>
                                    <th className="border border-gray-300 px-3 py-3 text-center font-semibold w-32">금액</th>
                                    <th className="border border-gray-300 px-3 py-3 text-center font-semibold w-28">상태</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.reservations.map((r, idx) => {
                                    const d: any = r.service_details || {};
                                    // 주요 정보: 서비스 상세의 모든 키/값을 거의 전부 표시(내부키 제외)
                                    const info = summarize(d, { exclude: ['price_info'] });
                                    // 세부 정보: 가격표에서 가져온 price_info 전체 표시
                                    const priceInfo = d?.price_info ? summarize(d.price_info) : '-';

                                    return (
                                        <tr key={`${r.reservation_id}_${idx}`} className="hover:bg-gray-50">
                                            <td className="border border-gray-300 px-3 py-3 text-center text-sm text-gray-700">{idx + 1}</td>
                                            <td className="border border-gray-300 px-3 py-3 text-sm font-medium text-gray-800 whitespace-nowrap">{typeLabel(r.service_type)}</td>
                                            <td className="border border-gray-300 px-3 py-3 text-sm text-gray-700">
                                                <div className="truncate" title={`예약ID: ${String(r.reservation_id).slice(-8)}`}>{info || '-'}</div>
                                                <div className="text-xs text-gray-400 mt-1">예약ID: {String(r.reservation_id).slice(-8)}</div>
                                            </td>
                                            <td className="border border-gray-300 px-3 py-3 text-sm text-gray-700">
                                                <div className="whitespace-pre-wrap break-words">{priceInfo}</div>
                                            </td>
                                            <td className="border border-gray-300 px-3 py-3 text-center text-sm font-bold text-blue-600">{r.amount > 0 ? `${r.amount.toLocaleString()}동` : '포함'}</td>
                                            <td className="border border-gray-300 px-3 py-3 text-center">{statusBadge(r.status)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot>
                                <tr className="bg-blue-50">
                                    <td colSpan={4} className="border border-gray-300 px-3 py-4 text-right font-semibold text-gray-700">총 결제 금액</td>
                                    <td className="border border-gray-300 px-3 py-4 text-center">
                                        <div className="text-xl font-bold text-blue-600">{(data.total_price || 0).toLocaleString()}동</div>
                                    </td>
                                    <td className="border border-gray-300 px-3 py-4 text-center">
                                        <span className="inline-block px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded">결제완료</span>
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                ) : (
                    <div className="bg-gray-50 border border-gray-200 rounded p-6 text-center text-gray-600">서비스 정보가 없습니다.</div>
                )}
            </div>

            {/* 합계 */}
            <div className="mb-8">
                <div className="bg-blue-50 rounded-lg p-4 flex justify-between items-center border border-blue-100">
                    <div className="text-gray-700 font-medium">총 결제 금액</div>
                    <div className="text-xl font-bold text-blue-600">{(data.total_price || 0).toLocaleString()}동</div>
                </div>
            </div>

            {/* 푸터 */}
            <div className="text-center text-sm text-gray-500 border-t-2 border-blue-600 pt-6">
                <div className="mb-4">
                    <div className="text-lg font-bold text-blue-600 mb-2">🌊 스테이하롱 트레블과 함께하는 특별한 여행 🌊</div>
                    <p className="text-gray-600">베트남 하롱베이에서 잊지 못할 추억을 만들어보세요!</p>
                </div>
                <div className="bg-blue-50 rounded-lg p-4 text-center">
                    <div className="font-medium text-gray-700 mb-2">
                        <span className="text-blue-600">🏢 스테이하롱 트레블 </span> |
                        <span className="text-gray-600"> 하롱베이 상주 한국인 베트남 전문 여행사</span>
                    </div>
                    <div className="text-xs text-gray-500 space-y-1">
                        <div>📍 상호 : CONG TY TENPER COMMUNICATIONS</div>
                        <div>📍 주소 : PHUONG YET KIEU, THANH PHO HA LONG</div>
                        <div>📧 stayhalong@gmail.com | ☎️ 07045545185 🌐 https://cafe.naver.com/stayhalong</div>
                        <div>🕒 운영시간: 평일 09:00-24:00 (토요일 09:00-15:00, 일요일/공휴일 비상업무)</div>
                        <div className="text-gray-400 mt-2">© 2024 StayHalong Travel. All rights reserved.</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
