'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search, CalendarCheck, LayoutDashboard, Building2, ClipboardList, CalendarRange } from 'lucide-react';

interface Tab { href: string; label: string; icon: React.ComponentType<{ className?: string }>; }

const TABS_BY_ROLE: Record<string, Tab[]> = {
    member: [
        { href: '/partner/browse', label: '둘러보기', icon: Search },
        { href: '/partner/my-reservations', label: '내 예약', icon: CalendarCheck },
    ],
    partner: [
        { href: '/partner/dashboard', label: '예약', icon: LayoutDashboard },
        { href: '/partner/calendar', label: '캘린더', icon: CalendarRange },
    ],
    manager: [
        { href: '/partner/admin/partners', label: '업체', icon: Building2 },
        { href: '/partner/admin/reservations', label: '예약', icon: ClipboardList },
    ],
};
TABS_BY_ROLE.admin = TABS_BY_ROLE.manager;

interface Props { role: string; }

export default function BottomTabBar({ role }: Props) {
    const pathname = usePathname();
    const tabs = TABS_BY_ROLE[role] || TABS_BY_ROLE.member;

    return (
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-xl border-t border-gray-200 pb-[env(safe-area-inset-bottom)]">
            <div className="grid grid-cols-2 gap-1 px-2 py-1.5">
                {tabs.map((t) => {
                    const active = pathname === t.href || pathname.startsWith(t.href + '/');
                    const Icon = t.icon;
                    return (
                        <Link
                            key={t.href}
                            href={t.href}
                            className={`flex flex-col items-center justify-center gap-0.5 py-2 rounded-xl transition ${active ? 'text-blue-600 bg-blue-50' : 'text-gray-500 hover:text-gray-800'
                                }`}
                        >
                            <Icon className="w-5 h-5" />
                            <span className="text-[10px] font-medium">{t.label}</span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
