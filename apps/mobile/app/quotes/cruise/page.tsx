'use client';
import { useEffect, useState, Suspense, useRef, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '@/lib/supabase';
import { getExchangeRate, formatExchangeRate } from '../../../lib/exchangeRate';
import { vndToKrw, roundKrwToHundred } from '../../../lib/exchangeRate';
import { resolveLocalQuoteTitle, ensureQuoteTitle } from '../../../lib/getQuoteTitle';
import {
    CruisePriceCalculator,
    CruiseRateCard,
    CruiseTourOption,
    SelectedTourOption,
    CruisePriceResult,
    formatVND as formatVNDCurrency,
    SCHEDULE_MAP,
} from '@/lib/cruisePriceCalculator';

const calculator = new CruisePriceCalculator(supabase);

/**
 * 모바일 전용 페이지 래퍼
 * - manager1의 ManagerLayout(사이드바/탭 등)을 단순 헤더로 대체
 * - 기능은 동일하되 UI만 모바일 최적화
 */
function MobileQuoteLayout({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-slate-50 pb-20 overflow-x-hidden text-xs">
            <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
                <div className="max-w-screen-md mx-auto flex items-center justify-between px-2 py-2">
                    <Link href="/" className="flex items-center gap-1 text-slate-600 active:text-slate-900">
                        <ArrowLeft className="w-5 h-5" />
                        <span className="text-xs">홈</span>
                    </Link>
                    <h1 className="text-xs font-semibold text-slate-800">{title}</h1>
                    <Link href="/quotes" className="text-xs text-blue-600 active:text-blue-800">목록</Link>
                </div>
            </header>
            <div className="max-w-screen-md mx-auto w-full min-w-0 px-2 py-2 overflow-x-hidden">
                {children}
            </div>
        </div>
    );
}

// VND 포맷 함수 (동 단위 - 매니저 자연어 요약용)
const formatVND = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return '—';
    return `${Math.round(value).toLocaleString()}동`;
};

// 공용 탭 (quoteId 유지) + 오늘 타이틀 선택/작업 시작 컨트롤
function ManagerServiceTabs({ active, pageRawRate }: { active: 'cruise' | 'airport' | 'hotel' | 'rentcar' | 'tour' | 'comprehensive' | 'package'; pageRawRate?: number | null }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const quoteId = searchParams.get('quoteId');
    const [titlesToday, setTitlesToday] = useState<any[]>([]);
    const [creating, setCreating] = useState(false);
    const [titleInput, setTitleInput] = useState('');
    const makeHref = (key: string, id?: string | null) => `/quotes/${key}${id ? `?quoteId=${id}` : (quoteId ? `?quoteId=${quoteId}` : '')}`;
    const Tab = ({ keyName, label }: { keyName: typeof active; label: string }) => (
        <button
            type="button"
            onClick={() => router.push(makeHref(keyName))}
            className={`px-3 py-1.5 text-xs rounded-md border ${active === keyName ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}
        >
            {label}
        </button>
    );

    useEffect(() => {
        const loadTodaysTitles = async () => {
            try {
                const { data: authData } = await supabase.auth.getUser();
                const user = (authData as any)?.user;
                const today = new Date();
                const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
                const next = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();
                let q = supabase.from('quote').select('id,title,created_at').gte('created_at', start).lt('created_at', next).order('created_at', { ascending: false });
                if (user?.id) q = q.eq('user_id', user.id);
                const { data } = await q;
                setTitlesToday(data || []);
            } catch { setTitlesToday([]); }
        };
        loadTodaysTitles();
    }, []);

    const onPickTitle = (id: string) => router.push(makeHref(active, id));
    const startNew = async () => {
        if (!titleInput.trim()) return alert('타이틀을 입력하세요');
        try {
            setCreating(true);
            const { data: authData, error: authErr } = await supabase.auth.getUser();
            if (authErr) return alert('로그인이 필요합니다.');
            const user = (authData as any)?.user;
            if (!user?.id) return alert('로그인이 필요합니다.');
            const resp = await supabase.from('quote').insert({ title: titleInput.trim(), status: 'draft', user_id: user.id }).select('id').single();
            if (resp.error || !resp.data?.id) return alert(`견적 생성 실패: ${resp.error?.message || '알 수 없는 오류'}`);
            try { if (typeof window !== 'undefined') sessionStorage.removeItem('manager:cruise:form:draft'); } catch { }
            router.push(makeHref(active, resp.data.id));
        } finally { setCreating(false); }
    };

    return (
        <div className="mb-2 w-full min-w-0 flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
                <div className="flex flex-wrap gap-1.5">
                    <Tab keyName="cruise" label="크루즈" />
                    <Tab keyName="airport" label="공항" />
                    <Tab keyName="hotel" label="호텔" />
                    <Tab keyName="rentcar" label="렌트카" />
                    <Tab keyName="tour" label="투어" />
                    <Tab keyName="package" label="패키지" />
                    <Tab keyName="comprehensive" label="전체" />
                </div>
                {pageRawRate !== null && pageRawRate !== undefined && (
                    <span className="text-[10px] text-gray-500 whitespace-nowrap">환율(DB raw): {pageRawRate}</span>
                )}
            </div>
            <div className="w-full min-w-0 grid grid-cols-2 gap-1.5">
                <select onChange={(e) => e.target.value && onPickTitle(e.target.value)} className="border h-8 px-2 rounded text-[11px] bg-white w-full min-w-0">
                    <option value="">오늘 작성한 타이틀 선택</option>
                    {titlesToday.map(t => (
                        <option key={t.id} value={t.id}>{t.title} — {new Date(t.created_at).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' })}</option>
                    ))}
                </select>
                <input value={titleInput} onChange={(e) => setTitleInput(e.target.value)} placeholder="타이틀" className="border h-8 px-2 rounded text-[11px] w-full min-w-0" />
                <button
                    type="button"
                    onClick={startNew}
                    disabled={creating}
                    className="col-span-2 h-8 text-[11px] bg-green-600 text-white px-2 rounded text-center"
                    aria-label="작업 시작"
                >
                    {creating ? '생성중...' : '작업 시작'}
                </button>
            </div>
        </div>
    );
}

function ManagerCruiseQuoteForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const quoteId = searchParams.get('quoteId');

    const STORAGE_KEY = 'manager:cruise:form:draft';

    // 폼 상태 (cruise_rate_card 기반 - sht-customer와 동일)
    const [form, setForm] = useState({
        checkin: new Date().toISOString().split('T')[0],
        schedule: '1박2일',
        cruise_name: '',
        room_type: '',
        adult_count: 2,
        child_count: 0,
        child_extra_bed_count: 0,
        infant_count: 0,
        extra_bed_count: 0,
        single_count: 0,
    });

    const [vehicleForm, setVehicleForm] = useState([{ car_type: '', car_category: '', car_code: '', route: '', count: 1 }]);
    const [selectedCarCategory, setSelectedCarCategory] = useState('');

    const [cruiseOptions, setCruiseOptions] = useState<string[]>([]);
    const [roomTypeCards, setRoomTypeCards] = useState<CruiseRateCard[]>([]);

    // 가격 계산 결과 (cruise_rate_card 기반)
    const [priceResult, setPriceResult] = useState<CruisePriceResult | null>(null);
    const [priceLoading, setPriceLoading] = useState(false);

    // 당일투어 옵션
    const [tourOptions, setTourOptions] = useState<CruiseTourOption[]>([]);
    const [selectedTourOptions, setSelectedTourOptions] = useState<SelectedTourOption[]>([]);

    // 패키지 옵션
    const [availablePackages, setAvailablePackages] = useState<any[]>([]);
    const [selectedPackage, setSelectedPackage] = useState<any | null>(null);
    const [carCategoryOptions, setCarCategoryOptions] = useState<string[]>([]);
    const [carTypeOptions, setCarTypeOptions] = useState<string[]>([]);
    const [routeOptions, setRouteOptions] = useState<string[]>([]);
    const [selectedRoute, setSelectedRoute] = useState('');
    const scheduleOptions = ['1박2일', '2박3일', '당일'];
    const [formData, setFormData] = useState({ special_requests: '' });
    const [loading, setLoading] = useState(false);
    const [quote, setQuote] = useState<any>(null);
    const [quoteRooms, setQuoteRooms] = useState<any[]>([]);
    const [quoteCars, setQuoteCars] = useState<any[]>([]);
    const [detailedServices, setDetailedServices] = useState<any>({ rooms: [], cars: [], airports: [], hotels: [], rentcars: [], tours: [] });
    const rightCardRef = useRef<HTMLDivElement | null>(null);
    const naturalRef = useRef<HTMLDivElement | null>(null);
    const naturalTextRef = useRef<HTMLDivElement | null>(null);
    const [selectedDiscount, setSelectedDiscount] = useState<number | null>(null);
    const [exchangeRate, setExchangeRate] = useState<number>(1400); // 기본 환율 설정
    const [rawExchangeRate, setRawExchangeRate] = useState<number | null>(null); // DB에 저장된 실제 원시 환율
    const [naturalSummary, setNaturalSummary] = useState<string>('');
    const [regenerating, setRegenerating] = useState<boolean>(false);
    const [isComparisonMode, setIsComparisonMode] = useState<boolean>(false);
    const [isCarComparisonMode, setIsCarComparisonMode] = useState<boolean>(false); // 차량 비교 모드
    // 합계 요약 상태: 동화 합계와 원화 합계
    const [totalSummary, setTotalSummary] = useState<{ totalDong: number; totalWon: number }>({ totalDong: 0, totalWon: 0 });

    // 차량구분 (하드코딩)
    const carCategoryHardcoded = ['편도', '당일왕복', '다른날왕복'];

    // 선택된 요금 카드
    const selectedRateCard = useMemo(() => {
        return roomTypeCards.find(card => card.room_type === form.room_type) || null;
    }, [roomTypeCards, form.room_type]);

    const copyNaturalOnly = async () => {
        try {
            if (typeof window === 'undefined') return;
            const naturalEl = naturalTextRef.current || naturalRef.current;
            if (!naturalEl) {
                alert('복사할 자연어 요약 영역을 찾을 수 없습니다.');
                return;
            }
            // innerText of the text-only container (excludes header/button)
            const naturalText = naturalEl.innerText || '';
            if (!naturalText) {
                alert('복사할 자연어 요약이 없습니다.');
                return;
            }
            await navigator.clipboard.writeText(naturalText);
            alert('자연어 요약을 클립보드에 복사했습니다.');
        } catch (e) {
            console.error('복사 실패:', e);
            alert('복사에 실패했습니다. 브라우저의 클립보드 권한을 확인하세요.');
        }
    };
    const regenerateNatural = async () => {
        try {
            setRegenerating(true);
            const summary = generateNaturalSummary(detailedServices, exchangeRate, selectedDiscount, isComparisonMode, isCarComparisonMode);
            setNaturalSummary(summary);
        } catch (e) {
            console.error('자연어 생성 실패:', e);
            alert('자연어 생성에 실패했습니다. 콘솔을 확인하세요.');
        } finally {
            setRegenerating(false);
        }
    };
    // 자연어 요약 생성 함수
    const generateNaturalSummary = (services: any, rate: number, discount: number | null, comparisonMode: boolean = false, carComparisonMode: boolean = false) => {
        // 통화 포맷 헬퍼
        const formatDong = (v: number | null | undefined) => {
            if (v === null || v === undefined) return '-';
            return `${Math.round(v).toLocaleString()}동`;
        };

        // Normalize rate: some sources provide VND-per-KRW (e.g. 1400), others provide KRW-per-VND (small < 10).
        // We expect a multiplier for VND -> KRW. If rate looks large (>10), treat it as VND-per-KRW and invert it.
        const EXCHANGE_RATE = (typeof rate === 'number' && rate > 10) ? (1 / rate) : (rate || 0);

        // 차량 비교 모드: 차량을 하나씩 분리하여 따로 계산 (객실 포함)
        if (carComparisonMode) {
            let outCar = '';
            outCar += `회원님~! 차량별 견적드립니다^^\n\n`;

            // 크루즈별로 그룹화
            const cruiseCarGroups: { [key: string]: { cars: any[], rooms: any[] } } = {};

            // 차량 그룹화
            services.cars?.forEach((c: any) => {
                const cruiseName = c.priceInfo?.[0]?.cruise || c.carInfo?.cruise_name || '크루즈 미지정';
                if (!cruiseCarGroups[cruiseName]) cruiseCarGroups[cruiseName] = { cars: [], rooms: [] };
                cruiseCarGroups[cruiseName].cars.push(c);
            });

            // 객실 그룹화
            services.rooms?.forEach((r: any) => {
                const cruiseName = r.roomInfo?.cruise_name || r.priceInfo?.[0]?.cruise || '크루즈 미지정';
                if (!cruiseCarGroups[cruiseName]) cruiseCarGroups[cruiseName] = { cars: [], rooms: [] };
                cruiseCarGroups[cruiseName].rooms.push(r);
            });

            // 객실 합계 계산 (공통)
            const calculateRoomTotal = (rooms: any[]) => {
                return rooms.reduce((sum: number, r: any) => {
                    const categoryLabel = r.priceInfo?.[0]?.room_category || r.priceInfo?.[0]?.room_type || r.roomInfo?.room_category || '성인';
                    const unit = r.priceInfo?.[0]?.price ?? r.priceInfo?.[0]?.base_price ?? r.item?.unit_price ?? 0;
                    let categoryCount = r.calculated_count ?? r.item?.quantity ?? 1;
                    const ri = r.roomInfo || {};
                    const catKey = String(categoryLabel || '').toLowerCase();
                    if (/엑스트라/.test(catKey)) {
                        categoryCount = ri.extra_count ?? categoryCount;
                    }
                    let roomTotal = r.calculated_total ?? (Number(unit || 0) * Number(categoryCount || 1));
                    if (discount && [3, 5, 8, 10].includes(Number(discount))) {
                        const discountRate = 1 - (Number(discount) / 100);
                        roomTotal = Math.round(roomTotal * discountRate);
                    }
                    return sum + roomTotal;
                }, 0);
            };

            // 크루즈별 합계를 저장할 배열 (비교용)
            const cruiseTotals: Array<{ cruiseName: string, roomTotal: number, carTotals: number[], combinedTotals: number[] }> = [];

            Object.entries(cruiseCarGroups).forEach(([cruiseName, data]) => {
                outCar += `크루즈: ${cruiseName}\n\n`;

                // 객실 합계 계산
                const roomTotal = calculateRoomTotal(data.rooms);

                // 객실 표시
                if (data.rooms && data.rooms.length > 0) {
                    data.rooms.forEach((r: any) => {
                        const categoryLabel = r.priceInfo?.[0]?.room_category || r.priceInfo?.[0]?.room_type || r.roomInfo?.room_category || '성인';
                        const unit = r.priceInfo?.[0]?.price ?? r.priceInfo?.[0]?.base_price ?? r.item?.unit_price ?? 0;
                        let categoryCount = r.calculated_count ?? r.item?.quantity ?? 1;
                        const ri = r.roomInfo || {};
                        const catKey = String(categoryLabel || '').toLowerCase();
                        if (/엑스트라/.test(catKey)) {
                            categoryCount = ri.extra_count ?? categoryCount;
                        }
                        let roomTotalPrice = r.calculated_total ?? (Number(unit || 0) * Number(categoryCount || 1));

                        // 할인 적용
                        if (discount && [3, 5, 8, 10].includes(Number(discount))) {
                            const discountRate = 1 - (Number(discount) / 100);
                            roomTotalPrice = Math.round(roomTotalPrice * discountRate);
                        }

                        const roomName = r.priceInfo?.[0]?.room_type || r.priceInfo?.[0]?.room_name || r.roomInfo?.room_name || '객실명 미지정';
                        outCar += `${roomName} ${categoryLabel} 1인 ${formatDong(unit)} * ${categoryCount}인 = ${formatDong(roomTotalPrice)}\n`;
                    });
                    outCar += `\n`;
                }

                // 각 차량별 합계 저장
                const carTotals: number[] = [];
                const combinedTotals: number[] = [];

                // 각 차량을 개별적으로 표시하고 합계 계산
                data.cars.forEach((c: any, idx: number) => {
                    const carName = c.priceInfo?.[0]?.car_type || c.carInfo?.car_type || '차량명 미지정';
                    const carCategory = c.priceInfo?.[0]?.car_category || c.carInfo?.car_category || '';
                    const unit = c.priceInfo?.[0]?.price ?? c.priceInfo?.[0]?.base_price ?? c.item?.unit_price ?? 0;
                    const cnt = c.calculated_count ?? c.item?.quantity ?? 1;
                    const carTotal = c.calculated_total ?? (Number(unit || 0) * Number(cnt || 1));

                    carTotals.push(carTotal);
                    const combinedTotal = roomTotal + carTotal;
                    combinedTotals.push(combinedTotal);

                    const prefix = idx === 0 ? '차량: ' : '        ';
                    outCar += `${prefix}${carName}${carCategory ? ` (${carCategory})` : ''} 1인 ${formatDong(unit)} * ${cnt}인 = ${formatDong(carTotal)}\n`;
                });

                outCar += `\n`;

                // 각 차량별 합계 표시 (객실 + 차량N)
                data.cars.forEach((c: any, idx: number) => {
                    const carName = c.priceInfo?.[0]?.car_type || c.carInfo?.car_type || '차량명 미지정';
                    const combinedTotal = combinedTotals[idx];
                    const combinedTotalWon = roundKrwToHundred(vndToKrw(combinedTotal, EXCHANGE_RATE));
                    outCar += `객실 + 차량${idx + 1}(${carName}) 합계: ${formatDong(combinedTotal)} (원화: ${combinedTotalWon.toLocaleString()}원)\n`;
                });

                outCar += `\n`;

                cruiseTotals.push({ cruiseName, roomTotal, carTotals, combinedTotals });
            });

            // 차량 비교 (객실 + 각 차량별 합계)
            if (cruiseTotals.length > 0) {
                outCar += `=== 차량 비교 결과 ===\n\n`;

                cruiseTotals.forEach((cruise) => {
                    outCar += `${cruise.cruiseName}:\n`;
                    cruise.combinedTotals.forEach((total, idx) => {
                        const totalWon = roundKrwToHundred(vndToKrw(total, EXCHANGE_RATE));
                        outCar += `  객실 + 차량${idx + 1} 합계: ${formatDong(total)} (원화: ${totalWon.toLocaleString()}원)\n`;
                    });
                    outCar += `\n`;
                });

                // 차량별 차이 계산
                if (cruiseTotals[0]?.combinedTotals.length > 1) {
                    outCar += `차량 간 차이:\n`;
                    const maxCarCount = Math.max(...cruiseTotals.map(c => c.combinedTotals.length));

                    for (let carIdx = 0; carIdx < maxCarCount - 1; carIdx++) {
                        const totals = cruiseTotals.map(c => c.combinedTotals[carIdx]).filter(t => t !== undefined);
                        const nextTotals = cruiseTotals.map(c => c.combinedTotals[carIdx + 1]).filter(t => t !== undefined);

                        if (totals.length > 0 && nextTotals.length > 0) {
                            const diff = Math.abs(totals[0] - nextTotals[0]);
                            const diffWon = roundKrwToHundred(vndToKrw(diff, EXCHANGE_RATE));
                            outCar += `  차량${carIdx + 1} vs 차량${carIdx + 2}: ${formatDong(diff)} (원화: ${diffWon.toLocaleString()}원)\n`;
                        }
                    }
                    outCar += `\n`;
                }
            }

            return outCar;
        }

        // 비교 모드 전용 출력: 기존 요약을 포함하지 않고 요청하신 형식으로 한 번만 반환
        if (comparisonMode) {
            // 객실별 그룹화 (크루즈 + 객실명 단위)
            const roomGroups: { [key: string]: { cruiseName: string; roomName: string; rooms: any[]; total?: number } } = {};
            services.rooms?.forEach((r: any) => {
                const cruiseName = r.roomInfo?.cruise_name || r.priceInfo?.[0]?.cruise || '크루즈 미지정';
                const roomName = r.priceInfo?.[0]?.room_type || r.priceInfo?.[0]?.room_name || r.roomInfo?.room_name || '객실명 미지정';
                const key = `${cruiseName}_${roomName}`;
                if (!roomGroups[key]) roomGroups[key] = { cruiseName, roomName, rooms: [] };
                roomGroups[key].rooms.push(r);
            });

            // 각 그룹의 합계 계산
            Object.values(roomGroups).forEach((group) => {
                let groupTotal = 0;
                group.rooms.forEach((r: any) => {
                    const unit = r.priceInfo?.[0]?.price ?? r.priceInfo?.[0]?.base_price ?? r.item?.unit_price ?? 0;
                    let categoryCount = r.calculated_count ?? r.item?.quantity ?? 1;
                    const categoryLabel = r.priceInfo?.[0]?.room_category || r.priceInfo?.[0]?.room_type || r.roomInfo?.room_category || '성인';
                    const catKey = String(categoryLabel || '').toLowerCase();
                    const ri = r.roomInfo || {};
                    if (/엑스트라/.test(catKey)) categoryCount = ri.extra_count ?? categoryCount;
                    let roomTotal = r.calculated_total ?? (Number(unit || 0) * Number(categoryCount || 1));
                    if (discount && [3, 5, 8, 10].includes(Number(discount))) {
                        const discountRate = 1 - (Number(discount) / 100);
                        roomTotal = Math.round(roomTotal * discountRate);
                    }
                    groupTotal += roomTotal;
                });
                // 해당 크루즈의 차량 합계 추가
                services.cars?.forEach((c: any) => {
                    const carCruise = c.priceInfo?.[0]?.cruise || c.carInfo?.cruise_name;
                    if (carCruise === group.cruiseName) {
                        const carTotal = c.calculated_total ?? (Number(c.priceInfo?.[0]?.price ?? c.priceInfo?.[0]?.base_price ?? c.item?.unit_price ?? 0) * Number(c.calculated_count ?? c.item?.quantity ?? 1));
                        groupTotal += carTotal;
                    }
                });
                group.total = groupTotal;
            });

            // 크루즈별로 정리: cruiseName => [groups]
            const cruiseMap: { [key: string]: Array<{ roomName: string; rooms: any[]; total: number }> } = {};
            Object.values(roomGroups).forEach(g => {
                if (!cruiseMap[g.cruiseName]) cruiseMap[g.cruiseName] = [];
                cruiseMap[g.cruiseName].push({ roomName: g.roomName, rooms: g.rooms, total: g.total || 0 });
            });

            let outCmp = '';
            outCmp += `회원님~! 견적드립니다^^\n\n`;

            const cruiseNames = Object.keys(cruiseMap);
            cruiseNames.forEach((cruiseName, ci) => {
                outCmp += `크루즈: ${cruiseName}\n\n`;
                cruiseMap[cruiseName].forEach((rg) => {
                    outCmp += `객실명: ${rg.roomName}\n`;
                    // 객실 항목 상세
                    rg.rooms.forEach((r: any) => {
                        const categoryLabel = r.priceInfo?.[0]?.room_category || r.priceInfo?.[0]?.room_type || r.roomInfo?.room_category || '성인';
                        const unit = r.priceInfo?.[0]?.price ?? r.priceInfo?.[0]?.base_price ?? r.item?.unit_price ?? 0;
                        let categoryCount = r.calculated_count ?? r.item?.quantity ?? 1;
                        const ri = r.roomInfo || {};
                        const catKey = String(categoryLabel || '').toLowerCase();
                        if (/엑스트라/.test(catKey)) categoryCount = ri.extra_count ?? categoryCount;
                        let roomTotal = r.calculated_total ?? (Number(unit || 0) * Number(categoryCount || 1));
                        if (discount && [3, 5, 8, 10].includes(Number(discount))) {
                            const discountRate = 1 - (Number(discount) / 100);
                            roomTotal = Math.round(roomTotal * discountRate);
                        }
                        outCmp += `${categoryLabel} 1인 ${formatDong(unit)} * ${categoryCount}인 = ${formatDong(roomTotal)}\n`;
                    });

                    // 차량 (크루즈 소속 차량을 객실마다 중복 표기)
                    const groupCars = services.cars?.filter((c: any) => {
                        const carCruise = c.priceInfo?.[0]?.cruise || c.carInfo?.cruise_name;
                        return carCruise === cruiseName;
                    }) || [];
                    if (groupCars.length > 0) {
                        groupCars.forEach((c: any, ci2: number) => {
                            const carName = c.priceInfo?.[0]?.car_type || c.carInfo?.car_type || '차량명 미지정';
                            const unit = c.priceInfo?.[0]?.price ?? c.priceInfo?.[0]?.base_price ?? c.item?.unit_price ?? 0;
                            const cnt = c.calculated_count ?? c.item?.quantity ?? 1;
                            const total = c.calculated_total ?? (Number(unit || 0) * Number(cnt || 1));
                            const prefix = ci2 === 0 ? '차량: ' : '        ';
                            outCmp += `${prefix}${carName} 1인 ${formatDong(unit)} * ${cnt}인 = ${formatDong(total)}\n`;
                        });
                    }

                    const groupWon = roundKrwToHundred(vndToKrw(rg.total, EXCHANGE_RATE));
                    outCmp += `\n총합계: ${formatDong(rg.total)}\n`;
                    outCmp += `원화금액: ${groupWon.toLocaleString()}원\n\n`;
                });
            });

            // 비교 문구
            const sorted = Object.values(roomGroups).sort((a, b) => (a.total || 0) - (b.total || 0));
            if (sorted.length > 1) {
                const cheapest = sorted[0];
                const mostExpensive = sorted[sorted.length - 1];
                const diff = (mostExpensive.total || 0) - (cheapest.total || 0);
                const diffWon = roundKrwToHundred(vndToKrw(diff, EXCHANGE_RATE));
                outCmp += `${cheapest.cruiseName} ${cheapest.roomName} 객실과\n`;
                outCmp += `${mostExpensive.cruiseName} ${mostExpensive.roomName} 객실의\n차이는 ${formatDong(diff)}(원화: ${diffWon.toLocaleString()}원) 입니다.`;
            } else {
                outCmp += `비교할 수 있는 객실이 부족합니다.`;
            }

            return outCmp;
        }

        let out = '';
        const topCruise = services.rooms?.[0]?.roomInfo?.cruise_name || services.rooms?.[0]?.priceInfo?.[0]?.cruise || undefined;
        const hasServices = (services.rooms && services.rooms.length > 0) || (services.cars && services.cars.length > 0) || (services.airports && services.airports.length > 0) || (services.hotels && services.hotels.length > 0) || (services.rentcars && services.rentcars.length > 0) || (services.tours && services.tours.length > 0);
        if (hasServices) {
            out += `회원님~! 견적드립니다^^\n\n`;
        }
        const seenCruises = new Set<string>();
        // 객실 데이터를 크루즈별로 그룹화
        const cruiseGroups: { [key: string]: any[] } = {};
        services.rooms?.forEach((r: any) => {
            const cruiseName = r.roomInfo?.cruise_name || r.priceInfo?.[0]?.cruise || topCruise || '크루즈 미지정';
            if (!cruiseGroups[cruiseName]) {
                cruiseGroups[cruiseName] = [];
            }
            cruiseGroups[cruiseName].push(r);
        });

        const cruiseGroupNames = Object.keys(cruiseGroups);
        const assignedCarIndexes = new Set<number>();

        // 크루즈별로 처리
        Object.entries(cruiseGroups).forEach(([cruiseName, rooms]) => {
            out += `크루즈: ${cruiseName}\n\n`;

            // 객실별로 그룹화
            const roomGroups: { [key: string]: any[] } = {};
            rooms.forEach((r: any) => {
                const roomName = r.priceInfo?.[0]?.room_type || r.priceInfo?.[0]?.room_name || r.roomInfo?.room_name || '객실명 미지정';
                if (!roomGroups[roomName]) {
                    roomGroups[roomName] = [];
                }
                roomGroups[roomName].push(r);
            });

            // 객실별로 처리
            let firstRoomInCruise = true;
            Object.entries(roomGroups).forEach(([roomName, roomItems]) => {
                if (!firstRoomInCruise) out += `\n`;
                out += `객실명: ${roomName}\n`;

                let roomTotalSum = 0;
                roomItems.forEach((r: any) => {
                    const categoryLabel = r.priceInfo?.[0]?.room_category || r.priceInfo?.[0]?.room_type || r.roomInfo?.room_category || '성인';
                    const unit = r.priceInfo?.[0]?.price ?? r.priceInfo?.[0]?.base_price ?? r.item?.unit_price ?? 0;
                    let categoryCount = r.calculated_count ?? r.item?.quantity ?? 1;
                    const ri = r.roomInfo || {};
                    const catKey = String(categoryLabel || '').toLowerCase();
                    if (/엑스트라/.test(catKey)) {
                        // DB에는 성인/아동 구분된 extra 컬럼이 없을 수 있으므로
                        // 저장된 단일 extra_count를 우선 사용합니다.
                        categoryCount = ri.extra_count ?? categoryCount;
                    }

                    let roomTotal = r.calculated_total ?? (Number(unit || 0) * Number(categoryCount || 1));

                    // 할인 적용 (공휴일·투어 항목은 할인 제외)
                    if (discount && [3, 5, 8, 10].includes(Number(discount)) && !/^(공휴일|투어)/.test(categoryLabel)) {
                        const discountRate = 1 - (Number(discount) / 100);
                        roomTotal = Math.round(roomTotal * discountRate);
                    }

                    roomTotalSum += roomTotal;

                    out += `${categoryLabel} 1인 ${formatDong(unit)} * ${categoryCount}인 = ${formatDong(roomTotal)}\n`;
                });

                // 룸 테이블의 sale 컬럼 값에 따라 할인 표시 (첫 번째 객실 기준)
                if (discount && [3, 5, 8, 10].includes(Number(discount))) {
                    out += `${discount}% 할인 바우쳐 적용시 금액: ${formatDong(roomTotalSum)}\n`;
                } else {
                    out += `\n객실합계: ${formatDong(roomTotalSum)}\n`;
                }

                firstRoomInCruise = false;
            });

            // 패키지 표시
            const pkgInfo = rooms[0]?.item?.options?.selected_package;
            if (pkgInfo?.package_name) {
                out += `패키지: ${pkgInfo.package_name}\n`;
            }

            // 특별 요청사항 표시
            const specialReqs = rooms[0]?.item?.options?.special_requests;
            if (specialReqs) {
                out += `요청사항: ${specialReqs}\n`;
            }

            // 크루즈별 차량 표시
            // 객실 블록과 차량 블록 사이에 빈 줄을 추가
            if (Object.keys(roomGroups).length > 0) {
                out += `\n`;
            }
            const cruiseCars = (services.cars || [])
                .map((c: any, idx: number) => ({ c, idx }))
                .filter(({ c, idx }: { c: any; idx: number }) => {
                    if (assignedCarIndexes.has(idx)) return false;
                    const carCruise = c.priceInfo?.[0]?.cruise || c.carInfo?.cruise_name;
                    const normalizedCarCruise = String(carCruise || '').trim();
                    const normalizedCruiseName = String(cruiseName || '').trim();

                    if (normalizedCarCruise && normalizedCarCruise === normalizedCruiseName) {
                        assignedCarIndexes.add(idx);
                        return true;
                    }

                    // 단일 크루즈 견적이면 표기 차이(공백/별칭)로 매칭이 어긋난 차량도 해당 크루즈에 귀속
                    if (cruiseGroupNames.length === 1) {
                        assignedCarIndexes.add(idx);
                        return true;
                    }

                    return false;
                })
                .map(({ c }: { c: any; idx: number }) => c);

            if (cruiseCars.length > 0) {
                cruiseCars.forEach((c: any, index: number) => {
                    const carName = c.priceInfo?.[0]?.car_type || c.carInfo?.car_type || '차량명 미지정';
                    const unit = c.priceInfo?.[0]?.price ?? c.priceInfo?.[0]?.base_price ?? c.item?.unit_price ?? 0;
                    const cnt = c.calculated_count ?? c.item?.quantity ?? 1;
                    const total = c.calculated_total ?? (Number(unit || 0) * Number(cnt || 1));

                    const prefix = index === 0 ? '차량: ' : '        ';
                    out += `${prefix}${carName} 1인 ${formatDong(unit)} * ${cnt}인 = ${formatDong(total)}\n`;
                    // 차량 항목 사이에 한 줄 띄움
                    if (index < cruiseCars.length - 1) out += '\n';
                });
                out += '\n';
            }

            // 크루즈별 합계 계산 (객실 + 차량만)
            const cruiseRoomSum = rooms.reduce((s: number, r: any) => {
                const categoryLabel = r.priceInfo?.[0]?.room_category || r.priceInfo?.[0]?.room_type || r.roomInfo?.room_category || '성인';
                const unit = r.priceInfo?.[0]?.price ?? r.priceInfo?.[0]?.base_price ?? r.item?.unit_price ?? 0;
                let categoryCount = r.calculated_count ?? r.item?.quantity ?? 1;
                const ri = r.roomInfo || {};
                const catKey = String(categoryLabel || '').toLowerCase();
                if (/엑스트라/.test(catKey)) {
                    categoryCount = ri.extra_count ?? categoryCount;
                }
                let roomTotal = r.calculated_total ?? (Number(unit || 0) * Number(categoryCount || 1));

                // 할인 적용 (공휴일·투어 항목은 할인 제외)
                if (discount && [3, 5, 8, 10].includes(Number(discount)) && !/^(공휴일|투어)/.test(categoryLabel)) {
                    const discountRate = 1 - (Number(discount) / 100);
                    roomTotal = Math.round(roomTotal * discountRate);
                }

                return s + roomTotal;
            }, 0);

            const cruiseCarSum = cruiseCars.reduce((s: number, c: any) => {
                const total = c.calculated_total ?? (Number(c.priceInfo?.[0]?.price ?? c.priceInfo?.[0]?.base_price ?? c.item?.unit_price ?? 0) * Number(c.calculated_count ?? c.item?.quantity ?? 1));
                return s + total;
            }, 0);

            const cruiseTotal = cruiseRoomSum + cruiseCarSum;
            // 원화는 총합계에 환율(rate_to_krw)을 곱함 (정규화된 multiplier 사용)
            const cruiseWon = roundKrwToHundred(vndToKrw(cruiseTotal, EXCHANGE_RATE));

            out += `총합계: ${formatDong(cruiseRoomSum)} + ${formatDong(cruiseCarSum)} = ${formatDong(cruiseTotal)}\n`;
            out += `원화금액: ${cruiseWon.toLocaleString()}원\n\n`;
        });

        // 크루즈 외 차량 표시 (크루즈에 속하지 않은 차량)
        const unassignedCars = (services.cars || []).filter((_: any, idx: number) => !assignedCarIndexes.has(idx));

        if (unassignedCars.length > 0) {
            unassignedCars.forEach((c: any, index: number) => {
                const carName = c.priceInfo?.[0]?.car_type || c.carInfo?.car_type || '차량명 미지정';
                const unit = c.priceInfo?.[0]?.price ?? c.priceInfo?.[0]?.base_price ?? c.item?.unit_price ?? 0;
                const cnt = c.calculated_count ?? c.item?.quantity ?? 1;
                const total = c.calculated_total ?? (Number(unit || 0) * Number(cnt || 1));

                const prefix = index === 0 ? '차량: ' : '        ';
                out += `${prefix}${carName} 1인 ${formatDong(unit)} * ${cnt}인 = ${formatDong(total)}\n`;
                // 차량 항목 사이에 한 줄 띄움
                if (index < unassignedCars.length - 1) out += '\n';
            });
            out += '\n';
        }

        // 비교 모드일 때 가격 비교 결과 추가 (comprehensive 페이지와 동일한 로직)
        if (comparisonMode && services.rooms && services.rooms.length > 0) {
            // 객실별로 그룹화하여 각 객실의 총합 계산 (크루즈 + 객실명 단위)
            const roomGroups: { [key: string]: { cruiseName: string; roomName: string; total: number; rooms: any[] } } = {};

            services.rooms.forEach((r: any) => {
                const cruiseName = r.roomInfo?.cruise_name || r.priceInfo?.[0]?.cruise || '크루즈 미지정';
                const roomName = r.priceInfo?.[0]?.room_type || r.roomInfo?.room_name || '객실명 미지정';
                const key = `${cruiseName}_${roomName}`;

                if (!roomGroups[key]) {
                    roomGroups[key] = { cruiseName, roomName, total: 0, rooms: [] };
                }
                roomGroups[key].rooms.push(r);
            });

            // 각 객실 그룹의 총합 계산 (객실 합 + 해당 크루즈 차량 합)
            Object.values(roomGroups).forEach((group) => {
                let groupTotal = 0;
                group.rooms.forEach((r: any) => {
                    const categoryLabel = r.priceInfo?.[0]?.room_category || r.priceInfo?.[0]?.room_type || r.roomInfo?.room_category || '성인';
                    const unit = r.priceInfo?.[0]?.price ?? r.priceInfo?.[0]?.base_price ?? r.item?.unit_price ?? 0;
                    let categoryCount = r.calculated_count ?? r.item?.quantity ?? 1;
                    const ri = r.roomInfo || {};
                    const catKey = String(categoryLabel || '').toLowerCase();
                    if (/엑스트라/.test(catKey)) {
                        categoryCount = ri.extra_count ?? categoryCount;
                    }
                    let roomTotal = r.calculated_total ?? (Number(unit || 0) * Number(categoryCount || 1));

                    // 할인 적용
                    if (discount && [3, 5, 8, 10].includes(Number(discount))) {
                        const discountRate = 1 - (Number(discount) / 100);
                        roomTotal = Math.round(roomTotal * discountRate);
                    }

                    groupTotal += roomTotal;
                });

                // 차량 합계 추가 (해당 크루즈의 차량만)
                services.cars?.forEach((c: any) => {
                    const carCruise = c.priceInfo?.[0]?.cruise || c.carInfo?.cruise_name;
                    if (carCruise === group.cruiseName) {
                        const carTotal = c.calculated_total ?? (Number(c.priceInfo?.[0]?.price ?? c.priceInfo?.[0]?.base_price ?? c.item?.unit_price ?? 0) * Number(c.calculated_count ?? c.item?.quantity ?? 1));
                        groupTotal += carTotal;
                    }
                });

                group.total = groupTotal;
            });

            // 가격순으로 정렬
            const sortedRooms = Object.values(roomGroups).sort((a, b) => a.total - b.total);

            if (sortedRooms.length > 0) {
                // 각 객실 그룹별로 차량을 나열하고, VND 및 KRW 총합을 표시
                sortedRooms.forEach((grp, idx) => {
                    out += `\n${grp.cruiseName} — ${grp.roomName}\n`;

                    const groupCars = services.cars?.filter((c: any) => {
                        const carCruise = c.priceInfo?.[0]?.cruise || c.carInfo?.cruise_name;
                        return carCruise === grp.cruiseName;
                    }) || [];

                    if (groupCars.length > 0) {
                        groupCars.forEach((c: any, ci: number) => {
                            const carName = c.priceInfo?.[0]?.car_type || c.carInfo?.car_type || '차량명 미지정';
                            const unit = c.priceInfo?.[0]?.price ?? c.priceInfo?.[0]?.base_price ?? c.item?.unit_price ?? 0;
                            const cnt = c.calculated_count ?? c.item?.quantity ?? 1;
                            const total = c.calculated_total ?? (Number(unit || 0) * Number(cnt || 1));
                            const prefix = ci === 0 ? '차량: ' : '        ';
                            out += `${prefix}${carName} 1인 ${formatDong(unit)} * ${cnt}인 = ${formatDong(total)}\n`;
                            if (ci < groupCars.length - 1) out += '\n';
                        });
                    }

                    const groupWon = roundKrwToHundred(vndToKrw(grp.total, EXCHANGE_RATE));
                    out += `총합계: ${formatDong(grp.total)}\n`;
                    out += `원화금액: ${groupWon.toLocaleString()}원\n`;
                    if (idx < sortedRooms.length - 1) out += `\n`;
                });

                if (sortedRooms.length > 1) {
                    const cheapest = sortedRooms[0];
                    const mostExpensive = sortedRooms[sortedRooms.length - 1];
                    const priceDiff = mostExpensive.total - cheapest.total;
                    const diffWon = roundKrwToHundred(vndToKrw(priceDiff, EXCHANGE_RATE));
                    out += `\n비교결과: ${cheapest.cruiseName} ${cheapest.roomName} 객실과\n`;
                    out += `${mostExpensive.cruiseName} ${mostExpensive.roomName} 객실의\n차이는 ${formatDong(priceDiff)}(원화: ${diffWon.toLocaleString()}원) 입니다.\n`;
                }
            } else {
                out += `\n비교할 수 있는 객실이 부족합니다.\n`;
            }
        }

        return out;
    };
    // 합계 계산 useEffect
    useEffect(() => {
        if (!detailedServices.rooms && !detailedServices.cars && !detailedServices.airports && !detailedServices.hotels && !detailedServices.rentcars && !detailedServices.tours) {
            setTotalSummary({ totalDong: 0, totalWon: 0 });
            return;
        }

        const roomSum = detailedServices.rooms?.reduce((s: number, r: any) => {
            let val = r.calculated_total ?? (Number(r.calculated_unit || 0) * Number(r.calculated_count || 1));
            // 할인 적용 - selectedDiscount 사용
            if (selectedDiscount && [3, 5, 8, 10].includes(Number(selectedDiscount))) {
                const discountRate = 1 - (Number(selectedDiscount) / 100);
                val = Math.round(val * discountRate);
            }
            return s + (Number(val) || 0);
        }, 0) || 0;

        const carSum = detailedServices.cars?.reduce((s: number, c: any) => {
            const val = c.calculated_total ?? (Number(c.calculated_unit || 0) * Number(c.calculated_count || 1));
            return s + (Number(val) || 0);
        }, 0) || 0;

        const airportSum = detailedServices.airports?.reduce((s: number, a: any) => {
            const val = a.calculated_total ?? (Number(a.calculated_unit || 0) * Number(a.calculated_count || 1));
            return s + (Number(val) || 0);
        }, 0) || 0;

        const hotelSum = detailedServices.hotels?.reduce((s: number, h: any) => {
            const val = h.calculated_total ?? (Number(h.calculated_unit || 0) * Number(h.calculated_count || 1));
            return s + (Number(val) || 0);
        }, 0) || 0;

        const rentcarSum = detailedServices.rentcars?.reduce((s: number, rc: any) => {
            const val = rc.calculated_total ?? (Number(rc.calculated_unit || 0) * Number(rc.calculated_count || 1));
            return s + (Number(val) || 0);
        }, 0) || 0;

        const tourSum = detailedServices.tours?.reduce((s: number, t: any) => {
            const val = t.calculated_total ?? (Number(t.calculated_unit || 0) * Number(t.calculated_count || 1));
            return s + (Number(val) || 0);
        }, 0) || 0;

        const totalDong = roomSum + carSum + airportSum + hotelSum + rentcarSum + tourSum;
        // 원화는 총합계에 환율(rate_to_krw)을 곱함
        // Normalize exchangeRate similarly: if it looks like VND-per-KRW (e.g. 1400), invert it to get KRW-per-VND
        const multiplier = (typeof exchangeRate === 'number' && exchangeRate > 10) ? (1 / exchangeRate) : (exchangeRate || 0);
        const totalWon = Math.round(totalDong * multiplier);

        setTotalSummary({ totalDong, totalWon });
    }, [detailedServices, selectedDiscount, exchangeRate]);

    // 할인/환율/서비스/비교모드 변경 시 자연어 요약 자동 갱신
    useEffect(() => {
        try {
            const summary = generateNaturalSummary(detailedServices, exchangeRate, selectedDiscount, isComparisonMode, isCarComparisonMode);
            setNaturalSummary(summary);
        } catch (e) {
            // ignore
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [detailedServices, exchangeRate, selectedDiscount, isComparisonMode, isCarComparisonMode]);

    // 복원: quoteId가 없을 때만 이전에 입력하던 임시값을 복원
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (quoteId) return; // 이미 견적이 있으면 복원하지 않음
        try {
            const raw = sessionStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed?.form) setForm(parsed.form);
                if (parsed?.vehicleForm) setVehicleForm(parsed.vehicleForm);
                if (parsed?.formData) setFormData(parsed.formData);
            }
        } catch (e) {
            console.error('세션 복원 실패:', e);
        }
    }, [quoteId]);

    // API에서 정규화된 환율과 DB raw 값을 읽어와 UI에 표시 (디버깅용)
    useEffect(() => {
        let mounted = true;
        const loadRates = async () => {
            try {
                const er = await getExchangeRate('VND');
                if (!er) return;
                const norm = Number(er.rate_to_krw || 0);
                const raw = (er as any)?.raw_rate_to_krw ?? Number(er.rate_to_krw || 0);
                if (mounted) {
                    setExchangeRate(norm || 0);
                    setRawExchangeRate(raw !== undefined && raw !== null ? Number(raw) : null);
                }
            } catch (e) {
                // ignore
            }
        };
        loadRates();
        return () => { mounted = false; };
    }, []);

    // 저장: quoteId가 없는 상태에서 입력이 변경되면 세션에 임시 저장
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (quoteId) return; // quote가 생기면 더이상 autosave하지 않음
        try {
            const payload = { form, vehicleForm, formData };
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch (e) {
            console.error('세션 저장 실패:', e);
        }
    }, [form, vehicleForm, formData, quoteId]);

    useEffect(() => {
        if (!quoteId) return; // 매니저 페이지에서는 빈 상태로도 표시되게 두고, 안내는 우측 카드에서 제공
        loadQuote();
    }, [quoteId]);

    const handleSelectTitle = async (id: string) => {
        try {
            console.log('handleSelectTitle start', id);
            const { data: items, error: itemsErr } = await supabase.from('quote_item').select('service_type,service_ref_id,quantity').eq('quote_id', id);
            console.log('quote_item result', items, itemsErr);
            if (itemsErr) throw itemsErr;

            const roomItems = (items || []).filter((it: any) => it.service_type === 'room');
            const carItems = (items || []).filter((it: any) => it.service_type === 'car');

            const rooms: any[] = [];
            const quoteRoomsForCard: any[] = [];
            for (const it of roomItems) {
                const { data: r, error: rErr } = await supabase.from('room').select('room_code,extra_count,person_count,single_charge_count').eq('id', it.service_ref_id).maybeSingle();
                if (rErr) {
                    console.log('room load failed for', it.service_ref_id, rErr);
                    continue;
                }
                // create categories for the labels; data uses single extra_count
                const categories = [
                    { room_category: '엑스트라', extra_count: (r?.extra_count) || 0, room_code: r?.room_code || '' }
                ];
                rooms.push({ room_type: r?.room_code || '', categories });
                // prepare card-friendly flat row (use person_count/extra fields available on room)
                const personCount = (r?.person_count) ?? ((r?.extra_count) ? r.extra_count : it.quantity || 1);
                quoteRoomsForCard.push({ room_code: r?.room_code || '', person_count: personCount, extra_count: (r?.extra_count) || 0, quantity: it.quantity || 1 });
            }

            const vehicles: any[] = [];
            for (const it of carItems) {
                const { data: c, error: cErr } = await supabase.from('car').select('car_code,car_count').eq('id', it.service_ref_id).single();
                if (cErr) {
                    console.log('car load failed for', it.service_ref_id, cErr);
                    continue;
                }
                vehicles.push({ car_type: c.car_code, car_category: '', car_code: c.car_code, count: c.car_count || it.quantity || 1 });
            }

            console.log('mapped rooms/vehicles', rooms, vehicles);

            // also load the quote meta (title/status) for display in the right card
            try {
                const { data: quoteData, error: quoteErr } = await supabase.from('quote').select('title,status,created_at').eq('id', id).single();
                if (!quoteErr && quoteData) setQuote(quoteData);
            } catch (qe) {
                console.log('quote load failed', qe);
            }

            // set quoteRooms/quoteCars for the right info card (flat rows)
            setQuoteRooms(quoteRoomsForCard.filter(r => r && Object.keys(r).length > 0));
            // vehicles -> flat car rows
            const quoteCarsForCard = vehicles.map(v => ({ car_code: v.car_code, car_count: v.count, quantity: v.count }));
            setQuoteCars(quoteCarsForCard.filter(c => c && Object.keys(c).length > 0));
            // load detailed service info for right card
            await loadRightDetails(id);
            // NOTE: do NOT populate left-side form when selecting a title here.
            // Only update right-side info card (quoteRooms, quoteCars) and quote meta.
        } catch (e) {
            console.error('타이틀 선택 에러:', e);
            alert('타이틀 로드 중 오류가 발생했습니다. 콘솔을 확인하세요.');
        } finally { }
    };

    // ── 크루즈 옵션 로드 (cruise_rate_card 기반) ──
    useEffect(() => {
        if (form.schedule && form.checkin) {
            loadCruiseOptions();
        } else {
            setCruiseOptions([]);
            if (form.cruise_name) setForm(prev => ({ ...prev, cruise_name: '' }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [form.schedule, form.checkin]);

    // ── 객실 타입 로드 (cruise_rate_card 기반) ──
    useEffect(() => {
        if (form.schedule && form.checkin && form.cruise_name) {
            loadRoomTypes();
            loadCarCategoryOptions();
            loadPackages();
            if (form.schedule === '당일') {
                loadTourOptions();
            } else {
                setTourOptions([]);
                setSelectedTourOptions([]);
            }
        } else {
            setRoomTypeCards([]);
            setCarCategoryOptions([]);
            setTourOptions([]);
            setSelectedTourOptions([]);
            setAvailablePackages([]);
            setSelectedPackage(null);
            if (form.room_type) setForm(prev => ({ ...prev, room_type: '' }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [form.schedule, form.checkin, form.cruise_name]);

    // ── 가격 자동 계산 ──
    useEffect(() => {
        if (form.cruise_name && form.room_type && form.checkin && form.schedule) {
            calculatePrice();
        } else {
            setPriceResult(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        form.cruise_name, form.room_type, form.checkin, form.schedule,
        form.adult_count, form.child_count, form.child_extra_bed_count,
        form.infant_count, form.extra_bed_count, form.single_count,
        selectedTourOptions,
    ]);

    // ── 차량 타입 로드 ──
    useEffect(() => {
        if (selectedCarCategory) {
            // 모든 이용방식: 경로 로드
            loadRouteOptions(selectedCarCategory);
            setCarTypeOptions([]);
        } else {
            setCarTypeOptions([]);
            setRouteOptions([]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedCarCategory]);

    const loadQuote = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('quote')
                .select('title, status, created_at')
                .eq('id', quoteId)
                .single();
            if (error) throw error;
            setQuote(data);
            // load quote items -> rooms and cars
            try {
                const { data: items, error: itemsErr } = await supabase.from('quote_item').select('service_type,service_ref_id,quantity').eq('quote_id', quoteId);
                if (itemsErr) throw itemsErr;
                const roomItems = (items || []).filter((it: any) => it.service_type === 'room');
                const carItems = (items || []).filter((it: any) => it.service_type === 'car');

                const roomPromises = roomItems.map((it: any) => supabase.from('room').select('room_code,extra_count,person_count,single_charge_count').eq('id', it.service_ref_id).maybeSingle());
                const carPromises = carItems.map((it: any) => supabase.from('car').select('car_code,car_count').eq('id', it.service_ref_id).single());

                const roomResults = await Promise.all(roomPromises);
                const carResults = await Promise.all(carPromises);

                const rooms = roomResults.map((r: any, i: number) => ({ ...(r.data || {}), quantity: roomItems[i]?.quantity }));
                const cars = carResults.map((r: any, i: number) => ({ ...(r.data || {}), quantity: carItems[i]?.quantity }));

                setQuoteRooms(rooms.filter(r => r && Object.keys(r).length > 0));
                setQuoteCars(cars.filter(c => c && Object.keys(c).length > 0));
                // load detailed info for right card
                await loadRightDetails(quoteId as string);
            } catch (ie) {
                console.error('quote items load failed:', ie);
                setQuoteRooms([]);
                setQuoteCars([]);
            }
        } catch (e) {
            console.error('견적 조회 실패:', e);
        } finally {
            setLoading(false);
        }
    };

    const loadRightDetails = async (qid: string | null) => {
        if (!qid) return;
        try {
            const { data: items, error } = await supabase.from('quote_item').select('*').eq('quote_id', qid);
            if (error) throw error;

            const detailed: any = { rooms: [], cars: [], airports: [], hotels: [], rentcars: [], tours: [] };

            for (const item of (items || [])) {
                try {
                    if (item.service_type === 'room') {
                        const { data: roomData } = await supabase.from('room').select('*').eq('id', item.service_ref_id).single();
                        if (roomData) {
                            const opts = item.options || {};
                            const pb = opts.price_breakdown;

                            // ── 새 형식: cruise_rate_card + price_breakdown ──
                            if (pb && pb.rate_card_id) {
                                const cruiseName = pb.cruise_name || opts.cruise_name || '크루즈 미지정';
                                const roomType = pb.room_type || opts.room_type || '객실 미지정';
                                const basePriceInfo = { room_type: roomType, cruise: cruiseName, schedule: pb.schedule };
                                const baseRoomInfo = { ...roomData, cruise_name: cruiseName };

                                // 인원 카테고리별 개별 항목 생성 (자연어 요약에서 각각 표시)
                                const categories = [
                                    { label: '성인', data: pb.adult },
                                    { label: '아동(엑스트라베드)', data: pb.child_extra_bed },
                                    { label: '아동', data: pb.child },
                                    { label: '유아', data: pb.infant },
                                    { label: '엑스트라베드', data: pb.extra_bed },
                                    { label: '싱글차지', data: pb.single },
                                ];

                                categories.forEach(cat => {
                                    if (cat.data && cat.data.count > 0 && cat.data.unit_price > 0) {
                                        detailed.rooms.push({
                                            item,
                                            roomInfo: baseRoomInfo,
                                            priceInfo: [{ ...basePriceInfo, room_category: cat.label, price: cat.data.unit_price }],
                                            calculated_unit: cat.data.unit_price,
                                            calculated_count: cat.data.count,
                                            calculated_total: cat.data.total,
                                        });
                                    }
                                });

                                // 공휴일 할증
                                if (pb.surcharges?.length > 0) {
                                    pb.surcharges.forEach((s: any) => {
                                        if (s.total > 0) {
                                            detailed.rooms.push({
                                                item,
                                                roomInfo: baseRoomInfo,
                                                priceInfo: [{ ...basePriceInfo, room_category: `공휴일할증(${s.holiday_name || ''})`, price: s.total }],
                                                calculated_unit: s.total,
                                                calculated_count: 1,
                                                calculated_total: s.total,
                                            });
                                        }
                                    });
                                }

                                // 당일투어 옵션
                                if (pb.tour_options?.length > 0) {
                                    pb.tour_options.forEach((t: any) => {
                                        detailed.rooms.push({
                                            item,
                                            roomInfo: baseRoomInfo,
                                            priceInfo: [{ ...basePriceInfo, room_category: `투어(${t.option_name || ''})`, price: t.unit_price }],
                                            calculated_unit: t.unit_price,
                                            calculated_count: t.quantity || 1,
                                            calculated_total: t.total,
                                        });
                                    });
                                }

                                // ── 레거시 형식: cruise_rate_card 테이블 ──
                            } else {
                                let priceData: any[] = [];
                                const { data: rateCardData } = await supabase.from('cruise_rate_card').select('*').eq('id', roomData.room_code).maybeSingle();
                                if (rateCardData) {
                                    priceData = [{
                                        room_type: rateCardData.room_type,
                                        room_category: '성인',
                                        cruise: rateCardData.cruise_name,
                                        schedule: rateCardData.schedule_type,
                                        price: rateCardData.price_adult,
                                    }];
                                }

                                const unit = (priceData[0]?.price ?? priceData[0]?.base_price) ?? item.unit_price ?? 0;
                                const extraCount = roomData.extra_count ?? 0;
                                const personCount = extraCount > 0 ? extraCount : (roomData.person_count ?? item.quantity ?? 1);
                                const calcTotal = Number(unit || 0) * Number(personCount || 1);
                                detailed.rooms.push({
                                    item,
                                    roomInfo: { ...roomData, cruise_name: roomData.cruise_name || priceData[0]?.cruise },
                                    priceInfo: priceData,
                                    calculated_unit: unit,
                                    calculated_count: personCount,
                                    calculated_total: calcTotal,
                                });
                            }
                        }
                    } else if (item.service_type === 'car') {
                        const { data: carData } = await supabase.from('car').select('*').eq('id', item.service_ref_id).single();
                        if (carData) {
                            const { data: priceData } = await supabase.from('rentcar_price').select('*').eq('rent_code', carData.car_code);
                            const unit = (priceData && priceData[0] && (priceData[0].price ?? priceData[0].base_price)) ?? item.unit_price ?? 0;
                            const count = item.quantity ?? carData.car_count ?? 1;
                            const calcTotal = Number(unit || 0) * Number(count || 1);
                            detailed.cars.push({ item, carInfo: carData, priceInfo: priceData || [], calculated_unit: unit, calculated_count: count, calculated_total: calcTotal });
                        }
                    } else if (item.service_type === 'airport') {
                        const { data: apData } = await supabase.from('airport').select('*').eq('id', item.service_ref_id).single();
                        if (apData) {
                            const { data: priceData } = await supabase.from('airport_price').select('*').eq('airport_code', apData.airport_code);
                            const unit = (priceData && priceData[0] && (priceData[0].price ?? priceData[0].base_price)) ?? item.unit_price ?? 0;
                            const count = item.quantity ?? apData.person_count ?? 1;
                            const calcTotal = Number(unit || 0) * Number(count || 1);
                            detailed.airports.push({ item, airportInfo: apData, priceInfo: priceData || [], calculated_unit: unit, calculated_count: count, calculated_total: calcTotal });
                        }
                    } else if (item.service_type === 'hotel') {
                        const { data: hotelData } = await supabase.from('hotel').select('*').eq('id', item.service_ref_id).single();
                        if (hotelData) {
                            const { data: priceData } = await supabase.from('hotel_price').select('*').eq('hotel_price_code', hotelData.hotel_code);
                            const unit = (priceData && priceData[0] && (priceData[0].price ?? priceData[0].base_price)) ?? item.unit_price ?? 0;
                            const count = item.quantity ?? hotelData.guests ?? 1;
                            const calcTotal = Number(unit || 0) * Number(count || 1);
                            detailed.hotels.push({ item, hotelInfo: hotelData, priceInfo: priceData || [], calculated_unit: unit, calculated_count: count, calculated_total: calcTotal });
                        }
                    } else if (item.service_type === 'rentcar') {
                        const { data: rentData } = await supabase.from('rentcar').select('*').eq('id', item.service_ref_id).single();
                        if (rentData) {
                            const { data: priceData } = await supabase.from('rentcar_price').select('*').eq('rent_code', rentData.rentcar_code);
                            const unit = (priceData && priceData[0] && (priceData[0].price ?? priceData[0].base_price)) ?? item.unit_price ?? 0;
                            const count = item.quantity ?? rentData.rental_days ?? 1;
                            const calcTotal = Number(unit || 0) * Number(count || 1);
                            detailed.rentcars.push({ item, rentcarInfo: rentData, priceInfo: priceData || [], calculated_unit: unit, calculated_count: count, calculated_total: calcTotal });
                        }
                    } else if (item.service_type === 'tour') {
                        const { data: tourData } = await supabase.from('tour').select('*').eq('id', item.service_ref_id).single();
                        if (tourData) {
                            const { data: priceData } = await supabase.from('tour_pricing').select('*, tour:tour_id!inner(tour_name, tour_code)').eq('tour.tour_code', tourData.tour_code).eq('is_active', true);
                            const unit = (priceData && priceData[0] && (priceData[0].price ?? priceData[0].base_price)) ?? item.unit_price ?? 0;
                            const count = item.quantity ?? tourData.participant_count ?? 1;
                            const calcTotal = Number(unit || 0) * Number(count || 1);
                            detailed.tours.push({ item, tourInfo: tourData, priceInfo: priceData || [], calculated_unit: unit, calculated_count: count, calculated_total: calcTotal });
                        }
                    }
                } catch (innerErr) {
                    console.warn('서비스 상세 로드 실패:', innerErr);
                }
            }

            setDetailedServices(detailed);
            return detailed;
        } catch (e) {
            console.error('우측 상세 정보 로드 실패:', e);
            setDetailedServices({ rooms: [], cars: [], airports: [], hotels: [], rentcars: [], tours: [] });
            return null;
        }
    };

    const loadCruiseOptions = useCallback(async () => {
        const names = await calculator.getCruiseNames({
            schedule: form.schedule,
            checkin_date: form.checkin,
        });
        setCruiseOptions(names);
    }, [form.schedule, form.checkin]);

    const loadRoomTypes = useCallback(async () => {
        const cards = await calculator.getRoomTypes({
            schedule: form.schedule,
            checkin_date: form.checkin,
            cruise_name: form.cruise_name,
        });
        const sortedCards = [...cards].sort((a, b) => (a.price_adult || 0) - (b.price_adult || 0));
        setRoomTypeCards(sortedCards);
    }, [form.schedule, form.checkin, form.cruise_name]);

    const loadTourOptions = useCallback(async () => {
        const options = await calculator.getTourOptions(form.cruise_name, form.schedule);
        setTourOptions(options);
    }, [form.cruise_name, form.schedule]);

    const calculatePrice = useCallback(async () => {
        setPriceLoading(true);
        try {
            const result = await calculator.calculate({
                cruise_name: form.cruise_name,
                schedule: form.schedule,
                room_type: form.room_type,
                checkin_date: form.checkin,
                adult_count: form.adult_count,
                child_count: form.child_count,
                child_extra_bed_count: form.child_extra_bed_count,
                infant_count: form.infant_count,
                extra_bed_count: form.extra_bed_count,
                single_count: form.single_count,
                selected_options: selectedTourOptions,
            });
            setPriceResult(result);
        } catch (error) {
            console.error('가격 계산 실패:', error);
            setPriceResult(null);
        } finally {
            setPriceLoading(false);
        }
    }, [form.cruise_name, form.schedule, form.room_type, form.checkin,
    form.adult_count, form.child_count, form.child_extra_bed_count,
    form.infant_count, form.extra_bed_count, form.single_count, selectedTourOptions]);

    const loadPackages = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('package_master')
                .select('*, package_items(*)')
                .eq('is_active', true)
                .order('base_price');
            if (error) throw error;
            const filtered = (data || []).filter((pkg: any) => {
                const cruiseNames = pkg.price_config?.cruise_names;
                return Array.isArray(cruiseNames) && cruiseNames.includes(form.cruise_name);
            });
            setAvailablePackages(filtered);
            setSelectedPackage(null);
        } catch (error) {
            console.error('패키지 로드 실패:', error);
            setAvailablePackages([]);
        }
    }, [form.cruise_name]);

    const loadCarCategoryOptions = useCallback(async () => {
        setCarCategoryOptions(carCategoryHardcoded);
    }, [carCategoryHardcoded]);

    const loadRouteOptions = useCallback(async (wayType: string) => {
        if (!wayType) return;
        try {
            const { data, error } = await supabase
                .from('rentcar_price')
                .select('route')
                .eq('way_type', wayType)
                .like('route', '%하롱베이%')
                .order('route');
            if (error) throw error;
            const uniqueRoutes = [...new Set((data || []).map((d: any) => d.route).filter(Boolean))] as string[];
            setRouteOptions(uniqueRoutes);
        } catch (error) {
            console.error('경로 옵션 로드 실패:', error);
            setRouteOptions([]);
        }
    }, []);

    const loadCarTypeOptions = useCallback(async (wayType?: string, route?: string) => {
        const wt = wayType || selectedCarCategory;
        const rt = route !== undefined ? route : selectedRoute;
        try {
            let query = supabase
                .from('rentcar_price')
                .select('vehicle_type')
                .eq('way_type', wt);
            if (rt) {
                query = query.eq('route', rt);
            } else {
                // 경로 없는 경우(당일왕복/다른날왕복): 하롱베이 포함 경로의 차량만
                query = query.like('route', '%하롱베이%');
            }
            const { data, error } = await query.order('vehicle_type');
            if (error) throw error;
            let uniqueCarTypes = [...new Set((data || []).map((d: any) => d.vehicle_type).filter(Boolean))] as string[];
            // 스테이하롱 셔틀 리무진 A/B/C 변형만 제외 (단돁은 표시)
            uniqueCarTypes = uniqueCarTypes.filter(t => !/스테이하롱 셔틀 리무진 [ABC]/.test(t));
            setCarTypeOptions(uniqueCarTypes);
        } catch (error) {
            console.error('차량타입 옵션 조회 실패:', error);
        }
    }, [selectedCarCategory, selectedRoute]);

    const getCarCode = async (carType: string, carCategory: string, route?: string): Promise<string> => {
        try {
            const effectiveRoute = route || selectedRoute;
            let query = supabase
                .from('rentcar_price')
                .select('rent_code')
                .eq('way_type', carCategory)
                .eq('vehicle_type', carType);
            if (effectiveRoute) {
                query = query.eq('route', effectiveRoute);
            }
            const { data, error } = await query.limit(1);
            if (error) throw error;
            return data?.[0]?.rent_code || '';
        } catch (error) {
            console.error('rent_code 조회 실패:', error);
            return '';
        }
    };

    const handleAddVehicle = () => {
        if (vehicleForm.length < 3) {
            setVehicleForm([...vehicleForm, { car_type: '', car_category: selectedCarCategory || '', car_code: '', route: selectedRoute || '', count: 1 }]);
        }
    };

    const handleRemoveVehicle = (index: number) => {
        if (vehicleForm.length > 1) {
            setVehicleForm(vehicleForm.filter((_, i) => i !== index));
        }
    };

    const handleVehicleChange = (index: number, field: string, value: any) => {
        const next = [...vehicleForm];
        (next[index] as any)[field] = value;
        setVehicleForm(next);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setLoading(true);
            let effectiveQuoteId = quoteId;
            if (!effectiveQuoteId) {
                const { data: authData, error: authErr } = await supabase.auth.getUser();
                if (authErr || !(authData as any)?.user?.id) {
                    alert('로그인이 필요합니다.');
                    return;
                }

                const autoTitle = `${form.cruise_name || '크루즈'} 견적 ${new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}`;
                const { data: createdQuote, error: createError } = await supabase
                    .from('quote')
                    .insert({
                        title: autoTitle,
                        status: 'draft',
                        user_id: (authData as any).user.id
                    })
                    .select('id')
                    .single();

                if (createError || !createdQuote?.id) {
                    alert(`견적 생성 실패: ${createError?.message || '알 수 없는 오류'}`);
                    return;
                }

                effectiveQuoteId = createdQuote.id;
                router.replace(`/quotes/cruise?quoteId=${effectiveQuoteId}`);
            }

            // 1. 객실 데이터 저장 (cruise_rate_card 기반 - sht-customer와 동일)
            if (priceResult && form.adult_count > 0) {
                const { data: roomData, error: roomError } = await supabase
                    .from('room')
                    .insert({
                        room_code: priceResult.rate_card.id,
                        person_count: form.adult_count + form.child_count + form.child_extra_bed_count + form.infant_count,
                        adult_count: form.adult_count,
                        child_count: form.child_count,
                        child_extra_bed_count: form.child_extra_bed_count,
                        infant_count: form.infant_count,
                        extra_bed_count: form.extra_bed_count,
                        single_count: form.single_count,
                        sale: selectedDiscount
                    })
                    .select()
                    .single();
                if (roomError) throw roomError;

                const { error: itemError } = await supabase
                    .from('quote_item')
                    .insert({
                        quote_id: effectiveQuoteId,
                        service_type: 'room',
                        service_ref_id: roomData.id,
                        quantity: 1,
                        unit_price: priceResult.grand_total,
                        total_price: priceResult.grand_total,
                        usage_date: form.checkin,
                        options: {
                            schedule: form.schedule,
                            cruise_name: form.cruise_name,
                            room_type: form.room_type,
                            rate_card_id: priceResult.rate_card.id,
                            adult_count: form.adult_count,
                            child_count: form.child_count,
                            child_extra_bed_count: form.child_extra_bed_count,
                            infant_count: form.infant_count,
                            extra_bed_count: form.extra_bed_count,
                            single_count: form.single_count,
                            selected_tour_options: selectedTourOptions,
                            price_breakdown: priceResult.price_breakdown,
                            discount: selectedDiscount,
                            selected_package: selectedPackage ? {
                                package_id: selectedPackage.id,
                                package_code: selectedPackage.package_code,
                                package_name: selectedPackage.name,
                                package_price: selectedPackage.base_price,
                            } : null,
                            special_requests: formData.special_requests || ''
                        }
                    });
                if (itemError) throw itemError;
            }

            // 2. 차량 저장 (rentcar_price 기준)
            for (const vehicle of vehicleForm) {
                if (vehicle.car_code && vehicle.count > 0) {
                    const { data: carData, error: carError } = await supabase
                        .from('car')
                        .insert({ car_code: vehicle.car_code, car_count: vehicle.count })
                        .select()
                        .single();
                    if (carError) throw carError;

                    // 차량 단가 조회 (rentcar_price)
                    let unitPrice = 0;
                    try {
                        const { data: priceRow } = await supabase
                            .from('rentcar_price')
                            .select('price')
                            .eq('rent_code', vehicle.car_code)
                            .maybeSingle();
                        if (priceRow && priceRow.price != null) unitPrice = Number(priceRow.price) || 0;
                    } catch (pe) {
                        console.warn('rentcar price lookup failed', pe);
                    }

                    const totalPrice = unitPrice * (vehicle.count || 1);

                    const { error: itemError } = await supabase
                        .from('quote_item')
                        .insert({
                            quote_id: effectiveQuoteId,
                            service_type: 'car',
                            service_ref_id: carData.id,
                            quantity: vehicle.count,
                            unit_price: unitPrice,
                            total_price: totalPrice,
                            usage_date: form.checkin,
                            options: {
                                way_type: vehicle.car_category,
                                route: vehicle.route || null,
                                vehicle_type: vehicle.car_type,
                                rentcar_price_code: vehicle.car_code,
                                source_table: 'rentcar_price',
                            }
                        });
                    if (itemError) throw itemError;
                }
            }

            // 우측 상세 정보를 즉시 갱신하고 자연어 요약 재생성
            try {
                const detailed = await loadRightDetails(effectiveQuoteId as string);
                const summary = generateNaturalSummary(detailed || detailedServices, exchangeRate, selectedDiscount, isComparisonMode, isCarComparisonMode);
                setNaturalSummary(summary);
            } catch (e) {
                console.warn('저장 후 상세 갱신 실패:', e);
            }

            alert('크루즈 견적이 저장되었습니다.');
        } catch (e) {
            console.error('저장 실패:', e);
            alert('저장 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="grid grid-cols-1 gap-2 w-full min-w-0 overflow-x-hidden">
            {/* 상단 간단 타이틀 스트립 (매니저 전용) */}
            <div className="-mt-1 -mb-1 min-w-0">
                <div className="text-xs text-gray-600">행복여행 이름: <span className="font-semibold text-gray-900">{resolveLocalQuoteTitle(quote) ?? quote?.title ?? '로딩 중...'}</span></div>
            </div>
            {/* 좌측: 입력 카드 (2칸 차지) */}
            <div>
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <h2 className="text-sm font-semibold text-gray-800">크루즈 견적</h2>
                        {/* 할인 버튼들 */}
                        <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs text-gray-600">할인:</span>
                            {[3, 5, 8, 10].map(discount => (
                                <button
                                    key={discount}
                                    type="button"
                                    onClick={() => setSelectedDiscount(discount)}
                                    className={`px-3 py-1 text-xs rounded border ${selectedDiscount === discount
                                        ? 'bg-red-500 text-white border-red-500'
                                        : 'bg-gray-50 text-gray-700 border-gray-300 hover:bg-gray-100'
                                        }`}
                                >
                                    {discount}%
                                </button>
                            ))}
                            <button
                                type="button"
                                onClick={() => setSelectedDiscount(null)}
                                className={`px-3 py-1 text-xs rounded border ${selectedDiscount === null
                                    ? 'bg-gray-500 text-white border-gray-500'
                                    : 'bg-gray-50 text-gray-700 border-gray-300 hover:bg-gray-100'
                                    }`}
                            >
                                해제
                            </button>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-3 min-w-0 [&_label]:text-xs [&_input]:text-xs [&_select]:text-xs [&_textarea]:text-xs">
                        {/* 체크인 날짜 */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">📅 체크인 날짜</label>
                            <input
                                type="date"
                                value={form.checkin}
                                onChange={e => setForm({ ...form, checkin: e.target.value })}
                                className="w-full border border-gray-300 p-2 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                required
                            />
                        </div>

                        {/* 일정 선택 */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">🗓 일정 선택</label>
                            <div className="flex flex-wrap gap-2">
                                {scheduleOptions.map(opt => (
                                    <button
                                        key={opt}
                                        type="button"
                                        onClick={() => setForm({ ...form, schedule: opt })}
                                        className={`px-2 py-1.5 rounded-md border text-xs ${form.schedule === opt ? 'bg-blue-500 text-white border-blue-500' : 'bg-blue-50 text-blue-700 border-gray-300 hover:bg-blue-100'}`}
                                    >
                                        {opt}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 크루즈 선택 */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">🚢 크루즈 선택</label>
                            <select
                                value={form.cruise_name}
                                onChange={e => setForm({ ...form, cruise_name: e.target.value, room_type: '' })}
                                className="w-full border border-gray-300 p-2 rounded-md focus:ring-2 focus:ring-blue-500"
                                required
                            >
                                <option value="">크루즈를 선택하세요</option>
                                {cruiseOptions.map(cruise => (
                                    <option key={cruise} value={cruise}>{cruise}</option>
                                ))}
                            </select>
                        </div>

                        {/* 패키지 선택 */}
                        {availablePackages.length > 0 && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">🎁 프로모션 패키지 (선택)</label>
                                <div className="grid grid-cols-1 gap-2">
                                    {availablePackages.map((pkg: any) => {
                                        const config = pkg.price_config || {};
                                        const includes = config.includes || {};
                                        return (
                                            <button
                                                key={pkg.id}
                                                type="button"
                                                onClick={() => setSelectedPackage(selectedPackage?.id === pkg.id ? null : pkg)}
                                                className={`border rounded-lg p-3 text-left transition-all ${selectedPackage?.id === pkg.id
                                                    ? 'border-purple-500 bg-purple-50 ring-2 ring-purple-500'
                                                    : 'border-gray-200 hover:border-purple-300 hover:bg-purple-50/50'
                                                    }`}
                                            >
                                                <div className="font-semibold text-gray-800 text-sm">{pkg.name}</div>
                                                <div className="mt-1 text-sm font-bold text-purple-600">
                                                    {formatVND(config.price_2_person || pkg.base_price)}
                                                    <span className="text-xs font-normal text-gray-500 ml-1">(2인)</span>
                                                </div>
                                                <div className="text-xs text-purple-500">
                                                    1인당 {formatVND(config.price_per_person || pkg.base_price / 2)}
                                                </div>
                                                <div className="mt-1 space-y-0.5 text-xs text-gray-600">
                                                    <div>🛏 {(config.rooms || []).join(' / ')}</div>
                                                    <div>🚣 {(includes.activity || []).join(' / ')}</div>
                                                    <div>🍹 {includes.meal_drinks || '음료 포함'}</div>
                                                    {includes.transport && <div>🚐 {includes.transport_detail || '셔틀 포함'}</div>}
                                                    {includes.lobster && <div>🦞 {includes.lobster_detail || '랍스터 포함'}</div>}
                                                    {includes.vip_seat && <div>⭐ {includes.vip_seat_detail || 'VIP 좌석'}</div>}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                                {selectedPackage && (
                                    <div className="mt-2 p-2 bg-purple-50 border border-purple-200 rounded-lg text-xs text-purple-700">
                                        ✅ <strong>{selectedPackage.name}</strong> 선택됨 — {selectedPackage.description}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* 객실 선택 (요금 카드 기반 - 드롭다운, 객실명만 노출) */}
                        {roomTypeCards.length > 0 && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">🛏 객실 선택</label>
                                <select
                                    value={form.room_type}
                                    onChange={e => setForm({ ...form, room_type: e.target.value })}
                                    className="w-full border border-gray-300 p-2 rounded-md focus:ring-2 focus:ring-blue-500"
                                    required
                                >
                                    <option value="">객실을 선택하세요</option>
                                    {roomTypeCards.map((card) => (
                                        <option key={card.id} value={card.room_type}>
                                            {card.room_type}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* 인원수 입력 */}
                        {form.room_type && selectedRateCard && (
                            <div className="border border-blue-200 rounded-lg p-3 bg-blue-50/50">
                                <h3 className="text-sm font-semibold text-gray-800 mb-2">👥 인원수 입력</h3>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">
                                            성인 ({formatVNDCurrency(selectedRateCard.price_adult)}/인)
                                        </label>
                                        <input
                                            type="number" min="0" max="20"
                                            value={form.adult_count || ''}
                                            onChange={e => setForm({ ...form, adult_count: parseInt(e.target.value) || 0 })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500"
                                            placeholder="인원수"
                                        />
                                    </div>

                                    {selectedRateCard.price_child != null && (
                                        <div>
                                            <label className="block text-xs font-medium text-gray-600 mb-1">
                                                아동 5~11세 ({formatVNDCurrency(selectedRateCard.price_child)}/인)
                                            </label>
                                            <input
                                                type="number" min="0" max="10"
                                                value={form.child_count || ''}
                                                onChange={e => setForm({ ...form, child_count: parseInt(e.target.value) || 0 })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500"
                                                placeholder="인원수"
                                            />
                                        </div>
                                    )}

                                    {selectedRateCard.price_child_extra_bed != null && selectedRateCard.extra_bed_available && (
                                        <div>
                                            <label className="block text-xs font-medium text-gray-600 mb-1">
                                                아동 엑스트라베드 ({formatVNDCurrency(selectedRateCard.price_child_extra_bed)}/인)
                                            </label>
                                            <input
                                                type="number" min="0" max="5"
                                                value={form.child_extra_bed_count || ''}
                                                onChange={e => setForm({ ...form, child_extra_bed_count: parseInt(e.target.value) || 0 })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500"
                                                placeholder="인원수"
                                            />
                                        </div>
                                    )}

                                    {selectedRateCard.price_infant != null && (
                                        <div>
                                            <label className="block text-xs font-medium text-gray-600 mb-1">
                                                유아 0~4세 ({formatVNDCurrency(selectedRateCard.price_infant)}/인)
                                            </label>
                                            <input
                                                type="number" min="0" max="5"
                                                value={form.infant_count || ''}
                                                onChange={e => setForm({ ...form, infant_count: parseInt(e.target.value) || 0 })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500"
                                                placeholder="인원수"
                                            />
                                        </div>
                                    )}

                                    {selectedRateCard.price_extra_bed != null && selectedRateCard.extra_bed_available && (
                                        <div>
                                            <label className="block text-xs font-medium text-gray-600 mb-1">
                                                엑스트라베드 ({formatVNDCurrency(selectedRateCard.price_extra_bed)}/인)
                                            </label>
                                            <input
                                                type="number" min="0" max="5"
                                                value={form.extra_bed_count || ''}
                                                onChange={e => setForm({ ...form, extra_bed_count: parseInt(e.target.value) || 0 })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500"
                                                placeholder="인원수"
                                            />
                                        </div>
                                    )}

                                    {selectedRateCard.price_single != null && selectedRateCard.single_available && (
                                        <div>
                                            <label className="block text-xs font-medium text-gray-600 mb-1">
                                                싱글차지 ({formatVNDCurrency(selectedRateCard.price_single)}/인)
                                            </label>
                                            <input
                                                type="number" min="0" max="5"
                                                value={form.single_count || ''}
                                                onChange={e => setForm({ ...form, single_count: parseInt(e.target.value) || 0 })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500"
                                                placeholder="인원수"
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* 당일투어 선택 옵션 */}
                        {form.schedule === '당일' && tourOptions.length > 0 && form.room_type && (
                            <div className="border border-purple-200 rounded-lg p-3 bg-purple-50/50">
                                <h3 className="text-sm font-semibold text-gray-800 mb-2">🎯 선택 옵션</h3>
                                <p className="text-xs text-gray-500 mb-3">원하시는 추가 옵션을 선택하고 수량을 입력하세요.</p>
                                <div className="space-y-3">
                                    {tourOptions.map((option) => {
                                        const optionKey = String(option.id ?? option.option_id ?? `${option.option_name}:${option.option_price}`);
                                        const selected = selectedTourOptions.find(so => so.option_id === optionKey);
                                        const isSelected = !!selected;
                                        return (
                                            <div
                                                key={optionKey}
                                                className={`border rounded-lg p-3 transition-all cursor-pointer ${isSelected
                                                    ? 'border-purple-500 bg-purple-50 ring-1 ring-purple-500'
                                                    : 'border-gray-200 hover:border-purple-300'
                                                    }`}
                                                onClick={() => {
                                                    if (isSelected) {
                                                        setSelectedTourOptions(prev => prev.filter(so => so.option_id !== optionKey));
                                                    } else {
                                                        setSelectedTourOptions(prev => [...prev, {
                                                            option_id: optionKey,
                                                            option_name: option.option_name,
                                                            quantity: 1,
                                                            unit_price: option.option_price,
                                                        }]);
                                                    }
                                                }}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            readOnly
                                                            className="w-4 h-4 text-purple-600 rounded"
                                                        />
                                                        <div>
                                                            <span className="font-medium text-gray-800">{option.option_name}</span>
                                                            {option.option_name_en && (
                                                                <span className="text-xs text-gray-400 ml-2">{option.option_name_en}</span>
                                                            )}
                                                            {option.description && (
                                                                <p className="text-xs text-gray-500 mt-0.5">{option.description}</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-sm font-semibold text-purple-700">{formatVNDCurrency(option.option_price)}</div>
                                                        <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">
                                                            {option.option_type === 'upgrade' ? '업그레이드' : '추가'}
                                                        </span>
                                                    </div>
                                                </div>
                                                {isSelected && (
                                                    <div className="mt-2 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                                        <label className="text-xs text-gray-600">수량:</label>
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            max="10"
                                                            value={selected!.quantity}
                                                            onChange={(e) => {
                                                                const qty = parseInt(e.target.value) || 1;
                                                                setSelectedTourOptions(prev => prev.map(so =>
                                                                    so.option_id === optionKey ? { ...so, quantity: qty } : so
                                                                ));
                                                            }}
                                                            className="w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-purple-500"
                                                        />
                                                        <span className="text-xs text-gray-500">
                                                            = {formatVNDCurrency(option.option_price * (selected!.quantity))}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* 가격 미리보기 */}
                        {priceResult && (
                            <div className="border border-green-200 rounded-lg p-3 bg-green-50">
                                <div className="flex justify-between items-center mb-3">
                                    <h3 className="text-sm font-semibold text-gray-800">💰 예상 금액</h3>
                                    <button
                                        type="button"
                                        onClick={calculatePrice}
                                        disabled={priceLoading}
                                        className="px-3 py-1 text-sm bg-white border border-green-500 text-green-700 rounded hover:bg-green-50 disabled:opacity-50 transition-colors"
                                    >
                                        {priceLoading ? '계산 중...' : '🔄 재계산'}
                                    </button>
                                </div>

                                <div className="space-y-1 mb-2">
                                    {priceResult.items.map((item, idx) => (
                                        <div key={idx} className="flex justify-between text-sm">
                                            <span className="text-gray-600">{item.label} × {item.count}명</span>
                                            <span className="font-medium">{formatVNDCurrency(item.total)}</span>
                                        </div>
                                    ))}
                                </div>

                                {priceResult.items.length > 0 && (
                                    <div className="flex justify-between text-sm font-medium border-t border-green-200 pt-2">
                                        <span>객실 소계</span>
                                        <span>{formatVNDCurrency(priceResult.subtotal)}</span>
                                    </div>
                                )}

                                {priceResult.surcharges.length > 0 && (
                                    <div className="mt-3 border-t border-green-200 pt-2">
                                        <h4 className="text-sm font-medium text-orange-700 mb-1">📅 공휴일 추가요금</h4>
                                        {priceResult.surcharges.map((surcharge, idx) => (
                                            <div key={idx} className="flex justify-between text-sm">
                                                <span className={surcharge.is_confirmed ? 'text-orange-600' : 'text-gray-400'}>
                                                    {surcharge.holiday_name}
                                                    {!surcharge.is_confirmed && ' (미정)'}
                                                </span>
                                                <span className={`font-medium ${surcharge.is_confirmed ? 'text-orange-600' : 'text-gray-400 line-through'}`}>
                                                    {formatVNDCurrency(surcharge.total)}
                                                </span>
                                            </div>
                                        ))}
                                        {priceResult.surcharge_total > 0 && (
                                            <div className="flex justify-between text-sm font-medium mt-1">
                                                <span className="text-orange-700">추가요금 소계</span>
                                                <span className="text-orange-700">{formatVNDCurrency(priceResult.surcharge_total)}</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {priceResult.has_unconfirmed_surcharge && (
                                    <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-700">
                                        ⚠️ 미확정 추가요금이 있습니다. 최종 금액은 변동될 수 있습니다.
                                    </div>
                                )}

                                {priceResult.tour_options && priceResult.tour_options.length > 0 && (
                                    <div className="mt-3 border-t border-green-200 pt-2">
                                        <h4 className="text-sm font-medium text-purple-700 mb-1">🎯 선택 옵션</h4>
                                        {priceResult.tour_options.map((opt, idx) => (
                                            <div key={idx} className="flex justify-between text-sm">
                                                <span className="text-purple-600">{opt.label} × {opt.count}</span>
                                                <span className="font-medium text-purple-600">{formatVNDCurrency(opt.total)}</span>
                                            </div>
                                        ))}
                                        {priceResult.option_total > 0 && (
                                            <div className="flex justify-between text-sm font-medium mt-1">
                                                <span className="text-purple-700">옵션 소계</span>
                                                <span className="text-purple-700">{formatVNDCurrency(priceResult.option_total)}</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {priceResult.rate_card.season_name && (
                                    <div className="mt-2 text-xs text-gray-500">
                                        🏷️ 적용 시즌: {priceResult.rate_card.season_name}
                                        {priceResult.rate_card.is_promotion && ' (프로모션)'}
                                    </div>
                                )}

                                {/* 할인 적용 시 */}
                                {selectedDiscount && (
                                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm">
                                        <span className="text-red-600 font-medium">🏷️ {selectedDiscount}% 할인 적용 시: </span>
                                        <span className="text-red-700 font-bold">{formatVNDCurrency(Math.round(priceResult.grand_total * (1 - selectedDiscount / 100)))}</span>
                                    </div>
                                )}

                                <div className="flex justify-between text-sm font-bold mt-2 border-t-2 border-green-300 pt-2">
                                    <span className="text-gray-800">총 예상 금액</span>
                                    <span className="text-green-700">{formatVNDCurrency(priceResult.grand_total)}</span>
                                </div>

                                {/* 패키지 선택 시 패키지 가격 표시 */}
                                {selectedPackage && (
                                    <div className="mt-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                                        <div className="flex justify-between text-sm font-medium text-purple-700 mb-1">
                                            <span>🎁 {selectedPackage.name} (2인 기준)</span>
                                            <span>{formatVND(selectedPackage.price_config?.price_2_person || selectedPackage.base_price)}</span>
                                        </div>
                                        <div className="text-xs text-purple-600">
                                            ※ 패키지 가격은 2인 정가 기준이며, 객실 요금과 별도로 제공되는 프로모션입니다.
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* 차량 선택 영역 */}
                        <div className="space-y-2">
                            <h3 className="text-sm font-semibold text-gray-800">🚗 차량 선택</h3>

                            <div className="min-w-0">
                                <label className="block text-sm font-medium text-gray-700 mb-2">차량구분</label>
                                <div className="flex flex-wrap gap-1.5">
                                    {carCategoryHardcoded.map(category => (
                                        <button
                                            key={category}
                                            type="button"
                                            onClick={async () => {
                                                setSelectedCarCategory(category);
                                                setSelectedRoute('');
                                                setCarTypeOptions([]);
                                                setVehicleForm(vehicleForm.map(v => ({
                                                    ...v,
                                                    car_category: category,
                                                    route: '',
                                                    car_type: '',
                                                    car_code: ''
                                                })));
                                            }}
                                            className={`px-3 py-1.5 border rounded-lg transition-colors text-xs ${selectedCarCategory === category
                                                ? 'bg-green-500 text-white border-green-500'
                                                : 'bg-gray-50 border-gray-300 hover:bg-gray-100 text-gray-700'
                                                }`}
                                        >
                                            {category}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {vehicleForm.map((vehicle, vehicleIndex) => (
                                <div key={vehicleIndex} className="border border-green-200 rounded-lg p-3 bg-green-50 min-w-0">
                                    <div className="flex items-center justify-between mb-3">
                                        <h4 className="font-medium text-gray-900">차량 {vehicleIndex + 1}</h4>
                                        {vehicleForm.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveVehicle(vehicleIndex)}
                                                className="text-red-600 hover:text-red-800 text-sm"
                                            >
                                                삭제
                                            </button>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-1 gap-2">
                                        {selectedCarCategory && (
                                            <div>
                                                <label className="block text-sm font-medium text-gray-600 mb-1">경로</label>
                                                <select
                                                    value={vehicle.route || ''}
                                                    onChange={async (e) => {
                                                        const routeValue = e.target.value;
                                                        setSelectedRoute(routeValue);
                                                        handleVehicleChange(vehicleIndex, 'route', routeValue);
                                                        if (selectedCarCategory && routeValue) {
                                                            await loadCarTypeOptions(selectedCarCategory, routeValue);
                                                        }
                                                    }}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-green-500 bg-white"
                                                >
                                                    <option value="">경로 선택</option>
                                                    {routeOptions.map(route => (
                                                        <option key={route} value={route}>{route}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}

                                        <div>
                                            <label className="block text-sm font-medium text-gray-600 mb-1">차량타입</label>
                                            <select
                                                value={vehicle.car_type}
                                                onChange={async (e) => {
                                                    const carType = e.target.value;
                                                    const carCode = await getCarCode(carType, selectedCarCategory, vehicle.route || selectedRoute);
                                                    handleVehicleChange(vehicleIndex, 'car_type', carType);
                                                    handleVehicleChange(vehicleIndex, 'car_category', selectedCarCategory);
                                                    handleVehicleChange(vehicleIndex, 'car_code', carCode);
                                                }}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-green-500 bg-white"
                                                disabled={!selectedCarCategory || !vehicle.route}
                                            >
                                                <option value="">
                                                    {!selectedCarCategory ? '이용방식을 먼저 선택하세요' : (!vehicle.route ? '경로를 먼저 선택하세요' : '차량타입 선택')}
                                                </option>
                                                {carTypeOptions.map(carType => (
                                                    <option key={carType} value={carType}>{carType}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-600 mb-1">차량 및 인원수</label>
                                            <input
                                                type="number" min="0"
                                                value={vehicle.count}
                                                onChange={(e) => handleVehicleChange(vehicleIndex, 'count', parseInt(e.target.value) || 0)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-green-500"
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {vehicleForm.length < 3 && (
                                <button
                                    type="button"
                                    onClick={handleAddVehicle}
                                    className="w-full border-2 border-dashed border-green-300 rounded-lg p-3 text-xs text-green-600 hover:border-green-400 hover:text-green-700 transition-colors"
                                >
                                    + 차량 추가 (최대 3개)
                                </button>
                            )}
                        </div>

                        {/* 특별 요청사항 */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">특별 요청사항</label>
                            <textarea
                                value={formData.special_requests}
                                onChange={(e) => setFormData({ ...formData, special_requests: e.target.value })}
                                rows={3}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="특별한 요청사항이 있으시면 입력해주세요..."
                            />
                        </div>

                        {/* 제출 버튼 */}
                        <div className="flex justify-end gap-2 mt-4">
                            <button
                                type="button"
                                onClick={() => router.push('/quotes')}
                                className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                                취소
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700 disabled:opacity-50 transition-colors"
                            >
                                {loading ? '저장 중...' : priceResult ? `견적 추가 (${formatVND(priceResult.grand_total)})` : '견적 추가'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            {/* 우측: 안내 카드 */}
            <div>
                <div ref={rightCardRef} className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 min-w-0 overflow-x-hidden">
                    <h3 className="text-sm font-semibold text-gray-800 mb-2">안내</h3>
                    {/* 자연어 요약 카드 (안내 상단) */}
                    <div ref={naturalRef} className="mt-4 border-t pt-3">
                        <h5 className="text-sm font-semibold text-gray-800 mb-3">📝 자연어 요약</h5>
                        
                        {/* 액션 버튼 그룹 (1행 4열 - 파스텔 톤) */}
                        <div className="flex flex-wrap gap-2 mb-3">
                            <button
                                type="button"
                                onClick={copyNaturalOnly}
                                className="flex-1 min-w-fit px-3 py-2 text-xs font-medium bg-blue-200 hover:bg-blue-300 text-blue-700 rounded-lg transition-colors active:scale-95"
                            >
                                📋 복사
                            </button>
                            <button
                                type="button"
                                onClick={regenerateNatural}
                                disabled={regenerating}
                                className="flex-1 min-w-fit px-3 py-2 text-xs font-medium bg-cyan-200 hover:bg-cyan-300 text-cyan-700 rounded-lg transition-colors active:scale-95 disabled:opacity-50"
                            >
                                {regenerating ? '생성중...' : '🔄 생성'}
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsComparisonMode(!isComparisonMode)}
                                className={`flex-1 min-w-fit px-3 py-2 text-xs font-medium rounded-lg transition-colors active:scale-95 ${isComparisonMode ? 'bg-emerald-200 hover:bg-emerald-300 text-emerald-700' : 'bg-orange-200 hover:bg-orange-300 text-orange-700'}`}
                            >
                                {isComparisonMode ? '✓ 비교중' : '🔍 비교'}
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsCarComparisonMode(!isCarComparisonMode)}
                                className={`flex-1 min-w-fit px-3 py-2 text-xs font-medium rounded-lg transition-colors active:scale-95 ${isCarComparisonMode ? 'bg-violet-200 hover:bg-violet-300 text-violet-700' : 'bg-indigo-200 hover:bg-indigo-300 text-indigo-700'}`}
                            >
                                {isCarComparisonMode ? '✓ 차량비교' : '🚗 차량비교'}
                            </button>
                        </div>

                        {/* 텍스트 전용 컨테이너(헤더/버튼 제외) */}
                        <div ref={naturalTextRef} className="text-xs text-gray-700 whitespace-pre-wrap break-words bg-slate-50 p-3 rounded-lg border-2 border-black">
                            {naturalSummary || <span className="text-gray-400 italic">자연어 요약이 없습니다. 크루즈, 객실, 인원을 선택하고 생성 버튼을 눌러주세요.</span>}
                        </div>
                    </div>

                    {/* 상세 서비스 정보 */}
                    <div className="mt-4">
                        <div className="mt-4 pt-3">
                            <h5 className="text-sm font-medium text-gray-700 mb-2">상세 서비스 정보</h5>
                            {loading ? (
                                <div className="text-xs text-gray-400">로딩 중...</div>
                            ) : (
                                <div className="space-y-2 text-xs text-gray-700 break-words">
                                    {/* 객실 */}
                                    {detailedServices.rooms && detailedServices.rooms.length > 0 && (
                                        <div>
                                            <h6 className="font-medium">🛏 객실</h6>
                                            <div className="space-y-2 mt-2">
                                                {detailedServices.rooms.map((r: any, i: number) => (
                                                    <div key={i} className="p-2 border rounded bg-white">
                                                        <div className="text-xs text-gray-600">기본 정보:</div>
                                                        <div className="text-sm font-medium">
                                                            {r.item?.quantity ? `수량: ${r.item.quantity}` : ''}
                                                        </div>
                                                        <div className="text-xs text-gray-500">
                                                            {(() => {
                                                                // DB에는 extra가 단일 컬럼(extra_count)로 저장됩니다.
                                                                const person = (r.roomInfo?.person_count ?? (r.roomInfo?.extra_count ?? 0)) || r.item?.quantity;
                                                                const extra = r.roomInfo?.extra_count ?? r.item?.extra_count;
                                                                const parts: string[] = [];
                                                                if (person !== undefined && person !== null) parts.push(`인원: ${person}`);
                                                                if (extra !== undefined && extra !== null && extra > 0) parts.push(`엑스트라: ${extra}`);
                                                                return parts.join(' / ');
                                                            })()}
                                                        </div>
                                                        {r.priceInfo && r.priceInfo.length > 0 && (
                                                            <div className="mt-2">
                                                                <div className="text-xs text-gray-600">가격 정보:</div>
                                                                {r.priceInfo.map((p: any, pi: number) => (
                                                                    <div key={pi} className="mt-1 p-2 bg-gray-50 rounded">
                                                                        <div className="text-sm">{p.schedule ? `일정: ${p.schedule}` : ''} {p.cruise ? ` / 크루즈: ${p.cruise}` : ''}</div>
                                                                        <div className="text-sm">{p.room_type ? `객실 타입: ${p.room_type}` : ''} {p.room_category ? ` / 카테고리: ${p.room_category}` : ''}</div>
                                                                        <div className="text-sm font-medium text-green-600">{p.price !== null && p.price !== undefined ? `기본 가격: ${p.price?.toLocaleString()}동` : ''} {p.base_price ? ` / 단가: ${p.base_price?.toLocaleString()}동` : ''}</div>
                                                                        <div className="text-sm text-blue-600 mt-1">총액: {r.calculated_total ? r.calculated_total?.toLocaleString() + '동' : (r.item?.total_price ? r.item.total_price?.toLocaleString() + '동' : (r.calculated_unit ? (Number(r.calculated_unit) * Number(r.calculated_count || r.item?.quantity || 1)).toLocaleString() + '동' : (r.item?.unit_price ? (r.item.unit_price * (r.item.quantity || 1)).toLocaleString() + '동' : '-')))}</div>
                                                                        {r.roomInfo?.sale && [3, 5, 8, 10].includes(Number(r.roomInfo.sale)) && (
                                                                            <div className="text-sm text-red-600 mt-1">
                                                                                {r.roomInfo.sale}% 할인 바우쳐 적용시 금액: {(() => {
                                                                                    const discountRate = 1 - (Number(r.roomInfo.sale) / 100);
                                                                                    const discounted = Math.round((r.calculated_total || r.item?.total_price || (Number(r.calculated_unit || 0) * Number(r.calculated_count || r.item?.quantity || 1))) * discountRate);
                                                                                    return `${Math.round(discounted).toLocaleString()}동`;
                                                                                })()}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* 차량 */}
                                    {detailedServices.cars && detailedServices.cars.length > 0 && (
                                        <div>
                                            <h6 className="font-medium">🚗 차량</h6>
                                            <div className="space-y-2 mt-2">
                                                {detailedServices.cars.map((c: any, i: number) => (
                                                    <div key={i} className="p-2 border rounded bg-white">
                                                        <div className="text-xs text-gray-600">기본 정보:</div>
                                                        <div className="text-sm font-medium">{c.item?.quantity ? `수량: ${c.item.quantity}` : ''}</div>
                                                        <div className="mt-2 text-xs text-gray-600">가격 정보:</div>
                                                        {c.priceInfo && c.priceInfo.length > 0 && c.priceInfo.map((p: any, pi: number) => (
                                                            <div key={pi} className="mt-1 p-2 bg-gray-50 rounded">
                                                                <div className="text-sm">{p.schedule ? `일정: ${p.schedule}` : ''} {p.cruise ? ` / 크루즈: ${p.cruise}` : ''}</div>
                                                                <div className="text-sm">{p.car_type ? `차량 타입: ${p.car_type}` : ''} {p.car_category ? ` / 카테고리: ${p.car_category}` : ''}</div>
                                                                <div className="text-sm font-medium text-green-600">{p.price !== null && p.price !== undefined ? `기본 가격: ${p.price?.toLocaleString()}동` : ''} {p.base_price ? ` / 단가: ${p.base_price?.toLocaleString()}동` : ''}</div>
                                                                <div className="text-sm text-blue-600 mt-1">총액: {c.item?.total_price ? c.item.total_price?.toLocaleString() + '동' : (c.item?.unit_price ? (c.item.unit_price * (c.item.quantity || 1)).toLocaleString() + '동' : '-')}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* 공항 */}
                                    {detailedServices.airports && detailedServices.airports.length > 0 && (
                                        <div>
                                            <h6 className="font-medium">✈️ 공항 서비스</h6>
                                            <div className="space-y-2 mt-2">
                                                {detailedServices.airports.map((a: any, i: number) => (
                                                    <div key={i} className="p-2 border rounded bg-white">
                                                        <div className="text-xs text-gray-600">기본 정보:</div>
                                                        <div className="text-sm font-medium">{a.item?.quantity ? `승객수: ${a.item.quantity}` : ''}</div>
                                                        {a.priceInfo && a.priceInfo.length > 0 && (
                                                            <div className="mt-2">
                                                                <div className="text-xs text-gray-600">가격 정보:</div>
                                                                {a.priceInfo.map((p: any, pi: number) => (
                                                                    <div key={pi} className="mt-1 p-2 bg-gray-50 rounded">
                                                                        <div className="text-sm">{p.airport_category ? `카테고리: ${p.airport_category}` : ''} {p.airport_route ? ` / 경로: ${p.airport_route}` : ''}</div>
                                                                        <div className="text-sm">{p.airport_car_type ? `차량 타입: ${p.airport_car_type}` : ''}</div>
                                                                        <div className="text-sm font-medium text-green-600">{p.price !== null && p.price !== undefined ? `기본 가격: ${p.price?.toLocaleString()}동` : ''} {p.base_price ? ` / 단가: ${p.base_price?.toLocaleString()}동` : ''}</div>
                                                                        <div className="text-sm text-blue-600 mt-1">총액: {a.item?.total_price ? a.item.total_price?.toLocaleString() + '동' : (a.item?.unit_price ? (a.item.unit_price * (a.item.quantity || 1)).toLocaleString() + '동' : '-')}</div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* 호텔 */}
                                    {detailedServices.hotels && detailedServices.hotels.length > 0 && (
                                        <div>
                                            <h6 className="font-medium">🏨 호텔</h6>
                                            <div className="space-y-2 mt-2">
                                                {detailedServices.hotels.map((h: any, i: number) => (
                                                    <div key={i} className="p-2 border rounded bg-white">
                                                        <div className="text-xs text-gray-600">기본 정보:</div>
                                                        {h.priceInfo && h.priceInfo.length > 0 && h.priceInfo.map((p: any, pi: number) => (
                                                            <div key={pi} className="mt-1 p-2 bg-gray-50 rounded">
                                                                <div className="text-sm">{p.hotel_name ? `호텔명: ${p.hotel_name}` : ''} {p.room_name ? ` / 객실명: ${p.room_name}` : ''}</div>
                                                                <div className="text-sm">{p.room_type ? `객실 타입: ${p.room_type}` : ''}</div>
                                                                <div className="text-sm font-medium text-green-600">{p.price !== null && p.price !== undefined ? `기본 가격: ${p.price?.toLocaleString()}동` : ''} {p.base_price ? ` / 단가: ${p.base_price?.toLocaleString()}동` : ''}</div>
                                                                <div className="text-sm text-blue-600 mt-1">총액: {h.item?.total_price ? h.item.total_price?.toLocaleString() + '동' : (h.item?.unit_price ? (h.item.unit_price * (h.item.quantity || 1)).toLocaleString() + '동' : '-')}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* 렌트카 */}
                                    {detailedServices.rentcars && detailedServices.rentcars.length > 0 && (
                                        <div>
                                            <h6 className="font-medium">🚙 렌트카</h6>
                                            <div className="space-y-2 mt-2">
                                                {detailedServices.rentcars.map((rc: any, i: number) => (
                                                    <div key={i} className="p-2 border rounded bg-white">
                                                        <div className="text-xs text-gray-600">기본 정보:</div>
                                                        {rc.priceInfo && rc.priceInfo.length > 0 && rc.priceInfo.map((p: any, pi: number) => (
                                                            <div key={pi} className="mt-1 p-2 bg-gray-50 rounded">
                                                                <div className="text-sm">{p.way_type ? `이용방식: ${p.way_type}` : ''}</div>
                                                                <div className="text-sm">{p.route ? `경로: ${p.route}` : ''}</div>
                                                                <div className="text-sm font-medium text-green-600">{p.price !== null && p.price !== undefined ? `기본 가격: ${p.price?.toLocaleString()}동` : ''} {p.base_price ? ` / 단가: ${p.base_price?.toLocaleString()}동` : ''}</div>
                                                                <div className="text-sm text-blue-600 mt-1">총액: {rc.item?.total_price ? rc.item.total_price?.toLocaleString() + '동' : (rc.item?.unit_price ? (rc.item.unit_price * (rc.item.quantity || 1)).toLocaleString() + '동' : '-')}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* 투어 */}
                                    {detailedServices.tours && detailedServices.tours.length > 0 && (
                                        <div>
                                            <h6 className="font-medium">🎯 투어</h6>
                                            <div className="space-y-2 mt-2">
                                                {detailedServices.tours.map((t: any, i: number) => (
                                                    <div key={i} className="p-2 border rounded bg-white">
                                                        <div className="text-xs text-gray-600">기본 정보:</div>
                                                        <div className="text-sm font-medium">{t.tourInfo?.tour_date ? `날짜: ${t.tourInfo.tour_date}` : ''} {t.item?.quantity ? ` / 참가자수: ${t.item.quantity}` : ''}</div>
                                                        {t.priceInfo && t.priceInfo.length > 0 && t.priceInfo.map((p: any, pi: number) => (
                                                            <div key={pi} className="mt-1 p-2 bg-gray-50 rounded">
                                                                <div className="text-sm">{p.tour_name ? `투어명: ${p.tour_name}` : ''} {p.tour_capacity ? ` / 정원: ${p.tour_capacity}` : ''} {p.tour_vehicle ? ` / 차량: ${p.tour_vehicle}` : ''}</div>
                                                                <div className="text-sm font-medium text-green-600">{p.price !== null && p.price !== undefined ? `기본 가격: ${p.price?.toLocaleString()}동` : ''} {p.base_price ? ` / 단가: ${p.base_price?.toLocaleString()}동` : ''}</div>
                                                                <div className="text-sm text-blue-600 mt-1">총액: {t.item?.total_price ? t.item.total_price?.toLocaleString() + '동' : (t.item?.unit_price ? (t.item.unit_price * (t.item.quantity || 1)).toLocaleString() + '동' : '-')}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ))}

                                                {/* 합계 표시 */}
                                                {(() => {
                                                    const formatDong = (v: number | null | undefined) => {
                                                        if (v === null || v === undefined) return '-';
                                                        return `${Math.round(v).toLocaleString()}동`;
                                                    };

                                                    return (
                                                        <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded">
                                                            <div className="text-sm text-gray-600">합계 (동화)</div>
                                                            <div className="text-sm font-bold text-red-600 mt-1">{formatDong(totalSummary.totalDong)}</div>
                                                            <div className="text-sm text-gray-600 mt-2">합계 (원화)</div>
                                                            <div className="text-sm font-bold text-blue-600 mt-1">{totalSummary.totalWon.toLocaleString()}원</div>

                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// TitleStarter는 탭 컨트롤로 대체됨

export default function ManagerCruiseQuoteNewPage() {
    const [pageRawRate, setPageRawRate] = useState<number | null>(null);
    useEffect(() => {
        let mounted = true;
        const fetchRate = async () => {
            try {
                const resp = await fetch('/api/exchange-rate?currency=VND');
                if (!resp.ok) return;
                const json = await resp.json();
                const raw = json?.data?.raw_rate_to_krw;
                if (mounted && raw !== undefined && raw !== null) setPageRawRate(Number(raw));
            } catch (e) { /* ignore */ }
        };

        // initial load
        fetchRate();

        // Listen for storage events so the exchange-rate admin page can signal an update
        const onStorage = (e: StorageEvent) => {
            if (!e.key) return;
            // admin page should set localStorage.setItem('exchange-rate:VND','updated') after successful update
            if (e.key === 'exchange-rate:VND' || e.key === 'exchange-rate:VND:updated' || e.key === 'exchange-rate:update') {
                fetchRate();
            }
        };
        window.addEventListener('storage', onStorage);

        // BroadcastChannel fallback for same-origin tabs
        let bc: BroadcastChannel | null = null;
        try {
            if (typeof BroadcastChannel !== 'undefined') {
                bc = new BroadcastChannel('exchange-rate');
                bc.addEventListener('message', (ev) => {
                    const data = ev.data;
                    if (data === 'updated' || data?.currency === 'VND') fetchRate();
                });
            }
        } catch { /* ignore */ }

        // Also refresh when user returns to the tab (visibilitychange)
        const onVisibility = () => {
            if (document.visibilityState === 'visible') fetchRate();
        };
        window.addEventListener('visibilitychange', onVisibility);

        return () => {
            mounted = false;
            window.removeEventListener('storage', onStorage);
            window.removeEventListener('visibilitychange', onVisibility);
            try { if (bc) bc.close(); } catch { }
        };
    }, []);
    return (
        <Suspense fallback={
            <MobileQuoteLayout title="견적 입력">
                <div className="flex flex-col justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                    <p className="text-gray-600">로딩 중...</p>
                </div>
            </MobileQuoteLayout>
        }>
            <MobileQuoteLayout title="견적 입력">
                <ManagerServiceTabs active="cruise" pageRawRate={pageRawRate} />
                <ManagerCruiseQuoteForm />
            </MobileQuoteLayout>
        </Suspense>
    );
}

