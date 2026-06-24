'use client';

import { useState, useEffect, Suspense, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '../../../../lib/supabase';
import { refreshAuthBeforeSubmit } from '../../../../lib/authHelpers';
import { useLoadingTimeout } from '../../../../hooks/useLoadingTimeout';
import PageWrapper from '../../../../components/PageWrapper';
import {
    CruisePriceCalculator,
    CruiseRateCard,
    CruiseTourOption,
    SelectedTourOption,
    formatVND,
} from '../../../../lib/cruisePriceCalculator';

const calculator = new CruisePriceCalculator(supabase);

const hasOriginalPrice = (currentPrice: number | null | undefined, originalPrice: number | null | undefined) => {
    return typeof currentPrice === 'number'
        && typeof originalPrice === 'number'
        && originalPrice > 0
        && originalPrice !== currentPrice;
};

type RoomSelection = {
    local_id: string;
    rate_card_id: string;
    room_type: string;
    adult_count: number;
    child_count: number;
    child_extra_bed_count: number;
    infant_count: number;
    extra_bed_count: number;
    single_count: number;
    room_count: number;
};

type MultiRoomPriceResult = {
    room_results: Array<{
        selection: RoomSelection;
        rate_card: CruiseRateCard;
        price_breakdown: Record<string, any>;
        subtotal: number;
        surcharge_total: number;
        room_multiplier: number;
        total: number;
    }>;
    subtotal: number;
    surcharge_total: number;
    option_total: number;
    grand_total: number;
    total_room_count: number;
    total_adult_count: number;
    total_child_count: number;
    total_child_extra_bed_count: number;
    total_infant_count: number;
    total_extra_bed_count: number;
    total_single_count: number;
    total_effective_adult_count: number;
    total_effective_child_count: number;
    total_pax: number;
    price_breakdown: Record<string, any>;
    primary_rate_card: CruiseRateCard;
};

const normalizeScheduleLabel = (scheduleType?: string | null) => {
    if (!scheduleType) return '';
    if (scheduleType === '1N2D') return '1박2일';
    if (scheduleType === '2N3D') return '2박3일';
    if (scheduleType === 'DAY') return '당일';
    return scheduleType;
};

const createRoomSelection = (idSeed?: string): RoomSelection => ({
    local_id: idSeed || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    rate_card_id: '',
    room_type: '',
    adult_count: 2,
    child_count: 0,
    child_extra_bed_count: 0,
    infant_count: 0,
    extra_bed_count: 0,
    single_count: 0,
    room_count: 1,
});

function StepperNumberInput({
    value,
    min = 0,
    max,
    placeholder,
    onChange,
    className = '',
}: {
    value: number;
    min?: number;
    max?: number;
    placeholder?: string;
    onChange: (value: number) => void;
    className?: string;
}) {
    const clamp = (next: number) => {
        if (Number.isNaN(next)) return min;
        let v = next;
        if (v < min) v = min;
        if (typeof max === 'number' && v > max) v = max;
        return v;
    };

    return (
        <div className={`flex items-center justify-center gap-3 ${className}`}>
            <button
                type="button"
                onClick={() => onChange(clamp((value || 0) - 1))}
                className="w-9 h-9 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100 text-lg leading-none"
                aria-label="감소"
            >
                -
            </button>
            <span className="w-10 text-center font-semibold text-gray-800" aria-label={placeholder || '수량'}>{value || 0}</span>
            <button
                type="button"
                onClick={() => onChange(clamp((value || 0) + 1))}
                className="w-9 h-9 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100 text-lg leading-none"
                aria-label="증가"
            >
                +
            </button>
        </div>
    );
}

function DirectBookingCruiseContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const quoteId = searchParams.get('quoteId');
    const isEditMode = searchParams.get('edit') === 'true';
    const safeQuoteId = useMemo(() => {
        if (!quoteId) return null;
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(quoteId)
            ? quoteId
            : null;
    }, [quoteId]);

    // 기존 예약 데이터 (수정 모드용)
    const [existingReservationId, setExistingReservationId] = useState<string | null>(null);
    const [editDataLoaded, setEditDataLoaded] = useState(false);

    // ── 크루즈 예약 폼 상태 ──
    const [form, setForm] = useState({
        checkin: '',
        schedule: '',
        cruise_name: '',
        // 요청사항
        room_request_note: '',
        window_seat_request: false,
        connecting_room: false,
        birthday_event: false,
        birthday_name: '',
        child_extra_bed_count: 0,
    });

    // ── 객실(다중) 폼 상태 ──
    const [roomSelections, setRoomSelections] = useState<RoomSelection[]>([createRoomSelection('room-1')]);

    // ── 옵션 데이터 ──
    const [cruiseOptions, setCruiseOptions] = useState<string[]>([]);
    const [roomTypeCards, setRoomTypeCards] = useState<CruiseRateCard[]>([]);

    // 당일투어 옵션
    const [tourOptions, setTourOptions] = useState<CruiseTourOption[]>([]);
    const [selectedTourOptions, setSelectedTourOptions] = useState<SelectedTourOption[]>([]);

    // cruise_rate_card_inclusions
    const [rateCardInclusions, setRateCardInclusions] = useState<Record<string, string[]>>({});

    // cruise_info 상세 정보
    const [cruiseInfoList, setCruiseInfoList] = useState<any[]>([]);
    const [showItinerary, setShowItinerary] = useState(false);
    const [showCancelPolicy, setShowCancelPolicy] = useState(false);

    // 일정 옵션
    const scheduleOptions = ['1박2일', '2박3일', '당일'];

    const isCatherineHorizonCruise = useMemo(
        () => form.cruise_name === '캐서린 호라이즌 크루즈',
        [form.cruise_name]
    );

    const isDayCruise = useMemo(
        () => form.schedule === '당일',
        [form.schedule]
    );

    const isDolphinDayCruise = useMemo(
        () => isDayCruise && form.cruise_name === '돌핀 하롱 크루즈',
        [isDayCruise, form.cruise_name]
    );

    const dolphinDayType = useMemo(() => {
        if (!form.checkin) return '';
        const day = new Date(form.checkin).getDay();
        const isWeekend = day === 5 || day === 6 || day === 0;
        return isWeekend ? '주말' : '평일';
    }, [form.checkin]);

    // ── 가격 계산 결과 ──
    const [priceResult, setPriceResult] = useState<MultiRoomPriceResult | null>(null);
    const [priceLoading, setPriceLoading] = useState(false);

    // ── 로딩/UI 상태 ──
    const [loading, setLoading] = useState(false);
    const [user, setUser] = useState<any>(null);

    // 로딩 안전 타임아웃 (60초)
    useLoadingTimeout(loading, setLoading);

    // 아동 생년월일 관련 상태
    const [isChildBirthDateModalOpen, setIsChildBirthDateModalOpen] = useState(false);
    const [childBirthDates, setChildBirthDates] = useState<string[]>(['', '', '']);
    const [tempChildBirthDates, setTempChildBirthDates] = useState<string[]>(['', '', '']);
    const [childCount, setChildCount] = useState(1);

    // 유아 생년월일 관련 상태
    const [isInfantBirthDateModalOpen, setIsInfantBirthDateModalOpen] = useState(false);
    const [infantBirthDates, setInfantBirthDates] = useState<string[]>(['', '', '']);
    const [tempInfantBirthDates, setTempInfantBirthDates] = useState<string[]>(['', '', '']);
    const [infantCount, setInfantCount] = useState(1);

    // 아동 엑스트라베드 생년월일 관련 상태
    const [isChildExtraBedBirthDateModalOpen, setIsChildExtraBedBirthDateModalOpen] = useState(false);
    const [childExtraBedBirthDates, setChildExtraBedBirthDates] = useState<string[]>(['', '', '']);
    const [tempChildExtraBedBirthDates, setTempChildExtraBedBirthDates] = useState<string[]>(['', '', '']);
    const [childExtraBedCount, setChildExtraBedCount] = useState(1);

    // ── 인증 (MyPageLayout이 인증 가드를 담당. 여기서는 user state만 동기화) ──
    useEffect(() => {
        let cancelled = false;
        const editMode = isEditMode && quoteId;

        // 1. 현재 세션 즉시 확인 (로컬 캐시 → 네트워크 호출 없음)
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (cancelled) return;
            if (session?.user) {
                setUser(session.user);
                if (editMode) loadExistingReservation(session.user.id);
            }
            // 세션 없어도 /login으로 강제 이동하지 않음 → MyPageLayout이 처리
        });

        // 2. 토큰 갱신/로그아웃 등 변화 자동 반영
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (cancelled) return;
            if (session?.user) setUser(session.user);
        });

        return () => {
            cancelled = true;
            try { subscription?.unsubscribe?.(); } catch { /* noop */ }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── 기존 예약 데이터 로드 (수정 모드) ──
    const loadExistingReservation = async (userId: string) => {
        try {
            // 해당 quoteId의 크루즈 예약 조회
            const { data: reservation, error: resError } = await supabase
                .from('reservation')
                .select('re_id, re_status, price_breakdown')
                .eq('re_user_id', userId)
                .eq('re_quote_id', quoteId)
                .eq('re_type', 'cruise')
                .order('re_created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (resError || !reservation) {
                console.warn('기존 예약 조회 실패:', resError);
                return;
            }

            setExistingReservationId(reservation.re_id);

            // reservation_cruise 상세 조회 (안내용 - 첫 행 기준)
            const { data: cruiseData, error: cruiseError } = await supabase
                .from('reservation_cruise')
                .select('*')
                .eq('reservation_id', reservation.re_id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (cruiseError || !cruiseData) {
                console.warn('크루즈 예약 상세 조회 실패:', cruiseError);
                return;
            }

            // cruise_rate_card 정보 조회
            let cruiseName = '';
            let roomType = '';
            let schedule = '';
            if (cruiseData.room_price_code) {
                const { data: rateCard } = await supabase
                    .from('cruise_rate_card')
                    .select('cruise_name, room_type, schedule_type')
                    .eq('id', cruiseData.room_price_code)
                    .maybeSingle();
                if (rateCard) {
                    cruiseName = rateCard.cruise_name || '';
                    roomType = rateCard.room_type || '';
                    schedule = normalizeScheduleLabel(rateCard.schedule_type);
                }
            }

            const restoredSelections = Array.isArray((reservation as any)?.price_breakdown?.room_selections)
                ? (reservation as any).price_breakdown.room_selections as any[]
                : [];

            if (!cruiseName && restoredSelections.length > 0) {
                cruiseName = String((reservation as any)?.price_breakdown?.cruise_name || '');
            }
            if (!schedule && restoredSelections.length > 0) {
                schedule = normalizeScheduleLabel((reservation as any)?.price_breakdown?.schedule);
            }
            if (!roomType && restoredSelections.length > 0) {
                roomType = String(restoredSelections[0]?.room_type || '');
            }

            const normalizedSelections: RoomSelection[] = restoredSelections
                .map((s: any, idx: number) => ({
                    local_id: `loaded-${idx + 1}`,
                    rate_card_id: s.rate_card_id || '',
                    room_type: s.room_type || '',
                    adult_count: Number(s.adult_count ?? 2),
                    child_count: Number(s.child_count ?? 0),
                    child_extra_bed_count: Number(s.child_extra_bed_count ?? 0),
                    infant_count: Number(s.infant_count ?? 0),
                    extra_bed_count: Number(s.extra_bed_count ?? 0),
                    single_count: Number(s.single_count ?? 0),
                    room_count: Math.max(1, Number(s.room_count ?? 1)),
                }))
                .filter((s) => !!s.rate_card_id || !!s.room_type);

            const fallbackSelection: RoomSelection = {
                local_id: 'loaded-1',
                rate_card_id: cruiseData.room_price_code || '',
                room_type: roomType || '',
                adult_count: Number(cruiseData.adult_count ?? 2),
                child_count: Number(cruiseData.child_count ?? 0),
                child_extra_bed_count: Number(cruiseData.child_extra_bed_count ?? 0),
                infant_count: Number(cruiseData.infant_count ?? 0),
                extra_bed_count: Number(cruiseData.extra_bed_count ?? 0),
                single_count: Number(cruiseData.single_count ?? 0),
                room_count: Math.max(1, Number(cruiseData.room_count ?? 1)),
            };

            setRoomSelections(normalizedSelections.length > 0 ? normalizedSelections : [fallbackSelection]);

            // 폼 데이터 설정
            setForm(prev => ({
                ...prev,
                checkin: cruiseData.checkin || '',
                schedule: schedule,
                cruise_name: cruiseName,
                room_request_note: cruiseData.request_note || '',
                window_seat_request: (cruiseData.request_note || '').includes('[창가석 요청]'),
                connecting_room: cruiseData.connecting_room || false,
                birthday_event: cruiseData.birthday_event || false,
                birthday_name: cruiseData.birthday_name || '',
            }));

            // 아동 엑스트라베드 생년월일 복원 (request_note에서 파싱)
            if (cruiseData.request_note && cruiseData.request_note.includes('[아동 엑스트라베드]')) {
                const lines = cruiseData.request_note.split('\n');
                const startIdx = lines.findIndex(l => l.includes('[아동 엑스트라베드]'));
                if (startIdx !== -1) {
                    const birthDateLines = lines.slice(startIdx + 1).filter(l => l.match(/아동\d+:/));
                    const dates = birthDateLines.map(l => {
                        const parts = l.split(': ');
                        return parts[1] ? parts[1].trim() : '';
                    }).filter(d => d);
                    if (dates.length > 0) {
                        setChildExtraBedBirthDates(dates);
                        setChildExtraBedCount(dates.length);
                    }
                }
            }

            setEditDataLoaded(true);
            console.log('✅ 기존 예약 데이터 로드 완료');
        } catch (error) {
            console.error('기존 예약 데이터 로드 오류:', error);
        }
    };

    // ── 크루즈 옵션 로드 (cruise_rate_card 기반) ──
    useEffect(() => {
        if (form.schedule && form.checkin) {
            loadCruiseOptions();
        } else {
            setCruiseOptions([]);
            if (form.cruise_name) setForm(prev => ({ ...prev, cruise_name: '' }));
            // 당일이 아니면 창가석 요청 초기화
            if (form.schedule !== '당일') {
                setForm(prev => ({ ...prev, window_seat_request: false }));
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [form.schedule, form.checkin]);

    // ── 객실 타입 로드 (cruise_rate_card 기반) ──
    useEffect(() => {
        if (form.schedule && form.checkin && form.cruise_name) {
            loadRoomTypes();
            loadCruiseInfo();
            // 당일투어인 경우 옵션 로드
            if (form.schedule === '당일') {
                loadTourOptions();
            } else {
                setTourOptions([]);
                setSelectedTourOptions([]);
            }
        } else {
            setRoomTypeCards([]);
            setTourOptions([]);
            setSelectedTourOptions([]);
            setCruiseInfoList([]);
            setRoomSelections([createRoomSelection('room-reset')]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [form.schedule, form.checkin, form.cruise_name]);

    // ── 가격 자동 계산 (인원수 변경 시) ──
    useEffect(() => {
        const hasValidRoom = roomSelections.some((s) => s.rate_card_id && (isCatherineHorizonCruise || s.room_count > 0));
        if (form.cruise_name && hasValidRoom && form.checkin && form.schedule) {
            calculatePrice();
        } else {
            setPriceResult(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        form.cruise_name, form.checkin, form.schedule,
        JSON.stringify(roomSelections),
        selectedTourOptions,
        isCatherineHorizonCruise,
    ]);

    // ── 데이터 로드 함수들 ──

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
        // 가격이 낮은 순으로 정렬
        const sortedCards = [...cards].sort((a, b) => (a.price_adult || 0) - (b.price_adult || 0));
        setRoomTypeCards(sortedCards);

        if (sortedCards.length > 0) {
            setRoomSelections((prev) => prev.map((selection) => {
                const currentCard = sortedCards.find((card) => card.id === selection.rate_card_id);
                if (currentCard) {
                    if (selection.room_type === currentCard.room_type) return selection;
                    return { ...selection, room_type: currentCard.room_type };
                }

                const fallbackCard = sortedCards.find((card) => card.room_type === selection.room_type);
                if (!fallbackCard) return selection;

                return {
                    ...selection,
                    rate_card_id: fallbackCard.id,
                    room_type: fallbackCard.room_type,
                };
            }));
        }

        // 포함사항 로드
        if (sortedCards.length > 0) {
            const rateCardIds = sortedCards.map((c) => c.id);
            const { data: inclusions } = await supabase
                .from('cruise_rate_card_inclusions')
                .select('rate_card_id, inclusion_text, display_order')
                .in('rate_card_id', rateCardIds)
                .order('display_order');
            if (inclusions) {
                const map: Record<string, string[]> = {};
                for (const inc of inclusions) {
                    if (!map[inc.rate_card_id]) map[inc.rate_card_id] = [];
                    map[inc.rate_card_id].push(inc.inclusion_text);
                }
                setRateCardInclusions(map);
            }
        } else {
            setRateCardInclusions({});
        }
    }, [form.schedule, form.checkin, form.cruise_name]);

    useEffect(() => {
        if (!isDolphinDayCruise || roomTypeCards.length === 0) return;

        const matched = roomTypeCards.find((card) => {
            const roomType = String(card.room_type || '');
            const seasonName = String(card.season_name || '');
            return roomType.includes(dolphinDayType) || seasonName.includes(dolphinDayType);
        }) || roomTypeCards[0];

        if (!matched) return;

        setRoomSelections((prev) => {
            const first = prev[0] || createRoomSelection('day-1');
            return [{
                ...first,
                rate_card_id: matched.id,
                room_type: matched.room_type,
                room_count: 1,
            }];
        });
    }, [isDolphinDayCruise, roomTypeCards, dolphinDayType]);

    useEffect(() => {
        if (!isDayCruise || roomTypeCards.length !== 1) return;

        const onlyOption = roomTypeCards[0];
        setRoomSelections((prev) => {
            const first = prev[0] || createRoomSelection('day-single');
            const alreadySelected =
                prev.length === 1
                && first.rate_card_id === onlyOption.id
                && first.room_count === 1;

            if (alreadySelected) return prev;

            return [{
                ...first,
                rate_card_id: onlyOption.id,
                room_type: onlyOption.room_type,
                room_count: 1,
            }];
        });
    }, [isDayCruise, roomTypeCards]);

    const loadTourOptions = useCallback(async () => {
        const options = await calculator.getTourOptions(form.cruise_name, form.schedule);
        setTourOptions(options);
    }, [form.cruise_name, form.schedule]);

    // ── cruise_info 로드 (크루즈 상세 정보) ──
    const loadCruiseInfo = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('cruise_info')
                .select('*')
                .eq('cruise_name', form.cruise_name)
                .order('display_order');
            if (error) throw error;
            setCruiseInfoList(data || []);
        } catch (error) {
            console.error('cruise_info 로드 실패:', error);
            setCruiseInfoList([]);
        }
    }, [form.cruise_name]);

    const calculatePrice = useCallback(async (cardsOverride?: CruiseRateCard[]) => {
        setPriceLoading(true);
        try {
            const sourceCards = cardsOverride || roomTypeCards;
            const validSelections = roomSelections.filter((s) => s.rate_card_id && (isCatherineHorizonCruise || s.room_count > 0));

            if (validSelections.length === 0) {
                setPriceResult(null);
                return;
            }

            const roomResultsRaw = await Promise.all(
                validSelections.map(async (selection) => {
                    const rateCard = sourceCards.find((card) => card.id === selection.rate_card_id);
                    if (!rateCard) return null;

                    const result = await calculator.calculate({
                        cruise_name: form.cruise_name,
                        schedule: form.schedule,
                        room_type: rateCard.room_type,
                        checkin_date: form.checkin,
                        adult_count: selection.adult_count,
                        child_count: selection.child_count,
                        child_extra_bed_count: selection.child_extra_bed_count,
                        infant_count: selection.infant_count,
                        extra_bed_count: selection.extra_bed_count,
                        single_count: selection.single_count,
                        selected_options: [],
                    });
                    if (!result) return null;

                    // 객실수는 인원/가격 계산과 무관하게 메타데이터로만 저장한다.
                    // 입력된 인원수가 곧 총 인원수이며, 가격은 인원 기준 1회만 합산한다.
                    const baseTotal = result.subtotal + result.surcharge_total;

                    return {
                        selection,
                        rate_card: result.rate_card,
                        price_breakdown: result.price_breakdown,
                        subtotal: result.subtotal,
                        surcharge_total: result.surcharge_total,
                        room_multiplier: 1,
                        total: baseTotal,
                    };
                })
            );

            const room_results = roomResultsRaw.filter(Boolean) as MultiRoomPriceResult['room_results'];
            if (room_results.length === 0) {
                setPriceResult(null);
                return;
            }

            const subtotal = room_results.reduce((sum, r) => sum + r.subtotal, 0);
            const surcharge_total = room_results.reduce((sum, r) => sum + r.surcharge_total, 0);
            const option_total = selectedTourOptions.reduce((sum, opt) => sum + (opt.unit_price * opt.quantity), 0);
            const grand_total = subtotal + surcharge_total + option_total;
            const promotion_savings = room_results.reduce((sum, r) => sum + Number(r.price_breakdown?.promotion_savings || 0), 0);
            const promotion_original_grand_total = promotion_savings > 0 ? grand_total + promotion_savings : null;

            const total_room_count = isCatherineHorizonCruise
                ? 0
                : room_results.reduce((sum, r) => sum + r.selection.room_count, 0);
            // 객실수와 무관하게 입력된 인원수를 그대로 합산한다.
            const total_adult_count = room_results.reduce((sum, r) => sum + r.selection.adult_count, 0);
            const total_child_count = room_results.reduce((sum, r) => sum + r.selection.child_count, 0);
            const total_child_extra_bed_count = room_results.reduce((sum, r) => sum + r.selection.child_extra_bed_count, 0);
            const total_infant_count = room_results.reduce((sum, r) => sum + r.selection.infant_count, 0);
            const total_extra_bed_count = room_results.reduce((sum, r) => sum + r.selection.extra_bed_count, 0);
            const total_single_count = room_results.reduce((sum, r) => sum + r.selection.single_count, 0);
            const appliedPromotions = Array.from(new Set(
                room_results
                    .map((r) => r.rate_card.promotion_code)
                    .filter(Boolean)
            ));

            const total_effective_adult_count = total_adult_count + total_extra_bed_count;
            const total_effective_child_count = total_child_count + total_child_extra_bed_count;
            const total_pax = total_effective_adult_count + total_effective_child_count + total_infant_count;

            const price_breakdown = {
                mode: 'multi_room',
                room_selections: room_results.map((r) => ({
                    rate_card_id: r.rate_card.id,
                    room_type: r.rate_card.room_type,
                    room_count: isCatherineHorizonCruise ? null : r.selection.room_count,
                    adult_count: r.selection.adult_count,
                    child_count: r.selection.child_count,
                    child_extra_bed_count: r.selection.child_extra_bed_count,
                    infant_count: r.selection.infant_count,
                    extra_bed_count: r.selection.extra_bed_count,
                    single_count: r.selection.single_count,
                    subtotal_per_room: r.subtotal,
                    surcharge_per_room: r.surcharge_total,
                    total_for_selection: r.total,
                    is_promotion: r.rate_card.is_promotion,
                    promotion_code: r.rate_card.promotion_code || null,
                    promotion_name: r.rate_card.promotion_name || null,
                    promotion_quota_remaining: r.rate_card.promotion_quota_remaining ?? null,
                    promotion_original_subtotal: r.price_breakdown?.promotion_original_subtotal ?? null,
                    promotion_original_grand_total: r.price_breakdown?.promotion_original_grand_total ?? null,
                    promotion_savings: r.price_breakdown?.promotion_savings || 0,
                })),
                selected_options: selectedTourOptions,
                subtotal,
                surcharge_total,
                option_total,
                grand_total,
                total_room_count,
                total_pax,
                total_effective_adult_count,
                total_effective_child_count,
                total_infant_count,
                promotion_code: appliedPromotions[0] || null,
                applied_promotions: appliedPromotions,
                promotion_savings,
                promotion_original_grand_total,
            };

            setPriceResult({
                room_results,
                subtotal,
                surcharge_total,
                option_total,
                grand_total,
                total_room_count,
                total_adult_count,
                total_child_count,
                total_child_extra_bed_count,
                total_infant_count,
                total_extra_bed_count,
                total_single_count,
                total_effective_adult_count,
                total_effective_child_count,
                total_pax,
                price_breakdown,
                primary_rate_card: room_results[0].rate_card,
            });
        } catch (error) {
            console.error('가격 계산 실패:', error);
            setPriceResult(null);
        } finally {
            setPriceLoading(false);
        }
    }, [form.cruise_name, form.schedule, form.checkin, roomSelections, roomTypeCards, selectedTourOptions, isCatherineHorizonCruise]);

    const refreshRatesAfterPromotionSoldOut = useCallback(async () => {
        const cards = await calculator.getRoomTypes({
            schedule: form.schedule,
            checkin_date: form.checkin,
            cruise_name: form.cruise_name,
        });
        const sortedCards = [...cards].sort((a, b) => (a.price_adult || 0) - (b.price_adult || 0));
        setRoomTypeCards(sortedCards);
        await calculatePrice(sortedCards);
        alert('프로모션 선착순이 마감되어 기본요금으로 전환되었습니다. 금액을 확인 후 다시 저장해 주세요.');
    }, [form.schedule, form.checkin, form.cruise_name, calculatePrice]);

    const claimPromotionForReservation = useCallback(async (
        promotionCode: string,
        reservationId: string,
        metadata: Record<string, any>
    ) => {
        // 신선한 토큰 확보: getSession → 토큰 없으면 refreshSession 1회 시도.
        // 토큰이 없어도 서버가 예약 소유자 기준으로 처리하므로 그대로 진행한다.
        let accessToken: string | null = null;
        try {
            const { data: { session } } = await supabase.auth.getSession();
            accessToken = session?.access_token || null;
            if (!accessToken) {
                const { data } = await supabase.auth.refreshSession();
                accessToken = data.session?.access_token || null;
            }
        } catch {
            accessToken = null;
        }

        const response = await fetch('/api/cruise-promotion/claim', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            },
            body: JSON.stringify({
                promotionCode,
                reservationId,
                metadata,
            }),
        });

        const claim = await response.json().catch(() => null);
        if (response.ok && claim?.claimed) {
            return { ok: true, claim, claimError: null };
        }
        return { ok: false, claim, claimError: response.ok ? null : claim };
    }, []);

    const updateRoomSelection = useCallback((localId: string, patch: Partial<RoomSelection>) => {
        setRoomSelections((prev) => prev.map((room) => room.local_id === localId ? { ...room, ...patch } : room));
    }, []);

    const addRoomSelection = useCallback(() => {
        setRoomSelections((prev) => {
            if (prev.length >= 6) return prev;
            return [...prev, createRoomSelection()];
        });
    }, []);

    const removeRoomSelection = useCallback((localId: string) => {
        setRoomSelections((prev) => {
            if (prev.length <= 1) return prev;
            return prev.filter((room) => room.local_id !== localId);
        });
    }, []);

    const hasSelectedRooms = useMemo(
        () => roomSelections.some((s) => !!s.rate_card_id && (isCatherineHorizonCruise || s.room_count > 0)),
        [roomSelections, isCatherineHorizonCruise]
    );

    // ── 대표 객실(첫 번째 선택 객실) 요금 카드 ──
    const selectedRateCard = useMemo(() => {
        const first = roomSelections.find((s) => !!s.rate_card_id);
        if (!first) return null;
        return roomTypeCards.find((card) => card.id === first.rate_card_id) || null;
    }, [roomSelections, roomTypeCards]);

    const selectedPromotionCode = priceResult?.price_breakdown?.promotion_code || null;
    const selectedPromotionSavings = Number(priceResult?.price_breakdown?.promotion_savings || 0);
    const selectedPromotionOriginalTotal = Number(priceResult?.price_breakdown?.promotion_original_grand_total || 0);
    const selectedPromotionNames = useMemo(() => {
        if (!priceResult) return [];
        return Array.from(new Set(priceResult.room_results.map((r) => r.rate_card.promotion_name).filter(Boolean))) as string[];
    }, [priceResult]);

    // ── 객실별 cruise_info 매칭 (한글/영문 room_type 모두 지원) ──
    const getCruiseInfoForRoom = useCallback((roomType: string, roomTypeEn?: string) => {
        if (!cruiseInfoList.length) return null;
        // 1. room_name 정확 매칭
        let found = cruiseInfoList.find(info => info.room_name === roomType);
        if (found) return found;
        // 2. room_type_en으로 정확 매칭
        if (roomTypeEn) {
            found = cruiseInfoList.find(info => info.room_name === roomTypeEn);
            if (found) return found;
            // 3. room_type_en 부분 매칭 - 가장 긴 매칭 우선 (longest match)
            const enLower = roomTypeEn.toLowerCase();
            let bestMatch: (typeof cruiseInfoList)[0] | null = null;
            let bestLen = 0;
            cruiseInfoList.forEach(info => {
                const infoName = (info.room_name || '').toLowerCase();
                if (enLower.includes(infoName) || infoName.includes(enLower)) {
                    if (infoName.length > bestLen) {
                        bestLen = infoName.length;
                        bestMatch = info;
                    }
                }
            });
            if (bestMatch) return bestMatch;
        }
        // 4. 한글 room_type 부분 매칭 - 가장 긴 매칭 우선
        const typeLower = roomType.toLowerCase();
        let bestMatchKr: (typeof cruiseInfoList)[0] | null = null;
        let bestLenKr = 0;
        cruiseInfoList.forEach(info => {
            const infoName = (info.room_name || '').toLowerCase();
            if (infoName.includes(typeLower) || typeLower.includes(infoName)) {
                if (infoName.length > bestLenKr) {
                    bestLenKr = infoName.length;
                    bestMatchKr = info;
                }
            }
        });
        return bestMatchKr || null;
    }, [cruiseInfoList]);

    // ── 크루즈 공통 정보 (첫 번째 행에서 추출) ──
    const cruiseCommonInfo = useMemo(() => {
        if (cruiseInfoList.length === 0) return null;
        const first = cruiseInfoList[0];
        return {
            description: first.description,
            star_rating: first.star_rating,
            capacity: first.capacity,
            awards: first.awards,
            itinerary: first.itinerary,
            cancellation_policy: first.cancellation_policy,
            inclusions: first.inclusions,
            exclusions: first.exclusions,
            facilities: first.facilities,
            features: first.features,
        };
    }, [cruiseInfoList]);

    // ── 예약 제출 ──
    const handleReservationSubmit = async (e: React.FormEvent, mode: 'skip' | 'continue' = 'continue') => {
        e.preventDefault();
        try {
            setLoading(true);

            // 세션 유효성 확인 (만료 시 자동 갱신 시도)
            const { user: freshUser, error: authError } = await refreshAuthBeforeSubmit();
            if (authError || !freshUser) {
                alert('세션이 만료되었습니다. 페이지를 새로고침 해주세요.');
                return;
            }

            if (!user) {
                alert('로그인이 필요합니다.');
                return;
            }

            if (!priceResult) {
                alert('가격 정보를 확인할 수 없습니다. 객실 선택을 다시 확인해주세요.');
                return;
            }

            if (!hasSelectedRooms) {
                alert('최소 1개 객실을 선택해주세요.');
                return;
            }

            // 사용자 역할 업데이트
            const { data: existingUser } = await supabase
                .from('users')
                .select('id, role, name')
                .eq('id', user.id)
                .single();

            if (!existingUser || existingUser.role === 'guest') {
                await supabase
                    .from('users')
                    .upsert({
                        id: user.id,
                        email: user.email,
                        role: 'member',
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'id' });
            }

            const effectiveAdultCount = priceResult.total_effective_adult_count;
            const effectiveChildCount = priceResult.total_effective_child_count;
            const totalPax = priceResult.total_pax;
            const finalTotalAmount = priceResult!.grand_total;

            // ⚠️ 객실 구성 정보(roomCompositionLines)는 제거됨
            // accommodation_info JSON에 이미 모든 객실 정보가 저장되므로, 
            // request_note에는 사용자 입력 요청사항만 저장

            const sharedRequestNote = [
                form.room_request_note || '',
                ...(form.connecting_room ? ['커넥팅룸 신청'] : []),
                ...(form.birthday_event && form.birthday_name
                    ? [`생일이벤트 신청-생일 당사자 영문성함: ${form.birthday_name}`]
                    : []),
                ...(form.window_seat_request ? ['[창가석 요청]'] : []),
                ...(priceResult.total_child_extra_bed_count > 0 && childExtraBedBirthDates.some(d => d)
                    ? ['[아동 엑스트라베드]', ...childExtraBedBirthDates.filter(d => d).map((d, i) =>
                        `아동${i + 1}: ${d}`
                    )]
                    : []),
                ...(priceResult.total_infant_count > 0 && infantBirthDates.some(d => d)
                    ? ['[유아 생년월일]', ...infantBirthDates.filter(d => d).map((d, i) =>
                        `유아${i + 1}: ${d}`
                    )]
                    : []),
                ...(selectedTourOptions.length > 0
                    ? ['[당일투어 선택옵션]', ...selectedTourOptions.map(opt =>
                        `- ${opt.option_name} x${opt.quantity} = ${formatVND(opt.unit_price * opt.quantity)}`
                    )]
                    : []),
            ].filter(Boolean).join('\n');

            // ===== 수정 모드: 기존 예약 업데이트 =====
            // ── reservation_cruise 다중 행 생성: 객실(room_results)별로 1행씩 ──
            const buildCruiseRows = (reservationId: string) => {
                const accommodationInfoJson = JSON.stringify(priceResult!.price_breakdown.room_selections);
                return priceResult!.room_results.map((r, idx) => {
                    const isPrimary = idx === 0;
                    return {
                        reservation_id: reservationId,
                        room_price_code: r.rate_card.id,
                        checkin: form.checkin,
                        guest_count: r.selection.adult_count + r.selection.child_count + r.selection.child_extra_bed_count + r.selection.infant_count + r.selection.extra_bed_count + r.selection.single_count,
                        adult_count: r.selection.adult_count,
                        child_count: r.selection.child_count,
                        child_extra_bed_count: r.selection.child_extra_bed_count,
                        infant_count: r.selection.infant_count,
                        extra_bed_count: r.selection.extra_bed_count,
                        single_count: r.selection.single_count,
                        room_count: isCatherineHorizonCruise ? null : r.selection.room_count,
                        unit_price: r.rate_card.price_adult,
                        room_total_price: r.total,
                        connecting_room: isPrimary ? form.connecting_room : false,
                        birthday_event: isPrimary ? form.birthday_event : false,
                        birthday_name: isPrimary ? (form.birthday_name || null) : null,
                        accommodation_info: isPrimary ? accommodationInfoJson : null,
                        request_note: isPrimary ? sharedRequestNote : null,
                    };
                });
            };

            if (isEditMode && existingReservationId) {
                // reservation 테이블 업데이트
                const { error: updateResError } = await supabase
                    .from('reservation')
                    .update({
                        total_amount: finalTotalAmount,
                        pax_count: totalPax,
                        re_adult_count: effectiveAdultCount,
                        re_child_count: effectiveChildCount,
                        re_infant_count: priceResult.total_infant_count,
                        reservation_date: form.checkin,
                        price_breakdown: priceResult!.price_breakdown,
                    })
                    .eq('re_id', existingReservationId);

                if (updateResError) throw updateResError;

                // 기존 reservation_cruise 행 모두 삭제 후 객실 수 만큼 재삽입
                const { error: deleteCruiseError } = await supabase
                    .from('reservation_cruise')
                    .delete()
                    .eq('reservation_id', existingReservationId);
                if (deleteCruiseError) throw deleteCruiseError;

                const cruiseRows = buildCruiseRows(existingReservationId);
                const { error: insertCruiseError } = await supabase
                    .from('reservation_cruise')
                    .insert(cruiseRows);
                if (insertCruiseError) throw insertCruiseError;

                if (priceResult!.price_breakdown?.promotion_code) {
                    const { ok, claim, claimError } = await claimPromotionForReservation(
                        priceResult!.price_breakdown.promotion_code,
                        existingReservationId,
                        {
                            source: 'customer_direct_booking_cruise_edit',
                            checkin: form.checkin,
                            schedule: form.schedule,
                            cruise_name: form.cruise_name,
                            total_price: finalTotalAmount,
                        }
                    );

                    if (claim?.reason === 'quota_exhausted') {
                        await refreshRatesAfterPromotionSoldOut();
                        return;
                    }
                    if (!ok) {
                        console.warn('프로모션 claim 실패(edit, 예약 저장은 계속):', { claimError, claim, reservationId: existingReservationId });
                    }
                }

                // ── 차량 예약은 별도 페이지(/cruise/vehicle)에서 처리 ──

                if (mode === 'continue') {
                    router.push(`/mypage/direct-booking/cruise/vehicle?reservationId=${existingReservationId}&quoteId=${quoteId || ''}`);
                } else {
                    alert('예약이 성공적으로 수정되었습니다!');
                    router.push('/mypage/direct-booking?completed=cruise');
                }
                return;
            }

            // ===== 신규 모드: 새 예약 생성 =====
            const { data: newReservation, error: reservationError } = await supabase
                .from('reservation')
                .insert({
                    re_user_id: user.id,
                    re_quote_id: safeQuoteId,
                    re_type: 'cruise',
                    re_status: 'pending',
                    re_created_at: new Date().toISOString(),
                    total_amount: finalTotalAmount,
                    pax_count: totalPax,
                    re_adult_count: effectiveAdultCount,
                    re_child_count: effectiveChildCount,
                    re_infant_count: priceResult.total_infant_count,
                    reservation_date: form.checkin,
                    price_breakdown: priceResult!.price_breakdown,
                })
                .select()
                .single();

            if (reservationError) throw reservationError;

            // reservation_cruise 다중 행 저장 (객실 수 만큼)
            const cruiseRows = buildCruiseRows(newReservation.re_id);
            const { error: cruiseError } = await supabase
                .from('reservation_cruise')
                .insert(cruiseRows);

            if (cruiseError) throw cruiseError;

            if (priceResult!.price_breakdown?.promotion_code) {
                const { ok, claim, claimError } = await claimPromotionForReservation(
                    priceResult!.price_breakdown.promotion_code,
                    newReservation.re_id,
                    {
                        source: 'customer_direct_booking_cruise',
                        checkin: form.checkin,
                        schedule: form.schedule,
                        cruise_name: form.cruise_name,
                        total_price: finalTotalAmount,
                    }
                );

                if (claim?.reason === 'quota_exhausted') {
                    await refreshRatesAfterPromotionSoldOut();
                    return;
                }
                if (!ok) {
                    console.warn('프로모션 claim 실패(new, 예약 저장은 계속):', { claimError, claim, reservationId: newReservation.re_id });
                }
            }

            // 크루즈 선착장 정보 조회 (참고용 - 차량 페이지에서 사용)
            // 차량 예약 저장은 별도 페이지(/cruise/vehicle)에서 처리

            // 알림 생성
            try {
                await supabase.rpc('create_reservation_notification', {
                    p_reservation_id: newReservation.re_id,
                    p_user_id: user.id
                });
            } catch (notificationError) {
                console.error('알림 생성 실패:', notificationError);
            }

            if (mode === 'continue') {
                router.push(`/mypage/direct-booking/cruise/vehicle?reservationId=${newReservation.re_id}&quoteId=${quoteId || ''}`);
            } else {
                alert('예약 신청이 완료되었습니다.\n카카오 채널로 연락주세요.\n담당자의 안내에 따라 결제를 진행하셔야 예약이 완료됩니다.\n\n※ 신청서 제출 후 24시간 이내에 카카오톡 채널로 연락주지 않으시면, 신청서는 삭제됩니다.\n\n카카오채널 - http://pf.kakao.com/_zvsxaG/chat');
                router.push('/mypage/direct-booking?completed=cruise');
            }
        } catch (error) {
            console.error('예약 저장 오류:', error);
            alert('예약 저장 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    // 아동 생년월일 저장
    const handleSaveChildBirthDates = async () => {
        const validDates = tempChildBirthDates.filter(date => date !== '');
        if (validDates.length === 0) {
            alert('최소 1명의 생년월일을 입력해주세요.');
            return;
        }
        const infantValidDates = infantBirthDates.filter(d => d);
        const combinedDates = [...validDates, ...infantValidDates];
        if (combinedDates.length > 10) {
            alert('아동+유아 생년월일은 합산 최대 10명까지만 저장할 수 있습니다.');
            return;
        }
        try {
            setChildBirthDates(tempChildBirthDates);
            if (user) {
                await supabase
                    .from('users')
                    .update({ child_birth_dates: combinedDates })
                    .eq('id', user.id);
            }
            setIsChildBirthDateModalOpen(false);
            alert('아동 생년월일이 저장되었습니다.');
        } catch (error) {
            console.error('아동 생년월일 처리 중 오류:', error);
            alert('오류가 발생했습니다.');
        }
    };

    // 유아 생년월일 저장
    const handleSaveInfantBirthDates = async () => {
        const validDates = tempInfantBirthDates.filter(date => date !== '');
        if (validDates.length === 0) {
            alert('최소 1명의 유아 생년월일을 입력해주세요.');
            return;
        }
        const childValidDates = childBirthDates.filter(d => d);
        const combinedDates = [...childValidDates, ...validDates];
        if (combinedDates.length > 10) {
            alert('아동+유아 생년월일은 합산 최대 10명까지만 저장할 수 있습니다.');
            return;
        }
        try {
            setInfantBirthDates(tempInfantBirthDates);
            if (user) {
                await supabase
                    .from('users')
                    .update({ child_birth_dates: combinedDates })
                    .eq('id', user.id);
            }
            setIsInfantBirthDateModalOpen(false);
            alert('유아 생년월일이 저장되었습니다.');
        } catch (error) {
            console.error('유아 생년월일 처리 중 오류:', error);
            alert('오류가 발생했습니다.');
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50">
                <div className="flex flex-col justify-center items-center h-48">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                    <p className="mt-4 text-gray-600">예약 처리 중...</p>
                </div>
            </div>
        );
    }

    // 아동 엑스트라베드 생년월일 모달
    const renderChildExtraBedBirthDateModal = () => {
        if (!isChildExtraBedBirthDateModalOpen) return null;

        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4">
                    <h2 className="text-xl font-bold text-gray-800 mb-4">아동 엑스트라베드 생년월일 입력</h2>
                    <p className="text-sm text-gray-600 mb-4">엑스트라베드 아동 {childExtraBedCount}명의 생년월일을 입력해주세요.</p>
                    <div className="space-y-3 max-h-80 overflow-y-auto">
                        {Array.from({ length: childExtraBedCount }).map((_, idx) => (
                            <div key={idx}>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                    아동 {idx + 1} 생년월일
                                </label>
                                <input
                                    type="date"
                                    value={tempChildExtraBedBirthDates[idx] || ''}
                                    onChange={(e) => {
                                        const updated = [...tempChildExtraBedBirthDates];
                                        updated[idx] = e.target.value;
                                        setTempChildExtraBedBirthDates(updated);
                                    }}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500"
                                />
                            </div>
                        ))}
                    </div>
                    <div className="mt-6 flex gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                setIsChildExtraBedBirthDateModalOpen(false);
                                setForm({ ...form, child_extra_bed_count: 0 });
                            }}
                            className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                        >
                            취소
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setChildExtraBedBirthDates(tempChildExtraBedBirthDates);
                                setIsChildExtraBedBirthDateModalOpen(false);
                            }}
                            className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                        >
                            저장
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <PageWrapper title={`📝 크루즈 ${isEditMode ? '예약 수정' : '예약'}`}>
            {/* 아동 엑스트라베드 생년월일 모달 */}
            {renderChildExtraBedBirthDateModal()}

            {/* 메인 컨텐츠 */}
            <div className="w-full">
                <form onSubmit={(e) => handleReservationSubmit(e, 'continue')} className="space-y-4">

                        <div className="bg-blue-50 rounded-lg p-4 mb-4 border border-blue-200">
                            <p className="text-blue-700 text-sm">
                                체크인 날짜, 일정, 크루즈 선택 객실선택 순서대로 입력해주세요
                            </p>
                        </div>

                        <div className="space-y-4">
                            {/* 체크인 날짜 */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">📅 체크인 날짜</label>
                                <input
                                    type="date"
                                    value={form.checkin}
                                    onChange={e => setForm({ ...form, checkin: e.target.value })}
                                    className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    required
                                />
                            </div>

                            {/* 일정 선택 */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">🗓 일정 선택</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {scheduleOptions.map((option) => (
                                        <button
                                            key={option}
                                            type="button"
                                            onClick={() => setForm({ ...form, schedule: option })}
                                            className={`border p-3 rounded-lg transition-colors ${form.schedule === option ? 'bg-blue-500 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}
                                        >
                                            {option}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* 크루즈 선택 */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">🚢 크루즈 선택</label>
                                <select
                                    value={form.cruise_name}
                                    onChange={e => { setForm({ ...form, cruise_name: e.target.value }); setRoomSelections([createRoomSelection()]); }}
                                    className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    required
                                >
                                    <option value="">크루즈를 선택하세요</option>
                                    {cruiseOptions.map(cruise => (
                                        <option key={cruise} value={cruise}>{cruise}</option>
                                    ))}
                                </select>
                            </div>


                            {/* 객실 선택 (다중) */}
                            {roomTypeCards.length > 0 && (
                                <div className="border border-blue-200 rounded-lg p-4 bg-blue-50/50 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-lg font-semibold text-gray-800">{isDayCruise ? '🎯 기본 옵션' : '🛏 객실 구성'}</h3>
                                    </div>

                                    {!isDayCruise && (
                                        <div className="rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2 text-xs text-yellow-800 space-y-1">
                                            <p>같은 객실을 여러 개 예약할 경우 총 객실수를 입력해 주세요.</p>
                                            <p>객실명이 다른 객실은 객실 추가로 선택해 주세요.</p>
                                            <p>🎁 표시 객실은 프로모션 적용 가능 객실입니다.</p>
                                        </div>
                                    )}

                                    {isDolphinDayCruise && (
                                        <p className="text-xs text-blue-700 bg-blue-100 border border-blue-200 rounded-md px-3 py-2">
                                            체크인 날짜 기준으로 {dolphinDayType === '주말' ? '주말(금·토·일)' : '평일(월·화·수·목)'} 요금이 자동 선택됩니다.
                                        </p>
                                    )}

                                    {roomSelections.map((room, idx) => {
                                        const roomCard = roomTypeCards.find((card) => card.id === room.rate_card_id) || null;
                                        return (
                                            <div key={room.local_id} className="border border-blue-300 rounded-lg bg-white p-4 space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <h4 className="font-semibold text-gray-800">
                                                        {isDayCruise ? (
                                                            `옵션 ${idx + 1}`
                                                        ) : (
                                                            <>
                                                                객실 {idx + 1}
                                                            </>
                                                        )}
                                                    </h4>
                                                    {!isDayCruise && roomSelections.length > 1 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => removeRoomSelection(room.local_id)}
                                                            className="text-red-600 text-sm hover:text-red-700"
                                                        >
                                                            삭제
                                                        </button>
                                                    )}
                                                </div>

                                                <div>
                                                    <label className="block text-xs font-medium text-gray-600 mb-1">{isDayCruise ? '기본 옵션' : '객실명'}</label>
                                                    <select
                                                        value={room.rate_card_id}
                                                        onChange={(e) => {
                                                            const nextId = e.target.value;
                                                            const nextCard = roomTypeCards.find((card) => card.id === nextId);
                                                            updateRoomSelection(room.local_id, {
                                                                rate_card_id: nextId,
                                                                room_type: nextCard?.room_type || '',
                                                            });
                                                        }}
                                                        className="w-full border border-gray-300 p-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                        disabled={isDolphinDayCruise}
                                                    >
                                                        <option value="">{isDayCruise ? '옵션 선택' : '객실명 선택'}</option>
                                                        {roomTypeCards.map((card) => (
                                                            <option key={card.id} value={card.id}>
                                                                {isDayCruise
                                                                    ? `${card.season_name || card.room_type}${card.season_name && card.room_type && card.season_name !== card.room_type ? ` (${card.room_type})` : ''}${card.promotion_code ? ' 🎁' : ''}`
                                                                    : `${card.room_type}${card.promotion_code ? ' 🎁' : ''}`}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    {roomCard?.promotion_code && (
                                                        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                                                            <span className="font-semibold">🎁 {roomCard.promotion_name || '프로모션 적용'}</span>
                                                            <div className="mt-1 text-red-600">
                                                                기존 요금은 참고용이며 계산은 프로모션 요금으로 적용됩니다.
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                {roomCard && (
                                                    <>
                                                        {!isDayCruise && !isCatherineHorizonCruise && (
                                                            <div className="mt-2 border border-gray-300 rounded-lg p-3 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                                                                <label className="text-sm font-semibold text-blue-900">위 객실의 총 객실 수</label>
                                                                <StepperNumberInput
                                                                    min={1}
                                                                    max={20}
                                                                    value={room.room_count}
                                                                    onChange={(value) => updateRoomSelection(room.local_id, { room_count: Math.max(1, value) })}
                                                                    className="w-full max-w-[220px] sm:w-44"
                                                                />
                                                            </div>
                                                        )}

                                                        <div className="space-y-3">
                                                            <div className="border border-gray-300 rounded-lg p-3 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                                                                <div>
                                                                    <label className="text-sm font-medium text-gray-700">성인({formatVND(roomCard.price_adult)}/인)</label>
                                                                    {hasOriginalPrice(roomCard.price_adult, roomCard.original_price_adult) && (
                                                                        <div className="text-xs text-gray-400 line-through">기존 {formatVND(roomCard.original_price_adult)}/인</div>
                                                                    )}
                                                                </div>
                                                                <StepperNumberInput
                                                                    min={0}
                                                                    max={20}
                                                                    value={room.adult_count}
                                                                    onChange={(value) => updateRoomSelection(room.local_id, { adult_count: value })}
                                                                    className="w-full max-w-[220px] sm:w-44"
                                                                />
                                                            </div>

                                                            {roomCard.price_child != null && (
                                                                <div className="border border-gray-300 rounded-lg p-3 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                                                                    <div>
                                                                        <label className="text-sm font-medium text-gray-700">아동 5~11세({formatVND(roomCard.price_child)}/인)</label>
                                                                        {hasOriginalPrice(roomCard.price_child, roomCard.original_price_child) && (
                                                                            <div className="text-xs text-gray-400 line-through">기존 {formatVND(roomCard.original_price_child)}/인</div>
                                                                        )}
                                                                    </div>
                                                                    <StepperNumberInput
                                                                        min={0}
                                                                        max={10}
                                                                        value={room.child_count}
                                                                        onChange={(val) => {
                                                                            updateRoomSelection(room.local_id, { child_count: val });
                                                                            if (val > 0) setIsChildBirthDateModalOpen(true);
                                                                        }}
                                                                        className="w-full max-w-[220px] sm:w-44"
                                                                    />
                                                                </div>
                                                            )}

                                                            {roomCard.price_child_extra_bed != null && roomCard.extra_bed_available && (
                                                                <div className="border border-gray-300 rounded-lg p-3 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                                                                    <div>
                                                                        <label className="text-sm font-medium text-gray-700">아동 엑스트라베드({formatVND(roomCard.price_child_extra_bed)}/인)</label>
                                                                        {hasOriginalPrice(roomCard.price_child_extra_bed, roomCard.original_price_child_extra_bed) && (
                                                                            <div className="text-xs text-gray-400 line-through">기존 {formatVND(roomCard.original_price_child_extra_bed)}/인</div>
                                                                        )}
                                                                    </div>
                                                                    <StepperNumberInput
                                                                        min={0}
                                                                        max={5}
                                                                        value={room.child_extra_bed_count}
                                                                        onChange={(val) => {
                                                                            updateRoomSelection(room.local_id, { child_extra_bed_count: val });
                                                                            if (val > 0) {
                                                                                setChildExtraBedCount(val);
                                                                                setTempChildExtraBedBirthDates([...childExtraBedBirthDates]);
                                                                                setIsChildExtraBedBirthDateModalOpen(true);
                                                                            }
                                                                        }}
                                                                        className="w-full max-w-[220px] sm:w-44"
                                                                    />
                                                                </div>
                                                            )}

                                                            {roomCard.price_infant != null && (
                                                                <div className="border border-gray-300 rounded-lg p-3 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                                                                    <div>
                                                                        <label className="text-sm font-medium text-gray-700">유아 0~4세({formatVND(roomCard.price_infant)}/인)</label>
                                                                        {hasOriginalPrice(roomCard.price_infant, roomCard.original_price_infant) && (
                                                                            <div className="text-xs text-gray-400 line-through">기존 {formatVND(roomCard.original_price_infant)}/인</div>
                                                                        )}
                                                                    </div>
                                                                    <StepperNumberInput
                                                                        min={0}
                                                                        max={5}
                                                                        value={room.infant_count}
                                                                        onChange={(val) => {
                                                                            updateRoomSelection(room.local_id, { infant_count: val });
                                                                            if (val > 0) {
                                                                                setInfantCount(val);
                                                                                setTempInfantBirthDates([...infantBirthDates]);
                                                                                setIsInfantBirthDateModalOpen(true);
                                                                            }
                                                                        }}
                                                                        className="w-full max-w-[220px] sm:w-44"
                                                                    />
                                                                </div>
                                                            )}

                                                            {roomCard.price_extra_bed != null && roomCard.extra_bed_available && (
                                                                <div className="border border-gray-300 rounded-lg p-3 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                                                                    <div>
                                                                        <label className="text-sm font-medium text-gray-700">엑스트라베드({formatVND(roomCard.price_extra_bed)}/인)</label>
                                                                        {hasOriginalPrice(roomCard.price_extra_bed, roomCard.original_price_extra_bed) && (
                                                                            <div className="text-xs text-gray-400 line-through">기존 {formatVND(roomCard.original_price_extra_bed)}/인</div>
                                                                        )}
                                                                    </div>
                                                                    <StepperNumberInput
                                                                        min={0}
                                                                        max={5}
                                                                        value={room.extra_bed_count}
                                                                        onChange={(value) => updateRoomSelection(room.local_id, { extra_bed_count: value })}
                                                                        className="w-full max-w-[220px] sm:w-44"
                                                                    />
                                                                </div>
                                                            )}

                                                            {roomCard.price_single != null && roomCard.single_available && (
                                                                <div className="border border-gray-300 rounded-lg p-3 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                                                                    <div>
                                                                        <label className="text-sm font-medium text-gray-700">싱글차지({formatVND(roomCard.price_single)}/인)</label>
                                                                        {hasOriginalPrice(roomCard.price_single, roomCard.original_price_single) && (
                                                                            <div className="text-xs text-gray-400 line-through">기존 {formatVND(roomCard.original_price_single)}/인</div>
                                                                        )}
                                                                    </div>
                                                                    <StepperNumberInput
                                                                        min={0}
                                                                        max={5}
                                                                        value={room.single_count}
                                                                        onChange={(value) => updateRoomSelection(room.local_id, { single_count: value })}
                                                                        className="w-full max-w-[220px] sm:w-44"
                                                                    />
                                                                </div>
                                                            )}
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        );
                                    })}

                                    {!isDayCruise && (
                                        <div className="pt-1 flex justify-end">
                                            <button
                                                type="button"
                                                onClick={addRoomSelection}
                                                disabled={roomSelections.length >= 6}
                                                className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                                            >
                                                객실명이 다른 객실추가
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {priceResult && (
                                <div className="border border-green-200 rounded-lg p-4 bg-green-50">
                                    {priceResult.surcharge_total > 0 && (
                                        <div className="mt-1 flex justify-between text-sm text-orange-700">
                                            <span>추가요금</span>
                                            <span>{formatVND(priceResult.surcharge_total)}</span>
                                        </div>
                                    )}
                                    {priceResult.option_total > 0 && (
                                        <div className="mt-1 flex justify-between text-sm text-purple-700">
                                            <span>옵션</span>
                                            <span>{formatVND(priceResult.option_total)}</span>
                                        </div>
                                    )}
                                    {selectedPromotionCode && (
                                        <div className="mt-3 rounded-lg border border-red-200 bg-white p-3 text-sm text-red-700">
                                            <div className="font-semibold">
                                                <span>🎁 {selectedPromotionNames.join(', ') || '프로모션 적용'}</span>
                                            </div>
                                            {selectedPromotionSavings > 0 && selectedPromotionOriginalTotal > 0 && (
                                                <div className="mt-2 space-y-1 text-xs">
                                                    <div className="flex justify-between text-red-500">
                                                        <span>정상가 기준</span>
                                                        <span className="line-through">{formatVND(selectedPromotionOriginalTotal)}</span>
                                                    </div>
                                                    <div className="flex justify-between font-semibold text-red-700">
                                                        <span>프로모션 차액</span>
                                                        <span>-{formatVND(selectedPromotionSavings)}</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── 당일투어 선택 옵션 ── */}
                            {form.schedule === '당일' && tourOptions.length > 0 && hasSelectedRooms && (
                                <div className="border border-purple-200 rounded-lg p-4 bg-purple-50/50">
                                    <h3 className="text-lg font-semibold text-gray-800 mb-3">🎯 선택 옵션</h3>
                                    <p className="text-xs text-gray-500 mb-3">원하시는 추가 옵션을 선택하고 수량을 입력하세요.</p>
                                    <div className="space-y-3">
                                        {tourOptions.map((option, index) => {
                                            const optionKey = String(option.option_id ?? option.id ?? `${option.option_name}:${option.option_price}:${index}`);
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
                                                            <div className="text-sm font-semibold text-purple-700">{formatVND(option.option_price)}</div>
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
                                                                = {formatVND(option.option_price * (selected!.quantity))}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}


                            {/* 추가 정보 */}
                            <div className="space-y-4">
                                <h3 className="text-lg font-semibold text-gray-800">📝 추가 정보</h3>

                                {/* 커넥팅룸 신청 */}
                                {(form.schedule === '1박2일' || form.schedule === '2박3일') && (
                                    <div className="border border-gray-300 rounded-lg p-4 space-y-3">
                                        <label className="block text-sm font-medium text-gray-700">커넥팅룸</label>
                                        <p className="text-xs text-gray-600">*침대 타입은 더블 + 트윈으로 고정됨.</p>
                                        <div className="flex gap-3">
                                            <button
                                                type="button"
                                                onClick={() => setForm({ ...form, connecting_room: true })}
                                                className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${form.connecting_room
                                                    ? 'bg-green-500 text-white border-2 border-green-600'
                                                    : 'bg-gray-100 text-gray-700 border-2 border-gray-300 hover:bg-gray-200'
                                                    }`}
                                            >
                                                신청함
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setForm({ ...form, connecting_room: false })}
                                                className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${!form.connecting_room
                                                    ? 'bg-green-500 text-white border-2 border-green-600'
                                                    : 'bg-gray-100 text-gray-700 border-2 border-gray-300 hover:bg-gray-200'
                                                    }`}
                                            >
                                                신청 안함
                                            </button>
                                        </div>
                                        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                            <p className="text-xs text-yellow-800">
                                                *커넥팅 룸 수량은 한정적이기 때문에, 매진인 경우 옆 객실이나 마주보는 객실 등 가까운 객실로 배정됨.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* 생일 이벤트 신청 */}
                                {(form.schedule === '1박2일' || form.schedule === '2박3일') && (
                                    <div className="border border-gray-300 rounded-lg p-4 space-y-3">
                                        <label className="block text-sm font-medium text-gray-700">생일 이벤트</label>
                                        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                            <p className="text-xs text-yellow-800">* 100만동의 유료 서비스 입니다.</p>
                                        </div>
                                        <div className="flex gap-3">
                                            <button
                                                type="button"
                                                onClick={() => setForm({ ...form, birthday_event: true })}
                                                className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${form.birthday_event
                                                    ? 'bg-green-500 text-white border-2 border-green-600'
                                                    : 'bg-gray-100 text-gray-700 border-2 border-gray-300 hover:bg-gray-200'
                                                    }`}
                                            >
                                                신청함
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setForm({ ...form, birthday_event: false })}
                                                className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${!form.birthday_event
                                                    ? 'bg-green-500 text-white border-2 border-green-600'
                                                    : 'bg-gray-100 text-gray-700 border-2 border-gray-300 hover:bg-gray-200'
                                                    }`}
                                            >
                                                신청 안함
                                            </button>
                                        </div>
                                        {form.birthday_event && (
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">생일 당사자 영문성함</label>
                                                <input
                                                    type="text"
                                                    value={form.birthday_name}
                                                    onChange={(e) => setForm({ ...form, birthday_name: e.target.value.toUpperCase() })}
                                                    placeholder="ex) HONG GIL DONG"
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* 창가석 요청 (당일만) */}
                                {form.schedule === '당일' && (
                                    <div className="border border-gray-300 rounded-lg p-4 space-y-3">
                                        <label className="block text-sm font-medium text-gray-700">창가석 요청</label>
                                        <div className="flex gap-3">
                                            <button
                                                type="button"
                                                onClick={() => setForm({ ...form, window_seat_request: true })}
                                                className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${form.window_seat_request
                                                    ? 'bg-green-500 text-white border-2 border-green-600'
                                                    : 'bg-gray-100 text-gray-700 border-2 border-gray-300 hover:bg-gray-200'
                                                    }`}
                                            >
                                                신청함
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setForm({ ...form, window_seat_request: false })}
                                                className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${!form.window_seat_request
                                                    ? 'bg-green-500 text-white border-2 border-green-600'
                                                    : 'bg-gray-100 text-gray-700 border-2 border-gray-300 hover:bg-gray-200'
                                                    }`}
                                            >
                                                신청 안함
                                            </button>
                                        </div>
                                        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                            <p className="text-xs text-yellow-800">
                                                *크루즈 사 측 사정에 의해 반영되지 않을 수 있습니다.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* 요청 사항 */}
                                <div className="border border-gray-300 rounded-lg p-4 space-y-3">
                                    <label className="block text-sm font-medium text-gray-700">요청 사항</label>
                                    <textarea
                                        value={form.room_request_note}
                                        onChange={(e) => setForm({ ...form, room_request_note: e.target.value })}
                                        rows={2}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                                        placeholder="객실 관련 요청사항을 입력하세요..."
                                    />
                                </div>

                                <p className="text-sm text-sky-700 bg-sky-50 border border-sky-200 rounded-lg px-4 py-3 text-center">
                                    🚗 크루즈 선착장 이동 전용차량 예약시 <strong>차량 포함 예약하기</strong> 클릭 하세요 ^^
                                </p>
                            </div>

                        </div>



                        {/* 제출 버튼 */}
                        <div className="space-y-3 mt-6">
                            <div className="flex gap-3 justify-end">
                                <button
                                    type="button"
                                    disabled={loading || !priceResult}
                                    onClick={(e) => handleReservationSubmit(e as any, 'skip')}
                                    className="px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:bg-gray-400"
                                >
                                    {loading ? '저장 중...' : '차량 없이 예약하기'}
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading || !priceResult}
                                    className="px-6 py-3 bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:bg-gray-400"
                                >
                                    {loading ? '저장 중...' : '차량 포함 예약하기'}
                                </button>
                            </div>
                            <div className="flex justify-start">
                                <button
                                    type="button"
                                    onClick={() => router.push('/mypage/direct-booking')}
                                    className="px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
                                >
                                    취소
                                </button>
                            </div>
                        </div>
                    </form>
            </div>

            {/* 아동 생년월일 입력 모달 */}
            {isChildBirthDateModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden animate-fadeIn">
                        <div className="bg-blue-600 px-6 py-4 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-white">👶 아동 생년월일 입력</h3>
                            <button
                                onClick={() => setIsChildBirthDateModalOpen(false)}
                                className="text-white hover:text-blue-200 transition-colors"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="p-6">
                            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-6">
                                <p className="text-sm text-blue-800">
                                    아동의 정확한 나이 확인을 위해 생년월일을 입력해주세요.<br />
                                </p>
                            </div>

                            <div className="space-y-4 mb-6">
                                {Array.from({ length: childCount }).map((_, index) => (
                                    <div key={index} className="flex flex-col">
                                        <label className="text-sm font-medium text-gray-700 mb-1">
                                            아동 {index + 1} 생년월일 {index === 0 && <span className="text-red-500">*</span>}
                                        </label>
                                        <input
                                            type="date"
                                            value={tempChildBirthDates[index] || ''}
                                            onChange={(e) => {
                                                const newDates = [...tempChildBirthDates];
                                                newDates[index] = e.target.value;
                                                setTempChildBirthDates(newDates);
                                            }}
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                        />
                                    </div>
                                ))}
                            </div>

                            <div className="flex gap-2 mb-6">
                                {(childCount + infantCount) < 10 && (
                                    <button
                                        type="button"
                                        onClick={() => setChildCount(childCount + 1)}
                                        className="flex-1 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors font-medium border border-blue-200"
                                    >
                                        + 아동 추가
                                    </button>
                                )}
                                {childCount > 1 && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setChildCount(childCount - 1);
                                            const newDates = [...tempChildBirthDates];
                                            newDates[childCount - 1] = '';
                                            setTempChildBirthDates(newDates);
                                        }}
                                        className="flex-1 px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors font-medium border border-red-200"
                                    >
                                        - 아동 제거
                                    </button>
                                )}
                            </div>

                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsChildBirthDateModalOpen(false)}
                                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                                >
                                    취소
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSaveChildBirthDates}
                                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-bold shadow-md"
                                >
                                    저장하기
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 유아 생년월일 입력 모달 */}
            {isInfantBirthDateModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden animate-fadeIn">
                        <div className="bg-cyan-600 px-6 py-4 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-white">🍼 유아 생년월일 입력</h3>
                            <button
                                onClick={() => setIsInfantBirthDateModalOpen(false)}
                                className="text-white hover:text-cyan-200 transition-colors"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="p-6">
                            <div className="bg-cyan-50 border border-cyan-100 rounded-lg p-4 mb-6">
                                <p className="text-sm text-cyan-800">
                                    유아의 정확한 나이 확인을 위해 생년월일을 입력해주세요.<br />
                                </p>
                            </div>

                            <div className="space-y-4 mb-6">
                                {Array.from({ length: infantCount }).map((_, index) => (
                                    <div key={index} className="flex flex-col">
                                        <label className="text-sm font-medium text-gray-700 mb-1">
                                            유아 {index + 1} 생년월일 {index === 0 && <span className="text-red-500">*</span>}
                                        </label>
                                        <input
                                            type="date"
                                            value={tempInfantBirthDates[index] || ''}
                                            onChange={(e) => {
                                                const newDates = [...tempInfantBirthDates];
                                                newDates[index] = e.target.value;
                                                setTempInfantBirthDates(newDates);
                                            }}
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-all"
                                        />
                                    </div>
                                ))}
                            </div>

                            <div className="flex gap-2 mb-6">
                                {(childCount + infantCount) < 10 && (
                                    <button
                                        type="button"
                                        onClick={() => setInfantCount(infantCount + 1)}
                                        className="flex-1 px-4 py-2 bg-cyan-50 text-cyan-600 rounded-lg hover:bg-cyan-100 transition-colors font-medium border border-cyan-200"
                                    >
                                        + 유아 추가
                                    </button>
                                )}
                                {infantCount > 1 && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setInfantCount(infantCount - 1);
                                            const newDates = [...tempInfantBirthDates];
                                            newDates[infantCount - 1] = '';
                                            setTempInfantBirthDates(newDates);
                                        }}
                                        className="flex-1 px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors font-medium border border-red-200"
                                    >
                                        - 유아 제거
                                    </button>
                                )}
                            </div>

                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsInfantBirthDateModalOpen(false)}
                                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                                >
                                    취소
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSaveInfantBirthDates}
                                    className="flex-1 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors font-bold shadow-md"
                                >
                                    저장하기
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </PageWrapper>
    );
}

export default function DirectBookingCruisePage() {
    return (
        <Suspense fallback={<div className="flex justify-center items-center h-48">로딩 중...</div>}>
            <DirectBookingCruiseContent />
        </Suspense>
    );
}
