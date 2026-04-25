'use client';
import { useEffect, useState, Suspense, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ManagerLayout from '@/components/ManagerLayout';
import supabase from '@/lib/supabase';
import { getExchangeRate, vndToKrw, roundKrwToHundred, formatExchangeRate } from '../../../../lib/exchangeRate';
// 공용 탭 (quoteId 유지) + 오늘 타이틀 선택/작
function ManagerServiceTabs({ active }: { active: 'cruise' | 'airport' | 'hotel' | 'rentcar' | 'tour' | 'comprehensive' | 'package' }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const quoteId = searchParams.get('quoteId');
    const [recentTitles, setRecentTitles] = useState<any[]>([]);
    const [creating, setCreating] = useState(false);
    const [titleInput, setTitleInput] = useState('');
    const searchTimer = useRef<any>(null);
    const makeHref = (key: string, id?: string | null) => `/manager/quotes/${key}${id ? `?quoteId=${id}` : (quoteId ? `?quoteId=${quoteId}` : '')}`;
    // 타이틀 검색 로컬 상태 (ManagerServiceTabs 내에서 독립적으로 동작)
    const [titleSearch, setTitleSearch] = useState<string>('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [searching, setSearching] = useState<boolean>(false);

    const searchByTitle = async (forceRemote = false) => {
        const q = titleSearch?.trim();
        if (!q) {
            setSearchResults([]);
            return;
        }
        // 빠른 응답을 위해 먼저 recentTitles에서 로컬 필터링
        try {
            setSearching(true);
            const lower = q.toLowerCase();
            const local = recentTitles.filter((r: any) => (r.title || '').toLowerCase().includes(lower)).slice(0, 20);
            // 로컬 결과가 충분하면 바로 사용
            if (local.length > 0 && !forceRemote) {
                setSearchResults(local);
            }

            // 로컬 결과가 부족하면 원격에서 추가 조회 (네트워크 호출 최소화)
            if (forceRemote || local.length < 10) {
                const { data, error } = await supabase
                    .from('quote')
                    .select('id,title,created_at')
                    .ilike('title', `%${q}%`)
                    .order('created_at', { ascending: false })
                    .limit(20);
                if (error) throw error;
                setSearchResults(data || local || []);
            }
        } catch (e) {
            console.error('타이틀 검색 실패:', e);
            setSearchResults([]);
        } finally {
            setSearching(false);
        }
    };

    // 입력 디바운스: 사용자가 타이핑을 멈춘 뒤 300ms 후에 검색 실행
    useEffect(() => {
        if (searchTimer.current) clearTimeout(searchTimer.current);
        if (!titleSearch || titleSearch.trim() === '') {
            setSearchResults([]);
            return;
        }
        searchTimer.current = setTimeout(() => {
            searchByTitle();
        }, 300);

        return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
    }, [titleSearch, recentTitles]);
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
        // 최근 작성된 견적(날짜 필터 없이 전체) 로드
        const loadRecentTitles = async () => {
            try {
                const { data } = await supabase
                    .from('quote')
                    .select('id,title,created_at')
                    .order('created_at', { ascending: false })
                    .limit(50);
                setRecentTitles(data || []);
            } catch (e) {
                console.error('최근 타이틀 로드 실패:', e);
                setRecentTitles([]);
            }
        };
        loadRecentTitles();
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
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
                <Tab keyName="comprehensive" label="전체" />
                <Tab keyName="cruise" label="크루즈" />
                <Tab keyName="airport" label="공항" />
                <Tab keyName="hotel" label="호텔" />
                <Tab keyName="rentcar" label="렌트카" />
                <Tab keyName="tour" label="투어" />
                <Tab keyName="package" label="패키지" />
            </div>
            <div className="flex items-center gap-2 ml-auto justify-end">
                {/* 타이틀 검색 입력 (먼저 표시) */}
                <div className="flex items-center border rounded overflow-hidden">
                    <input
                        value={titleSearch}
                        onChange={(e) => setTitleSearch(e.target.value)}
                        placeholder="타이틀 검색"
                        className="px-2 py-1 text-xs w-96"
                        aria-label="타이틀 검색어"
                    />
                    <button
                        type="button"
                        onClick={() => searchByTitle(true)}
                        disabled={searching}
                        className="px-3 py-1 text-xs bg-blue-500 text-white min-w-[80px] text-center"
                    >
                        {searching ? '검색중...' : '검색'}
                    </button>
                </div>
                {/* 검색 결과 드롭다운 */}
                {searchResults.length > 0 && (
                    <select onChange={(e) => e.target.value && router.push(`/manager/quotes/comprehensive?quoteId=${e.target.value}`)} className="border p-1.5 rounded text-xs bg-white max-w-[280px]">
                        <option value="">검색 결과 선택</option>
                        {searchResults.map(r => (
                            <option key={r.id} value={r.id}>{r.title} — {new Date(r.created_at).toLocaleString()}</option>
                        ))}
                    </select>
                )}
                <select onChange={(e) => e.target.value && onPickTitle(e.target.value)} className="border p-1.5 rounded text-xs bg-white max-w-[240px]">
                    <option value="">최근 작성한 타이틀 선택</option>
                    {recentTitles.map(t => (
                        <option key={t.id} value={t.id}>{t.title} — {new Date(t.created_at).toLocaleTimeString()}</option>
                    ))}
                </select>
                <input value={titleInput} onChange={(e) => setTitleInput(e.target.value)} placeholder="타이틀" className="border p-1.5 rounded text-xs w-36" />
                <button
                    type="button"
                    onClick={startNew}
                    disabled={creating}
                    className="text-xs bg-green-600 text-white px-2 sm:px-3 py-1.5 rounded min-w-[80px] sm:min-w-[96px] text-center"
                    aria-label="작업 시작"
                >
                    {creating ? '생성중...' : '작업 시작'}
                </button>
            </div>
        </div>
    );
}

function ManagerComprehensiveQuoteForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const quoteId = searchParams.get('quoteId');

    const [detailedServices, setDetailedServices] = useState<any>({ rooms: [], cars: [], airports: [], hotels: [], rentcars: [], tours: [] });
    const [loading, setLoading] = useState(false);
    const [quote, setQuote] = useState<any>(null);
    const [selectedDiscount, setSelectedDiscount] = useState<number | null>(null);
    // exchangeRate holds the admin-provided rate value (KRW per 100 VND)
    // Conversion used across the app: KRW = VND * exchangeRate * 0.01
    const [exchangeRate, setExchangeRate] = useState<number>(0);
    const [naturalSummary, setNaturalSummary] = useState<string>('');
    const naturalRef = useRef<HTMLDivElement | null>(null);
    const naturalTextRef = useRef<HTMLDivElement | null>(null);
    const [isComparisonMode, setIsComparisonMode] = useState<boolean>(false);

    const [totalSummary, setTotalSummary] = useState<{ totalDong: number; totalWon: number }>({ totalDong: 0, totalWon: 0 });

    // 타이틀 검색 상태 및 결과
    const [titleSearch, setTitleSearch] = useState<string>('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [searching, setSearching] = useState<boolean>(false);

    // 공통 포맷 함수
    const formatDong = (v: number | null | undefined) => {
        if (v === null || v === undefined) return '-';
        return `${Math.round(v).toLocaleString()}동`;
    };

    const copyNaturalOnly = async () => {
        try {
            if (typeof window === 'undefined') return;
            const naturalEl = naturalTextRef.current || naturalRef.current;
            if (!naturalEl) {
                alert('복사할 자연어 요약 영역을 찾을 수 없습니다.');
                return;
            }
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

    // 타이틀로 견적 검색 (부분 일치, 최신순 최대 20개)
    const searchByTitle = async () => {
        const q = titleSearch?.trim();
        if (!q) {
            setSearchResults([]);
            return;
        }
        try {
            setSearching(true);
            const { data, error } = await supabase
                .from('quote')
                .select('id,title,created_at')
                .ilike('title', `%${q}%`)
                .order('created_at', { ascending: false })
                .limit(20);
            if (error) throw error;
            setSearchResults(data || []);
        } catch (e) {
            console.error('타이틀 검색 실패:', e);
            setSearchResults([]);
        } finally {
            setSearching(false);
        }
    };

    // 자연어 요약 생성 함수
    const generateNaturalSummary = (services: any, rate: number, discount: number | null, comparisonMode: boolean = false) => {
        // 통화 포맷 헬퍼
        const formatDong = (v: number | null | undefined) => {
            if (v === null || v === undefined) return '-';
            return `${Math.round(v).toLocaleString()}동`;
        };

        const EXCHANGE_RATE = rate;
        // helper imports available via module scope

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
                        categoryCount = ri.extra_count ?? categoryCount;
                    }

                    let roomTotal = r.calculated_total ?? (Number(unit || 0) * Number(categoryCount || 1));

                    // 할인 적용
                    if (discount && [3, 5, 8, 10].includes(Number(discount)) && !/^(공휴일|투어)/.test(categoryLabel)) {
                        const discountRate = 1 - (Number(discount) / 100);
                        roomTotal = Math.round(roomTotal * discountRate);
                    }

                    roomTotalSum += roomTotal;

                    out += `${categoryLabel} 1인 ${formatDong(unit)} * ${categoryCount}인 = ${formatDong(roomTotal)}\n`;
                });

                // 룸 테이블의 sale 컬럼 값에 따라 할인 표시
                if (discount && [3, 5, 8, 10].includes(Number(discount))) {
                    out += `${discount}% 할인 바우쳐 적용시 금액: ${formatDong(roomTotalSum)}\n`;
                } else {
                    out += `\n객실합계: ${formatDong(roomTotalSum)}\n`;
                }

                firstRoomInCruise = false;
            });

            // 크루즈별 차량 표시
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

                // 할인 적용
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

                if (index === 0) {
                    out += `차량: ${carName} 1인 ${formatDong(unit)} * ${cnt}인 = ${formatDong(total)}\n`;
                } else {
                    out += `        ${carName} 1인 ${formatDong(unit)} * ${cnt}인 = ${formatDong(total)}\n`;
                }
            });
            out += '\n';
        }

        // 공항 서비스 표시
        if (services.airports && services.airports.length > 0) {
            // 카테고리별로 그룹화 (픽업/샌딩)
            const pickupServices = services.airports.filter((a: any) => {
                const category = a.priceInfo?.[0]?.airport_category;
                return category?.toLowerCase().includes('픽업');
            });

            const sendingServices = services.airports.filter((a: any) => {
                const category = a.priceInfo?.[0]?.airport_category;
                return category?.toLowerCase().includes('샌딩');
            });

            // 픽업 서비스 표시
            if (pickupServices.length > 0) {
                pickupServices.forEach((a: any) => {
                    const p = a.priceInfo?.[0];
                    const unit = p?.price ?? p?.base_price ?? a.item?.unit_price ?? 0;
                    const cnt = a.calculated_count ?? a.item?.quantity ?? 1;
                    const tot = a.calculated_total ?? (Number(unit || 0) * Number(cnt || 1));

                    out += `공항(픽업)\n`;
                    out += `경로: ${p?.airport_route || ''}\n`;
                    out += `차량: ${p?.airport_car_type || ''}\n`;
                    out += `1대 ${formatDong(unit)} * ${cnt}대 = ${formatDong(tot)}\n\n`;
                });
            }

            // 샌딩 서비스 표시
            if (sendingServices.length > 0) {
                sendingServices.forEach((a: any) => {
                    const p = a.priceInfo?.[0];
                    const unit = p?.price ?? p?.base_price ?? a.item?.unit_price ?? 0;
                    const cnt = a.calculated_count ?? a.item?.quantity ?? 1;
                    const tot = a.calculated_total ?? (Number(unit || 0) * Number(cnt || 1));

                    out += `공항(샌딩)\n`;
                    out += `경로: ${p?.airport_route || ''}\n`;
                    out += `차량: ${p?.airport_car_type || ''}\n`;
                    out += `1대 ${formatDong(unit)} * ${cnt}대 = ${formatDong(tot)}\n\n`;
                });
            }
        }

        // 호텔 서비스 표시 (호텔 페이지과 동일한 포맷)
        if (services.hotels && services.hotels.length > 0) {
            let hotelTotal = 0;
            services.hotels.forEach((h: any) => {
                const p = h.priceInfo?.[0];
                const unit = p?.price ?? p?.base_price ?? h.item?.unit_price ?? 0;
                const cnt = h.item?.quantity ?? h.calculated_count ?? 1;
                const tot = h.calculated_total ?? (Number(unit || 0) * Number(cnt || 1));

                out += `호텔명: ${p?.hotel_name || ''}\n`;
                out += `객실명: ${p?.room_name || ''}\n`;
                out += `객실당 금액 1실 ${formatDong(unit)} * ${cnt}실 = ${formatDong(tot)}\n\n`;

                hotelTotal += Number(tot || 0);
            });

            // 호텔 합계와 원화 환산
            const hotelWon = roundKrwToHundred(vndToKrw(hotelTotal, EXCHANGE_RATE));
            out += `총금액: ${formatDong(hotelTotal)}\n`;
            out += `원화금액: ${hotelWon.toLocaleString()}원\n\n`;
        }

        // 렌트카 서비스 표시
        if (services.rentcars && services.rentcars.length > 0) {
            services.rentcars.forEach((rc: any) => {
                const p = rc.priceInfo?.[0];
                const unit = p?.price ?? p?.base_price ?? rc.item?.unit_price ?? 0;
                const cnt = rc.calculated_count ?? rc.item?.quantity ?? 1;
                const tot = rc.calculated_total ?? (Number(unit || 0) * Number(cnt || 1));
                const code = rc.rentcarInfo?.rentcar_code || rc.rentcarInfo?.name || '';
                const rentType = p?.way_type || '';
                const category = p?.way_type || '';
                const route = p?.route || '';
                const carType = p?.vehicle_type || '';

                // 한 줄 요약: 코드/카테고리(렌트타입) — 경로 / 차량 — 단가 * 수량 = 합계
                out += `렌트카: ${code}${code ? ' — ' : ''}${category}${rentType ? `(${rentType})` : ''} / 경로: ${route} / 차량: ${carType} — 1대 ${formatDong(unit)} * ${cnt}대 = ${formatDong(tot)}\n\n`;
            });
        }

        // 투어 서비스 표시
        if (services.tours && services.tours.length > 0) {
            services.tours.forEach((t: any) => {
                const p = t.priceInfo?.[0];
                const unit = p?.price ?? p?.base_price ?? t.item?.unit_price ?? 0;
                const cnt = t.calculated_count ?? t.item?.quantity ?? 1;
                const tot = t.calculated_total ?? (Number(unit || 0) * Number(cnt || 1));

                out += `투어명: ${p?.tour_name || ''}\n`;
                out += `차량: ${p?.tour_vehicle || ''}\n`;
                out += `정원: ${p?.tour_capacity || ''}\n`;
                out += `1인 ${formatDong(unit)} * ${cnt}인 = ${formatDong(tot)}\n\n`;
            });
        }

        // 비교 모드일 때: 전체 요약 대신 비교 전용 블록만 반환
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

            // 각 그룹 총합 계산(객실 합 + 해당 크루즈 차량 합)
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
                    if (discount && [5, 8, 10].includes(Number(discount))) {
                        const discountRate = 1 - (Number(discount) / 100);
                        roomTotal = Math.round(roomTotal * discountRate);
                    }
                    groupTotal += roomTotal;
                });

                services.cars?.forEach((c: any) => {
                    const carCruise = c.priceInfo?.[0]?.cruise || c.carInfo?.cruise_name;
                    if (carCruise === group.cruiseName) {
                        const carTotal = c.calculated_total ?? (Number(c.priceInfo?.[0]?.price ?? c.priceInfo?.[0]?.base_price ?? c.item?.unit_price ?? 0) * Number(c.calculated_count ?? c.item?.quantity ?? 1));
                        groupTotal += carTotal;
                    }
                });

                group.total = groupTotal;
            });

            // cruiseName => [groups]
            const cruiseMap: { [key: string]: Array<{ roomName: string; rooms: any[]; total: number }> } = {};
            Object.values(roomGroups).forEach(g => {
                if (!cruiseMap[g.cruiseName]) cruiseMap[g.cruiseName] = [];
                cruiseMap[g.cruiseName].push({ roomName: g.roomName, rooms: g.rooms, total: g.total || 0 });
            });

            let outCmp = '';
            outCmp += `회원님~! 견적드립니다^^\n\n`;

            const cruiseNames = Object.keys(cruiseMap);
            cruiseNames.forEach((cruiseName) => {
                outCmp += `크루즈: ${cruiseName}\n\n`;
                cruiseMap[cruiseName].forEach((rg) => {
                    outCmp += `객실명: ${rg.roomName}\n`;
                    rg.rooms.forEach((r: any) => {
                        const categoryLabel = r.priceInfo?.[0]?.room_category || r.priceInfo?.[0]?.room_type || r.roomInfo?.room_category || '성인';
                        const unit = r.priceInfo?.[0]?.price ?? r.priceInfo?.[0]?.base_price ?? r.item?.unit_price ?? 0;
                        let categoryCount = r.calculated_count ?? r.item?.quantity ?? 1;
                        const ri = r.roomInfo || {};
                        const catKey = String(categoryLabel || '').toLowerCase();
                        if (/엑스트라/.test(catKey)) categoryCount = ri.extra_count ?? categoryCount;
                        let roomTotal = r.calculated_total ?? (Number(unit || 0) * Number(categoryCount || 1));
                        if (discount && [5, 8, 10].includes(Number(discount))) {
                            const discountRate = 1 - (Number(discount) / 100);
                            roomTotal = Math.round(roomTotal * discountRate);
                        }
                        outCmp += `${categoryLabel} 1인 ${formatDong(unit)} * ${categoryCount}인 = ${formatDong(roomTotal)}\n`;
                    });

                    const groupCars = services.cars?.filter((c: any) => {
                        const carCruise = c.priceInfo?.[0]?.cruise || c.carInfo?.cruise_name;
                        return carCruise === cruiseName;
                    }) || [];

                    if (groupCars.length > 0) {
                        groupCars.forEach((c: any, ci: number) => {
                            const carName = c.priceInfo?.[0]?.car_type || c.carInfo?.car_type || '차량명 미지정';
                            const unit = c.priceInfo?.[0]?.price ?? c.priceInfo?.[0]?.base_price ?? c.item?.unit_price ?? 0;
                            const cnt = c.calculated_count ?? c.item?.quantity ?? 1;
                            const total = c.calculated_total ?? (Number(unit || 0) * Number(cnt || 1));
                            const prefix = ci === 0 ? '차량: ' : '        ';
                            outCmp += `${prefix}${carName} 1인 ${formatDong(unit)} * ${cnt}인 = ${formatDong(total)}\n`;
                        });
                        outCmp += `\n`;
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
                // 사용자 요청: 비교보기 하단 문구 추가
                outCmp += `\n\n해당 환율은 참고용 네이버 환율로, 실제 결제하시는 금액과 차이가 있을 수 있습니다.^^`;
            } else {
                outCmp += `비교할 수 있는 객실이 부족합니다.`;
            }

            return outCmp;
        }

        // 문구는 요약의 맨 아래에 한 줄 띄워 표시
        out += `\n\n해당 환율은 참고용 네이버 환율로, 실제 결제하시는 금액과 차이가 있을 수 있습니다.^^`;

        return out;
    };

    // detailedServices나 exchangeRate가 변경될 때마다 자연어 요약 갱신
    useEffect(() => {
        const summary = generateNaturalSummary(detailedServices, exchangeRate, selectedDiscount, isComparisonMode);
        setNaturalSummary(summary);
    }, [detailedServices, exchangeRate, selectedDiscount, isComparisonMode]);

    // detailedServices나 exchangeRate가 변경될 때마다 전체 합계 계산
    useEffect(() => {
        try {
            let totalDong = 0;

            // rooms
            (detailedServices.rooms || []).forEach((r: any) => {
                const roomTotal = r.calculated_total ?? (r.item?.total_price ?? (r.calculated_unit ? Number(r.calculated_unit) * Number(r.calculated_count || r.item?.quantity || 1) : (r.item?.unit_price ? Number(r.item.unit_price) * Number(r.item.quantity || 1) : 0)));
                totalDong += Number(roomTotal || 0);
            });

            // cars
            (detailedServices.cars || []).forEach((c: any) => {
                const carTotal = c.calculated_total ?? (c.item?.total_price ?? (c.item?.unit_price ? Number(c.item.unit_price) * Number(c.item.quantity || 1) : 0));
                totalDong += Number(carTotal || 0);
            });

            // airports
            (detailedServices.airports || []).forEach((a: any) => {
                const apTotal = a.calculated_total ?? (a.item?.total_price ?? (a.item?.unit_price ? Number(a.item.unit_price) * Number(a.item.quantity || 1) : 0));
                totalDong += Number(apTotal || 0);
            });

            // hotels
            (detailedServices.hotels || []).forEach((h: any) => {
                const hTotal = h.calculated_total ?? (h.item?.total_price ?? (h.item?.unit_price ? Number(h.item.unit_price) * Number(h.item.quantity || 1) : 0));
                totalDong += Number(hTotal || 0);
            });

            // rentcars
            (detailedServices.rentcars || []).forEach((rc: any) => {
                const rcTotal = rc.calculated_total ?? (rc.item?.total_price ?? (rc.item?.unit_price ? Number(rc.item.unit_price) * Number(rc.item.quantity || 1) : 0));
                totalDong += Number(rcTotal || 0);
            });

            // tours
            (detailedServices.tours || []).forEach((t: any) => {
                const tTotal = t.calculated_total ?? (t.item?.total_price ?? (t.item?.unit_price ? Number(t.item.unit_price) * Number(t.item.quantity || 1) : 0));
                totalDong += Number(tTotal || 0);
            });

            // Use vndToKrw helper: exchangeRate must be normalized multiplier (KRW = VND * exchangeRate)
            const totalWon = exchangeRate ? roundKrwToHundred(vndToKrw(Number(totalDong || 0), Number(exchangeRate))) : 0;
            setTotalSummary({ totalDong: totalDong || 0, totalWon });
        } catch (err) {
            console.error('총합 계산 실패:', err);
            setTotalSummary({ totalDong: 0, totalWon: 0 });
        }
    }, [detailedServices, exchangeRate, selectedDiscount]);

    useEffect(() => {
        if (!quoteId) return;
        loadQuote();
    }, [quoteId]);

    // 로컬/DB에서 관리자가 입력한 canonical 환율을 불러와 exchangeRate를 초기화
    // Note: getExchangeRate now returns the admin-provided value (KRW per 100 VND)
    useEffect(() => {
        const initRate = async () => {
            try {
                const er = await getExchangeRate('VND');
                if (er && typeof er.rate_to_krw === 'number' && er.rate_to_krw > 0) {
                    setExchangeRate(er.rate_to_krw);
                }
            } catch (e) {
                console.warn('환율 초기화 실패:', e);
            }
        };
        initRate();
    }, []);

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
            await loadRightDetails(quoteId as string);
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

                            if (pb && pb.rate_card_id) {
                                const cruiseName = pb.cruise_name || opts.cruise_name || '크루즈 미지정';
                                const roomType = pb.room_type || opts.room_type || '객실 미지정';
                                const basePriceInfo = { room_type: roomType, cruise: cruiseName, schedule: pb.schedule };
                                const baseRoomInfo = { ...roomData, cruise_name: cruiseName };

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
                            const { data: priceData } = await supabase.from('car_price').select('*').eq('car_code', carData.car_code);
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
        } catch (e) {
            console.error('우측 상세 정보 로드 실패:', e);
            setDetailedServices({ rooms: [], cars: [], airports: [], hotels: [], rentcars: [], tours: [] });
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 상단 간단 타이틀 스트립 */}
            <div className="lg:col-span-2 -mt-2 -mb-2">
                <div className="text-xs text-gray-600">행복여행 이름: <span className="font-semibold text-gray-900">{quote?.title || '로딩 중...'}</span></div>
            </div>

            {/* 좌측: 모든 서비스 표시 */}
            <div>
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-gray-800">전체 서비스</h2>
                        {/* 할인 버튼들 */}
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-600">할인:</span>
                            {[5, 8, 10].map(discount => (
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

                    {loading ? (
                        <div className="flex justify-center items-center h-64">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                            <p className="mt-4 text-gray-600">데이터를 불러오는 중...</p>
                        </div>
                    ) : (
                        <div className="space-y-3 text-sm text-gray-700">
                            {/* 객실 */}
                            {detailedServices.rooms && detailedServices.rooms.length > 0 && (
                                <div>
                                    <h6 className="font-medium">🛏 객실</h6>
                                    <div className="space-y-2 mt-2">
                                        {detailedServices.rooms.map((r: any, i: number) => (
                                            <div key={i} className="p-2 border rounded bg-white">
                                                <div className="text-xs text-gray-600">기본 정보:</div>
                                                <div className="text-sm font-medium">
                                                    {r.roomInfo?.room_code ? `객실 코드: ${r.roomInfo.room_code}` : ''} {r.item?.quantity ? `(수량: ${r.item.quantity})` : ''}
                                                </div>
                                                <div className="text-xs text-gray-500">
                                                    {(() => {
                                                        // 우선 person_count를 사용, 없으면 extra_count 사용
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
                                                <div className="text-sm font-medium">{c.carInfo?.car_code ? `차량 코드: ${c.carInfo.car_code}` : ''} {c.item?.quantity ? `(수량: ${c.item.quantity})` : ''}</div>
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
                                                <div className="text-sm font-medium">{a.airportInfo?.airport_code ? `공항 코드: ${a.airportInfo.airport_code}` : ''} {a.item?.quantity ? `(승객수: ${a.item.quantity})` : ''}</div>
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
                                                <div className="text-sm font-medium">{h.hotelInfo?.hotel_code ? `호텔 코드: ${h.hotelInfo.hotel_code}` : ''}</div>
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
                                                <div className="text-sm font-medium">{rc.rentcarInfo?.rentcar_code ? `렌트카 코드: ${rc.rentcarInfo.rentcar_code}` : ''}</div>
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
                                                <div className="text-sm font-medium">{t.tourInfo?.tour_code ? `투어 코드: ${t.tourInfo.tour_code}` : ''} {t.tourInfo?.tour_date ? ` / 날짜: ${t.tourInfo.tour_date}` : ''} {t.item?.quantity ? ` / 참가자수: ${t.item.quantity}` : ''}</div>
                                                {t.priceInfo && t.priceInfo.length > 0 && t.priceInfo.map((p: any, pi: number) => (
                                                    <div key={pi} className="mt-1 p-2 bg-gray-50 rounded">
                                                        <div className="text-sm">{p.tour_name ? `투어명: ${p.tour_name}` : ''} {p.tour_capacity ? ` / 정원: ${p.tour_capacity}` : ''} {p.tour_vehicle ? ` / 차량: ${p.tour_vehicle}` : ''}</div>
                                                        <div className="text-sm font-medium text-green-600">{p.price !== null && p.price !== undefined ? `기본 가격: ${p.price?.toLocaleString()}동` : ''} {p.base_price ? ` / 단가: ${p.base_price?.toLocaleString()}동` : ''}</div>
                                                        <div className="text-sm text-blue-600 mt-1">총액: {t.item?.total_price ? t.item.total_price?.toLocaleString() + '동' : (t.item?.unit_price ? (t.item.unit_price * (t.item.quantity || 1)).toLocaleString() + '동' : '-')}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* 전체 합계 표시 */}
                            <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                                <div className="text-sm text-gray-600">합계 (동화)</div>
                                <div className="text-lg font-bold text-red-600 mt-1">{formatDong(totalSummary.totalDong)}</div>
                                <div className="text-sm text-gray-600 mt-2">합계 (원화)</div>
                                <div className="text-lg font-bold text-blue-600 mt-1">{totalSummary.totalWon.toLocaleString()}원</div>
                                <div className="text-xs text-gray-500 mt-1">적용 환율: {exchangeRate ? formatExchangeRate(exchangeRate) : '—'}</div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* 우측: 자연어 요약 */}
            <div>
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                    <h3 className="text-md font-semibold text-gray-800 mb-2">안내</h3>
                    {/* 자연어 요약 카드 (안내 상단) */}
                    <div ref={naturalRef} className="mt-4 border-t pt-3 bg-white p-3 rounded">
                        <div className="flex items-center justify-between">
                            <h5 className="text-sm font-medium text-gray-700 mb-2">자연어 요약</h5>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIsComparisonMode(!isComparisonMode)}
                                    className={`text-xs px-2 py-1 rounded border ${isComparisonMode
                                        ? 'bg-green-500 text-white border-green-500'
                                        : 'bg-gray-50 text-gray-700 border-gray-300 hover:bg-gray-100'
                                        }`}
                                >
                                    {isComparisonMode ? '비교 해제' : '가격 비교'}
                                </button>
                                <button type="button" onClick={copyNaturalOnly} className="text-xs bg-blue-500 text-white px-2 py-1 rounded">자연어 복사</button>
                            </div>
                        </div>
                        {/* 텍스트 전용 컨테이너(헤더/버튼 제외) */}
                        <div ref={naturalTextRef} className="text-sm text-gray-700 whitespace-pre-wrap">
                            {naturalSummary}
                        </div>
                    </div>
                    <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
                        <div className="text-xs text-yellow-800">
                            {quoteId ? (
                                <>현재 견적 ID: <span className="font-mono break-all">{quoteId}</span></>
                            ) : (
                                <>쿼리스트링 예: <code>?quoteId=00000000-0000-0000-0000-000000000000</code></>
                            )}
                        </div>
                        {quote && (
                            <div className="mt-2 text-xs text-gray-700 space-y-1">
                                <div>견적명: <span className="font-medium text-blue-600">{quote?.title}</span></div>
                                <div>상태: <span className="text-orange-600">{quote?.status}</span></div>
                            </div>
                        )}

                        <div className="mt-4 border-t pt-3">
                            <h5 className="text-sm font-medium text-gray-700 mb-2">상세 서비스 정보</h5>
                            <div className="text-xs text-gray-400">좌측에서 확인하세요</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function ManagerComprehensiveQuotePage() {
    return (
        <Suspense fallback={
            <ManagerLayout title="전체 견적" activeTab="quotes-comprehensive">
                <div className="flex flex-col justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                    <p className="text-gray-600">로딩 중...</p>
                </div>
            </ManagerLayout>
        }>
            <ManagerLayout title="전체 견적" activeTab="quotes-comprehensive">
                <ManagerServiceTabs active="comprehensive" />
                <ManagerComprehensiveQuoteForm />
            </ManagerLayout>
        </Suspense>
    );
}
