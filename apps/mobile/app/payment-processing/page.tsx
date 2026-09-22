'use client';

// 모바일에서 OnePay 송장 정보와 결제 상태를 관리하는 화면이다.
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle, Clock, Copy, CreditCard, ExternalLink, RefreshCw, Search, X } from 'lucide-react';
import ManagerLayout from '@/components/ManagerLayout';
import supabase from '@/lib/supabase';
import { fetchTableInBatches } from '@/lib/fetchInBatches';
import { getPreferredPaymentAmount } from '@sht/domain/reservation';
import { buildOnepayAutofillBookmark, buildOnepaySafariShortcutScript, copyAndOpenOnepayInvoice, getOnepayInvoiceFields, serializeOnepayInvoice } from '@/lib/onepayInvoiceTransfer';

const ONEPAY_INVOICE_CREATE_URL = 'https://onepay.vn/invoice/create_order.op';
const ONEPAY_INVOICE_TRANSACTION_URL = 'https://onepay.vn/invoice/transaction-management-2.op';
const EXPIRY_STORAGE_KEY = 'sht_mobile_onepay_invoice_expiry_hours';
const DEFAULT_EXPIRY_HOURS = 24;

type PaymentStatus = 'all' | 'pending' | 'completed' | 'failed';

type PaymentRow = {
  id: string;
  reservation_id: string;
  quote_id: string | null;
  user_id: string;
  amount: number | string | null;
  payment_method: string | null;
  payment_status: string;
  created_at: string;
  raw_response: Record<string, any> | null;
  onepay_invoice_reference: string | null;
  onepay_invoice_created_at: string | null;
  onepay_invoice_expires_at: string | null;
  onepay_invoice_expiry_hours: number | null;
  reservation?: {
    re_id: string;
    re_type: string;
    re_quote_id: string | null;
    total_amount: number | string | null;
    price_breakdown?: { grand_total?: number | string | null } | null;
  } | null;
  user?: {
    id: string;
    name: string | null;
    english_name: string | null;
    email: string | null;
  } | null;
};

type PaymentGroup = {
  key: string;
  user: PaymentRow['user'];
  payments: PaymentRow[];
  pendingPayments: PaymentRow[];
  totalAmount: number;
  pendingAmount: number;
};

type PreparedInvoice = {
  paymentIds: string[];
  customerName: string;
  customerEmail: string;
  reference: string;
  description: string;
  amount: number;
  expiresAt: string;
};

const serviceLabel = (value?: string) => ({
  cruise: '크루즈', airport: '공항', hotel: '호텔', tour: '투어', rentcar: '렌터카',
  car: '차량', vehicle: '차량', sht: '스하차량', ticket: '티켓', package: '패키지',
}[String(value || '')] || String(value || '') || '예약');

const paymentAmount = (payment: PaymentRow) => getPreferredPaymentAmount({
  reservation: payment.reservation,
  paymentAmount: payment.amount,
});

const normalizeReferencePart = (value: string) => String(value || '')
  .normalize('NFKD')
  .replace(/[^a-zA-Z0-9]/g, '')
  .toUpperCase();

const formatCheckinDate = (value: string) => {
  const matched = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!matched) return null;
  const [, year, month, day] = matched;
  return { compact: `${year}${month}${day}`, display: `${year}.${month}.${day}.` };
};

const buildInvoiceReference = (cruiseName: string, customerName: string, checkinDate: string) => {
  const cruise = normalizeReferencePart(cruiseName);
  const customer = normalizeReferencePart(customerName);
  const fullReference = `${cruise}${checkinDate}${customer}`;
  if (fullReference.length <= 30) return fullReference;
  const customerPart = customer.slice(0, 21);
  const cruiseLength = Math.max(1, 30 - checkinDate.length - customerPart.length);
  return `${cruise.slice(0, cruiseLength)}${checkinDate}${customerPart}`;
};

const isValidOnepayInvoiceUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.hostname === 'onepay.vn'
      && url.pathname === '/invoice-pay/payment.op'
      && Boolean(url.searchParams.get('i'));
  } catch {
    return false;
  }
};

const copyText = async (value: string) => {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // 클립보드 권한이 차단된 브라우저는 선택 영역 복사로 재시도한다.
    }
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, value.length);
  try {
    if (!document.execCommand('copy')) throw new Error('clipboard_unavailable');
  } finally {
    textarea.remove();
  }
};

export default function MobilePaymentProcessingPage() {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<PaymentStatus>('pending');
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [expiryHours, setExpiryHours] = useState(DEFAULT_EXPIRY_HOURS);
  const [workingGroup, setWorkingGroup] = useState('');
  const [preparedInvoice, setPreparedInvoice] = useState<PreparedInvoice | null>(null);
  const [manualPaymentUrl, setManualPaymentUrl] = useState('');
  const [copyNotice, setCopyNotice] = useState('');
  const [openingOnepay, setOpeningOnepay] = useState(false);

  const loadPayments = async () => {
    setLoading(true);
    setError('');
    try {
      let query = supabase
        .from('reservation_payment')
        .select(`
          id,reservation_id,quote_id,user_id,amount,payment_method,payment_status,created_at,raw_response,
          onepay_invoice_reference,onepay_invoice_created_at,onepay_invoice_expires_at,onepay_invoice_expiry_hours,
          reservation:reservation_id(re_id,re_type,re_quote_id,total_amount,price_breakdown)
        `)
        .order('created_at', { ascending: false })
        .limit(500);
      if (filter !== 'all') query = query.eq('payment_status', filter);
      const { data, error: paymentError } = await query;
      if (paymentError) throw paymentError;

      const rows = (data || []) as unknown as PaymentRow[];
      const userIds = Array.from(new Set(rows.map((row) => row.user_id).filter(Boolean)));
      const users = userIds.length > 0
        ? await fetchTableInBatches<any>('users', 'id', userIds, 'id,name,english_name,email', 80)
        : [];
      const userMap = new Map(users.map((user) => [String(user.id), user]));
      setPayments(rows.map((row) => ({ ...row, user: userMap.get(String(row.user_id)) || null })));
    } catch (loadError) {
      console.error('모바일 결제 목록 조회 실패:', loadError);
      setPayments([]);
      setError('결제 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const stored = Number(window.localStorage.getItem(EXPIRY_STORAGE_KEY));
    if (Number.isInteger(stored) && stored >= 1 && stored <= 8760) setExpiryHours(stored);
  }, []);

  useEffect(() => {
    void loadPayments();
    // 필터 변경 시 최신 목록을 다시 조회한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const groups = useMemo(() => {
    const grouped = new Map<string, PaymentGroup>();
    for (const payment of payments) {
      const key = String(payment.quote_id || payment.reservation?.re_quote_id || payment.reservation_id);
      const current = grouped.get(key) || {
        key,
        user: payment.user,
        payments: [],
        pendingPayments: [],
        totalAmount: 0,
        pendingAmount: 0,
      };
      current.payments.push(payment);
      current.totalAmount += paymentAmount(payment);
      if (payment.payment_status === 'pending') {
        current.pendingPayments.push(payment);
        current.pendingAmount += paymentAmount(payment);
      }
      if (!current.user && payment.user) current.user = payment.user;
      grouped.set(key, current);
    }

    const normalizedSearch = searchTerm.trim().toLowerCase();
    return Array.from(grouped.values()).filter((group) => {
      if (!normalizedSearch) return true;
      const searchable = [
        group.user?.name,
        group.user?.english_name,
        group.user?.email,
        group.key,
        ...group.payments.map((payment) => payment.reservation_id),
      ].filter(Boolean).join(' ').toLowerCase();
      return searchable.includes(normalizedSearch);
    });
  }, [payments, searchTerm]);

  const resolveCruiseInfo = async (targetPayments: PaymentRow[]) => {
    const reservationIds = targetPayments.map((payment) => payment.reservation_id).filter(Boolean);
    const { data: cruises, error: cruiseError } = await supabase
      .from('reservation_cruise')
      .select('reservation_id,room_price_code,checkin')
      .in('reservation_id', reservationIds);
    if (cruiseError) throw cruiseError;
    const cruise = reservationIds
      .map((reservationId) => cruises?.find((item: any) => item.reservation_id === reservationId))
      .find(Boolean);
    if (!cruise?.room_price_code) throw new Error('cruise_missing');

    const { data: rate, error: rateError } = await supabase
      .from('cruise_rate_card')
      .select('cruise_name')
      .eq('id', cruise.room_price_code)
      .maybeSingle();
    if (rateError || !rate?.cruise_name) throw rateError || new Error('cruise_missing');

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error('session_missing');
    const response = await fetch(`/api/manager/onepay-cruise-info?cruiseName=${encodeURIComponent(rate.cruise_name)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error('cruise_content_missing');
    const content = await response.json();
    return {
      koreanName: String(content.koreanName || '').trim(),
      englishName: String(content.englishName || '').trim(),
      checkin: String(cruise.checkin || '').trim(),
    };
  };

  const savePreparedInvoice = async (group: PaymentGroup, invoice: PreparedInvoice, createdAt: string) => {
    const paymentIds = group.pendingPayments.map((payment) => payment.id);
    const results = await Promise.all(group.pendingPayments.map((payment) => {
      const rawResponse = payment.raw_response && typeof payment.raw_response === 'object'
        ? { ...payment.raw_response }
        : {};
      delete rawResponse.invoice_payment_url;
      delete rawResponse.invoice_link_updated_at;
      return supabase.from('reservation_payment').update({
        amount: paymentAmount(payment),
        gateway: 'onepay',
        onepay_invoice_reference: invoice.reference,
        onepay_invoice_created_at: createdAt,
        onepay_invoice_expires_at: invoice.expiresAt,
        onepay_invoice_expiry_hours: expiryHours,
        raw_response: {
          ...rawResponse,
          invoice_reference: invoice.reference,
          invoice_created_at: createdAt,
          invoice_expires_at: invoice.expiresAt,
          invoice_expiry_hours: expiryHours,
          onepay_payment_request: {
            id: group.pendingPayments[0]?.id,
            customer_name: invoice.customerName,
            customer_email: invoice.customerEmail,
            total_amount: invoice.amount,
            payment_ids: paymentIds,
            description: invoice.description,
            requested_at: createdAt,
          },
        },
        updated_at: createdAt,
      }).eq('id', payment.id);
    }));
    const failed = results.find((result) => result.error);
    if (failed?.error) throw failed.error;

    const { data: saved, error: readError } = await supabase
      .from('reservation_payment')
      .select('id,onepay_invoice_reference,onepay_invoice_expires_at')
      .in('id', paymentIds);
    if (readError) throw readError;
    // timestamptz는 Z/+00:00 표기나 초 단위 정밀도가 달라질 수 있어 시각값으로 비교한다
    const expectedExpiresAtMs = new Date(invoice.expiresAt).getTime();
    if (!saved || saved.length !== paymentIds.length || saved.some((row: any) => (
      row.onepay_invoice_reference !== invoice.reference
      || new Date(row.onepay_invoice_expires_at).getTime() !== expectedExpiresAtMs
    ))) throw new Error('saved_invoice_mismatch');
  };

  const prepareInvoice = async (group: PaymentGroup) => {
    if (group.pendingPayments.length === 0) return;
    const customerName = String(group.user?.name || '').trim();
    const customerEnglishName = String(group.user?.english_name || '').trim();
    const customerEmail = String(group.user?.email || '').trim();
    if (!customerName || !normalizeReferencePart(customerEnglishName)) {
      alert('고객 한글명과 영문명을 확인해 주세요.');
      return;
    }

    setWorkingGroup(group.key);
    try {
      const cruise = await resolveCruiseInfo(group.pendingPayments);
      const checkin = formatCheckinDate(cruise.checkin);
      if (!cruise.koreanName || !normalizeReferencePart(cruise.englishName) || !checkin) {
        throw new Error('cruise_content_missing');
      }
      const createdAt = new Date().toISOString();
      const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString();
      const invoice: PreparedInvoice = {
        paymentIds: group.pendingPayments.map((payment) => payment.id),
        customerName,
        customerEmail,
        reference: buildInvoiceReference(cruise.englishName, customerEnglishName, checkin.compact),
        description: `${checkin.display} ${customerName} 회원님 - ${cruise.koreanName}`,
        amount: group.pendingAmount,
        expiresAt,
      };
      await savePreparedInvoice(group, invoice, createdAt);
      setManualPaymentUrl('');
      setCopyNotice('');
      setPreparedInvoice(invoice);
      await loadPayments();
    } catch (prepareError) {
      console.error('모바일 OnePay 송장 준비 실패:', prepareError);
      alert('송장 정보를 준비하지 못했습니다. 고객명, 크루즈명과 체크인 일자를 확인해 주세요.');
    } finally {
      setWorkingGroup('');
    }
  };

  const completePaymentGroup = async (group: PaymentGroup) => {
    if (group.pendingPayments.length === 0) return;
    if (!window.confirm(`${group.pendingPayments.length}건을 결제 완료 처리하시겠습니까?`)) return;
    setWorkingGroup(group.key);
    try {
      const paymentIds = group.pendingPayments.map((payment) => payment.id);
      const reservationIds = Array.from(new Set(group.pendingPayments.map((payment) => payment.reservation_id)));
      const updatedAt = new Date().toISOString();
      const { data: updated, error: updateError } = await supabase
        .from('reservation_payment')
        .update({ payment_status: 'completed', updated_at: updatedAt })
        .in('id', paymentIds)
        .select('id,payment_status');
      if (updateError) throw updateError;
      if (!updated || updated.length !== paymentIds.length || updated.some((row: any) => row.payment_status !== 'completed')) {
        throw new Error('payment_update_mismatch');
      }
      const { error: reservationError } = await supabase
        .from('reservation')
        .update({ re_status: 'approved' })
        .in('re_id', reservationIds)
        .eq('re_status', 'pending');
      if (reservationError) throw reservationError;
      await loadPayments();
      alert('결제 완료로 처리했습니다.');
    } catch (completeError) {
      console.error('모바일 결제 완료 처리 실패:', completeError);
      alert('결제 완료 처리에 실패했습니다.');
    } finally {
      setWorkingGroup('');
    }
  };

  const copyPaymentLink = async (group: PaymentGroup) => {
    const url = group.payments
      .map((payment) => String(payment.raw_response?.invoice_payment_url || '').trim())
      .find(Boolean);
    if (!url) {
      alert('저장된 결제 링크가 없습니다. PC에서 OnePay 송장을 발행한 뒤 링크를 등록해 주세요.');
      return;
    }
    await copyText(url);
    alert('결제 링크를 복사했습니다.');
  };

  const openPaymentStatus = async (group: PaymentGroup) => {
    const reference = group.payments
      .map((payment) => String(payment.onepay_invoice_reference || payment.raw_response?.invoice_reference || '').trim())
      .find(Boolean);
    if (!reference) {
      alert('저장된 송장 참조번호가 없습니다.');
      return;
    }
    await copyText(reference);
    window.open(ONEPAY_INVOICE_TRANSACTION_URL, '_blank', 'noopener,noreferrer');
    alert('송장 참조번호를 복사했습니다. 열린 OnePay 조회 화면에 붙여 넣어 주세요.');
  };

  const copyInvoiceValue = async (value: string, message: string) => {
    try {
      await copyText(value);
      setCopyNotice(message);
    } catch {
      setCopyNotice('복사하지 못했습니다. 아래 항목의 값을 길게 눌러 직접 복사해 주세요.');
    }
  };

  const copyPreparedInvoice = async () => {
    if (!preparedInvoice) return;
    try {
      await copyInvoiceValue(serializeOnepayInvoice(preparedInvoice), '송장 전체를 복사했습니다. OnePay에서 자동입력 북마크를 실행하고 Safari의 붙여넣기를 허용하세요.');
    } catch {
      setCopyNotice('송장 정보를 확인할 수 없습니다. 송장 정보를 다시 준비해 주세요.');
    }
  };

  const openPreparedInvoice = async () => {
    if (!preparedInvoice || openingOnepay) return;
    setOpeningOnepay(true);
    try {
      const opened = await copyAndOpenOnepayInvoice(preparedInvoice, copyText);
      setCopyNotice(opened
        ? '전체 복사와 OnePay 열기를 마쳤습니다. OnePay 송장 생성 화면에서 자동입력 북마크를 실행하세요.'
        : '송장 전체를 복사했습니다. 새 탭이 차단되어 아래 OnePay 열기를 눌러 주세요.');
    } catch {
      setCopyNotice('복사 또는 OnePay 열기에 실패했습니다. 전체 복사와 OnePay 열기 버튼으로 다시 시도해 주세요.');
    } finally {
      setOpeningOnepay(false);
    }
  };

  const saveManualPaymentUrl = async () => {
    if (!preparedInvoice) return;
    const paymentUrl = manualPaymentUrl.trim();
    if (!isValidOnepayInvoiceUrl(paymentUrl)) {
      alert('OnePay에서 발급된 올바른 결제 링크를 입력해 주세요.');
      return;
    }
    try {
      const updatedAt = new Date().toISOString();
      const targetPayments = payments.filter((payment) => preparedInvoice.paymentIds.includes(payment.id));
      const results = await Promise.all(targetPayments.map((payment) => supabase
        .from('reservation_payment')
        .update({
          gateway: 'onepay',
          onepay_invoice_reference: preparedInvoice.reference,
          raw_response: {
            ...(payment.raw_response && typeof payment.raw_response === 'object' ? payment.raw_response : {}),
            invoice_payment_url: paymentUrl,
            invoice_reference: preparedInvoice.reference,
            invoice_link_updated_at: updatedAt,
          },
          updated_at: updatedAt,
        })
        .eq('id', payment.id)));
      const failed = results.find((result) => result.error);
      if (failed?.error) throw failed.error;

      const { data: saved, error: readError } = await supabase
        .from('reservation_payment')
        .select('id,raw_response')
        .in('id', preparedInvoice.paymentIds);
      if (readError) throw readError;
      if (!saved || saved.length !== preparedInvoice.paymentIds.length || saved.some((row: any) => row.raw_response?.invoice_payment_url !== paymentUrl)) {
        throw new Error('saved_payment_url_mismatch');
      }
      await copyText(paymentUrl);
      setPreparedInvoice(null);
      setManualPaymentUrl('');
      await loadPayments();
      alert('결제 링크를 저장하고 클립보드에 복사했습니다.');
    } catch (saveError) {
      console.error('모바일 OnePay 결제 링크 저장 실패:', saveError);
      alert('결제 링크를 저장하지 못했습니다. 다시 시도해 주세요.');
    }
  };

  return (
    <ManagerLayout title="결제 처리" activeTab="payment-processing">
      <div className="mx-auto max-w-2xl space-y-3 pb-8">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          아이폰 Safari에서는 송장 준비 후 ‘전체 복사하고 OnePay 열기’를 누르세요. OnePay 송장 생성 화면의 공유 메뉴에서 ‘OnePay 자동입력’ 단축어를 실행하면 8개 항목이 한 번에 입력됩니다.
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && setSearchTerm(searchInput)}
                placeholder="고객명, 이메일, 예약번호"
                className="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-3 text-sm"
              />
            </div>
            <button type="button" onClick={() => setSearchTerm(searchInput)} className="rounded-xl bg-slate-800 px-3 text-sm font-semibold text-white">조회</button>
            <button type="button" onClick={() => void loadPayments()} aria-label="새로고침" className="rounded-xl border border-slate-300 p-2 text-slate-600">
              <RefreshCw className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-1">
            {(['pending', 'completed', 'failed', 'all'] as PaymentStatus[]).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setFilter(status)}
                className={`rounded-lg px-2 py-2 text-xs font-semibold ${filter === status ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}
              >
                {{ pending: '결제대기', completed: '결제완료', failed: '실패', all: '전체' }[status]}
              </button>
            ))}
          </div>
          <label className="mt-3 flex items-center justify-between gap-3 text-sm text-slate-700">
            <span>청구서 만료시간</span>
            <span className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={8760}
                value={expiryHours}
                onChange={(event) => {
                  const value = Math.min(8760, Math.max(1, Number(event.target.value) || 1));
                  setExpiryHours(value);
                  window.localStorage.setItem(EXPIRY_STORAGE_KEY, String(value));
                }}
                className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-right"
              />
              시간 후
            </span>
          </label>
        </div>

        {loading && <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500">결제 목록을 불러오는 중입니다.</div>}
        {!loading && error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
        {!loading && !error && groups.length === 0 && <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500">표시할 결제 내역이 없습니다.</div>}

        {!loading && !error && groups.map((group) => {
          const isWorking = workingGroup === group.key;
          const reference = group.payments.map((payment) => payment.onepay_invoice_reference).find(Boolean);
          const paymentUrl = group.payments.map((payment) => payment.raw_response?.invoice_payment_url).find(Boolean);
          const displayAmount = group.pendingPayments.length > 0 ? group.pendingAmount : group.totalAmount;
          return (
            <section key={group.key} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-bold text-slate-900">{group.user?.name || '고객 정보 없음'}</h2>
                    <p className="truncate text-xs text-slate-500">{group.user?.email || group.key}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">{group.pendingPayments.length > 0 ? '결제대기 금액' : '결제 금액'}</p>
                    <p className="text-base font-bold tabular-nums text-slate-900">{displayAmount.toLocaleString()} ₫</p>
                  </div>
                </div>
                {reference && <p className="mt-2 break-all rounded-lg bg-slate-50 px-2 py-1.5 text-[11px] text-slate-600">송장 {reference}</p>}
              </div>

              <div className="divide-y divide-slate-100">
                {group.payments.map((payment) => (
                  <div key={payment.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                    {payment.payment_status === 'completed'
                      ? <CheckCircle className="h-4 w-4 flex-none text-green-600" />
                      : <Clock className="h-4 w-4 flex-none text-amber-500" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-700">{serviceLabel(payment.reservation?.re_type)}</p>
                      <p className="truncate text-[11px] text-slate-400">{payment.reservation_id}</p>
                    </div>
                    <p className="flex-none text-right font-semibold tabular-nums text-slate-800">{paymentAmount(payment).toLocaleString()} ₫</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3">
                {group.pendingPayments.length > 0 && (
                  <button type="button" disabled={isWorking} onClick={() => void prepareInvoice(group)} className="rounded-xl bg-blue-600 px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-50">
                    {isWorking ? '처리 중...' : '송장 정보 준비'}
                  </button>
                )}
                <button type="button" onClick={() => void copyPaymentLink(group)} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700">
                  <Copy className="mr-1 inline h-3.5 w-3.5" />결제 링크 복사
                </button>
                {reference && (
                  <button type="button" onClick={() => void openPaymentStatus(group)} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700">
                    <ExternalLink className="mr-1 inline h-3.5 w-3.5" />OnePay 조회
                  </button>
                )}
                {group.pendingPayments.length > 0 && (
                  <button type="button" disabled={isWorking} onClick={() => void completePaymentGroup(group)} className="rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-50">
                    결제 완료 처리
                  </button>
                )}
                {paymentUrl && <p className="col-span-2 text-center text-[11px] text-emerald-700">고객 결제 링크가 저장되어 있습니다.</p>}
              </div>
            </section>
          );
        })}
      </div>

      {preparedInvoice && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/45 sm:items-center sm:justify-center">
          <div className="max-h-[88vh] w-full overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl sm:max-w-md sm:rounded-3xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">송장 정보 준비 완료</h2>
                <p className="text-xs text-slate-500">Safari 자동입력으로 송장 8개 항목을 한 번에 입력하세요.</p>
              </div>
              <button type="button" onClick={() => { setPreparedInvoice(null); setManualPaymentUrl(''); }} aria-label="닫기" className="rounded-full bg-slate-100 p-2"><X className="h-4 w-4" /></button>
            </div>
            <button type="button" disabled={openingOnepay} onClick={() => void openPreparedInvoice()} className="mt-4 w-full rounded-xl bg-blue-600 px-3 py-3 text-sm font-semibold text-white disabled:opacity-50">
              <CreditCard className="mr-1 inline h-4 w-4" />{openingOnepay ? '준비 중...' : '전체 복사하고 OnePay 열기'}
            </button>
            {copyNotice && <p role="status" className="mt-3 rounded-xl bg-slate-100 p-3 text-xs leading-5 text-slate-700">{copyNotice}</p>}
            <p className="mt-2 text-xs leading-5 text-slate-600">OnePay 송장 생성 화면에서 Safari 공유 버튼을 누르고 ‘OnePay 자동입력’을 실행하세요. 처음 실행할 때 웹페이지 접근과 붙여넣기를 허용하면 됩니다.</p>
            <details className="mt-3 rounded-xl border border-slate-200 p-3">
              <summary className="cursor-pointer text-xs font-semibold text-slate-700">송장 항목 확인 및 개별 복사</summary>
              <dl className="mt-3 space-y-3 text-sm">
              {getOnepayInvoiceFields(preparedInvoice).map(({ id, label, value, display }) => (
                <div key={id} className="rounded-xl bg-slate-50 p-3">
                  <dt className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-500">
                    <span>{label}</span>
                    <button type="button" disabled={!value} aria-label={`${label} 복사`} onClick={() => void copyInvoiceValue(value, `${label} 값을 복사했습니다. OnePay의 해당 입력칸에 붙여넣으세요.`)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40">
                      <Copy className="mr-1 inline h-3 w-3" />복사
                    </button>
                  </dt>
                  <dd className={`mt-1 select-text break-words font-medium text-slate-900 ${id === 'strAmount' ? 'text-right tabular-nums' : ''}`}>{display || '미등록 — OnePay에서 직접 입력해 주세요.'}</dd>
                </div>
              ))}
              </dl>
            </details>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => void copyPreparedInvoice()} className="rounded-xl border border-slate-300 px-3 py-3 text-sm font-semibold text-slate-700">
                <Copy className="mr-1 inline h-4 w-4" />전체 복사 (도구용)
              </button>
              <button type="button" onClick={() => window.open(ONEPAY_INVOICE_CREATE_URL, '_blank', 'noopener,noreferrer')} className="rounded-xl bg-blue-600 px-3 py-3 text-sm font-semibold text-white">
                <CreditCard className="mr-1 inline h-4 w-4" />OnePay 열기
              </button>
            </div>
            <details className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-slate-700">
              <summary className="cursor-pointer font-semibold text-blue-900">아이폰 Safari 공유 단축어 설치 (최초 1회)</summary>
              <p className="mt-2 font-semibold text-blue-900">1단계. 스크립트 실행을 허용합니다.</p>
              <ol className="mt-1 list-decimal space-y-1 pl-5">
                <li>아이폰의 ‘설정’ 앱을 엽니다.</li>
                <li>최신 iOS에서는 ‘앱 → 단축어 → 고급’을 엽니다. ‘앱’ 메뉴가 없는 iOS에서는 ‘단축어 → 고급’을 엽니다.</li>
                <li>‘스크립트 실행 허용’을 켭니다. 이 설정은 단축어를 실행할 때 필요합니다.</li>
              </ol>
              <p className="mt-3 font-semibold text-blue-900">2단계. OnePay 자동입력 단축어를 만듭니다.</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => void copyInvoiceValue(buildOnepaySafariShortcutScript(), 'Safari 공유 단축어 스크립트를 복사했습니다. 단축어 앱의 ‘웹 페이지에서 JavaScript 실행’ 작업에 붙여넣으세요.')} className="rounded-xl border border-blue-200 bg-white px-2 py-3 text-xs font-semibold text-blue-800">
                  <Copy className="mr-1 inline h-4 w-4" />공유 단축어 스크립트 복사
                </button>
                <a href="shortcuts://create-shortcut" className="rounded-xl bg-blue-700 px-2 py-3 text-center text-xs font-semibold text-white">
                  단축어 앱에서 새로 만들기
                </a>
              </div>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li>위의 ‘공유 단축어 스크립트 복사’를 먼저 누릅니다.</li>
                <li>‘단축어 앱에서 새로 만들기’를 누르거나 단축어 앱에서 오른쪽 위의 ‘+’를 누릅니다.</li>
                <li>‘동작 추가’를 누르고 검색창에 전체 이름 대신 <strong>JavaScript</strong>만 입력합니다.</li>
                <li>Safari 아이콘이 붙은 ‘웹 페이지에서 JavaScript 실행’을 선택합니다.</li>
                <li>추가된 작업의 기본 JavaScript를 길게 눌러 ‘전체 선택 → 붙여넣기’를 누릅니다.</li>
                <li>작업에 표시되는 웹 페이지 입력값은 ‘단축어 입력’으로 둡니다.</li>
                <li>화면 위의 단축어 이름이나 아래의 정보 버튼을 누르고 ‘공유 시트에서 보기’를 켭니다.</li>
                <li>‘공유 시트 입력 유형’ 또는 ‘받는 항목’에서 ‘Safari 웹 페이지’만 선택합니다.</li>
                <li>이름을 ‘OnePay 자동입력’으로 지정하고 ‘완료’를 누릅니다.</li>
              </ol>
              <p className="mt-2">공유 단축어는 OnePay 송장 생성 화면에서만 작동하며 송장을 발행하거나 전송하지 않습니다.</p>
              <details className="mt-3 rounded-lg border border-blue-200 bg-white p-2">
                <summary className="cursor-pointer font-semibold text-blue-900">‘웹 페이지에서 JavaScript 실행’이 안 보일 때</summary>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>검색창에는 한글 전체 문장 대신 ‘JavaScript’만 입력해 보세요.</li>
                  <li>검색 결과에서 Safari 아이콘이 붙은 작업을 찾으세요. 아이폰 작업 이름은 ‘웹 페이지에서 JavaScript 실행’입니다.</li>
                  <li>단축어 앱이 삭제되어 있으면 App Store에서 Apple의 ‘단축어’ 앱을 다시 설치하고 iOS와 앱을 최신 버전으로 업데이트하세요.</li>
                  <li>단축어 앱과 설정 앱을 완전히 닫았다가 다시 열고 같은 순서로 검색하세요.</li>
                  <li>Mac의 ‘활성화된 Safari 탭에서 JavaScript 실행’과 이름이 다르므로 아이폰에서는 해당 Mac 작업을 찾지 않아도 됩니다.</li>
                </ul>
                <a href="https://support.apple.com/ko-kr/guide/shortcuts/apdb71a01d93/ios" target="_blank" rel="noreferrer" className="mt-2 inline-block font-semibold text-blue-700 underline">
                  Apple 공식 사용 방법 열기
                </a>
              </details>
              <p className="mt-3 font-semibold">3단계. 송장을 작성할 때 실행합니다.</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li>‘전체 복사하고 OnePay 열기’를 누릅니다. 로그인이 필요하면 로그인 후 송장 생성 화면을 여세요.</li>
                <li>OnePay 송장 생성 화면에서 Safari의 공유 버튼을 누르고 ‘OnePay 자동입력’을 실행합니다.</li>
                <li>단축어가 보이지 않으면 공유 시트 맨 아래의 ‘동작 편집’을 누르고 ‘OnePay 자동입력’을 추가합니다.</li>
                <li>처음 표시되는 웹페이지 접근과 붙여넣기 요청을 허용하면 8개 항목이 자동 입력됩니다.</li>
              </ol>
              <p className="mt-2">작성 중인 값이 있으면 기존 내용을 보호하기 위해 자동입력을 중단합니다. 입력 내용을 확인한 뒤 최종 발행은 직접 누르세요.</p>
            </details>
            <details className="mt-3 rounded-xl border border-slate-200 p-3 text-xs leading-5 text-slate-600">
              <summary className="cursor-pointer font-semibold">공유 단축어를 사용할 수 없을 때</summary>
              <p className="mt-2">기존 책갈피 자동입력 또는 항목별 복사를 사용할 수 있습니다.</p>
              <button type="button" onClick={() => void copyInvoiceValue(buildOnepayAutofillBookmark(), '책갈피 도구 주소를 복사했습니다. Safari 책갈피의 주소 전체를 교체해 저장하세요.')} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold text-slate-700">
                <Copy className="mr-1 inline h-4 w-4" />책갈피 자동입력 도구 주소 복사
              </button>
            </details>
            <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-3">
              <label htmlFor="onepay-payment-url" className="text-xs font-semibold text-blue-900">OnePay 발행 후 결제 링크 붙여넣기</label>
              <input
                id="onepay-payment-url"
                type="url"
                value={manualPaymentUrl}
                onChange={(event) => setManualPaymentUrl(event.target.value)}
                placeholder="https://onepay.vn/invoice-pay/payment.op?i=..."
                className="mt-2 w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm"
              />
              <button type="button" onClick={() => void saveManualPaymentUrl()} className="mt-2 w-full rounded-xl bg-blue-700 px-3 py-2.5 text-sm font-semibold text-white">
                링크 저장하고 복사
              </button>
            </div>
          </div>
        </div>
      )}
    </ManagerLayout>
  );
}
