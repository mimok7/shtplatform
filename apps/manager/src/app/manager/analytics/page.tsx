'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import ManagerLayout from '@/components/ManagerLayout';

const SERVICE_LABELS: Record<string, string> = {
  cruise: '크루즈', airport: '공항', hotel: '호텔', tour: '투어',
  rentcar: '렌터카', sht: '스하차량', car: '크루즈차량', car_sht: 'car_sht',
};
const SERVICE_DISPLAY_ORDER = ['cruise', 'car', 'sht', 'airport', 'rentcar', 'tour', 'hotel', 'car_sht'];
const STATUS_LABELS: Record<string, string> = {
  pending: '대기', approved: '승인', confirmed: '확정',
  completed: '완료', cancelled: '취소', deleted: '삭제',
};
const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-blue-100 text-blue-800',
  confirmed: 'bg-green-100 text-green-800',
  completed: 'bg-gray-100 text-gray-700',
  cancelled: 'bg-red-100 text-red-800',
  deleted: 'bg-gray-200 text-gray-500',
};

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

function toLocalDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseLocalDate(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function formatDateKo(dateStr: string) {
  if (!dateStr) return '';
  const d = parseLocalDate(dateStr);
  return `${dateStr} (${WEEKDAY_KO[d.getDay()]})`;
}

function addDays(dateStr: string, delta: number) {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + delta);
  return toLocalDateString(d);
}

type TabType = 'daily_stats' | 'status_log';

export default function AnalyticsPage() {
  const [isMounted, setIsMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('daily_stats');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const todayStr = toLocalDateString(new Date());

  // 단일 날짜 선택 (일별 빠른 조회)
  const [singleDate, setSingleDate] = useState(todayStr);

  // 기간 조회 입력값
  const [rangeFrom, setRangeFrom] = useState(() => addDays(todayStr, -7));
  const [rangeTo, setRangeTo] = useState(todayStr);

  // 실제 쿼리에 사용되는 날짜 (single 또는 range로 설정됨)
  const [statsDateFrom, setStatsDateFrom] = useState(todayStr);
  const [statsDateTo, setStatsDateTo] = useState(todayStr);

  const [statsServiceFilter, setStatsServiceFilter] = useState('all');
  const [statsRows, setStatsRows] = useState<any[]>([]);

  const [logDateFrom, setLogDateFrom] = useState(todayStr);
  const [logDateTo, setLogDateTo] = useState(todayStr);
  const [logSingleDate, setLogSingleDate] = useState(todayStr);
  const [logRangeFrom, setLogRangeFrom] = useState(() => addDays(todayStr, -7));
  const [logRangeTo, setLogRangeTo] = useState(todayStr);
  const [logRows, setLogRows] = useState<any[]>([]);
  const [logTotal, setLogTotal] = useState(0);
  const [logPage, setLogPage] = useState(0);
  const LOG_PAGE_SIZE = 50;

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (activeTab === 'daily_stats') loadStats();
  }, [activeTab, statsDateFrom, statsDateTo, statsServiceFilter]);

  useEffect(() => {
    if (activeTab === 'status_log') loadLog();
  }, [activeTab, logDateFrom, logDateTo, logPage]);

  // 초기 로드 시에도 상태 로그를 오늘 날짜 기준으로 미리 로드
  useEffect(() => {
    loadLog();
  }, []);

  const handleSingleDateChange = (date: string) => {
    setSingleDate(date);
    setStatsDateFrom(date);
    setStatsDateTo(date);
  };

  const handleRangeQuery = () => {
    setSingleDate('');
    setStatsDateFrom(rangeFrom);
    setStatsDateTo(rangeTo);
  };

  const handleLogSingleDateChange = (date: string) => {
    setLogSingleDate(date);
    setLogDateFrom(date);
    setLogDateTo(date);
    setLogPage(0);
  };

  const handleLogRangeQuery = () => {
    setLogSingleDate('');
    setLogDateFrom(logRangeFrom);
    setLogDateTo(logRangeTo);
    setLogPage(0);
  };

  // 1000건 제한 해결: range 루프로 전체 데이터 조회
  const loadStats = async () => {
    setLoading(true);
    try {
      const PAGE_SIZE = 1000;
      let allData: any[] = [];
      let offset = 0;
      while (true) {
        let query = supabase
          .from('reservation_daily_stats')
          .select('*')
          .gte('stat_date', statsDateFrom)
          .lte('stat_date', statsDateTo)
          .order('stat_date', { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);
        if (statsServiceFilter !== 'all') query = query.eq('service_type', statsServiceFilter);
        const { data, error } = await query;
        if (error) throw error;
        allData = allData.concat(data || []);
        if (!data || data.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }
      setStatsRows(allData);
    } catch (e) {
      console.error('통계 조회 오류:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadLog = async () => {
    setLoading(true);
    try {
      const from = `${logDateFrom}T00:00:00+09:00`;
      const to = `${logDateTo}T23:59:59+09:00`;
      const { data } = await supabase
        .from('reservation_status_log')
        .select('*')
        .gte('changed_at', from)
        .lte('changed_at', to)
        .order('changed_at', { ascending: false })
        .range(logPage * LOG_PAGE_SIZE, (logPage + 1) * LOG_PAGE_SIZE - 1);

      const rawRows = data || [];
      const reservationIds = Array.from(new Set(rawRows.map((r: any) => r.reservation_id).filter(Boolean)));
      const changedByIds = Array.from(new Set(
        rawRows
          .map((r: any) => r.changed_by)
          .filter((v: any) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v))
      ));
      let enrichedRows = rawRows;

      let changedByEmailMap = new Map<string, string>();
      if (changedByIds.length > 0) {
        const { data: changedByUsers } = await supabase
          .from('users')
          .select('id, email')
          .in('id', changedByIds);
        changedByEmailMap = new Map<string, string>(
          (changedByUsers || [])
            .filter((u: any) => u?.id && u?.email)
            .map((u: any) => [u.id, u.email])
        );
      }

      if (reservationIds.length > 0) {
        const { data: reservationRows } = await supabase
          .from('reservation')
          .select('re_id, re_user_id')
          .in('re_id', reservationIds);

        const reservationMap = new Map<string, any>((reservationRows || []).map((r: any) => [r.re_id, r]));
        const userIds = Array.from(new Set((reservationRows || []).map((r: any) => r.re_user_id).filter(Boolean)));

        let userMap = new Map<string, any>();
        if (userIds.length > 0) {
          const { data: userRows } = await supabase
            .from('users')
            .select('id, name, email')
            .in('id', userIds);
          userMap = new Map<string, any>((userRows || []).map((u: any) => [u.id, u]));
        }

        enrichedRows = rawRows.map((row: any) => {
          const reservation = reservationMap.get(row.reservation_id);
          const reserver = reservation?.re_user_id ? userMap.get(reservation.re_user_id) : null;
          const candidateEmail = row.changed_by_email || changedByEmailMap.get(row.changed_by) || row.changed_by || null;
          const changedByDisplay = candidateEmail && String(candidateEmail).includes('@')
            ? String(candidateEmail).split('@')[0]
            : (candidateEmail || 'system');
          return {
            ...row,
            reserver_name: reserver?.name || '-',
            reserver_email: reserver?.email || '-',
            changed_by_display: changedByDisplay,
          };
        });
      } else {
        enrichedRows = rawRows.map((row: any) => {
          const candidateEmail = row.changed_by_email || changedByEmailMap.get(row.changed_by) || row.changed_by || null;
          const changedByDisplay = candidateEmail && String(candidateEmail).includes('@')
            ? String(candidateEmail).split('@')[0]
            : (candidateEmail || 'system');
          return {
            ...row,
            changed_by_display: changedByDisplay,
          };
        });
      }

      const { count } = await supabase
        .from('reservation_status_log')
        .select('*', { count: 'exact', head: true })
        .gte('changed_at', from)
        .lte('changed_at', to);
      setLogRows(enrichedRows || []);
      setLogTotal(count || 0);
    } catch (e) {
      console.error('로그 조회 오류:', e);
    } finally {
      setLoading(false);
    }
  };

  const allStatuses = ['pending', 'approved', 'confirmed', 'completed', 'cancelled'];

  const byDate: Record<string, any[]> = {};
  for (const r of statsRows) {
    if (!byDate[r.stat_date]) byDate[r.stat_date] = [];
    byDate[r.stat_date].push(r);
  }
  const dates = Object.keys(byDate).sort().reverse();

  const totalLogPages = Math.ceil(logTotal / LOG_PAGE_SIZE);

  if (!isMounted) {
    return (
      <ManagerLayout title="예약 통계" activeTab="analytics">
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        </div>
      </ManagerLayout>
    );
  }

  return (
    <ManagerLayout title="예약 통계" activeTab="analytics">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('daily_stats')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                activeTab === 'daily_stats' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-600 hover:bg-white'
              }`}
            >
              📊 일별 통계
            </button>
            <button
              onClick={() => setActiveTab('status_log')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                activeTab === 'status_log' ? 'bg-rose-600 text-white shadow-md' : 'text-gray-600 hover:bg-white'
              }`}
            >
              📝 상태 변경 로그
            </button>
          </div>
          <button
            onClick={() => router.push('/manager/reservations/analytics')}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-md text-sm font-medium hover:bg-emerald-700 transition-all shadow-sm"
          >
            📈 예약 통계
          </button>
        </div>

        {loading && (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
          </div>
        )}

        {activeTab === 'daily_stats' && !loading && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                {/* 왼쪽: 단일 날짜 선택 (달력 클릭) */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleSingleDateChange(addDays(singleDate || statsDateFrom, -1))}
                    className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-800 transition-colors"
                    title="이전 날"
                  >
                    ◀
                  </button>
                  <label className="relative cursor-pointer" title="클릭하여 날짜 선택">
                    <input
                      type="date"
                      value={singleDate || statsDateFrom}
                      onChange={e => handleSingleDateChange(e.target.value)}
                      className="absolute inset-0 opacity-0 w-full cursor-pointer"
                    />
                    <div className={`px-4 py-2 rounded-lg border text-sm font-semibold select-none transition-colors ${singleDate ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-gray-50 border-gray-200 text-gray-700'}`}>
                      📅 {formatDateKo(singleDate || statsDateFrom)}
                    </div>
                  </label>
                  <button
                    onClick={() => handleSingleDateChange(addDays(singleDate || statsDateFrom, 1))}
                    className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-800 transition-colors"
                    title="다음 날"
                  >
                    ▶
                  </button>
                  <button
                    onClick={() => handleSingleDateChange(todayStr)}
                    className="ml-1 px-2 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded text-gray-600 transition-colors"
                  >
                    오늘
                  </button>
                </div>

                {/* 오른쪽: 기간 조회 */}
                <div className="flex flex-wrap items-center gap-2 ml-auto">
                  <span className="text-xs text-gray-400">기간 조회</span>
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">시작일</label>
                    <input type="date" value={rangeFrom} onChange={e => setRangeFrom(e.target.value)}
                      className="px-2 py-1 border border-gray-200 rounded text-sm" />
                  </div>
                  <span className="text-gray-400 text-sm mt-4">~</span>
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">종료일</label>
                    <input type="date" value={rangeTo} onChange={e => setRangeTo(e.target.value)}
                      className="px-2 py-1 border border-gray-200 rounded text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">서비스</label>
                    <select value={statsServiceFilter} onChange={e => setStatsServiceFilter(e.target.value)}
                      className="px-2 py-1 border border-gray-200 rounded text-sm">
                      <option value="all">전체</option>
                      {Object.entries(SERVICE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={handleRangeQuery}
                    className="px-3 py-1 bg-indigo-500 text-white rounded text-sm hover:bg-indigo-600 mt-4"
                  >
                    조회
                  </button>
                </div>
              </div>
              {/* 현재 조회 범위 표시 */}
              {statsDateFrom !== statsDateTo && (
                <div className="mt-2 text-xs text-gray-400">
                  조회 기간: {statsDateFrom} ~ {statsDateTo}
                </div>
              )}
            </div>

            {dates.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm border p-8 text-center text-gray-500">
                해당 기간에 통계 데이터가 없습니다.
              </div>
            ) : (
              dates.map(date => {
                const dayRows = byDate[date];
                const serviceTotals: Record<string, Record<string, number>> = {};
                let grandTotal = 0;
                for (const r of dayRows) {
                  if (!serviceTotals[r.service_type]) serviceTotals[r.service_type] = {};
                  serviceTotals[r.service_type][r.status] = r.count;
                  grandTotal += r.count;
                }
                const orderedServices = [
                  ...SERVICE_DISPLAY_ORDER.filter(svc => serviceTotals[svc]),
                  ...Object.keys(serviceTotals).filter(svc => !SERVICE_DISPLAY_ORDER.includes(svc)).sort(),
                ];
                return (
                  <div key={date} className="bg-white rounded-lg shadow-sm border">
                    <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
                      <span className="font-medium text-sm">{formatDateKo(date)}</span>
                      <span className="text-xs text-gray-500">총 {grandTotal}건</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 text-gray-600">
                            <th className="px-3 py-2 text-left font-medium">서비스</th>
                            {allStatuses.map(s => (
                              <th key={s} className="px-3 py-2 text-center font-medium">{STATUS_LABELS[s] || s}</th>
                            ))}
                            <th className="px-3 py-2 text-center font-medium">합계</th>
                          </tr>
                        </thead>
                        <tbody>
                          {orderedServices.map(svc => {
                            const svcData = serviceTotals[svc] || {};
                            const svcTotal = Object.values(svcData).reduce((a, b) => a + b, 0);
                            return (
                              <tr key={svc} className="border-t">
                                <td className="px-3 py-2 font-medium">{SERVICE_LABELS[svc] || svc}</td>
                                {allStatuses.map(s => (
                                  <td key={s} className="px-3 py-2 text-center">
                                    {svcData[s] ? (
                                      <span className={`inline-block px-2 py-0.5 rounded text-xs ${STATUS_COLORS[s] || 'bg-gray-100'}`}>
                                        {svcData[s]}
                                      </span>
                                    ) : <span className="text-gray-300">-</span>}
                                  </td>
                                ))}
                                <td className="px-3 py-2 text-center font-medium">{svcTotal}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'status_log' && !loading && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleLogSingleDateChange(addDays(logSingleDate || logDateFrom, -1))}
                    className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-800 transition-colors"
                    title="이전 날"
                  >
                    ◀
                  </button>
                  <label className="relative cursor-pointer" title="클릭하여 날짜 선택">
                    <input
                      type="date"
                      value={logSingleDate || logDateFrom}
                      onChange={e => handleLogSingleDateChange(e.target.value)}
                      className="absolute inset-0 opacity-0 w-full cursor-pointer"
                    />
                    <div className={`px-4 py-2 rounded-lg border text-sm font-semibold select-none transition-colors ${logSingleDate ? 'bg-rose-50 border-rose-300 text-rose-700' : 'bg-gray-50 border-gray-200 text-gray-700'}`}>
                      📅 {formatDateKo(logSingleDate || logDateFrom)}
                    </div>
                  </label>
                  <button
                    onClick={() => handleLogSingleDateChange(addDays(logSingleDate || logDateFrom, 1))}
                    className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-800 transition-colors"
                    title="다음 날"
                  >
                    ▶
                  </button>
                  <button
                    onClick={() => handleLogSingleDateChange(todayStr)}
                    className="ml-1 px-2 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded text-gray-600 transition-colors"
                  >
                    오늘
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2 ml-auto">
                  <span className="text-xs text-gray-400">기간 조회</span>
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">시작일</label>
                    <input type="date" value={logRangeFrom} onChange={e => setLogRangeFrom(e.target.value)}
                      className="px-2 py-1 border border-gray-200 rounded text-sm" />
                  </div>
                  <span className="text-gray-400 text-sm mt-4">~</span>
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">종료일</label>
                    <input type="date" value={logRangeTo} onChange={e => setLogRangeTo(e.target.value)}
                      className="px-2 py-1 border border-gray-200 rounded text-sm" />
                  </div>
                  <button onClick={handleLogRangeQuery}
                    className="px-3 py-1 bg-rose-500 text-white rounded text-sm hover:bg-rose-600 mt-4">
                    조회
                  </button>
                  <span className="text-xs text-gray-500 self-center mt-4">총 {logTotal}건</span>
                </div>
              </div>
              {logDateFrom !== logDateTo && (
                <div className="mt-2 text-xs text-gray-400">
                  조회 기간: {logDateFrom} ~ {logDateTo}
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg shadow-sm border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-600">
                    <th className="px-3 py-2 text-left font-medium">변경일시</th>
                    <th className="px-3 py-2 text-left font-medium">예약ID</th>
                    <th className="px-3 py-2 text-left font-medium">예약자</th>
                    <th className="px-3 py-2 text-left font-medium">서비스</th>
                    <th className="px-3 py-2 text-center font-medium">변경 상태</th>
                    <th className="px-3 py-2 text-left font-medium">변경자</th>
                  </tr>
                </thead>
                <tbody>
                  {logRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                        해당 기간에 상태 변경 로그가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    logRows.map((row: any, idx: number) => (
                      <tr key={`${row.reservation_id}-${idx}`} className="border-t hover:bg-gray-50">
                        <td className="px-3 py-2 text-xs whitespace-nowrap">
                          {new Date(row.changed_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-3 py-2 text-xs font-mono">{row.reservation_id || '-'}</td>
                        <td className="px-3 py-2 text-xs">{row.reserver_name || row.reserver_email || '-'}</td>
                        <td className="px-3 py-2">{SERVICE_LABELS[row.re_type] || row.re_type || '-'}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs ${STATUS_COLORS[row.new_status] || 'bg-gray-100'}`}>
                            {STATUS_LABELS[row.new_status] || row.new_status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs">{row.changed_by_display || row.changed_by_email || row.changed_by || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {totalLogPages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <button disabled={logPage === 0} onClick={() => setLogPage(p => p - 1)}
                  className="px-3 py-1 text-sm border rounded disabled:opacity-40 hover:bg-gray-50">이전</button>
                <span className="text-sm text-gray-600">{logPage + 1} / {totalLogPages}</span>
                <button disabled={logPage >= totalLogPages - 1} onClick={() => setLogPage(p => p + 1)}
                  className="px-3 py-1 text-sm border rounded disabled:opacity-40 hover:bg-gray-50">다음</button>
              </div>
            )}
          </div>
        )}
      </div>
    </ManagerLayout>
  );
}
