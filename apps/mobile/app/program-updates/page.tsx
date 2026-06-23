'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, CheckCircle2, Copy, Home, Loader2, Pencil, Wrench } from 'lucide-react';
import supabase from '@/lib/supabase';

type ProgramUpdateRow = {
  id: string;
  app_name: string;
  request_url: string | null;
  content: string;
  account: string | null;
  requested_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type StatusFilter = 'requested' | 'completed' | 'all';

type AppOption = 'mobile' | 'manager' | 'manager1' | 'customer' | 'partner' | 'admin' | 'other';

type MenuOption = { label: string; path: string };
type AppRouteConfig = { baseUrl: string; defaultPath: string; menuOptions: MenuOption[] };
type ProgramUpdateForm = {
  app_name: AppOption;
  request_url: string;
  content: string;
  account: string;
};

const APP_OPTIONS: AppOption[] = [
  'mobile',
  'manager',
  'manager1',
  'customer',
  'partner',
  'admin',
  'other',
];

const APP_ROUTE_CONFIG: Record<AppOption, AppRouteConfig> = {
  mobile: {
    baseUrl: 'https://newmobile.stayhalong.com',
    defaultPath: '/program-updates',
    menuOptions: [
      { label: '예약일정', path: '/schedule' },
      { label: '예약 처리', path: '/reservations' },
      { label: '예약확인서', path: '/confirmation' },
      { label: '예약 수정', path: '/reservation-edit' },
      { label: '크차 일자', path: '/cruise-car-dates' },
      { label: '고객관리', path: '/customers' },
      { label: '스하 차량', path: '/sht-car' },
      { label: '카페 안내', path: '/cafe-guide' },
      { label: '견적 목록', path: '/quotes' },
      { label: '견적 입력', path: '/quotes/cruise' },
      { label: '취소요청', path: '/cancel-requests' },
      { label: '알림 관리', path: '/notifications' },
      { label: '프로그램 수정', path: '/program-updates' },
    ],
  },
  manager: {
    baseUrl: 'https://manager.stayhalong.com',
    defaultPath: '/manager/notifications',
    menuOptions: [
      { label: '견적 목록', path: '/manager/quotes' },
      { label: '전체 검색', path: '/manager/quotes/comprehensive' },
      { label: '신/구 구분', path: '/manager/schedule/new' },
      { label: '예약 처리', path: '/manager/reservations/bulk' },
      { label: '스하 차량', path: '/manager/sht-car' },
      { label: '패키지', path: '/manager/reservations/package' },
      { label: '제휴업체 예약', path: '/partner/admin/reservations' },
      { label: '예약 수정', path: '/manager/reservation-edit' },
      { label: '시트 수정', path: '/manager/schedule/sheet-edit' },
      { label: '수정 승인', path: '/manager/reservation-edit/approval' },
      { label: '여권 관리', path: '/manager/passport-management' },
      { label: '승선 코드', path: '/manager/boarding-code' },
      { label: '차량 코드', path: '/manager/dispatch-codes/vehicle' },
      { label: '차량 배차', path: '/manager/dispatch' },
      { label: '승차 확인', path: '/manager/dispatch-codes/confirm' },
      { label: '호텔 코드', path: '/manager/assignment-codes/hotel' },
      { label: '크차 일자', path: '/manager/cruise-car-dates' },
      { label: '결제 처리', path: '/manager/payment-processing' },
      { label: '현황 처리', path: '/manager/payments' },
      { label: '예약 확인서', path: '/manager/confirmation' },
      { label: '취소 요청', path: '/manager/cancel-requests' },
      { label: '통계 조회', path: '/manager/analytics' },
      { label: '카페 안내', path: '/manager/cafe-guide' },
      { label: '리포트 스하 차량', path: '/manager/reports/sht-car' },
      { label: '리포트 크루즈 차량', path: '/manager/reports/cruise-car' },
      { label: '고객 관리', path: '/manager/customers' },
      { label: '프로모션', path: '/manager/promotions' },
      { label: '추가 요금', path: '/manager/additional-fee-management' },
      { label: '예약 삭제', path: '/manager/quote-bulk-delete' },
      { label: '앱 설정', path: '/manager/settings' },
    ],
  },
  manager1: {
    baseUrl: 'https://manag.staryhalong.com',
    defaultPath: '/manager/program-updates',
    menuOptions: [
      { label: '예약일정', path: '/manager/schedule/new' },
      { label: '예약 처리', path: '/manager/reservations/bulk' },
      { label: '견적 입력', path: '/manager/quotes/cruise' },
      { label: '견적 목록', path: '/manager/quotes' },
      { label: '예약 요청', path: '/manager/reservations/requests' },
      { label: '예약 수정', path: '/manager/reservation-edit' },
      { label: '결제 처리', path: '/manager/payment-processing' },
      { label: '스하 차량', path: '/manager/sht-car' },
      { label: '제휴업체', path: '/partner/admin/reservations' },
      { label: '알림 관리', path: '/manager/notifications' },
      { label: '취소 요청', path: '/manager/cancel-requests' },
      { label: '앱 설정', path: '/manager/settings' },
      { label: '프로그램 수정', path: '/manager/program-updates' },
      { label: '카페 안내', path: '/manager/cafe-guide' },
      { label: '시트 수정', path: '/manager/schedule/sheet-edit' },
      { label: '고객 관리', path: '/manager/customers' },
      { label: '수정 승인', path: '/manager/reservation-edit/approval' },
      { label: '예약 통계', path: '/manager/analytics' },
      { label: '예약 확인서', path: '/manager/confirmation' },
      { label: '여권 관리', path: '/manager/passport-management' },
      { label: '프로모션', path: '/manager/promotions' },
      { label: '크차 일자', path: '/manager/cruise-car-dates' },
      { label: '추가 요금', path: '/manager/additional-fee-management' },
      { label: '예약 삭제', path: '/manager/quote-bulk-delete' },
    ],
  },
  customer: {
    baseUrl: 'https://staycruise.kr',
    defaultPath: '/mypage/notifications',
    menuOptions: [
      { label: '로그인', path: '/login' },
      { label: '마이페이지', path: '/mypage' },
      { label: '예약 하기', path: '/mypage/direct-booking' },
      { label: '예약 내역', path: '/mypage/reservations/list' },
      { label: '제휴 업체', path: '/partner/browse' },
      { label: '장소 추가', path: '/mypage/location-updates' },
      { label: '알림', path: '/mypage/notifications' },
      { label: '예약 확인서', path: '/mypage/confirmations' },
      { label: '프로필', path: '/mypage/profile' },
      { label: '직접 예약', path: '/mypage/direct-booking' },
      { label: '직접 예약 크루즈', path: '/mypage/direct-booking/cruise' },
      { label: '직접 예약 공항', path: '/mypage/direct-booking/airport' },
      { label: '직접 예약 호텔', path: '/mypage/direct-booking/hotel' },
      { label: '직접 예약 투어', path: '/mypage/direct-booking/tour' },
      { label: '직접 예약 렌터카', path: '/mypage/direct-booking/rentcar' },
      { label: '직접 예약 패키지', path: '/mypage/direct-booking/package' },
      { label: '견적 메인', path: '/mypage/quotes' },
      { label: '크루즈 견적', path: '/mypage/quotes/cruise' },
      { label: '공항 견적', path: '/mypage/quotes/airport' },
      { label: '호텔 견적', path: '/mypage/quotes/hotel' },
      { label: '투어 견적', path: '/mypage/quotes/tour' },
      { label: '렌터카 견적', path: '/mypage/quotes/rentcar' },
      { label: '일반 견적', path: '/quote' },
      { label: '회원가입', path: '/signup' },
    ],
  },
  partner: {
    baseUrl: 'https://partner.stayhalong.com',
    defaultPath: '/partner/dashboard',
    menuOptions: [
      { label: '전체 카테고리', path: '/partner/browse' },
      { label: '내 예약 내역', path: '/partner/my-reservations' },
      { label: '예약 목록', path: '/partner/dashboard' },
      { label: '월별 캘린더', path: '/partner/calendar' },
      { label: '파트너 예약생성', path: '/partner/booking' },
      { label: '파트너 관리자 예약', path: '/partner/admin/reservations' },
      { label: '업체 목록/등록', path: '/partner/admin/partners' },
      { label: '서비스/메뉴', path: '/partner/admin/services' },
      { label: '파트너 관리자 요금', path: '/partner/admin/prices' },
      { label: '파트너 관리자 프로모션', path: '/partner/admin/promotions' },
    ],
  },
  admin: {
    baseUrl: 'https://admin.stayhalong.com',
    defaultPath: '/admin/reservation-settings',
    menuOptions: [
      { label: '관리자 홈', path: '/admin' },
      { label: '월별 매출 현황', path: '/admin/revenue/monthly' },
      { label: '일별 매출 현황', path: '/admin/revenue/daily' },
      { label: '사용자 관리', path: '/admin/users' },
      { label: '사용자 동기화', path: '/admin/user-sync' },
      { label: '인증 동기화', path: '/admin/auth-sync' },
      { label: '데이터 연결', path: '/admin/data-management' },
      { label: '데이터 동기화', path: '/admin/sync' },
      { label: 'sh_cc 동기화', path: '/admin/sync-shcc-to-reservation' },
      { label: '가격 동기화', path: '/admin/base-prices' },
      { label: '수량 수정', path: '/admin/fix-quantities' },
      { label: '알림 설정', path: '/admin/reservation-settings' },
      { label: '총금액 계산', path: '/admin/reservation-total-system' },
      { label: '스하좌석', path: '/admin/sht-seat' },
      { label: '패키지 관리', path: '/admin/packages' },
      { label: '리포트', path: '/admin/reports' },
      { label: 'SQL 실행', path: '/admin/sql-runner' },
      { label: 'DB 스키마', path: '/admin/database-schema' },
      { label: 'DB 관리', path: '/admin/database' },
      { label: '백업/복원', path: '/admin/backup' },
      { label: '복원 검증', path: '/admin/backup/verify' },
      { label: '계정 이전', path: '/admin/backup/migrate' },
      { label: '백업 지침', path: '/admin/backup/guide' },
      { label: '엑셀 자동 설정', path: '/admin/backup/setup' },
      { label: '엑셀 내보내기', path: '/admin/export' },
      { label: 'DB 시트 내보내기', path: '/admin/sheets-sync' },
      { label: '설정', path: '/admin/settings' },
      { label: '로그인', path: '/login' },
    ],
  },
  other: {
    baseUrl: 'https://newmobile.stayhalong.com',
    defaultPath: '/program-updates',
    menuOptions: [],
  },
};

function normalizeBaseUrl(url: string) {
  return url.replace(/\/$/, '');
}

function buildAbsoluteUrl(appName: AppOption, path: string) {
  const config = APP_ROUTE_CONFIG[appName] || APP_ROUTE_CONFIG.mobile;
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  if (!path) return `${baseUrl}${config.defaultPath}`;
  if (/^https?:\/\//i.test(path)) return path;
  return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

function buildDefaultRequestUrl(appName: AppOption) {
  const config = APP_ROUTE_CONFIG[appName] || APP_ROUTE_CONFIG.mobile;
  return buildAbsoluteUrl(appName, config.defaultPath);
}

function getRequestPageMeta(appName: string, requestUrl?: string | null) {
  const normalizedApp = APP_OPTIONS.includes(appName as AppOption) ? (appName as AppOption) : 'other';
  const config = APP_ROUTE_CONFIG[normalizedApp] || APP_ROUTE_CONFIG.mobile;
  const safeUrl = String(requestUrl || '').trim();

  if (!safeUrl) {
    return { menuLabel: '-', url: '-' };
  }

  const matched = config.menuOptions.find((item) => {
    const absoluteUrl = buildAbsoluteUrl(normalizedApp, item.path);
    if (absoluteUrl === safeUrl || item.path === safeUrl) return true;
    try {
      return new URL(absoluteUrl).pathname === new URL(safeUrl).pathname;
    } catch {
      return false;
    }
  });

  return {
    menuLabel: matched?.label || '직접입력',
    url: safeUrl,
  };
}

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function ProgramUpdatesPage() {
  const [rows, setRows] = useState<ProgramUpdateRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('requested');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [completeSavingId, setCompleteSavingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [copiedRowId, setCopiedRowId] = useState<string | null>(null);
  const [form, setForm] = useState<ProgramUpdateForm>({
    app_name: 'mobile' as AppOption,
    request_url: buildDefaultRequestUrl('mobile'),
    content: '',
    account: '',
  });

  const getMenuOptions = (appName: AppOption) => {
    const config = APP_ROUTE_CONFIG[appName] || APP_ROUTE_CONFIG.mobile;
    return config.menuOptions.map((item) => ({
      label: item.label,
      value: buildAbsoluteUrl(appName, item.path),
    }));
  };

  const currentMenuOptions = useMemo(() => getMenuOptions(form.app_name), [form.app_name]);

  const loadCurrentUser = async () => {
    try {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user?.email) return;

      setForm((prev) => ({
        ...prev,
        account: prev.account.trim() ? prev.account : String(user.email || '').trim(),
      }));
    } catch (error) {
      console.error('로그인 계정 조회 실패:', error);
    }
  };

  const loadRows = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('program_update_requests')
        .select('id, app_name, request_url, content, account, requested_at, completed_at, created_at, updated_at')
        .order('requested_at', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRows((data || []) as ProgramUpdateRow[]);
    } catch (error) {
      console.error('프로그램 수정 목록 조회 실패:', error);
      alert('프로그램 수정 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCurrentUser();
    void loadRows();
  }, []);

  const filteredRows = rows.filter((row) => {
    const isCompleted = Boolean(row.completed_at);

    if (statusFilter === 'requested') return !isCompleted;
    if (statusFilter === 'completed') return isCompleted;
    return true;
  });

  const sendProgramUpdateNotification = async (requestId: string, action: 'requested' | 'completed') => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error('로그인이 필요합니다.');
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error('인증 토큰을 찾을 수 없습니다. 다시 로그인해 주세요.');
    }

    const response = await fetch('/api/program-update-notify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ requestId, action }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result?.error || 'notification_request_failed');
    }

    return result;
  };

  const saveRequest = async () => {
    const appName = form.app_name;
    const requestUrl = form.request_url.trim();
    const content = form.content.trim();
    const account = form.account.trim();
    const requestedAt = new Date().toISOString();

    if (!appName) {
      alert('앱명을 입력해주세요.');
      return;
    }
    if (!requestUrl) {
      alert('수정요청페이지 URL을 입력해주세요.');
      return;
    }
    if (!content) {
      alert('내용을 입력해주세요.');
      return;
    }

    try {
      setSaving(true);
      const payload = {
        app_name: appName,
        request_url: requestUrl,
        content,
        account: account || null,
      };

      const isEditing = Boolean(editingId);
      const result = isEditing
        ? await supabase
            .from('program_update_requests')
            .update(payload)
            .eq('id', editingId)
            .select('id')
            .single()
        : await supabase
            .from('program_update_requests')
            .insert({
              ...payload,
              requested_at: requestedAt,
              completed_at: null,
            })
            .select('id')
            .single();

      if (result.error) throw result.error;

      let notificationFailed = false;
      if (!isEditing && result.data?.id) {
        try {
          await sendProgramUpdateNotification(result.data.id, 'requested');
        } catch (notificationError) {
          notificationFailed = true;
          console.error('프로그램 수정 신청 알림 생성 실패:', notificationError);
        }
      }

      setForm({
        app_name: appName === 'other' ? 'mobile' : appName,
        request_url: buildDefaultRequestUrl(appName === 'other' ? 'mobile' : appName),
        content: '',
        account,
      });
      setEditingId(null);
      await loadRows();
      if (notificationFailed) {
        alert(isEditing ? '프로그램 수정 요청이 수정되었습니다.' : '프로그램 수정 요청은 저장되었지만 알림 생성에 실패했습니다.');
      } else {
        alert(isEditing ? '프로그램 수정 요청이 수정되었습니다.' : '프로그램 수정 요청이 저장되었습니다.');
      }
    } catch (error) {
      console.error('프로그램 수정 저장 실패:', error);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleMarkCompleteNow = async (row: ProgramUpdateRow) => {
    try {
      setCompleteSavingId(row.id);
      const completedAt = new Date().toISOString();
      const { error } = await supabase
        .from('program_update_requests')
        .update({ completed_at: completedAt })
        .eq('id', row.id);

      if (error) throw error;
      let notificationFailed = false;
      try {
        await sendProgramUpdateNotification(row.id, 'completed');
      } catch (notificationError) {
        notificationFailed = true;
        console.error('프로그램 수정 완료 알림 생성 실패:', notificationError);
      }

      await loadRows();
      if (notificationFailed) {
        alert('완료 처리는 저장되었지만 알림 생성에 실패했습니다.');
      }
    } catch (error) {
      console.error('완료일시 업데이트 실패:', error);
      alert('완료일시 저장에 실패했습니다.');
    } finally {
      setCompleteSavingId(null);
    }
  };

  const handleEditRow = (row: ProgramUpdateRow) => {
    const nextAppName = APP_OPTIONS.includes(row.app_name as AppOption) ? (row.app_name as AppOption) : 'other';
    setEditingId(row.id);
    setForm({
      app_name: nextAppName,
      request_url: row.request_url || buildDefaultRequestUrl(nextAppName),
      content: row.content || '',
      account: row.account || form.account || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAppChange = (nextAppName: AppOption) => {
    const nextOptions = getMenuOptions(nextAppName);
    setForm((prev) => ({
      ...prev,
      app_name: nextAppName,
      request_url: nextOptions.some((item) => item.value === prev.request_url)
        ? prev.request_url
        : (nextOptions[0]?.value || buildDefaultRequestUrl(nextAppName)),
    }));
  };

  const handleCopyContent = async (row: ProgramUpdateRow) => {
    try {
      await navigator.clipboard.writeText(row.content || '');
      setCopiedRowId(row.id);
      window.setTimeout(() => {
        setCopiedRowId((current) => (current === row.id ? null : current));
      }, 1800);
    } catch (error) {
      console.error('프로그램 수정 내용 복사 실패:', error);
      alert('내용 복사에 실패했습니다.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <div className="sticky top-0 z-10 border-b bg-white/95 px-4 py-3 backdrop-blur">
        <div className="grid grid-cols-[40px_1fr_40px] items-center">
          <Link href="/" className="rounded-lg p-1.5 hover:bg-gray-100">
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </Link>
          <div className="text-center">
            <h1 className="text-base font-bold text-gray-900">프로그램 수정</h1>
          </div>
          <Link href="/" className="ml-auto rounded-lg bg-fuchsia-100 p-1.5 hover:bg-fuchsia-200">
            <Home className="h-4 w-4 text-fuchsia-700" />
          </Link>
        </div>
      </div>

      <div className="space-y-4 px-3 pt-4">
        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <div className="rounded-xl bg-fuchsia-100 p-2">
              <Wrench className="h-4 w-4 text-fuchsia-700" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">{editingId ? '수정 요청 수정' : '수정 요청 등록'}</h2>
              <p className="text-xs text-gray-500">앱명, 수정요청페이지, 내용을 저장합니다.</p>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void saveRequest();
            }}
            className="space-y-3"
          >
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">앱명</label>
              <select
                value={form.app_name}
                onChange={(e) => handleAppChange(e.target.value as AppOption)}
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-fuchsia-500 focus:outline-none focus:ring-2 focus:ring-fuchsia-100"
              >
                {APP_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">수정요청페이지</label>
              <select
                value={form.request_url}
                onChange={(e) => setForm((prev) => ({ ...prev, request_url: e.target.value }))}
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-fuchsia-500 focus:outline-none focus:ring-2 focus:ring-fuchsia-100"
              >
                {currentMenuOptions.length === 0 ? (
                  <option value="">선택 가능한 메뉴가 없습니다</option>
                ) : (
                  currentMenuOptions.map((item, index) => (
                    <option key={`${item.value}-${item.label}-${index}`} value={item.value}>
                      {item.label}
                    </option>
                  ))
                )}
                {form.request_url && !currentMenuOptions.some((item) => item.value === form.request_url) && (
                  <option value={form.request_url}>{form.request_url}</option>
                )}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">내용</label>
              <textarea
                value={form.content}
                onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
                rows={4}
                placeholder="수정 요청 내용을 입력하세요"
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-fuchsia-500 focus:outline-none focus:ring-2 focus:ring-fuchsia-100"
              />
            </div>

            <div className="grid grid-cols-1 gap-2">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-fuchsia-200 bg-fuchsia-100 px-4 py-2.5 text-sm font-semibold text-fuchsia-800 hover:bg-fuchsia-200 disabled:cursor-not-allowed disabled:bg-fuchsia-50 disabled:text-fuchsia-300"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
                {editingId ? '수정 저장' : '신청'}
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">프로그램 수정 신청 목록</h2>
              <p className="text-xs text-gray-500">총 {filteredRows.length}건</p>
            </div>
            <div className="flex items-center gap-2">
              {[
                { key: 'requested', label: '신청' },
                { key: 'completed', label: '완료' },
                { key: 'all', label: '전체' },
              ].map((filter) => {
                const isActive = statusFilter === filter.key;
                return (
                  <button
                    key={filter.key}
                    type="button"
                    onClick={() => setStatusFilter(filter.key as StatusFilter)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                      isActive
                        ? 'bg-fuchsia-600 text-white shadow-sm'
                        : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {filter.label}
                  </button>
                );
              })}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-10 text-sm text-gray-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              불러오는 중...
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
              {statusFilter === 'requested'
                ? '신청 상태의 프로그램 수정 요청이 없습니다.'
                : statusFilter === 'completed'
                  ? '완료 상태의 프로그램 수정 요청이 없습니다.'
                  : '저장된 프로그램 수정 요청이 없습니다.'}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRows.map((row) => {
                const isCompleted = Boolean(row.completed_at);
                const requestPageMeta = getRequestPageMeta(row.app_name, row.request_url);
                const isCopied = copiedRowId === row.id;
                return (
                  <article key={row.id} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-gray-900">{row.app_name}</div>
                        <div className="mt-1 text-xs text-gray-500">
                          계정: {row.account || '-'}
                        </div>
                      </div>
                      <span
                        className={`rounded-full px-2 py-1 text-[11px] font-medium ${
                          isCompleted
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {isCompleted ? '완료' : '신청'}
                      </span>
                    </div>

                    <div className="mb-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
                      <div className="text-[11px] font-medium text-blue-700">수정요청페이지</div>
                      <div className="mt-1 text-xs font-semibold text-blue-900">{requestPageMeta.menuLabel}</div>
                      <div className="mt-1 break-all text-[11px] text-blue-800/90">{requestPageMeta.url}</div>
                    </div>

                    <div className="rounded-lg bg-white px-3 py-2">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="text-[11px] font-medium text-gray-500">내용</div>
                        <button
                          type="button"
                          onClick={() => void handleCopyContent(row)}
                          className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-100"
                          title="내용 전체 복사"
                          aria-label="내용 전체 복사"
                        >
                          {isCopied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                          {isCopied ? '복사됨' : '복사'}
                        </button>
                      </div>
                      <div className="whitespace-pre-wrap text-sm text-gray-800">
                        {row.content}
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-gray-500">
                      <div>신청일시: {formatDateTime(row.requested_at)}</div>
                      <div>완료일시: {formatDateTime(row.completed_at)}</div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleEditRow(row)}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-200 bg-sky-100 px-3 py-2 text-xs font-medium text-sky-800 hover:bg-sky-200"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        수정
                      </button>
                      {!isCompleted && (
                        <button
                          type="button"
                          onClick={() => void handleMarkCompleteNow(row)}
                          disabled={completeSavingId === row.id}
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-100 px-3 py-2 text-xs font-medium text-emerald-800 hover:bg-emerald-200 disabled:cursor-not-allowed disabled:bg-emerald-50 disabled:text-emerald-300"
                        >
                          {completeSavingId === row.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          )}
                          완료
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
