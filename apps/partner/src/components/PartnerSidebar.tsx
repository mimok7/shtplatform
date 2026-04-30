'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

interface MenuItem { href: string; label: string; icon?: string; }

const MENU_BY_ROLE: Record<string, { section: string; items: MenuItem[] }[]> = {
    member: [
        {
            section: '🏨 호텔 예약',
            items: [
                { href: '/partner/booking', label: '제휴 호텔 둘러보기' },
                { href: '/partner/my-reservations', label: '내 예약 내역' },
            ],
        },
    ],
    partner: [
        {
            section: '📊 우리 업체 예약',
            items: [
                { href: '/partner/dashboard', label: '예약 목록' },
                { href: '/partner/calendar', label: '월별 캘린더' },
            ],
        },
    ],
    manager: [
        {
            section: '🛠️ 제휴업체 관리',
            items: [
                { href: '/partner/admin/partners', label: '제휴업체 목록' },
                { href: '/partner/admin/reservations', label: '전체 예약 조회' },
            ],
        },
    ],
    admin: [
        {
            section: '🛠️ 제휴업체 관리',
            items: [
                { href: '/partner/admin/partners', label: '제휴업체 목록' },
                { href: '/partner/admin/reservations', label: '전체 예약 조회' },
            ],
        },
    ],
};

export default function PartnerSidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const { user, profile, loading } = useAuth(undefined, '/partner/login');

    const role = profile?.role || 'member';
    const sections = MENU_BY_ROLE[role] || MENU_BY_ROLE.member;

    const handleSignOut = async () => {
        try { await supabase.auth.signOut(); } catch { /* noop */ }
        router.push('/partner/login');
    };

    return (
        <aside className="w-60 bg-white border-r border-gray-200 min-h-screen p-4 flex-shrink-0">
            <div className="mb-4 pb-3 border-b border-gray-200">
                <div className="text-sm font-semibold text-gray-800">제휴업체 시스템</div>
                {!loading && user && (
                    <div className="text-xs text-gray-500 mt-1">
                        {profile?.name || user.email} · <span className="text-blue-600">{role}</span>
                    </div>
                )}
            </div>

            {sections.map((section) => (
                <div key={section.section} className="mb-4">
                    <div className="text-xs font-medium text-gray-500 mb-2">{section.section}</div>
                    <nav className="flex flex-col gap-1">
                        {section.items.map((item) => {
                            const active = pathname === item.href || pathname.startsWith(item.href + '/');
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`px-3 py-1.5 text-sm rounded ${active
                                        ? 'bg-blue-50 text-blue-600 font-medium'
                                        : 'text-gray-700 hover:bg-gray-50'
                                        }`}
                                >
                                    {item.label}
                                </Link>
                            );
                        })}
                    </nav>
                </div>
            ))}

            {user && (
                <button
                    onClick={handleSignOut}
                    className="mt-6 w-full text-xs px-3 py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                    로그아웃
                </button>
            )}
        </aside>
    );
}
