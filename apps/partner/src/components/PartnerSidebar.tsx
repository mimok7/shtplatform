'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import {
    Search, CalendarCheck, LayoutDashboard, CalendarRange,
    Building2, ListTree, Wallet, Sparkles, ClipboardList,
    LogOut, X
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { partnerThumbnail } from '@/lib/partnerImages';

interface MenuItem { href: string; label: string; icon: React.ComponentType<{ className?: string }>; }
interface Section { section: string; items: MenuItem[]; }

const MEMBER_MENU: Section[] = [
    {
        section: '제휴업체 둘러보기',
        items: [
            { href: '/partner/browse', label: '전체 카테고리', icon: Search },
            // 호텔 카테고리는 별도 시스템에서 관리되므로 제휴업체 메뉴에서 숨김 처리
        ],
    },
    {
        section: '내 예약',
        items: [
            { href: '/partner/my-reservations', label: '내 예약 내역', icon: CalendarCheck },
        ],
    },
];

const PARTNER_MENU: Section[] = [
    {
        section: '우리 업체 예약',
        items: [
            { href: '/partner/dashboard', label: '예약 목록', icon: LayoutDashboard },
            { href: '/partner/calendar', label: '월별 캘린더', icon: CalendarRange },
        ],
    },
];

const ADMIN_MENU: Section[] = [
    {
        section: '제휴업체 관리',
        items: [
            { href: '/partner/admin/partners', label: '업체 목록/등록', icon: Building2 },
            { href: '/partner/admin/services', label: '서비스/메뉴', icon: ListTree },
            { href: '/partner/admin/prices', label: '가격 관리', icon: Wallet },
            { href: '/partner/admin/promotions', label: '프로모션/혜택', icon: Sparkles },
        ],
    },
    {
        section: '예약 운영',
        items: [
            { href: '/partner/admin/reservations', label: '전체 예약 조회', icon: ClipboardList },
        ],
    },
];

const MENU_BY_ROLE: Record<string, Section[]> = {
    member: MEMBER_MENU,
    partner: PARTNER_MENU,
    manager: ADMIN_MENU,
    admin: ADMIN_MENU,
};

interface Props {
    open: boolean;
    onClose: () => void;
}

export default function PartnerSidebar({ open, onClose }: Props) {
    const pathname = usePathname();
    const router = useRouter();
    const { user, profile, loading } = useAuth(undefined, '/partner/login');

    const role = profile?.role || 'member';
    const sections = MENU_BY_ROLE[role] || MENU_BY_ROLE.member;

    useEffect(() => { onClose(); }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSignOut = async () => {
        try { await supabase.auth.signOut(); } catch { /* noop */ }
        router.push('/partner/login');
    };

    return (
        <>
            <div
                className={`lg:hidden fixed inset-0 z-30 bg-black/40 backdrop-blur-sm transition-opacity ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={onClose}
            />

            <aside className={`
                fixed lg:sticky top-0 left-0 z-40 h-screen w-72 lg:w-64
                bg-white/95 backdrop-blur-xl border-r border-gray-200
                flex flex-col flex-shrink-0
                transform transition-transform duration-300
                ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
            `}>
                <div className="px-5 py-5 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm">
                            <Sparkles className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <div className="text-sm font-bold text-gray-900 leading-tight">제휴 시스템</div>
                            <div className="text-[10px] text-gray-500 leading-tight">StayHalongTravel</div>
                        </div>
                    </div>
                    <button onClick={onClose} className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {!loading && user && (() => {
                    const isPartner = role === 'partner';
                    const thumb = isPartner ? partnerThumbnail(profile?.partner_code) : null;
                    const displayName = isPartner
                        ? (profile?.partner_name || profile?.name || user.email)
                        : (profile?.name || user.email);
                    const subLabel = isPartner
                        ? (profile?.branch_name || role)
                        : role;
                    return (
                        <div className="mx-3 mt-3 px-3 py-2.5 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 flex items-center gap-2.5">
                            {thumb ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={thumb}
                                    alt={displayName}
                                    className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-white shadow-sm"
                                />
                            ) : (
                                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                                    {(displayName || '?').toString().slice(0, 1).toUpperCase()}
                                </div>
                            )}
                            <div className="min-w-0 flex-1">
                                <div className="text-xs font-medium text-gray-800 truncate">{displayName}</div>
                                <div className="text-[10px] text-blue-600 font-medium tracking-wide mt-0.5 truncate">{subLabel}</div>
                            </div>
                        </div>
                    );
                })()}

                <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
                    {sections.map((section) => (
                        <div key={section.section}>
                            <div className="px-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">
                                {section.section}
                            </div>
                            <div className="flex flex-col gap-0.5">
                                {section.items.map((item) => {
                                    const active = pathname === item.href || pathname.startsWith(item.href + '/');
                                    const Icon = item.icon;
                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            className={`
                                                group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-150
                                                ${active
                                                    ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-sm shadow-blue-200/50 font-medium'
                                                    : 'text-gray-700 hover:bg-gray-100'}
                                            `}
                                        >
                                            <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-white' : 'text-gray-400 group-hover:text-gray-600'}`} />
                                            <span className="truncate">{item.label}</span>
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </nav>

                {user && (
                    <div className="p-3 border-t border-gray-100">
                        <button
                            onClick={handleSignOut}
                            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 transition"
                        >
                            <LogOut className="w-4 h-4" />
                            로그아웃
                        </button>
                    </div>
                )}
            </aside>
        </>
    );
}
