'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
    Sparkles, Utensils, Shirt, Bus, Car,
    MapPin, Clock, Search, Tag, ChevronRight, Filter
} from 'lucide-react';
import PartnerLayout from '@/components/PartnerLayout';
import SectionBox from '@/components/SectionBox';
import Spinner from '@/components/Spinner';
import { supabase } from '@/lib/supabase';

interface Partner {
    partner_id: string;
    partner_code: string;
    name: string;
    branch_name?: string | null;
    category: string;
    subcategory?: string | null;
    region?: string | null;
    address?: string | null;
    description?: string | null;
    thumbnail_url?: string | null;
    open_hours?: string | null;
    default_discount_rate?: number | null;
}

// 호텔 카테고리는 별도 시스템(스테이하롱 호텔/크루즈)에서 관리되므로 제휴업체 화면에서 숨김
const HIDDEN_CATEGORIES = new Set<string>(['hotel']);

const CATEGORY_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string; }> = {
    spa: { label: '스파', icon: Sparkles, color: 'from-pink-500 to-rose-500' },
    restaurant: { label: '식당', icon: Utensils, color: 'from-orange-500 to-amber-500' },
    costume: { label: '의상대여', icon: Shirt, color: 'from-purple-500 to-fuchsia-500' },
    tour: { label: '투어', icon: Bus, color: 'from-emerald-500 to-teal-500' },
    rentcar: { label: '렌터카', icon: Car, color: 'from-indigo-500 to-violet-500' },
};

function categoryMeta(c: string) {
    return CATEGORY_META[c] || { label: c, icon: Tag, color: 'from-gray-500 to-gray-600' };
}

// 지역명 한글화
function regionLabel(r: string | null | undefined): string {
    const regionMap: Record<string, string> = {
        'Halong': '하롱베이',
        'Hanoi': '하노이',
    };
    return regionMap[r || ''] || r || '기타';
}

// partner_code → 이미지 경로 fallback 매핑 (DB thumbnail_url이 비어있을 때 사용)
const PARTNER_IMAGE_MAP: Record<string, string[]> = {
    'NHAMNHAM-HL-001':       ['/images/partners/nhamnham.gif'],
    'SOLCAFE-HL-001':        ['/images/partners/solcafe.gif'],
    'TAEYEONG-HN-WESTLAKE':  ['/images/partners/taeyeong.gif'],
    'TAEYEONG-HL-DELIVERY':   ['/images/partners/taeyeong.gif'],
    'MON-HL-NIGHTMKT':       ['/images/partners/mon.jpg'],
    'SERENE-HN-001':         ['/images/partners/serene.jpg'],
    'CUCCHI-HL-AOZAI':       ['/images/partners/cucchi.jpg'],
};
function partnerImage(p: { thumbnail_url?: string | null; partner_code?: string }): string | null {
    if (p.partner_code && PARTNER_IMAGE_MAP[p.partner_code]?.length) return PARTNER_IMAGE_MAP[p.partner_code][0];
    return p.thumbnail_url || null;
}

export default function BrowseAllPage() {
    const [partners, setPartners] = useState<Partner[]>([]);
    const [loading, setLoading] = useState(true);
    const [category, setCategory] = useState<string>('');
    const [region, setRegion] = useState<string>('');
    const [keyword, setKeyword] = useState<string>('');
    const [showFilters, setShowFilters] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const { data } = await supabase
                    .from('partner')
                    .select('partner_id, partner_code, name, branch_name, category, subcategory, region, address, description, thumbnail_url, open_hours, default_discount_rate')
                    .eq('is_active', true)
                    .not('category', 'in', `(${Array.from(HIDDEN_CATEGORIES).map(c => `"${c}"`).join(',')})`)
                    .order('category')
                    .order('name');
                if (cancelled) return;
                setPartners(((data as Partner[]) || []).filter(p => !HIDDEN_CATEGORIES.has(p.category)));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const categories = useMemo(() => Array.from(new Set(partners.map(p => p.category))).sort(), [partners]);
    const regions = useMemo(() => Array.from(new Set(partners.map(p => p.region).filter(Boolean))) as string[], [partners]);

    const filtered = useMemo(() => {
        return partners.filter(p => {
            if (category && p.category !== category) return false;
            if (region && (p.region || '') !== region) return false;
            if (keyword) {
                const k = keyword.toLowerCase();
                if (!(p.name?.toLowerCase().includes(k) || p.branch_name?.toLowerCase().includes(k) || p.description?.toLowerCase().includes(k))) return false;
            }
            return true;
        });
    }, [partners, category, region, keyword]);

    // 지역별 그룹화 (하롱베이 → 하노이 순서)
    const groupedByRegion = useMemo(() => {
        const groups: Record<string, Partner[]> = {};
        filtered.forEach(p => {
            const r = p.region || '기타';
            if (!groups[r]) groups[r] = [];
            groups[r].push(p);
        });
        
        // 정렬 순서: Halong 먼저, Hanoi 다음, 나머지는 알파벳
        const sortedRegions = Object.keys(groups).sort((a, b) => {
            if (a === 'Halong' && b !== 'Halong') return -1;
            if (a !== 'Halong' && b === 'Halong') return 1;
            if (a === 'Hanoi' && b !== 'Hanoi') return -1;
            if (a !== 'Hanoi' && b === 'Hanoi') return 1;
            return a.localeCompare(b);
        });
        
        return sortedRegions.map(r => ({ region: r, regionLabel: regionLabel(r), partners: groups[r] }));
    }, [filtered]);

    return (
        <PartnerLayout
            title="제휴업체 둘러보기"
            subtitle="할인 혜택과 다양한 서비스를 한눈에"
            requiredRoles={['member', 'partner', 'manager', 'admin']}
        >
            {/* 카테고리 칩 (가로 스크롤) */}
            <div className="mb-4 -mx-4 lg:mx-0 px-4 lg:px-0 overflow-x-auto scrollbar-hide">
                <div className="flex gap-2 lg:flex-wrap pb-1">
                    <CategoryChip
                        active={category === ''}
                        onClick={() => setCategory('')}
                        label="전체"
                        Icon={Tag}
                        color="from-gray-700 to-gray-800"
                    />
                    {categories.map(c => {
                        const m = categoryMeta(c);
                        return (
                            <CategoryChip
                                key={c}
                                active={category === c}
                                onClick={() => setCategory(c)}
                                label={m.label}
                                Icon={m.icon}
                                color={m.color}
                            />
                        );
                    })}
                </div>
            </div>

            {/* 검색바 */}
            <div className="mb-4 flex gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="업체명, 지점, 설명으로 검색"
                        value={keyword}
                        onChange={(e) => setKeyword(e.target.value)}
                        className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-gray-200 bg-white/80 backdrop-blur-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/30 focus:border-blue-400"
                    />
                </div>
                {regions.length > 0 && (
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`px-3 py-2.5 rounded-xl border text-sm font-medium flex items-center gap-1.5 transition ${region || showFilters
                            ? 'bg-blue-500 text-white border-blue-500'
                            : 'bg-white/80 text-gray-700 border-gray-200 hover:bg-white'
                            }`}
                    >
                        <Filter className="w-4 h-4" />
                        <span className="hidden sm:inline">지역</span>
                    </button>
                )}
            </div>

            {/* 지역 필터 (토글) */}
            {showFilters && regions.length > 0 && (
                <div className="mb-4 p-3 rounded-xl bg-white/80 border border-gray-200 flex flex-wrap gap-2">
                    <button
                        onClick={() => setRegion('')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${region === '' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                    >
                        전체 지역
                    </button>
                    {regions.map(r => (
                        <button
                            key={r}
                            onClick={() => setRegion(r)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${region === r ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                        >
                            {regionLabel(r)}
                        </button>
                    ))}
                </div>
            )}

            {/* 결과 */}
            <div className="mb-3 flex items-center justify-between px-1">
                <div className="text-sm text-gray-600">
                    총 <span className="font-bold text-gray-900">{filtered.length}</span>개 업체
                </div>
            </div>

            {loading ? (
                <Spinner label="불러오는 중..." />
            ) : filtered.length === 0 ? (
                <div className="text-center py-16 text-gray-400 text-sm bg-white/60 rounded-2xl border border-dashed border-gray-300">
                    조건에 맞는 업체가 없습니다.
                </div>
            ) : (
                <div className="space-y-8">
                    {groupedByRegion.map(group => (
                        <div key={group.region}>
                            <h3 className="text-sm font-bold text-gray-900 mb-3 px-1 flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-blue-600" />
                                {group.regionLabel}
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4">
                                {group.partners.map(p => (
                                    <PartnerCard key={p.partner_id} p={p} />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </PartnerLayout>
    );
}

function CategoryChip({
    active, onClick, label, Icon, color,
}: { active: boolean; onClick: () => void; label: string; Icon: React.ComponentType<{ className?: string }>; color: string; }) {
    return (
        <button
            onClick={onClick}
            className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-all ${active
                ? `bg-gradient-to-r ${color} text-white shadow-md shadow-gray-300/40`
                : 'bg-white/80 text-gray-700 border border-gray-200 hover:bg-white'
                }`}
        >
            <Icon className="w-3.5 h-3.5" />
            {label}
        </button>
    );
}

function PartnerCard({ p }: { p: Partner }) {
    const m = categoryMeta(p.category);
    const Icon = m.icon;
    const img = partnerImage(p);
    return (
        <Link
            href={`/partner/booking/${p.partner_id}`}
            className="group block bg-white/90 backdrop-blur-sm border border-gray-200/70 rounded-2xl overflow-hidden hover:shadow-lg hover:shadow-gray-300/30 hover:-translate-y-0.5 hover:border-blue-300 transition-all duration-200"
        >
            <div className="relative w-full aspect-[16/9] overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200">
                {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                ) : (
                    <div className={`w-full h-full bg-gradient-to-br ${m.color} flex items-center justify-center`}>
                        <Icon className="w-12 h-12 text-white/50" />
                    </div>
                )}
                <div className={`absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-lg bg-white/90 backdrop-blur text-[10px] font-semibold text-gray-700`}>
                    <Icon className="w-3 h-3" />
                    {m.label}
                </div>
                {p.default_discount_rate ? (
                    <div className="absolute top-2 right-2 px-2 py-1 rounded-lg bg-red-500 text-white text-[10px] font-bold shadow-sm">
                        {Number(p.default_discount_rate)}% OFF
                    </div>
                ) : null}
            </div>

            <div className="p-3.5">
                <div className="flex items-start justify-between gap-2 mb-1">
                    <h4 className="text-sm font-bold text-gray-900 line-clamp-1 group-hover:text-blue-600 transition">
                        {p.name}
                    </h4>
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition flex-shrink-0 mt-0.5" />
                </div>
                {p.branch_name && (
                    <div className="text-[11px] text-gray-500 mb-1.5">{p.branch_name}</div>
                )}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
                    {(p.region || p.address) && (
                        <span className="flex items-center gap-1 truncate max-w-full">
                            <MapPin className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{p.region || ''}{p.address ? ` · ${p.address}` : ''}</span>
                        </span>
                    )}
                    {p.open_hours && (
                        <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {p.open_hours}
                        </span>
                    )}
                </div>
                {p.description && (
                    <p className="text-xs text-gray-600 mt-2 line-clamp-2 leading-relaxed">{p.description}</p>
                )}
            </div>
        </Link>
    );
}
