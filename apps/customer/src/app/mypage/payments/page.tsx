'use client';
// 고객이 본인의 결제 금액과 OnePay 결제 링크를 확인하는 화면
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CreditCard, ExternalLink, RefreshCw, ShieldCheck } from 'lucide-react';
import PageWrapper from '@/components/PageWrapper';
import supabase from '@/lib/supabase';

interface PaymentRow {
  id: string;
  reservationId: string;
  quoteId: string | null;
  amount: number;
  status: string;
  method: string | null;
  serviceType: string | null;
  reservationDate: string | null;
  paymentUrl: string | null;
  updatedAt: string | null;
}

interface PaymentGroup {
  key: string;
  paymentUrl: string | null;
  payments: PaymentRow[];
  amount: number;
}

const SERVICE_LABELS: Record<string, string> = {
  cruise: '크루즈',
  airport: '공항 이동',
  rentcar: '렌터카',
  hotel: '호텔',
  tour: '투어',
  ticket: '티켓',
  package: '패키지',
  car: '차량',
  cruise_car: '크루즈 차량',
  sht: '차량',
};

function formatAmount(value: number): string {
  return `${Math.round(value).toLocaleString('ko-KR')} ₫`;
}

function formatDate(value: string | null): string {
  if (!value) return '일정 확인 중';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

export default function PaymentsPage() {
  const router = useRouter();
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadPayments = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        router.replace('/login');
        return;
      }

      const response = await fetch('/api/payments/invoice', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));

      if (response.status === 401) {
        router.replace('/login');
        return;
      }
      if (!response.ok) {
        throw new Error(result?.error || '결제 정보를 불러오지 못했습니다.');
      }

      setPayments(Array.isArray(result?.payments) ? result.payments : []);
    } catch (loadError) {
      console.error('결제 정보 불러오기 실패', loadError);
      setError(loadError instanceof Error ? loadError.message : '결제 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  const groups = useMemo<PaymentGroup[]>(() => {
    const grouped = new Map<string, PaymentGroup>();

    payments.forEach((payment) => {
      const key = payment.paymentUrl || `payment-${payment.id}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.payments.push(payment);
        existing.amount += payment.amount;
        return;
      }

      grouped.set(key, {
        key,
        paymentUrl: payment.paymentUrl,
        payments: [payment],
        amount: payment.amount,
      });
    });

    return [...grouped.values()];
  }, [payments]);

  const totalAmount = useMemo(
    () => groups.reduce((total, group) => total + group.amount, 0),
    [groups],
  );

  return (
    <PageWrapper title="결제하기" description="담당자가 안내한 결제 내역을 확인하고 OnePay에서 결제할 수 있습니다.">
      <div className="mx-auto max-w-2xl space-y-4">
        <section className="rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 p-5 text-white shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-emerald-100">결제 대기 금액</p>
              <p className="mt-1 text-2xl font-bold text-right tabular-nums">{formatAmount(totalAmount)}</p>
            </div>
            <div className="rounded-full bg-white/15 p-3">
              <CreditCard className="h-7 w-7" aria-hidden="true" />
            </div>
          </div>
        </section>

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
            <RefreshCw className="mx-auto mb-3 h-6 w-6 animate-spin text-emerald-600" aria-hidden="true" />
            결제 정보를 확인하고 있습니다.
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-5">
            <p className="text-sm text-red-700">{error}</p>
            <button
              type="button"
              onClick={loadPayments}
              className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              다시 확인
            </button>
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
            <ShieldCheck className="mx-auto mb-3 h-8 w-8 text-emerald-600" aria-hidden="true" />
            <p className="font-semibold text-slate-900">현재 결제할 내역이 없습니다.</p>
            <p className="mt-1 text-sm text-slate-500">새로운 결제 안내가 등록되면 이곳에서 확인할 수 있습니다.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => {
              const representative = group.payments[0];
              const serviceNames = [...new Set(group.payments.map((payment) => (
                SERVICE_LABELS[payment.serviceType || ''] || '여행 서비스'
              )))];

              return (
                <article key={group.key} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{serviceNames.join(' · ')}</p>
                      <p className="mt-1 text-xs text-slate-500">이용일 {formatDate(representative.reservationDate)}</p>
                      {group.payments.length > 1 && (
                        <p className="mt-1 text-xs text-slate-500">결제 항목 {group.payments.length}건</p>
                      )}
                    </div>
                    <p className="shrink-0 text-right text-lg font-bold tabular-nums text-slate-900">
                      {formatAmount(group.amount)}
                    </p>
                  </div>

                  {group.paymentUrl ? (
                    <a
                      href={group.paymentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-700"
                    >
                      OnePay에서 결제하기
                      <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    </a>
                  ) : (
                    <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-center text-sm font-medium text-amber-800">
                      담당자가 결제 링크를 준비하고 있습니다.
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}

        <p className="px-1 text-xs leading-5 text-slate-500">
          결제는 OnePay 보안 화면에서 진행됩니다. 결제 후 처리 상태는 담당자 확인을 거쳐 반영됩니다.
        </p>
      </div>
    </PageWrapper>
  );
}
