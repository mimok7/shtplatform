'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Calendar,
  ClipboardList,
  FilePenLine,
  FileText,
  ListChecks,
  Bus,
  Users,
  Handshake,
  MessageSquare,
  type LucideIcon,
} from 'lucide-react';
import supabase from '@/lib/supabase';

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
  { href: '/schedule',              label: '신/구 구분', desc: '날짜별 예약 조회 (신규/기존)', icon: Calendar,      iconColor: 'text-blue-600',   bg: 'bg-blue-100' },
  { href: '/reservations',          label: '예약 처리',  desc: '예약 변경 및 일괄 처리',       icon: ClipboardList, iconColor: 'text-green-600',  bg: 'bg-green-100' },
  { href: '/reservation-edit',      label: '예약 수정',  desc: '서비스별 상태 수정',            icon: ListChecks,    iconColor: 'text-amber-600',  bg: 'bg-amber-100' },
  { href: '/customers',             label: '고객관리',   desc: '고객 조회 / 수정 / 초기화',     icon: Users,         iconColor: 'text-cyan-600',   bg: 'bg-cyan-100' },
  { href: '/sht-car',               label: '스하 차량',  desc: '스하 차량 배정 관리',           icon: Bus,           iconColor: 'text-teal-600',   bg: 'bg-teal-100' },
  { href: '/cafe-guide',            label: '카페 안내',  desc: '카페 공지/안내문 생성',          icon: MessageSquare, iconColor: 'text-emerald-600', bg: 'bg-emerald-100' },
  { href: '/quotes/cruise',         label: '견적 입력',  desc: '크루즈 견적 신규 입력',         icon: FilePenLine,   iconColor: 'text-purple-600', bg: 'bg-purple-100' },
  { href: '/quotes',                label: '견적 목록',  desc: '견적 조회 / 수정',              icon: FileText,      iconColor: 'text-indigo-600', bg: 'bg-indigo-100' },
  { href: 'https://partner.stayhalong.com/partner/admin/reservations', label: '제휴업체', desc: '제휴업체 예약 관리', icon: Handshake, iconColor: 'text-orange-600', bg: 'bg-orange-100', external: true },
];

export default function HomePage() {
  const router = useRouter();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col p-4 pb-10">
      <div className="w-full flex justify-end pt-2">
        <button
          type="button"
          onClick={handleLogout}
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          로그아웃
        </button>
      </div>

      <div className="text-center my-6">
        <Image
          src="/logo.png"
          alt="스테이하롱 로고"
          width={180}
          height={60}
          className="mx-auto h-auto w-auto max-w-[180px]"
          priority
        />
        <p className="mt-2 text-xs text-slate-500">매니저 모바일 (manager1 mirror)</p>
      </div>

      <section className="w-full">
        <h2 className="px-1 mb-2 text-xs font-semibold text-slate-500 flex items-center gap-1">
          <span>⭐</span> 즐겨찾기
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {FAVORITES.map((item) => {
            const Icon = item.icon;
            const card = (
              <div
                className={`relative h-full p-4 bg-white rounded-2xl shadow-sm hover:shadow-md transition-all active:scale-[0.98] flex flex-col ${
                  item.comingSoon ? 'opacity-60' : ''
                }`}
              >
                <div className={`w-10 h-10 mb-2 flex items-center justify-center rounded-xl ${item.bg}`}>
                  <Icon className={`w-5 h-5 ${item.iconColor}`} />
                </div>
                <h3 className="text-sm font-semibold text-gray-800 leading-tight">{item.label}</h3>
                <p className="mt-1 text-[11px] text-gray-500 leading-snug">{item.desc}</p>
                {item.comingSoon && (
                  <span className="absolute top-2 right-2 text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                    준비 중
                  </span>
                )}
              </div>
            );

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
