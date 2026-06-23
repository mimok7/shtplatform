'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Calendar,
  CalendarDays,
  ClipboardList,
  FilePenLine,
  FileText,
  ListChecks,
  Bus,
  Users,
  Handshake,
  MessageSquare,
  Settings,
  LogOut,
  Home,
  Bell,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react';
import supabase, { hasSupabaseEnv } from '@/lib/supabase';
import { canAccessManagerApp, clearManagerAccessCache } from '@/lib/auth';

type MenuItem = {
  href: string;
  label: string;
  desc: string;
  icon: LucideIcon;
  iconColor: string;
  bg: string;
  external?: boolean;
  comingSoon?: boolean;
};

// ⭐ manager1 즐겨찾기와 동일 순서/라벨로 유지 (모바일 mirror 규칙)
const FAVORITES: MenuItem[] = [
  { href: '/schedule',              label: '예약일정', desc: '날짜별 예약 조회 (신규/기존)', icon: Calendar,      iconColor: 'text-blue-600',   bg: 'bg-blue-100' },
  { href: '/reservations',          label: '예약 처리',  desc: '예약 변경 및 일괄 처리',       icon: ClipboardList, iconColor: 'text-green-600',  bg: 'bg-green-100' },
  { href: '/confirmation',          label: '예약확인서', desc: '예약확인서 생성/미리보기',      icon: FileText,      iconColor: 'text-violet-600', bg: 'bg-violet-100' },
  { href: '/reservation-edit',      label: '예약 수정',  desc: '서비스별 상태 수정',            icon: ListChecks,    iconColor: 'text-amber-600',  bg: 'bg-amber-100' },
  { href: '/cruise-car-dates',      label: '크차 일자',  desc: '픽업/체크인 불일치 정리',       icon: CalendarDays,  iconColor: 'text-sky-600',   bg: 'bg-sky-100' },
  { href: '/customers',             label: '고객관리',   desc: '고객 조회 / 수정 / 초기화',     icon: Users,         iconColor: 'text-cyan-600',   bg: 'bg-cyan-100' },
  { href: '/sht-car',               label: '스하 차량',  desc: '스하 차량 배정 관리',           icon: Bus,           iconColor: 'text-teal-600',   bg: 'bg-teal-100' },
  { href: '/cafe-guide',            label: '카페 안내',  desc: '카페 공지/안내문 생성',          icon: MessageSquare, iconColor: 'text-emerald-600', bg: 'bg-emerald-100' },
  { href: 'https://partner.stayhalong.com/partner/admin/reservations', label: '제휴업체', desc: '제휴업체 예약 관리', icon: Handshake, iconColor: 'text-orange-600', bg: 'bg-orange-100', external: true },
  { href: '/quotes',                label: '견적 목록',  desc: '견적 조회 / 수정',              icon: FileText,      iconColor: 'text-indigo-600', bg: 'bg-indigo-100' },
  { href: '/quotes/cruise',         label: '견적 입력',  desc: '크루즈 견적 신규 입력',         icon: FilePenLine,   iconColor: 'text-purple-600', bg: 'bg-purple-100' },
  { href: '/cancel-requests',       label: '취소요청',  desc: '취소 신청 승인/반려 처리',      icon: Home,          iconColor: 'text-red-600',    bg: 'bg-red-100' },
  { href: '/notifications',         label: '알림 관리',  desc: '읽지 않은 알림 확인',           icon: Bell,          iconColor: 'text-rose-600',   bg: 'bg-rose-100' },
  { href: '/program-updates',       label: '프로그램 수정', desc: '앱 수정 요청 접수 / 완료 기록', icon: FilePenLine, iconColor: 'text-fuchsia-600', bg: 'bg-fuchsia-100' },
];

export default function HomePage() {
  const router = useRouter();
  const [sessionState, setSessionState] = useState<'loading' | 'authorized' | 'unauthorized'>('loading');
  const [sessionMessage, setSessionMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    const checkAccess = async () => {
      if (!hasSupabaseEnv) {
        if (!cancelled) {
          setSessionState('unauthorized');
          setSessionMessage('환경변수가 설정되지 않아 로그인 페이지로 이동할 수 없습니다.');
        }
        return;
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;

        if (!session?.user) {
          setSessionState('unauthorized');
          setSessionMessage('로그인이 필요합니다.');
          return;
        }

        const canAccess = await canAccessManagerApp(session.user);
        if (cancelled) return;

        if (!canAccess) {
          await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
          clearManagerAccessCache(session.user.id);
          setSessionState('unauthorized');
          setSessionMessage('매니저 권한이 있는 계정으로 다시 로그인해 주세요.');
          return;
        }

        setSessionState('authorized');
      } catch {
        if (!cancelled) {
          setSessionState('unauthorized');
          setSessionMessage('세션 확인 중 문제가 생겼습니다. 로그인 후 다시 시도해 주세요.');
        }
      }
    };

    void checkAccess();
    return () => {
      cancelled = true;
    };
  }, []);

  const getPartnerBaseUrl = () => {
    if (typeof window === 'undefined') return 'https://partner.stayhalong.com';
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:3003';
    }
    return 'https://partner.stayhalong.com';
  };

  const handlePartnerMove = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const partnerBase = getPartnerBaseUrl();
      const nextPath = '/partner/admin/reservations';

      if (!session?.access_token || !session?.refresh_token) {
        window.location.href = `${partnerBase}/partner/login`;
        return;
      }

      const hash = new URLSearchParams({
        at: session.access_token,
        rt: session.refresh_token,
        next: nextPath,
      }).toString();

      window.location.href = `${partnerBase}/auth/bridge#${hash}`;
    } catch (error) {
      console.error('제휴업체 이동 실패:', error);
      window.location.href = `${getPartnerBaseUrl()}/partner/login`;
    }
  };

  const handleLogout = async () => {
    const { data } = await supabase.auth.getUser();
    clearManagerAccessCache(data.user?.id);
    await supabase.auth.signOut();
    router.replace('/login');
  };

  if (sessionState === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
          <p className="mt-4 text-sm text-slate-600">모바일 앱을 준비하는 중입니다...</p>
        </div>
      </div>
    );
  }

  if (sessionState === 'unauthorized') {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-8">
        <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100">
              <ShieldAlert className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">모바일앱 로그인 필요</h1>
              <p className="mt-1 text-sm text-slate-600">{sessionMessage || '로그인 후 이용해 주세요.'}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => router.push('/login')}
            className="mt-6 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            로그인 페이지로 이동
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      {/* 헤더 */}
      <div className="bg-white border-b shadow-sm px-2 py-2.5">
        <div className="flex items-center gap-2">
          <Link href="/settings" className="p-1.5 rounded-lg hover:bg-gray-100">
            <Settings className="w-5 h-5 text-gray-600" />
          </Link>
          <h1 className="text-base font-bold text-gray-800 flex-1 text-center">스테이하롱 매니저</h1>
          <button type="button" onClick={handleLogout} className="p-1.5 rounded-lg hover:bg-gray-100">
            <LogOut className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </div>

      <section className="px-3 w-full mt-4">
        <div className="grid grid-cols-2 gap-2">
          {FAVORITES.map((item) => {
            const Icon = item.icon;
            const card = (
              <div
                className={`relative p-3 bg-white rounded-xl shadow-sm hover:shadow-md transition-all active:scale-[0.98] flex flex-col ${
                  item.comingSoon ? 'opacity-60' : ''
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-lg ${item.bg}`}>
                    <Icon className={`w-4 h-4 ${item.iconColor}`} />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-800">{item.label}</h3>
                </div>
                {item.desc && <p className="text-[11px] text-gray-500 leading-snug">{item.desc}</p>}
                {item.comingSoon && (
                  <span className="text-[9px] text-amber-600 bg-amber-50 px-1 py-0.5 rounded self-start mt-1">
                    준비 중
                  </span>
                )}
              </div>
            );

            if (item.external && item.label === '제휴업체') {
              return (
                <button key={item.href} type="button" onClick={() => void handlePartnerMove()} className="block text-left">
                  {card}
                </button>
              );
            }

            if (item.external) {
              return (
                <a key={item.href} href={item.href} target="_blank" rel="noopener noreferrer" className="block">
                  {card}
                </a>
              );
            }

            if (item.comingSoon) {
              return (
                <button
                  key={item.href}
                  type="button"
                  onClick={() => alert('준비 중인 기능입니다. (manager1과 동기화 예정)')}
                  className="text-left"
                >
                  {card}
                </button>
              );
            }

            return (
              <Link key={item.href} href={item.href} className="block">
                {card}
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
