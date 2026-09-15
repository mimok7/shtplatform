'use client';
// 고객명으로 예약 상태 단계별 처리자를 확인하는 관리자 화면.

import { FormEvent, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, Search, UserRound } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import supabase from '@/lib/supabase';

type StatusHistory = {
  id: number;
  reservationId: string;
  customerName: string;
  customerEmail: string;
  reservationType: string;
  currentStatus: string;
  previousStatus: string;
  nextStatus: string;
  processorName: string;
  processorEmail: string;
  changedAt: string;
  note: string;
};

const STATUS_LABELS: Record<string, string> = {
  pending: '대기',
  approved: '승인',
  confirmed: '확정',
  completed: '완료',
  cancelled: '취소',
};

const TYPE_LABELS: Record<string, string> = {
  cruise: '크루즈',
  airport: '공항',
  hotel: '호텔',
  rentcar: '렌터카',
  tour: '투어',
  ticket: '티켓',
  sht: '스하 차량',
  car: '차량',
  car_sht: '스하 차량',
  package: '패키지',
};

function statusLabel(status: string) {
  return STATUS_LABELS[status] || status || '-';
}

function formatKoreanDateTime(value: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

export default function ReservationStatusHandlersPage() {
  return (
    <AdminLayout title="처리자 조회" activeTab="reservation-status-handlers">
      <ReservationStatusHandlersContent />
    </AdminLayout>
  );
}

function ReservationStatusHandlersContent() {
  const [customerName, setCustomerName] = useState('');
  const [histories, setHistories] = useState<StatusHistory[]>([]);
  const [searchedName, setSearchedName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const search = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = customerName.trim();
    if (!normalizedName) {
      setError('고객명을 입력해 주세요.');
      setHistories([]);
      return;
    }

    try {
      setLoading(true);
      setError('');
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (sessionError || !accessToken) throw new Error('로그인 정보를 확인하지 못했습니다. 다시 로그인해 주세요.');

      const response = await fetch(`/api/admin/reservation-status-handlers?customerName=${encodeURIComponent(normalizedName)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || '처리자 이력을 불러오지 못했습니다.');

      setHistories(Array.isArray(result.histories) ? result.histories : []);
      setSearchedName(normalizedName);
    } catch (searchError) {
      setHistories([]);
      setError(searchError instanceof Error ? searchError.message : '처리자 이력을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <section className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-blue-100 p-2 text-blue-700"><UserRound className="h-5 w-5" /></div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">예약 처리자 조회</h2>
            <p className="mt-1 text-sm text-gray-600">고객명을 검색하면 예약 상태가 변경된 단계별 처리자와 처리 시각을 확인할 수 있습니다.</p>
          </div>
        </div>

        <form onSubmit={search} className="mt-5 flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor="customer-name">고객명</label>
          <input
            id="customer-name"
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
            placeholder="고객명 입력"
            className="min-w-0 flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            <Search className="h-4 w-4" />
            {loading ? '조회 중' : '조회'}
          </button>
        </form>
      </section>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {searchedName && !loading && !error && histories.length === 0 && (
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-12 text-center text-sm text-gray-600">
          <Clock3 className="mx-auto mb-3 h-8 w-8 text-gray-300" />
          <p><strong>{searchedName}</strong> 고객의 상태 변경 이력이 없습니다.</p>
        </div>
      )}

      {histories.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-5 py-4">
            <h3 className="font-semibold text-gray-900">{searchedName} 검색 결과</h3>
            <p className="mt-1 text-sm text-gray-600">총 {histories.length}건의 상태 변경 이력입니다. 처리 시각은 한국시간 기준입니다.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs text-gray-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">고객</th>
                  <th className="px-4 py-3 font-semibold">예약</th>
                  <th className="px-4 py-3 font-semibold">처리 단계</th>
                  <th className="px-4 py-3 font-semibold">처리자</th>
                  <th className="px-4 py-3 font-semibold">처리 일시</th>
                  <th className="px-4 py-3 font-semibold">현재 상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {histories.map((history) => (
                  <tr key={history.id} className="align-top hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900">
                      <p className="font-medium">{history.customerName}</p>
                      {history.customerEmail && <p className="mt-0.5 text-xs text-gray-500">{history.customerEmail}</p>}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      <p>{TYPE_LABELS[history.reservationType] || history.reservationType || '-'}</p>
                      <p className="mt-0.5 font-mono text-xs text-gray-400">{history.reservationId.slice(0, 8)}</p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-800">
                      {statusLabel(history.previousStatus)} <span className="px-1 text-gray-400">→</span> {statusLabel(history.nextStatus)}
                    </td>
                    <td className="px-4 py-3 text-gray-900">
                      <p className="font-medium">{history.processorName}</p>
                      {history.processorEmail && <p className="mt-0.5 text-xs text-gray-500">{history.processorEmail}</p>}
                      {history.note && <p className="mt-1 text-xs text-gray-400">{history.note}</p>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">{formatKoreanDateTime(history.changedAt)}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                        <CheckCircle2 className="h-3.5 w-3.5" /> {statusLabel(history.currentStatus)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
