'use client';

import React, { useEffect, useMemo, useState } from 'react';
import ManagerLayout from '@/components/ManagerLayout';
import supabase from '@/lib/supabase';

interface PendingReservationRow {
    re_id: string;
    re_quote_id: string | null;
    re_type: string;
    re_status: string;
    re_created_at: string;
    re_user_id: string;
    total_amount: number | null;
    re_adult_count?: number | null;
    re_child_count?: number | null;
    re_infant_count?: number | null;
}

interface PendingGroup {
    key: string;
    quoteId: string | null;
    title: string;
    userName: string;
    userEmail: string;
    createdAt: string;
    usageDate: string | null;
    daysAgo: number | null;
    reservations: PendingReservationRow[];
    statuses: string[];
}

interface UserInfo {
    id: string;
    name: string | null;
    email: string | null;
}

interface QuoteInfo {
    id: string;
    title: string | null;
}

type StatusFilter = 'pending' | 'approved' | 'confirmed';
type ServiceType = 'cruise' | 'airport' | 'tour' | 'hotel' | 'rentcar';

const CRUISE_GUIDE_TOP_LINES = [
    '✅ 스테이하롱을 통해 예약하신 회원님의 크루즈 예약내역입니다.',
    '',
    '예약자 본인께서는 하단에 표기 된 "안내사항"들을 반드시 숙지 해 주시고',
    '즐거운 여행이 되시길 바랍니다 ^^',
];

const CRUISE_GUIDE_BOTTOM_LINES = [
    '➡️ 승선 5일 전까지, 승선자 전원의 여권을 촬영하여 "카카오채널 채팅방"으로 보내주세요.',
    '➡️ 크루즈 승선일, 픽업차량 정보는 승차 전날 밤 9시~10시 (베트남시간) 에 전달 드립니다.',
    '➡️ 일부 차량들이 "진주판매휴게소"를 들리긴하지만 선택관광이 아니므로, 상품구입은 권하지 않습니다.',
    '➡️ 보다 상세한 내용은 "카톡방"을 통해 전달드린 링크를 꼭 확인 해 주세요.',
];

function formatKstDateDot(value?: string | null): string {
    if (!value) return '-';
    const raw = String(value).trim();
    if (!raw) return '-';

    const hasTimezone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw);
    if (!hasTimezone) {
        return raw.replace('T', ' ').slice(0, 10).replace(/-/g, '.');
    }

    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '-';
    const parts = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(d);
    const pick = (type: string) => parts.find((p) => p.type === type)?.value || '';
    return `${pick('year')}.${pick('month')}.${pick('day')}`;
}

function formatAmount(amount: number): string {
    return amount.toLocaleString('ko-KR');
}

function formatManDong(amount: number): string {
    if (!Number.isFinite(amount)) return '-';
    const manValue = Math.round(amount / 10000);
    return `${manValue.toLocaleString('ko-KR')}만동`;
}

function maskName(name?: string | null): string {
    const source = (name || '').trim();
    if (!source) return '고*';
    if (source.length === 1) return `${source}*`;
    if (source.length === 2) return `${source[0]}*`;
    return `${source[0]}*${source[source.length - 1]}`;
}

function mapStatusText(status: string): string {
    if (status === 'pending') return '대기';
    if (status === 'approved') return '승인';
    if (status === 'confirmed') return '확정';
    return status;
}

function toDateKey(value?: string | null): string | null {
    if (!value) return null;
    const raw = String(value).trim();
    if (!raw) return null;

    const hasTimezone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw);
    if (!hasTimezone) {
        const normalized = raw.replace(' ', 'T').slice(0, 10);
        return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
    }

    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    const parts = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(d);
    const pick = (type: string) => parts.find((p) => p.type === type)?.value || '';
    const key = `${pick('year')}-${pick('month')}-${pick('day')}`;
    return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
}

function daysAgoFromToday(dateKey: string): number {
    const [y, m, d] = dateKey.split('-').map(Number);
    const targetUtc = Date.UTC(y, m - 1, d);

    const nowParts = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(new Date());
    const pick = (type: string) => nowParts.find((p) => p.type === type)?.value || '';
    const nowUtc = Date.UTC(Number(pick('year')), Number(pick('month')) - 1, Number(pick('day')));

    return Math.floor((nowUtc - targetUtc) / 86400000);
}

function matchesStatusFilter(filter: StatusFilter, statuses: string[]): boolean {
    return statuses.includes(filter);
}

function detectCruiseProgram(scheduleType?: string | null, requestNote?: string | null): 'day' | '1n2d' | '2n3d' {
    const source = `${scheduleType || ''} ${requestNote || ''}`.toLowerCase();
    if (source.includes('당일') || source.includes('day')) return 'day';
    if (source.includes('2박') || source.includes('2n3d') || source.includes('3일')) return '2n3d';
    return '1n2d';
}

function getCruiseHeader(program: 'day' | '1n2d' | '2n3d'): string {
    if (program === 'day') return '💬 당일크루즈 예약현황';
    if (program === '2n3d') return '💬 2박 크루즈 예약현황';
    return '💬 1박2일 크루즈 예약현황';
}

function getCruiseProgramText(program: 'day' | '1n2d' | '2n3d'): string {
    if (program === 'day') return '당일 투어';
    if (program === '2n3d') return '2박 3일 투어';
    return '1박 2일 투어';
}

function normalizeText(value?: string | null): string {
    const text = (value || '').trim();
    return text || '-';
}

function normalizeCruiseVehicleLabel(vehicleType: string, wayType?: string | null): string {
    const base = normalizeText(vehicleType);
    if (base === '-') return '-';

    const compact = base.replace(/\s+/g, '');
    let normalized = base;
    if (compact.includes('크루즈셔틀리무진') || compact.includes('셔틀리무진')) {
        normalized = '스하 셔틀리무진';
    }

    const wayRaw = String(wayType || '').trim();
    const wayText =
        wayRaw === '당일왕복' || wayRaw === '왕복' ? '왕복' :
        wayRaw === '편도' ? '편도' :
        '';

    return `${normalized}${wayText ? ` ${wayText}` : ''}`;
}

function uniqueVehicleLabels(labels: Array<string | null | undefined>): string {
    const seen = new Set<string>();
    const normalized = labels
        .map((label) => normalizeText(label))
        .filter((label) => label !== '-')
        .filter((label) => {
            if (seen.has(label)) return false;
            seen.add(label);
            return true;
        });

    return normalized.length > 0 ? normalized.join(', ') : '-';
}

async function resolveCruiseVehicleType(reservationIds: string[]): Promise<string> {
    if (reservationIds.length === 0) return '-';

    const [cruiseCarRes, shtCarRes] = await Promise.all([
        supabase
            .from('reservation_cruise_car')
            .select('reservation_id, rentcar_price_code, car_price_code, vehicle_type')
            .in('reservation_id', reservationIds),
        supabase
            .from('reservation_car_sht')
            .select('reservation_id, car_price_code')
            .in('reservation_id', reservationIds),
    ]);

    const cruiseCarRows = cruiseCarRes.data || [];
    const shtCarRows = shtCarRes.data || [];

    const directCruiseVehicleType = normalizeText(
        (cruiseCarRows as any[]).find((row) => row?.vehicle_type)?.vehicle_type
    );
    const hasShtVehicle = (shtCarRows as any[]).length > 0;

    const rentCodes = Array.from(
        new Set((cruiseCarRows as any[]).map((row) => row?.rentcar_price_code).filter(Boolean))
    );
    const legacyCarCodes = Array.from(
        new Set([
            ...(cruiseCarRows as any[]).map((row) => row?.car_price_code),
            ...(shtCarRows as any[]).map((row) => row?.car_price_code),
        ].filter(Boolean))
    );
    const allRentCodes = Array.from(new Set([...rentCodes, ...legacyCarCodes]));

    const rentcarPriceRes = allRentCodes.length > 0
        ? await supabase.from('rentcar_price').select('rent_code, vehicle_type').in('rent_code', allRentCodes)
        : { data: [] as any[] };

    const rentVehicleType = normalizeText((rentcarPriceRes.data || [])[0]?.vehicle_type);
    const vehicleLabels = [
        directCruiseVehicleType,
        rentVehicleType,
        hasShtVehicle ? '스하차량 셔틀 리무진' : null,
    ];

    return uniqueVehicleLabels(vehicleLabels);
}

export default function CafeGuidePage() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [groups, setGroups] = useState<PendingGroup[]>([]);
    const [selectedGroupKey, setSelectedGroupKey] = useState<string>('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
    const [generatedService, setGeneratedService] = useState<ServiceType | null>(null);
    const [generatedHeader, setGeneratedHeader] = useState('');
    const [generatedTitle, setGeneratedTitle] = useState('');
    const [generatedBody, setGeneratedBody] = useState('');
    const [copiedTitle, setCopiedTitle] = useState(false);
    const [copiedBody, setCopiedBody] = useState(false);

    const selectedGroup = useMemo(
        () => groups.find((g) => g.key === selectedGroupKey) || null,
        [groups, selectedGroupKey]
    );

    useEffect(() => {
        const init = async () => {
            setLoading(true);
            setError(null);
            try {
                const { data: authData, error: authErr } = await supabase.auth.getUser();
                if (authErr || !authData?.user) {
                    setError('로그인이 필요합니다.');
                    return;
                }

                const { data: rows, error: rowsErr } = await supabase
                    .from('reservation')
                    .select('re_id, re_quote_id, re_type, re_status, re_created_at, re_user_id, total_amount, re_adult_count, re_child_count, re_infant_count')
                    .in('re_status', ['pending', 'approved', 'confirmed'])
                    .order('re_created_at', { ascending: false });

                if (rowsErr) throw rowsErr;
                const reservationRows = (rows || []) as PendingReservationRow[];
                if (reservationRows.length === 0) {
                    setGroups([]);
                    setSelectedGroupKey('');
                    return;
                }

                const reservationIds = reservationRows.map((r) => r.re_id);

                const [cruiseRes, airportRes, tourRes, hotelRes, rentcarRes] = await Promise.all([
                    supabase
                        .from('reservation_cruise')
                        .select('reservation_id, checkin')
                        .in('reservation_id', reservationIds),
                    supabase
                        .from('reservation_airport')
                        .select('reservation_id, ra_datetime')
                        .in('reservation_id', reservationIds),
                    supabase
                        .from('reservation_tour')
                        .select('reservation_id, usage_date')
                        .in('reservation_id', reservationIds),
                    supabase
                        .from('reservation_hotel')
                        .select('reservation_id, checkin_date')
                        .in('reservation_id', reservationIds),
                    supabase
                        .from('reservation_rentcar')
                        .select('reservation_id, pickup_datetime')
                        .in('reservation_id', reservationIds),
                ]);

                const reservationDateMap = new Map<string, string>();
                const saveEarlierDate = (reservationId: string, rawDate?: string | null) => {
                    const key = toDateKey(rawDate);
                    if (!reservationId || !key) return;
                    const prev = reservationDateMap.get(reservationId);
                    if (!prev || key < prev) {
                        reservationDateMap.set(reservationId, key);
                    }
                };

                (cruiseRes.data || []).forEach((row: any) => saveEarlierDate(row?.reservation_id, row?.checkin));
                (airportRes.data || []).forEach((row: any) => saveEarlierDate(row?.reservation_id, row?.ra_datetime));
                (tourRes.data || []).forEach((row: any) => saveEarlierDate(row?.reservation_id, row?.usage_date));
                (hotelRes.data || []).forEach((row: any) => saveEarlierDate(row?.reservation_id, row?.checkin_date));
                (rentcarRes.data || []).forEach((row: any) => saveEarlierDate(row?.reservation_id, row?.pickup_datetime));

                const userIds = Array.from(new Set(reservationRows.map((r) => r.re_user_id).filter(Boolean)));
                const quoteIds = Array.from(new Set(reservationRows.map((r) => r.re_quote_id).filter(Boolean))) as string[];

                const [{ data: users }, { data: quotes }] = await Promise.all([
                    userIds.length
                        ? supabase.from('users').select('id, name, email').in('id', userIds)
                        : Promise.resolve({ data: [] as UserInfo[] }),
                    quoteIds.length
                        ? supabase.from('quote').select('id, title').in('id', quoteIds)
                        : Promise.resolve({ data: [] as QuoteInfo[] }),
                ]);

                const typedUsers = (users || []) as UserInfo[];
                const typedQuotes = (quotes || []) as QuoteInfo[];
                const userMap = new Map<string, UserInfo>(typedUsers.map((u) => [u.id, u]));
                const quoteMap = new Map<string, QuoteInfo>(typedQuotes.map((q) => [q.id, q]));

                const grouped = new Map<string, PendingGroup>();
                reservationRows.forEach((r) => {
                    const key = r.re_quote_id || r.re_id;
                    if (!grouped.has(key)) {
                        const user = userMap.get(r.re_user_id);
                        const quote = r.re_quote_id ? quoteMap.get(r.re_quote_id) : null;
                        grouped.set(key, {
                            key,
                            quoteId: r.re_quote_id,
                            title: quote?.title || '제목 없음',
                            userName: user?.name || '고객',
                            userEmail: user?.email || '-',
                            createdAt: r.re_created_at,
                            usageDate: null,
                            daysAgo: null,
                            reservations: [],
                            statuses: [],
                        });
                    }
                    const target = grouped.get(key)!;
                    target.reservations.push(r);

                    const reservationDate = reservationDateMap.get(r.re_id) || null;
                    if (reservationDate) {
                        const reservationDaysAgo = daysAgoFromToday(reservationDate);
                        if (
                            target.daysAgo === null ||
                            reservationDaysAgo < target.daysAgo
                        ) {
                            target.daysAgo = reservationDaysAgo;
                            target.usageDate = reservationDate;
                        }
                    }

                    if (!target.statuses.includes(r.re_status)) {
                        target.statuses.push(r.re_status);
                    }
                });

                const groupList = Array.from(grouped.values())
                    .filter((g) => matchesStatusFilter(statusFilter, g.statuses))
                    .sort(
                    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                );

                setGroups(groupList);
                if (groupList.length > 0) {
                    setSelectedGroupKey(groupList[0].key);
                } else {
                    setSelectedGroupKey('');
                }
                setError(null);
            } catch (e: any) {
                setError(e?.message || '데이터 조회 중 오류가 발생했습니다.');
            } finally {
                setLoading(false);
            }
        };

        init();
    }, [statusFilter]);

    const applyGenerated = (service: ServiceType, header: string, title: string, body: string) => {
        setGeneratedService(service);
        setGeneratedHeader(header);
        setGeneratedTitle(title);
        setGeneratedBody(body);
        setCopiedTitle(false);
        setCopiedBody(false);
    };

    const generateCruiseText = async () => {
        if (!selectedGroup) return;
        const cruiseReservationIds = selectedGroup.reservations
            .filter((r) => r.re_type === 'cruise')
            .map((r) => r.re_id);
        const relatedVehicleReservationIds = selectedGroup.reservations
            .filter((r) => ['car', 'sht', 'car_sht', 'reservation_car_sht'].includes(r.re_type))
            .map((r) => r.re_id);
        const cruiseGuideReservationIds = Array.from(new Set([...cruiseReservationIds, ...relatedVehicleReservationIds]));

        if (cruiseReservationIds.length === 0) {
            alert('선택한 그룹에 크루즈 예약이 없습니다.');
            return;
        }

        const { data: cruiseRows } = await supabase
            .from('reservation_cruise')
            .select('reservation_id, room_price_code, checkin, request_note, guest_count, adult_count, child_count, infant_count, room_total_price')
            .in('reservation_id', cruiseReservationIds);

        const firstCruise = (cruiseRows || [])[0] as any;
        const roomCodes = Array.from(new Set((cruiseRows || []).map((r: any) => r.room_price_code).filter(Boolean)));
        let cruiseName = '-';
        let roomType = '-';
        let scheduleType = '';

        if (roomCodes.length > 0) {
            const { data: roomPriceRows } = await supabase
                .from('cruise_rate_card')
                .select('id, cruise_name, room_type, schedule_type')
                .in('id', roomCodes);

            const firstRoom = (roomPriceRows || [])[0] as any;
            cruiseName = normalizeText(firstRoom?.cruise_name);
            roomType = normalizeText(firstRoom?.room_type);
            scheduleType = String(firstRoom?.schedule_type || '');
        }

        const program = detectCruiseProgram(scheduleType, firstCruise?.request_note);
        const programText = getCruiseProgramText(program);
        const header = getCruiseHeader(program);
        const checkinDate = formatKstDateDot(firstCruise?.checkin || selectedGroup.createdAt);
        const extraOption = normalizeText(firstCruise?.request_note);

        let guestCount = Number(firstCruise?.guest_count || 0);
        if (!guestCount) {
            guestCount = selectedGroup.reservations
                .filter((r) => r.re_type === 'cruise')
                .reduce(
                    (sum, r) =>
                        sum + Number(r.re_adult_count || 0) + Number(r.re_child_count || 0) + Number(r.re_infant_count || 0),
                    0
                );
        }

        const adultCount = (cruiseRows || []).reduce((sum: number, row: any) => sum + Number(row?.adult_count || 0), 0);
        const passengerBaseCount = adultCount > 0 ? adultCount : guestCount;

        const { data: cruiseCarRows } = await supabase
            .from('reservation_cruise_car')
            .select('reservation_id, rentcar_price_code, car_price_code, car_total_price, unit_price, car_count')
            .in('reservation_id', cruiseGuideReservationIds);

        const { data: shtCarRows } = await supabase
            .from('reservation_car_sht')
            .select('reservation_id, car_total_price, unit_price, car_count')
            .in('reservation_id', cruiseGuideReservationIds);

        const cruiseTotalAmount = (cruiseRows || []).reduce((sum: number, row: any) => {
            const rowTotal = Number(row?.room_total_price || 0);
            return sum + (Number.isFinite(rowTotal) ? rowTotal : 0);
        }, 0);

        const shuttleCruiseCarAmount = (cruiseCarRows || []).reduce((sum: number, row: any) => {
            const rowTotal = Number(row?.car_total_price || 0);
            if (Number.isFinite(rowTotal) && rowTotal > 0) return sum + rowTotal;
            const unitPrice = Number(row?.unit_price || 0);
            const count = Number(row?.car_count || 0);
            if (Number.isFinite(unitPrice) && unitPrice > 0 && Number.isFinite(count) && count > 0) {
                return sum + unitPrice * count;
            }
            return sum;
        }, 0);

        const shuttleShtCarAmount = (shtCarRows || []).reduce((sum: number, row: any) => {
            const rowTotal = Number(row?.car_total_price || 0);
            if (Number.isFinite(rowTotal) && rowTotal > 0) return sum + rowTotal;
            const unitPrice = Number(row?.unit_price || 0);
            const count = Number(row?.car_count || 0);
            if (Number.isFinite(unitPrice) && unitPrice > 0 && Number.isFinite(count) && count > 0) {
                return sum + unitPrice * count;
            }
            return sum;
        }, 0);

        const shuttleTotalAmount = shuttleCruiseCarAmount + shuttleShtCarAmount;
        const totalAmount = cruiseTotalAmount + shuttleTotalAmount;

        const rentCodes = Array.from(new Set((cruiseCarRows || []).map((row: any) => row.rentcar_price_code).filter(Boolean)));
        let shuttleWayType = '';
        if (rentCodes.length > 0) {
            const { data: rentcarPriceRows } = await supabase
                .from('rentcar_price')
                .select('rent_code, way_type')
                .in('rent_code', rentCodes)
                .limit(1);
            shuttleWayType = String((rentcarPriceRows || [])[0]?.way_type || '').trim();
        }

        const vehicleType = await resolveCruiseVehicleType(cruiseGuideReservationIds);
        const vehicleLabel = normalizeCruiseVehicleLabel(vehicleType, shuttleWayType);

        const cruiseUnitAmount = passengerBaseCount > 0 ? Math.round(cruiseTotalAmount / passengerBaseCount) : 0;
        const shuttleUnitAmount = passengerBaseCount > 0 ? Math.round(shuttleTotalAmount / passengerBaseCount) : 0;

        const totalPriceLines = [
            cruiseTotalAmount > 0 && passengerBaseCount > 0
                ? `성인 1인 ${formatManDong(cruiseUnitAmount)} * ${passengerBaseCount} = ${formatManDong(cruiseTotalAmount)}`
                : null,
            shuttleTotalAmount > 0 && passengerBaseCount > 0
                ? `${vehicleLabel} 1인 ${formatManDong(shuttleUnitAmount)} * ${passengerBaseCount} = ${formatManDong(shuttleTotalAmount)}`
                : null,
            totalAmount > 0
                ? `총 ${formatManDong(totalAmount)}`
                : null,
        ].filter(Boolean) as string[];

        const title = `${maskName(selectedGroup.userName)} 님, ${checkinDate}. ${cruiseName} 예약입니다.`;
        const bodyLines = [
            '🔹 결제 방식 (요금제) : 신용카드',
            `🔹 크루즈 체크인 일자 : ${checkinDate}`,
            `🔹 예약 프로그램 (당일, 1박2일 등) : ${programText}`,
            `🔹 승선 총 인원 : ${guestCount || '-'}인`,
            '',
            `🔹 예약하신 크루즈명 : ${cruiseName}`,
            `🔹 예약하신 객실타입 : ${roomType}`,
            ...(normalizeText(vehicleType) !== '-' ? [`🔹 예약하신 차량타입 : ${vehicleType}`] : []),
            '',
            '🔹 예약에 따른 총액 :',
            '',
            totalPriceLines.length > 0 ? totalPriceLines.join('\n\n') : '-',
        ];
        const body = [...CRUISE_GUIDE_TOP_LINES, '', ...bodyLines, '', ...CRUISE_GUIDE_BOTTOM_LINES].join('\n');

        applyGenerated('cruise', header, title, body);
    };

    const generateAirportText = async () => {
        if (!selectedGroup) return;
        const airportReservationIds = selectedGroup.reservations
            .filter((r) => r.re_type === 'airport')
            .map((r) => r.re_id);

        if (airportReservationIds.length === 0) {
            alert('선택한 그룹에 공항 예약이 없습니다.');
            return;
        }

        const { data: airportRows } = await supabase
            .from('reservation_airport')
            .select('reservation_id, airport_price_code, ra_airport_location, ra_flight_number, ra_datetime, way_type, ra_passenger_count, request_note, accommodation_info')
            .in('reservation_id', airportReservationIds)
            .order('ra_datetime', { ascending: true });

        const firstAirport = (airportRows || [])[0] as any;
        const airportCode = firstAirport?.airport_price_code;
        let vehicleType = '-';
        let routeText = '-';

        if (airportCode) {
            const { data: airportPrice } = await supabase
                .from('airport_price')
                .select('airport_code, vehicle_type, route')
                .eq('airport_code', airportCode)
                .limit(1)
                .maybeSingle();
            vehicleType = normalizeText((airportPrice as any)?.vehicle_type);
            routeText = normalizeText((airportPrice as any)?.route);
        }

        const pickupDate = formatKstDateDot(firstAirport?.ra_datetime || selectedGroup.createdAt);
        const title = `${maskName(selectedGroup.userName)} 님, ${pickupDate}. 공항 픽업 샌딩 예약입니다.`;
        const totalAmount = selectedGroup.reservations
            .filter((r) => r.re_type === 'airport')
            .reduce((sum, r) => sum + Number(r.total_amount || 0), 0);

        const body = `✅ 스테이하롱을 통해 예약하신 회원님의 공항픽업샌딩 예약내역입니다.

예약자 본인께서는 하단에 표기 된 "안내사항"들을 반드시 숙지 해 주시고
즐거운 여행이 되시길 바랍니다 ^^

✅ 공항픽업샌딩 서비스 바로가기
https://cafe.naver.com/stayhalong/8609

🔹 픽업일자 : ${pickupDate}
🔹 항공편 : ${normalizeText(firstAirport?.ra_flight_number)}
🔹 예약하신 차량 : ${vehicleType}
🔹 목적지 (도시) : ${normalizeText(firstAirport?.ra_airport_location || firstAirport?.accommodation_info)}
🔹 이동 경로 : ${routeText}

🔹 예약에 따른 총액 :
${totalAmount > 0 ? `${formatAmount(totalAmount)}동` : '-'}

➡️ 공항에 도착 후 짐 찾는 곳에 도착하시면 스테이하롱으로 메시지를 보내주세요.
➡️ 짐을 찾고 메시지를 보내주시면 기사님 준비시간으로 대기시간이 길어집니다.
➡️ 아래의 이용안내를 반드시 확인 해 주세요.
공항픽업 이용안내 https://cafe.naver.com/stayhalong/7158
공항드랍 이용안내 https://cafe.naver.com/stayhalong/7159`;

        applyGenerated('airport', '💬 공항픽업샌딩 예약현황', title, body);
    };

    const generateTourText = async () => {
        if (!selectedGroup) return;
        const tourReservationIds = selectedGroup.reservations
            .filter((r) => r.re_type === 'tour')
            .map((r) => r.re_id);

        if (tourReservationIds.length === 0) {
            alert('선택한 그룹에 투어 예약이 없습니다.');
            return;
        }

        const { data: tourRows } = await supabase
            .from('reservation_tour')
            .select('reservation_id, tour_price_code, tour_capacity, usage_date, request_note, adult_count, child_count, infant_count')
            .in('reservation_id', tourReservationIds);

        const firstTour = (tourRows || [])[0] as any;
        const pricingId = firstTour?.tour_price_code;
        let tourName = normalizeText(selectedGroup.title);

        if (pricingId) {
            const { data: pricingRow } = await supabase
                .from('tour_pricing')
                .select('pricing_id, tour_id')
                .eq('pricing_id', pricingId)
                .maybeSingle();

            const tourId = (pricingRow as any)?.tour_id;
            if (tourId) {
                const { data: tourInfo } = await supabase
                    .from('tour')
                    .select('tour_id, tour_name')
                    .eq('tour_id', tourId)
                    .maybeSingle();
                tourName = normalizeText((tourInfo as any)?.tour_name);
            }
        }

        const usageDate = formatKstDateDot(firstTour?.usage_date || selectedGroup.createdAt);
        const participantCount =
            Number(firstTour?.tour_capacity || 0) ||
            Number(firstTour?.adult_count || 0) + Number(firstTour?.child_count || 0) + Number(firstTour?.infant_count || 0);

        const totalAmount = selectedGroup.reservations
            .filter((r) => r.re_type === 'tour')
            .reduce((sum, r) => sum + Number(r.total_amount || 0), 0);

        const title = `${maskName(selectedGroup.userName)} 님, ${usageDate}. ${tourName} 예약입니다.`;
        const body = `✅ 스테이하롱을 통해 예약하신 회원님의 가이드 투어 예약내역입니다.

예약자 본인께서는 하단에 표기 된 "안내사항"들을 반드시 숙지 해 주시고
즐거운 여행이 되시길 바랍니다 ^^

🔹 투어일자 : ${usageDate}
🔹 투어상품 : ${tourName}
🔹 투어인원 : ${participantCount || '-'}인
🔹 추가옵션 : ${normalizeText(firstTour?.request_note)}

🔹 예약에 따른 총액 :
${totalAmount > 0 ? `${formatAmount(totalAmount)}동` : '-'}

➡️ 투어전날 밤, 차량정보와 가이드 미팅시간을 전달 드립니다.
➡️ 단독투어로서 다른 팀과 조인투어가 아닙니다.
➡️ 한국어가 가능한 베트남인, 국제가이드자격 소지자가 인솔합니다.
➡️ 가이드 미팅은 회원님의 숙박호텔 로비 입니다.`;

        applyGenerated('tour', '💬 가이드 투어 예약현황', title, body);
    };

    const generateHotelText = async () => {
        if (!selectedGroup) return;
        const hotelReservationIds = selectedGroup.reservations
            .filter((r) => r.re_type === 'hotel')
            .map((r) => r.re_id);

        if (hotelReservationIds.length === 0) {
            alert('선택한 그룹에 호텔 예약이 없습니다.');
            return;
        }

        const { data: hotelRows } = await supabase
            .from('reservation_hotel')
            .select('reservation_id, hotel_price_code, checkin_date, guest_count, request_note, room_count')
            .in('reservation_id', hotelReservationIds);

        const firstHotel = (hotelRows || [])[0] as any;
        let hotelName = '-';
        let roomType = '-';
        if (firstHotel?.hotel_price_code) {
            const { data: hotelPrice } = await supabase
                .from('hotel_price')
                .select('hotel_price_code, hotel_name, room_type')
                .eq('hotel_price_code', firstHotel.hotel_price_code)
                .maybeSingle();
            hotelName = normalizeText((hotelPrice as any)?.hotel_name);
            roomType = normalizeText((hotelPrice as any)?.room_type);
        }

        const checkinDate = formatKstDateDot(firstHotel?.checkin_date || selectedGroup.createdAt);
        const totalAmount = selectedGroup.reservations
            .filter((r) => r.re_type === 'hotel')
            .reduce((sum, r) => sum + Number(r.total_amount || 0), 0);

        const title = `${maskName(selectedGroup.userName)} 님, ${checkinDate}. ${hotelName} 예약입니다.`;
        const body = `✅ 스테이하롱을 통해 예약하신 회원님의 호텔 예약내역입니다.

예약자 본인께서는 하단에 표기 된 "안내사항"들을 반드시 숙지 해 주시고
즐거운 여행이 되시길 바랍니다 ^^

🔹 체크인 일자 : ${checkinDate}
🔹 호텔명 : ${hotelName}
🔹 객실타입 : ${roomType}
🔹 숙박 인원 : ${Number(firstHotel?.guest_count || 0) || '-'}인
🔹 추가옵션 : ${normalizeText(firstHotel?.request_note)}

🔹 예약에 따른 총액 :
${totalAmount > 0 ? `${formatAmount(totalAmount)}동` : '-'}

➡️ 체크인 바우처 및 상세 안내는 예약확인서를 통해 전달 드립니다.
➡️ 호텔 규정에 따라 체크인 시 여권 원본이 필요합니다.`;

        applyGenerated('hotel', '💬 호텔 예약현황', title, body);
    };

    const generateRentcarText = async () => {
        if (!selectedGroup) return;
        const rentcarReservationIds = selectedGroup.reservations
            .filter((r) => r.re_type === 'rentcar')
            .map((r) => r.re_id);

        if (rentcarReservationIds.length === 0) {
            alert('선택한 그룹에 렌터카 예약이 없습니다.');
            return;
        }

        const { data: rentRows } = await supabase
            .from('reservation_rentcar')
            .select('reservation_id, rentcar_price_code, pickup_datetime, destination, passenger_count, request_note, pickup_location')
            .in('reservation_id', rentcarReservationIds);

        const firstRent = (rentRows || [])[0] as any;
        let vehicleType = '-';
        let routeText = '-';
        if (firstRent?.rentcar_price_code) {
            const { data: priceRow } = await supabase
                .from('rentcar_price')
                .select('rent_code, vehicle_type, route')
                .eq('rent_code', firstRent.rentcar_price_code)
                .maybeSingle();
            vehicleType = normalizeText((priceRow as any)?.vehicle_type);
            routeText = normalizeText((priceRow as any)?.route);
        }

        const pickupDate = formatKstDateDot(firstRent?.pickup_datetime || selectedGroup.createdAt);
        const totalAmount = selectedGroup.reservations
            .filter((r) => r.re_type === 'rentcar')
            .reduce((sum, r) => sum + Number(r.total_amount || 0), 0);

        const title = `${maskName(selectedGroup.userName)} 님, ${pickupDate}. 렌터카 예약입니다.`;
        const body = `✅ 스테이하롱을 통해 예약하신 회원님의 렌터카 예약내역입니다.

예약자 본인께서는 하단에 표기 된 "안내사항"들을 반드시 숙지 해 주시고
즐거운 여행이 되시길 바랍니다 ^^

🔹 이용일자 : ${pickupDate}
🔹 차량타입 : ${vehicleType}
🔹 이동경로 : ${routeText}
🔹 출발지 : ${normalizeText(firstRent?.pickup_location)}
🔹 도착지 : ${normalizeText(firstRent?.destination)}
🔹 탑승인원 : ${Number(firstRent?.passenger_count || 0) || '-'}인
🔹 추가옵션 : ${normalizeText(firstRent?.request_note)}

🔹 예약에 따른 총액 :
${totalAmount > 0 ? `${formatAmount(totalAmount)}동` : '-'}

➡️ 차량 정보는 이용 전날 전달 드립니다.
➡️ 기사님 미팅 관련 상세 위치는 카카오채널로 안내 드립니다.`;

        applyGenerated('rentcar', '💬 렌터카 예약현황', title, body);
    };

    const copyTitle = async () => {
        if (!generatedTitle) return;
        try {
            await navigator.clipboard.writeText(generatedTitle);
            setCopiedTitle(true);
        } catch {
            setCopiedTitle(false);
            alert('제목 복사에 실패했습니다.');
        }
    };

    const copyBody = async () => {
        if (!generatedBody) return;
        try {
            await navigator.clipboard.writeText(generatedBody);
            setCopiedBody(true);
        } catch {
            setCopiedBody(false);
            alert('내용 복사에 실패했습니다.');
        }
    };

    const reservationTypeSet = useMemo(
        () => new Set((selectedGroup?.reservations || []).map((r) => String(r.re_type || '').toLowerCase())),
        [selectedGroup]
    );

    const serviceAvailability = {
        cruise: reservationTypeSet.has('cruise'),
        airport: reservationTypeSet.has('airport'),
        tour: reservationTypeSet.has('tour'),
        hotel: reservationTypeSet.has('hotel'),
        rentcar: reservationTypeSet.has('rentcar'),
    };

    const getServiceButtonClass = (activeColorClass: string, isAvailable: boolean) =>
        [
            'px-3 py-2 rounded text-sm transition-colors',
            isAvailable
                ? `${activeColorClass} text-white hover:brightness-95`
                : 'bg-gray-200 text-gray-400 opacity-60 cursor-not-allowed',
        ].join(' ');

    return (
        <ManagerLayout title="카페 안내" activeTab="cafe-guide">
            <div className="w-full space-y-4">
                <div className="bg-white rounded-lg border p-4">
                    <h2 className="text-lg font-semibold text-gray-800">예약 조회 그룹 안내</h2>
                    <p className="text-sm text-gray-600 mt-1">
                        예약 상태(대기/승인/확정)별로 그룹을 선택하고, 서비스별 안내문을 생성해 제목과 내용을 각각 복사할 수 있습니다.
                    </p>
                </div>

                {loading && (
                    <div className="bg-white rounded-lg border p-6 text-center text-gray-600">로딩 중...</div>
                )}

                {!loading && error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-red-700">{error}</div>
                )}

                {!loading && !error && (
                    <>
                        <div className="bg-white rounded-lg border p-4 space-y-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">예약 상태 필터</label>
                                    <div className="flex gap-2">
                                        {[
                                            { value: 'pending', label: '대기' },
                                            { value: 'approved', label: '승인' },
                                            { value: 'confirmed', label: '확정' },
                                        ].map((option) => {
                                            const isActive = statusFilter === option.value;
                                            return (
                                                <button
                                                    key={option.value}
                                                    type="button"
                                                    onClick={() => setStatusFilter(option.value as StatusFilter)}
                                                    className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                                                        isActive
                                                            ? 'bg-blue-600 text-white'
                                                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                                    }`}
                                                >
                                                    {option.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">예약 그룹 선택</label>
                                    <select
                                        value={selectedGroupKey}
                                        onChange={(e) => setSelectedGroupKey(e.target.value)}
                                        className="w-full border rounded-lg px-3 py-2 text-sm"
                                    >
                                        {groups.length === 0 && <option value="">해당 조건의 예약이 없습니다.</option>}
                                        {groups.map((g) => (
                                            <option key={g.key} value={g.key}>
                                                {maskName(g.userName)} | {g.title} | 상태 {g.statuses.map((s) => mapStatusText(s)).join('/')} | 예약일 {formatKstDateDot(g.usageDate || g.createdAt)}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <p className="text-sm font-medium text-gray-700 mb-2">서비스별 생성</p>
                                <div className="flex flex-wrap gap-2">
                                    <button onClick={generateCruiseText} disabled={!selectedGroup || !serviceAvailability.cruise} className={getServiceButtonClass('bg-blue-600', !!selectedGroup && serviceAvailability.cruise)}>크루즈</button>
                                    <button onClick={generateAirportText} disabled={!selectedGroup || !serviceAvailability.airport} className={getServiceButtonClass('bg-indigo-600', !!selectedGroup && serviceAvailability.airport)}>공항픽업샌딩</button>
                                    <button onClick={generateTourText} disabled={!selectedGroup || !serviceAvailability.tour} className={getServiceButtonClass('bg-emerald-600', !!selectedGroup && serviceAvailability.tour)}>가이드투어</button>
                                    <button onClick={generateHotelText} disabled={!selectedGroup || !serviceAvailability.hotel} className={getServiceButtonClass('bg-amber-600', !!selectedGroup && serviceAvailability.hotel)}>호텔</button>
                                    <button onClick={generateRentcarText} disabled={!selectedGroup || !serviceAvailability.rentcar} className={getServiceButtonClass('bg-violet-600', !!selectedGroup && serviceAvailability.rentcar)}>렌터카</button>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white rounded-lg border p-4 space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                <h3 className="text-sm font-medium text-gray-700">생성 결과 {generatedService ? `(${generatedService})` : ''}</h3>
                                <div className="grid grid-cols-2 gap-2 w-full sm:w-auto">
                                    <button
                                        onClick={copyTitle}
                                        disabled={!generatedTitle}
                                        className="px-3 py-2 rounded bg-blue-600 text-white text-sm font-medium border border-blue-700 disabled:bg-gray-300 disabled:border-gray-300"
                                    >
                                        {copiedTitle ? '제목 복사 완료' : '제목 복사'}
                                    </button>
                                    <button
                                        onClick={copyBody}
                                        disabled={!generatedBody}
                                        className="px-3 py-2 rounded bg-blue-600 text-white text-sm font-medium border border-blue-700 disabled:bg-gray-300 disabled:border-gray-300"
                                    >
                                        {copiedBody ? '본문 복사 완료' : '본문 복사'}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs text-gray-700 mb-1">제목</label>
                                <input
                                    value={generatedTitle}
                                    readOnly
                                    className="w-full border rounded-lg px-3 py-2 text-sm"
                                    placeholder="예: 박*우 님, 2026.04.19. 닌빈투어 예약입니다."
                                />
                            </div>

                            <div>
                                <label className="block text-xs text-gray-700 mb-1">내용</label>
                                <div className="w-full min-h-[420px] border rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words bg-white">
                                    {generatedBody || generatedHeader || '서비스 버튼을 눌러 안내문을 생성해 주세요.'}
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </ManagerLayout>
    );
}
