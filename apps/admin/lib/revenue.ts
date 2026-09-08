// 관리자 매출 통계의 기간 조회와 한국시간 날짜 변환을 담당하는 도구
import supabase from '@/lib/supabase';

export type ReservationRevenueRecord = {
  re_created_at: string | null;
  total_amount: number | string | null;
};

export type PaymentRevenueRecord = {
  created_at: string | null;
  amount: number | string | null;
};

const PAGE_SIZE = 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const REVENUE_QUERY_TIMEOUT_MS = 20_000;
const REVENUE_STATUSES = ['confirmed', 'approved', 'completed'];

export function toKstDateKey(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function getKstDateKeyDaysAgo(daysAgo: number): string {
  const kstNow = new Date(Date.now() + KST_OFFSET_MS);
  kstNow.setUTCDate(kstNow.getUTCDate() - daysAgo);
  return kstNow.toISOString().slice(0, 10);
}

export function getKstMonthStartDateKey(monthsAgo: number): string {
  const kstNow = new Date(Date.now() + KST_OFFSET_MS);
  kstNow.setUTCDate(1);
  kstNow.setUTCHours(0, 0, 0, 0);
  kstNow.setUTCMonth(kstNow.getUTCMonth() - monthsAgo);
  return kstNow.toISOString().slice(0, 10);
}

export function kstDateStartIso(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00+09:00`).toISOString();
}

async function fetchAllPages<T>(fetchPage: (_from: number, _to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) {
      const message = typeof error === 'object' && error && 'message' in error
        ? String(error.message)
        : '매출 데이터를 불러오지 못했습니다.';
      throw new Error(message);
    }

    const page = data || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error('매출 데이터 조회 시간이 초과되었습니다. 다시 시도해주세요.')),
      REVENUE_QUERY_TIMEOUT_MS,
    );
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

export async function fetchRevenueRecords(startIso: string): Promise<{
  reservations: ReservationRevenueRecord[];
  payments: PaymentRevenueRecord[];
}> {
  return withTimeout(
    Promise.all([
      fetchAllPages<ReservationRevenueRecord>((from, to) =>
        supabase
          .from('reservation')
          .select('re_created_at, total_amount')
          .in('re_status', REVENUE_STATUSES)
          .gte('re_created_at', startIso)
          .order('re_created_at', { ascending: true })
          .range(from, to),
      ),
      fetchAllPages<PaymentRevenueRecord>((from, to) =>
        supabase
          .from('reservation_payment')
          .select('created_at, amount')
          .eq('payment_status', 'completed')
          .gte('created_at', startIso)
          .order('created_at', { ascending: true })
          .range(from, to),
      ),
    ]).then(([reservations, payments]) => ({ reservations, payments })),
  );
}
