'use client';

import React, { useEffect, useState } from 'react';
import supabase from '@/lib/supabase';
import AdminLayout from '@/components/AdminLayout';

type MonthlyRevenueRow = {
  month: string;
  reservationCount: number;
  reservationTotal: number;
  paidCount: number;
  paidTotal: number;
};

export default function MonthlyRevenuePage() {
  const [data, setData] = useState<MonthlyRevenueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMonthlyData();
  }, []);

  const fetchMonthlyData = async () => {
    try {
      setLoading(true);
      setError(null);

      // 예약 데이터 (확정/완료)
      const { data: reservations, error: resError } = await supabase
        .from('reservation')
        .select('re_created_at, total_amount')
        .in('re_status', ['confirmed', 'approved', 'completed']);

      if (resError) throw resError;

      // 결제 데이터
      const { data: payments, error: payError } = await supabase
        .from('reservation_payment')
        .select('created_at, amount')
        .eq('payment_status', 'completed');

      if (payError) throw payError;

      // 월별로 집계
      const monthMap = new Map<string, MonthlyRevenueRow>();

      // 현재 연도 12개월 초기화
      const now = new Date();
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthMap.set(monthKey, {
          month: monthKey,
          reservationCount: 0,
          reservationTotal: 0,
          paidCount: 0,
          paidTotal: 0,
        });
      }

      // 예약 데이터 집계
      (reservations || []).forEach((r: any) => {
        const month = r.re_created_at?.slice(0, 7);
        if (!month) return;
        const row = monthMap.get(month) || {
          month,
          reservationCount: 0,
          reservationTotal: 0,
          paidCount: 0,
          paidTotal: 0,
        };
        row.reservationCount += 1;
        row.reservationTotal += Number(r.total_amount) || 0;
        monthMap.set(month, row);
      });

      // 결제 데이터 집계
      (payments || []).forEach((p: any) => {
        const month = p.created_at?.slice(0, 7);
        if (!month) return;
        const row = monthMap.get(month) || {
          month,
          reservationCount: 0,
          reservationTotal: 0,
          paidCount: 0,
          paidTotal: 0,
        };
        row.paidCount += 1;
        row.paidTotal += Number(p.amount) || 0;
        monthMap.set(month, row);
      });

      const sortedData = Array.from(monthMap.values()).sort((a, b) =>
        a.month.localeCompare(b.month)
      );

      setData(sortedData);
    } catch (err) {
      console.error('데이터 조회 실패:', err);
      setError(err instanceof Error ? err.message : '데이터 조회 실패');
    } finally {
      setLoading(false);
    }
  };

  const maxRevenue = Math.max(...data.map((r) => r.reservationTotal), 1);
  const maxCount = Math.max(...data.map((r) => r.reservationCount), 1);

  const renderBar = (value: number, max: number, maxWidth = 40) => {
    const width = Math.max(1, Math.round((value / max) * maxWidth));
    return '█'.repeat(width);
  };

  const formatMoney = (n: number) => `VND ${Math.round(n).toLocaleString('en-US')}`;

  return (
    <AdminLayout title="월별 매출 현황">
      <div className="space-y-6">
        {loading && (
          <div className="flex items-center justify-center h-40">
            <div className="text-gray-500">데이터 로딩 중...</div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            오류: {error}
          </div>
        )}

        {!loading && !error && (
          <>
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between gap-4 mb-4">
                <h3 className="text-lg font-semibold text-gray-900">월별 건수 · 매출액 통합 그래프</h3>
                <div className="flex items-center gap-4 text-xs font-medium">
                  <span className="inline-flex items-center gap-1 text-blue-600">
                    <span className="block w-3 h-3 rounded-sm bg-blue-500" />건수
                  </span>
                  <span className="inline-flex items-center gap-1 text-emerald-600">
                    <span className="block w-3 h-3 rounded-sm bg-emerald-500" />매출액
                  </span>
                  <span className="text-gray-500">금액 단위: VND</span>
                </div>
              </div>
              <div className="overflow-x-auto pb-2">
                <div className="min-w-max">
                  <div className="h-72 rounded-lg border border-gray-300 bg-gradient-to-b from-gray-50 to-white p-4">
                    <div className="flex h-full items-end">
                      {data.map((row) => {
                        const countHeight = maxCount > 0 ? Math.max((row.reservationCount / maxCount) * 100, row.reservationCount > 0 ? 4 : 0) : 0;
                        const revenueHeight = maxRevenue > 0 ? Math.max((row.reservationTotal / maxRevenue) * 100, row.reservationTotal > 0 ? 4 : 0) : 0;

                        return (
                          <div
                            key={row.month}
                            className="flex min-w-[64px] flex-1 flex-col items-center justify-end gap-2 border-r border-gray-300 first:border-l"
                          >
                            <div className="text-[10px] leading-none text-gray-400">{row.reservationCount}</div>
                            <div className="flex h-52 w-full items-end justify-center gap-2 border-t border-dashed border-gray-300 px-2 pt-2">
                              <div
                                className="w-4 rounded-t-sm bg-blue-500"
                                style={{ height: `${countHeight}%` }}
                                title={`${row.month} 건수 ${row.reservationCount}건`}
                              />
                              <div
                                className="w-4 rounded-t-sm bg-emerald-500"
                                style={{ height: `${revenueHeight}%` }}
                                title={`${row.month} 매출액 ${formatMoney(row.reservationTotal)}`}
                              />
                            </div>
                            <div className="w-full border-t border-gray-300 pt-2 text-center text-[10px] leading-none text-gray-500">
                              {row.month.slice(5)}월
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-xs md:grid-cols-5">
                    {data.map((row) => (
                      <div key={`summary-${row.month}`} className="rounded border border-gray-300 px-3 py-2">
                        <div className="font-semibold text-gray-700">{row.month}</div>
                        <div className="mt-1 text-blue-700">건수 {row.reservationCount}건</div>
                        <div className="text-emerald-700">매출 {formatMoney(row.reservationTotal)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">결제 완료 (최근 12개월)</h3>
              <div className="space-y-2 font-mono text-sm">
                {data.map((row) => {
                  const collectionRate =
                    row.reservationTotal > 0
                      ? Math.round((row.paidTotal / row.reservationTotal) * 100)
                      : 0;
                  return (
                    <div key={`paid-${row.month}`} className="flex items-center gap-3">
                      <span className="w-12 text-gray-600">{row.month}</span>
                      <div className="flex-1">
                        <div className="text-orange-600">{renderBar(row.paidTotal, maxRevenue)}</div>
                      </div>
                      <span className="w-32 text-right text-gray-700">
                        {formatMoney(row.paidTotal)} ({collectionRate}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">월별 요약</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-3 text-gray-600 font-semibold">월</th>
                      <th className="text-right py-2 px-3 text-gray-600 font-semibold">예약 건수</th>
                      <th className="text-right py-2 px-3 text-gray-600 font-semibold">예약 매출</th>
                      <th className="text-right py-2 px-3 text-gray-600 font-semibold">결제 금액</th>
                      <th className="text-right py-2 px-3 text-gray-600 font-semibold">수금률</th>
                      <th className="text-right py-2 px-3 text-gray-600 font-semibold">평균 금액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((row) => {
                      const collectionRate =
                        row.reservationTotal > 0
                          ? Math.round((row.paidTotal / row.reservationTotal) * 100)
                          : 0;
                      const avgAmount =
                        row.reservationCount > 0
                          ? Math.round(row.reservationTotal / row.reservationCount)
                          : 0;
                      return (
                        <tr
                          key={row.month}
                          className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                        >
                          <td className="py-2 px-3 text-gray-700">{row.month}</td>
                          <td className="text-right py-2 px-3 text-gray-700 font-semibold">
                            {row.reservationCount}
                          </td>
                          <td className="text-right py-2 px-3 text-emerald-700 font-semibold">
                            {formatMoney(row.reservationTotal)}
                          </td>
                          <td className="text-right py-2 px-3 text-orange-700 font-semibold">
                            {formatMoney(row.paidTotal)}
                          </td>
                          <td className="text-right py-2 px-3 text-blue-700 font-semibold">
                            {collectionRate}%
                          </td>
                          <td className="text-right py-2 px-3 text-gray-700">
                            {formatMoney(avgAmount)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
