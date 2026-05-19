'use client';

import React, { useEffect, useState, useMemo } from 'react';
import supabase from '@/lib/supabase';
import AdminLayout from '@/components/AdminLayout';

type DailyRevenueRow = {
  date: string;
  reservationCount: number;
  reservationTotal: number;
  paidCount: number;
  paidTotal: number;
};

export default function DailyRevenuePage() {
  const [data, setData] = useState<DailyRevenueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>('');

  useEffect(() => {
    fetchDailyData();
  }, []);

  const fetchDailyData = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: reservations, error: resError } = await supabase
        .from('reservation')
        .select('re_created_at, total_amount')
        .in('re_status', ['confirmed', 'approved', 'completed']);

      if (resError) throw resError;

      const { data: payments, error: payError } = await supabase
        .from('reservation_payment')
        .select('created_at, amount')
        .eq('payment_status', 'completed');

      if (payError) throw payError;

      const dateMap = new Map<string, DailyRevenueRow>();
      const ninetyDaysAgoTime = new Date();
      ninetyDaysAgoTime.setDate(ninetyDaysAgoTime.getDate() - 90);

      (reservations || []).forEach((r: any) => {
        const date = r.re_created_at?.slice(0, 10);
        if (!date) return;
        const rowDate = new Date(date);
        if (rowDate < ninetyDaysAgoTime) return;

        const row = dateMap.get(date) || {
          date,
          reservationCount: 0,
          reservationTotal: 0,
          paidCount: 0,
          paidTotal: 0,
        };
        row.reservationCount += 1;
        row.reservationTotal += Number(r.total_amount) || 0;
        dateMap.set(date, row);
      });

      (payments || []).forEach((p: any) => {
        const date = p.created_at?.slice(0, 10);
        if (!date) return;
        const rowDate = new Date(date);
        if (rowDate < ninetyDaysAgoTime) return;

        const row = dateMap.get(date) || {
          date,
          reservationCount: 0,
          reservationTotal: 0,
          paidCount: 0,
          paidTotal: 0,
        };
        row.paidCount += 1;
        row.paidTotal += Number(p.amount) || 0;
        dateMap.set(date, row);
      });

      const sortedData = Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
      setData(sortedData);

      if (sortedData.length > 0) {
        const lastDate = sortedData[sortedData.length - 1].date;
        setSelectedMonth(lastDate.slice(0, 7));
      }
    } catch (err) {
      console.error('데이터 조회 실패:', err);
      setError(err instanceof Error ? err.message : '데이터 조회 실패');
    } finally {
      setLoading(false);
    }
  };

  const filteredData = useMemo(() => {
    if (!selectedMonth) return data;
    const monthRows = data.filter((d) => d.date.startsWith(selectedMonth));
    const [year, month] = selectedMonth.split('-').map(Number);
    if (!year || !month) return monthRows;
    const daysInMonth = new Date(year, month, 0).getDate();
    const dataMap = new Map(monthRows.map((row) => [row.date, row]));
    return Array.from({ length: daysInMonth }, (_, i) => {
      const date = `${selectedMonth}-${String(i + 1).padStart(2, '0')}`;
      return (
        dataMap.get(date) || {
          date,
          reservationCount: 0,
          reservationTotal: 0,
          paidCount: 0,
          paidTotal: 0,
        }
      );
    });
  }, [data, selectedMonth]);

  const maxRevenue = Math.max(...filteredData.map((r) => r.reservationTotal), 1);
  const maxCount = Math.max(...filteredData.map((r) => r.reservationCount), 1);

  const uniqueMonths = useMemo(() => Array.from(new Set(data.map((d) => d.date.slice(0, 7)))).sort((a, b) => b.localeCompare(a)), [data]);

  const renderBar = (value: number, max: number, maxWidth = 40) => {
    if (value <= 0 || max <= 0) return '';
    const width = Math.max(1, Math.round((value / max) * maxWidth));
    return '█'.repeat(width);
  };

  const formatMoney = (n: number) => `VND ${Math.round(n).toLocaleString('en-US')}`;

  const weekdayStats = useMemo(() => {
    const labels = ['월', '화', '수', '목', '금', '토', '일'];
    const agg = labels.map(() => ({ reservationCount: 0, reservationTotal: 0 }));
    filteredData.forEach((row) => {
      const d = new Date(row.date);
      if (isNaN(d.getTime())) return;
      const dow = (d.getDay() + 6) % 7; // shift Sunday->6, Monday->0
      agg[dow].reservationCount += row.reservationCount;
      agg[dow].reservationTotal += row.reservationTotal;
    });
    return {
      labels,
      agg,
      maxCount: Math.max(...agg.map((a) => a.reservationCount), 1),
      maxTotal: Math.max(...agg.map((a) => a.reservationTotal), 1),
    };
  }, [filteredData]);

  return (
    <AdminLayout title="일별 매출 현황">
      <div className="space-y-6">
        {loading && (
          <div className="flex items-center justify-center h-40">
            <div className="text-gray-500">데이터 로딩 중...</div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">오류: {error}</div>
        )}

        {!loading && !error && (
          <>
            {/* 월 선택 */}
            <div className="bg-white rounded-lg shadow-sm p-4">
              <div className="flex items-center gap-3">
                <label className="w-36 text-sm font-semibold text-gray-700 text-right flex-shrink-0">월 선택:</label>
                <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  {uniqueMonths.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 일별 통합 그래프 */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between gap-4 mb-4">
                <h3 className="text-lg font-semibold text-gray-900">일별 건수 · 매출액 통합 그래프</h3>
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
                {filteredData.length === 0 ? (
                  <div className="text-gray-500 py-4">데이터가 없습니다.</div>
                ) : (
                  <div className="min-w-max">
                    <div className="h-72 rounded-lg border border-gray-300 bg-gradient-to-b from-gray-50 to-white p-4">
                      <div className="flex h-full items-end">
                        {filteredData.map((row) => {
                          const countHeight = maxCount > 0 ? Math.max((row.reservationCount / maxCount) * 100, row.reservationCount > 0 ? 4 : 0) : 0;
                          const revenueHeight = maxRevenue > 0 ? Math.max((row.reservationTotal / maxRevenue) * 100, row.reservationTotal > 0 ? 4 : 0) : 0;

                          return (
                            <div key={row.date} className="flex min-w-[34px] flex-1 flex-col items-center justify-end gap-2 border-r border-gray-300 first:border-l">
                              <div className="text-[10px] leading-none text-gray-400">{row.reservationCount}</div>
                              <div className="flex h-52 w-full items-end justify-center gap-1 border-t border-dashed border-gray-300 px-1 pt-2">
                                <div className="w-3 rounded-t-sm bg-blue-500" style={{ height: `${countHeight}%` }} title={`${row.date} 건수 ${row.reservationCount}건`} />
                                <div className="w-3 rounded-t-sm bg-emerald-500" style={{ height: `${revenueHeight}%` }} title={`${row.date} 매출액 ${formatMoney(row.reservationTotal)}`} />
                              </div>
                              <div className="w-full border-t border-gray-300 pt-2 text-center text-[10px] leading-none text-gray-500">{row.date.slice(8)}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3 text-xs md:grid-cols-5">
                      {filteredData.map((row) => (
                        <div key={`summary-${row.date}`} className="rounded border border-gray-300 px-3 py-2">
                          <div className="font-semibold text-gray-700">{row.date.slice(5)}</div>
                          <div className="mt-1 text-blue-700">건수 {row.reservationCount}건</div>
                          <div className="text-emerald-700">매출 {formatMoney(row.reservationTotal)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 요일별 통계 */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">요일별 통계</h3>

              <div className="space-y-3">
                <div className="grid grid-cols-7 gap-3 items-end">
                  {weekdayStats.agg.map((a, idx) => (
                    <div key={`wd-${idx}`} className="text-center">
                      <div className="text-xs text-gray-500 mb-1">{weekdayStats.labels[idx]}</div>
                      <div className="h-24 flex items-end">
                        <div className="w-full">
                          <div className="relative h-3 bg-gray-100 rounded">
                            <div className="absolute left-0 top-0 h-3 rounded bg-blue-500" style={{ width: `${Math.round((a.reservationCount / weekdayStats.maxCount) * 100)}%` }} title={`건수 ${a.reservationCount}건`} />
                          </div>
                          <div className="mt-2 text-[11px] text-blue-700">{a.reservationCount}건</div>
                        </div>
                      </div>
                      <div className="mt-2 text-[11px] text-emerald-700">{formatMoney(a.reservationTotal)}</div>
                    </div>
                  ))}
                </div>
                <div className="text-xs text-gray-500">요일별 합계: 건수(파란색), 매출(녹색)</div>
              </div>
            </div>

            {/* 일별 결제 현황 */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">일별 결제 현황</h3>
              <div className="space-y-1.5 font-mono text-xs max-h-96 overflow-y-auto">
                {filteredData.length === 0 ? (
                  <div className="text-gray-500 py-4">데이터가 없습니다.</div>
                ) : (
                  filteredData.map((row) => {
                    const collectionRate = row.reservationTotal > 0 ? Math.round((row.paidTotal / row.reservationTotal) * 100) : 0;
                    return (
                      <div key={`paid-${row.date}`} className="flex items-center gap-2">
                        <span className="w-12 text-gray-600">{row.date.slice(5)}</span>
                        <div className="flex-1">
                          <div className="text-orange-600">{renderBar(row.paidTotal, maxRevenue, 35)}</div>
                        </div>
                        <span className="w-28 text-right text-gray-700">{formatMoney(row.paidTotal)} ({collectionRate}%)</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* 일별 상세 테이블 */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">일별 상세</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-3 text-gray-600 font-semibold">일자</th>
                      <th className="text-right py-2 px-3 text-gray-600 font-semibold">건수</th>
                      <th className="text-right py-2 px-3 text-gray-600 font-semibold">예약 매출</th>
                      <th className="text-right py-2 px-3 text-gray-600 font-semibold">결제액</th>
                      <th className="text-right py-2 px-3 text-gray-600 font-semibold">수금률</th>
                      <th className="text-right py-2 px-3 text-gray-600 font-semibold">일평균</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.map((row) => {
                      const collectionRate = row.reservationTotal > 0 ? Math.round((row.paidTotal / row.reservationTotal) * 100) : 0;
                      const avgAmount = row.reservationCount > 0 ? Math.round(row.reservationTotal / row.reservationCount) : 0;
                      return (
                        <tr key={row.date} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                          <td className="py-2 px-3 text-gray-700">{row.date.slice(5)}</td>
                          <td className="text-right py-2 px-3 text-gray-700 font-semibold">{row.reservationCount}</td>
                          <td className="text-right py-2 px-3 text-emerald-700 font-semibold">{formatMoney(row.reservationTotal)}</td>
                          <td className="text-right py-2 px-3 text-orange-700 font-semibold">{formatMoney(row.paidTotal)}</td>
                          <td className="text-right py-2 px-3 text-blue-700 font-semibold">{collectionRate}%</td>
                          <td className="text-right py-2 px-3 text-gray-700">{formatMoney(avgAmount)}</td>
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
