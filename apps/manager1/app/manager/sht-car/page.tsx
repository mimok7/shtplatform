'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ManagerLayout from '@/components/ManagerLayout';
import ShtCarSeatMap from '../../../components/ShtCarSeatMap';
import supabase from '@/lib/supabase';
import { fetchTableInBatches } from '@/lib/fetchInBatches';
import {
    Calendar,
    Car,
    Users,
    MapPin,
    Eye,
    Pencil,
    Trash2,
    Filter,
    ChevronLeft,
    ChevronRight,
    Plus,
    Grid3X3,
    List,
    X
} from 'lucide-react';

interface ShtCarReservation {
    id: string;
    reservation_id: string;
    reservation_type?: string;
    vehicle_number: string;
    seat_number: string;
    sht_category: string;
    pickup_datetime: string;
    pickup_location?: string;
    dropoff_location?: string;
    pier_location?: string;
    cruise_name?: string;
    booker_name?: string;
    booker_email?: string;
    reservation_status?: string;
}

interface ShtCarAnomalyRow {
    issue_type:
        | 'PICKUP_ONLY'
        | 'DROPOFF_ONLY'
        | 'PAIR_COUNT'
        | 'SEAT_MISMATCH'
        | 'SAME_DAY'
        | 'DUPLICATE_SEAT';
    service_date: string;
    reservation_id: string;
    user_id: string;
    reservation_type: string;
    user_name: string;
    user_email: string;
    re_status: string;
    vehicle_number: string;
    seat_number: string;
    sht_category: string;
    pickup_location: string;
    dropoff_location: string;
    duplicate_key?: string;
}

export default function ShtCarPage() {
    const router = useRouter();
    const toKstDateKey = (value: string | Date) => {
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return new Intl.DateTimeFormat('sv-SE', {
            timeZone: 'Asia/Seoul',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).format(date);
    };

    const getKstToday = () => {
        const parts = new Intl.DateTimeFormat('sv-SE', {
            timeZone: 'Asia/Seoul',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).formatToParts(new Date());
        const pick = (type: string) => Number(parts.find((p) => p.type === type)?.value || 0);
        return new Date(pick('year'), pick('month') - 1, pick('day'), 0, 0, 0, 0);
    };

    const [reservations, setReservations] = useState<ShtCarReservation[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState(() => getKstToday());
    const [selectedVehicle, setSelectedVehicle] = useState('all');
    // 카테고리 필터: 전체 / Pickup / Dropoff
    const [selectedCategory, setSelectedCategory] = useState<'all' | 'pickup' | 'dropoff'>('all');
    const [isMapOpen, setIsMapOpen] = useState(false);
    const [mapVehicle, setMapVehicle] = useState<string>('');
    const todayKey = toKstDateKey(getKstToday());
    const [viewMode, setViewMode] = useState<'day' | 'week' | 'month' | 'custom'>('day');
    const [customStartDate, setCustomStartDate] = useState<string>(todayKey);
    const [customEndDate, setCustomEndDate] = useState<string>(todayKey);
    const [appliedStartDate, setAppliedStartDate] = useState<string>(todayKey);
    const [appliedEndDate, setAppliedEndDate] = useState<string>(todayKey);
    const [displayMode, setDisplayMode] = useState<'table' | 'card'>('card');
    const [vehicles, setVehicles] = useState<string[]>([]);
    const [isAnomalyModalOpen, setIsAnomalyModalOpen] = useState(false);
    const [anomalyLoading, setAnomalyLoading] = useState(false);
    const [anomalyRows, setAnomalyRows] = useState<ShtCarAnomalyRow[]>([]);
    const [anomalyFilter, setAnomalyFilter] = useState<'all' | 'pickup' | 'dropoff' | 'pair' | 'mismatch' | 'sameday' | 'duplicate'>('all');
    const [groupByBooker, setGroupByBooker] = useState(false);
    const [showOnlyNonPairUsers, setShowOnlyNonPairUsers] = useState(false);
    const [creatingDropKey, setCreatingDropKey] = useState<string | null>(null);

    useEffect(() => {
        loadReservations();
    }, [selectedDate, selectedVehicle, viewMode, appliedStartDate, appliedEndDate]);

    const getDateRange = (base: Date, mode: 'day' | 'week' | 'month') => {
        const start = new Date(base);
        const end = new Date(base);

        if (mode === 'day') {
            start.setHours(0, 0, 0, 0);
            end.setHours(23, 59, 59, 999);
        } else if (mode === 'week') {
            const day = start.getDay();
            const diffToMonday = (day === 0 ? -6 : 1) - day;
            start.setDate(start.getDate() + diffToMonday);
            start.setHours(0, 0, 0, 0);
            end.setTime(start.getTime());
            end.setDate(end.getDate() + 6);
            end.setHours(23, 59, 59, 999);
        } else {
            start.setDate(1);
            start.setHours(0, 0, 0, 0);
            end.setMonth(start.getMonth() + 1, 0);
            end.setHours(23, 59, 59, 999);
        }

        return { start, end };
    };

    const loadReservations = async () => {
        setLoading(true);
        try {
            let startISO = '';
            let endISO = '';

            if (viewMode === 'custom') {
                if (!appliedStartDate || !appliedEndDate) {
                    setReservations([]);
                    setVehicles([]);
                    return;
                }

                const start = new Date(`${appliedStartDate}T00:00:00+09:00`);
                const end = new Date(`${appliedEndDate}T23:59:59+09:00`);
                const from = start.getTime() <= end.getTime() ? start : end;
                const to = start.getTime() <= end.getTime() ? end : start;

                startISO = from.toISOString();
                endISO = to.toISOString();
            } else {
                const { start, end } = getDateRange(selectedDate, viewMode);
                startISO = start.toISOString();
                endISO = end.toISOString();
            }

            // reservation_car_sht 단일 조회
            let q = supabase
                .from('reservation_car_sht')
                .select('id, reservation_id, vehicle_number, seat_number, sht_category, pickup_datetime, pickup_location, dropoff_location, created_at')
                .gte('pickup_datetime', startISO)
                .lte('pickup_datetime', endISO)
                .order('pickup_datetime', { ascending: true })
                .order('vehicle_number', { ascending: true })
                .order('seat_number', { ascending: true });

            if (selectedVehicle !== 'all') q = q.eq('vehicle_number', selectedVehicle);

            const { data: reservationCarRows, error: reservationCarError } = await q;

            if (reservationCarError) {
                console.warn('reservation_car_sht 조회 오류:', reservationCarError);
                setReservations([]);
                setVehicles([]);
                return;
            }

            const filteredRows = reservationCarRows || [];

            console.log(`📋 reservation_car_sht=${filteredRows.length} 건`);

            if (filteredRows.length === 0) {
                setReservations([]);
                setVehicles([]);
                return;
            }

            const reservationIds = Array.from(
                new Set(filteredRows.map((row: any) => row.reservation_id).filter(Boolean))
            ) as string[];

            const reservationRows = reservationIds.length > 0
                ? await fetchTableInBatches<any>(
                    'reservation',
                    're_id',
                    reservationIds,
                    're_id, re_user_id',
                    80
                )
                : [];

            const cruiseCarRows = reservationIds.length > 0
                ? await fetchTableInBatches<any>(
                    'reservation_cruise_car',
                    'reservation_id',
                    reservationIds,
                    'reservation_id, pickup_location, dropoff_location',
                    80
                )
                : [];

            const userIds = Array.from(
                new Set((reservationRows || []).map((r: any) => r.re_user_id).filter(Boolean))
            ) as string[];

            const userRows = userIds.length > 0
                ? await fetchTableInBatches<any>(
                    'users',
                    'id',
                    userIds,
                    'id, name, email',
                    80
                )
                : [];

            const reservationToUserId = new Map((reservationRows || []).map((r: any) => [r.re_id, r.re_user_id]));
            const userById = new Map((userRows || []).map((u: any) => [u.id, u]));

            // 동일 reservation_id 내에서 유효한 픽업/드롭 위치를 수집
            const locationByReservationId = new Map<string, { pickup?: string; dropoff?: string }>();

            // 1) reservation_cruise_car 위치를 기본값으로 먼저 적재
            (cruiseCarRows || []).forEach((row: any) => {
                const reservationId = row.reservation_id;
                if (!reservationId) return;

                const pickup = typeof row.pickup_location === 'string' ? row.pickup_location.trim() : '';
                const dropoff = typeof row.dropoff_location === 'string' ? row.dropoff_location.trim() : '';

                if (pickup || dropoff) {
                    locationByReservationId.set(reservationId, {
                        pickup: pickup || undefined,
                        dropoff: dropoff || undefined,
                    });
                }
            });

            // 2) reservation_car_sht 위치로 누락값 보완
            filteredRows.forEach((row: any) => {
                const reservationId = row.reservation_id;
                if (!reservationId) return;

                const pickup = typeof row.pickup_location === 'string'
                    ? row.pickup_location.trim()
                    : (typeof row.pickupLocation === 'string' ? row.pickupLocation.trim() : '');
                const dropoff = typeof row.dropoff_location === 'string'
                    ? row.dropoff_location.trim()
                    : (typeof row.dropoffLocation === 'string' ? row.dropoffLocation.trim() : '');

                const existing = locationByReservationId.get(reservationId) || {};
                locationByReservationId.set(reservationId, {
                    pickup: existing.pickup || pickup || undefined,
                    dropoff: existing.dropoff || dropoff || undefined,
                });
            });

            // 최종 매핑
            const mappedReservations = filteredRows.map((row: any) => {
                const userId = reservationToUserId.get(row.reservation_id);
                const user = userId ? userById.get(userId) : null;
                const locations = locationByReservationId.get(row.reservation_id || '') || {};
                const rowPickup = typeof row.pickup_location === 'string'
                    ? row.pickup_location.trim()
                    : (typeof row.pickupLocation === 'string' ? row.pickupLocation.trim() : '');
                const rowDropoff = typeof row.dropoff_location === 'string'
                    ? row.dropoff_location.trim()
                    : (typeof row.dropoffLocation === 'string' ? row.dropoffLocation.trim() : '');
                return {
                    id: row.id,
                    reservation_id: row.reservation_id || '',
                    reservation_type: 'car_sht',
                    vehicle_number: row.vehicle_number,
                    seat_number: row.seat_number,
                    sht_category: row.sht_category,
                    pickup_datetime: row.pickup_datetime,
                    pickup_location: rowPickup || locations.pickup || null,
                    dropoff_location: rowDropoff || locations.dropoff || null,
                    pier_location: null,
                    cruise_name: null,
                    booker_name: user?.name || null,
                    booker_email: user?.email || null,
                    reservation_status: 'confirmed'
                };
            });

            // 차량 목록 동적 구성 (현재 기간 데이터 기준)
            const distinctVehicles = Array.from(new Set(mappedReservations
                .map(r => r.vehicle_number)
                .filter(v => !!v))) as string[];
            distinctVehicles.sort();
            setVehicles(distinctVehicles);

            // 좌석도 기본 차량 선택 보정
            if (!mapVehicle && distinctVehicles.length > 0) {
                setMapVehicle(distinctVehicles[0]);
            }

            setReservations(mappedReservations);
        } catch (error) {
            console.error('스하차량 예약 로딩 실패:', error);
        } finally {
            setLoading(false);
        }
    };

    const navigateDate = (direction: 'prev' | 'next') => {
        const newDate = new Date(selectedDate);
        if (viewMode === 'day') {
            newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
        } else if (viewMode === 'week') {
            newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
        } else {
            newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1));
        }
        setSelectedDate(newDate);
    };

    const handleSearchCustomRange = () => {
        if (!customStartDate || !customEndDate) return;
        setAppliedStartDate(customStartDate);
        setAppliedEndDate(customEndDate);
        setViewMode('custom');
    };

    const openSeatMap = (vehicleNumber: string, category?: 'pickup' | 'dropoff', usageDate?: string) => {
        // 액션에서 사용일이 전달되면 해당 날짜로 필터하고 일 단위 뷰로 이동
        if (usageDate) {
            try {
                const d = new Date(usageDate);
                if (!isNaN(d.getTime())) {
                    const dateKey = toKstDateKey(d);
                    const [y, m, day] = dateKey.split('-').map(Number);
                    setSelectedDate(new Date(y, m - 1, day, 0, 0, 0, 0));
                    setViewMode('day');
                }
            } catch (e) {
                // 무시
            }
        }

        setMapVehicle(vehicleNumber);
        // 카테고리 지정이 있으면 모달 내부에서 초기 카테고리로 사용되도록 state 동기화는 모달쪽에서 처리
        setIsMapOpen(true);
    };

    const normalizeCategory = (raw?: string) => {
        const cat = String(raw || '').trim().toLowerCase();
        if (cat === 'pickup' || cat === '픽업') return 'pickup';
        if (cat === 'dropoff' || cat === 'drop-off' || cat === '드랍' || cat === '샌딩') return 'dropoff';
        return 'other';
    };

    const splitSeats = (raw?: string) => {
        return String(raw || '')
            .split(',')
            .map((s) => s.trim())
            .filter((s) => !!s && s.toLowerCase() !== 'all');
    };

    const loadAnomalyRows = async () => {
        setAnomalyLoading(true);
        try {
            const { data: carRows, error: carError } = await supabase
                .from('reservation_car_sht')
                .select('id, reservation_id, vehicle_number, seat_number, sht_category, pickup_datetime, usage_date, pickup_location, dropoff_location')
                .order('pickup_datetime', { ascending: true });

            if (carError) {
                console.warn('이상 배정 조회 실패(reservation_car_sht):', carError);
                setAnomalyRows([]);
                return;
            }

            const baseRows = carRows || [];
            if (baseRows.length === 0) {
                setAnomalyRows([]);
                return;
            }

            const reservationIds = Array.from(new Set(baseRows.map((r: any) => r.reservation_id).filter(Boolean)));
            const normalizedReservationIds = Array.from(
                new Set(
                    reservationIds
                        .map((id: any) => String(id || '').trim())
                        .filter(Boolean)
                )
            );
            const reservationRows = reservationIds.length > 0
                ? await fetchTableInBatches<any>(
                    'reservation',
                    're_id',
                    normalizedReservationIds,
                    're_id, re_user_id, re_status, re_type',
                    80
                )
                : [];

            const userIds = Array.from(new Set((reservationRows || []).map((r: any) => r.re_user_id).filter(Boolean)));
            const userRows = userIds.length > 0
                ? await fetchTableInBatches<any>(
                    'users',
                    'id',
                    userIds,
                    'id, name, email',
                    80
                )
                : [];

            const reservationMap = new Map(
                (reservationRows || []).map((r: any) => [String(r.re_id || '').trim(), r])
            );
            const userMap = new Map((userRows || []).map((u: any) => [u.id, u]));

            const rowsWithMeta = baseRows.map((row: any) => {
                const reservationKey = String(row.reservation_id || '').trim();
                const reservation = reservationMap.get(reservationKey);
                const user = reservation ? userMap.get(reservation.re_user_id) : null;
                const dateKey = toKstDateKey(row.usage_date || row.pickup_datetime);
                return {
                    ...row,
                    matched_reservation_id: reservation?.re_id || '',
                    service_date: dateKey || '-',
                    category_norm: normalizeCategory(row.sht_category),
                    user_id: reservation?.re_user_id || '',
                    user_name: user?.name || (user?.email ? String(user.email).split('@')[0] : '-'),
                    user_email: user?.email || '-',
                    re_status: reservation?.re_status || '-',
                    reservation_type: reservation?.re_type || '-',
                };
            });

            const anomaly: ShtCarAnomalyRow[] = [];

            const byReservation = new Map<string, any[]>();
            rowsWithMeta.forEach((r: any) => {
                if (!r.matched_reservation_id) return;
                if (!byReservation.has(r.matched_reservation_id)) byReservation.set(r.matched_reservation_id, []);
                byReservation.get(r.matched_reservation_id)!.push(r);
            });

            const pushIssue = (issue: ShtCarAnomalyRow['issue_type'], it: any, reservationId: string) => {
                anomaly.push({
                    issue_type: issue,
                    service_date: it.service_date,
                    reservation_id: reservationId,
                    user_id: it.user_id,
                    reservation_type: it.reservation_type,
                    user_name: it.user_name,
                    user_email: it.user_email,
                    re_status: it.re_status,
                    vehicle_number: it.vehicle_number || '-',
                    seat_number: it.seat_number || '-',
                    sht_category: it.sht_category || '-',
                    pickup_location: it.pickup_location || '-',
                    dropoff_location: it.dropoff_location || '-',
                });
            };

            const normSeat = (raw?: string) => String(raw || '').trim().toLowerCase();

            byReservation.forEach((items, reservationId) => {
                const pickups = items.filter((it) => it.category_norm === 'pickup');
                const dropoffs = items.filter((it) => it.category_norm === 'dropoff');

                // 1) 픽업/드롭 중 한쪽만 존재
                if (pickups.length > 0 && dropoffs.length === 0) {
                    items.forEach((it) => pushIssue('PICKUP_ONLY', it, reservationId));
                    return;
                }
                if (pickups.length === 0 && dropoffs.length > 0) {
                    items.forEach((it) => pushIssue('DROPOFF_ONLY', it, reservationId));
                    return;
                }
                if (pickups.length === 0 && dropoffs.length === 0) return;

                // 2) 픽업/드롭 짝 개수 불일치 (1쌍이 아니면 모두 오류)
                if (pickups.length !== 1 || dropoffs.length !== 1) {
                    items.forEach((it) => pushIssue('PAIR_COUNT', it, reservationId));
                    return;
                }

                // 3) 1픽업+1드롭 정상 짝: 좌석 일치 / 당일 왕복 검사
                const p = pickups[0];
                const d = dropoffs[0];
                const pSeat = normSeat(p.seat_number);
                const dSeat = normSeat(d.seat_number);
                const isAllPair = pSeat === 'all' && dSeat === 'all';

                if (pSeat !== dSeat) {
                    pushIssue('SEAT_MISMATCH', p, reservationId);
                    pushIssue('SEAT_MISMATCH', d, reservationId);
                }

                // 4) 단독(ALL)이 아니면 픽업일==드롭일이면 오류
                if (!isAllPair && p.service_date && d.service_date && p.service_date === d.service_date) {
                    pushIssue('SAME_DAY', p, reservationId);
                    pushIssue('SAME_DAY', d, reservationId);
                }
            });

            const dupMap = new Map<string, any[]>();
            rowsWithMeta.forEach((it: any) => {
                const seats = splitSeats(it.seat_number);
                if (seats.length === 0) return;
                seats.forEach((seat) => {
                    const key = `${it.service_date}|${it.vehicle_number || '-'}|${it.category_norm}|${seat}`;
                    if (!dupMap.has(key)) dupMap.set(key, []);
                    dupMap.get(key)!.push({ ...it, seat_token: seat, duplicate_key: key });
                });
            });

            dupMap.forEach((items, key) => {
                if (items.length <= 1) return;
                items.forEach((it) => {
                    anomaly.push({
                        issue_type: 'DUPLICATE_SEAT',
                        service_date: it.service_date,
                        reservation_id: it.matched_reservation_id || '-',
                        user_id: it.user_id || '',
                        reservation_type: it.reservation_type || '-',
                        user_name: it.user_name,
                        user_email: it.user_email,
                        re_status: it.re_status,
                        vehicle_number: it.vehicle_number || '-',
                        seat_number: it.seat_token || '-',
                        sht_category: it.sht_category || '-',
                        pickup_location: it.pickup_location || '-',
                        dropoff_location: it.dropoff_location || '-',
                        duplicate_key: key,
                    });
                });
            });

            anomaly.sort((a, b) => {
                if (a.issue_type !== b.issue_type) return a.issue_type.localeCompare(b.issue_type);
                if (a.service_date !== b.service_date) return a.service_date.localeCompare(b.service_date);
                if (a.vehicle_number !== b.vehicle_number) return a.vehicle_number.localeCompare(b.vehicle_number);
                return a.reservation_id.localeCompare(b.reservation_id);
            });

            setAnomalyRows(anomaly);
        } catch (error) {
            console.error('이상 배정 조회 실패:', error);
            setAnomalyRows([]);
        } finally {
            setAnomalyLoading(false);
        }
    };

    const openAnomalyModal = async () => {
        setIsAnomalyModalOpen(true);
        setAnomalyFilter('all');
        await loadAnomalyRows();
    };

    const filteredAnomalyRows = anomalyRows.filter((row) => {
        if (anomalyFilter === 'all') return true;
        if (anomalyFilter === 'pickup') return row.issue_type === 'PICKUP_ONLY';
        if (anomalyFilter === 'dropoff') return row.issue_type === 'DROPOFF_ONLY';
        if (anomalyFilter === 'pair') return row.issue_type === 'PAIR_COUNT';
        if (anomalyFilter === 'mismatch') return row.issue_type === 'SEAT_MISMATCH';
        if (anomalyFilter === 'sameday') return row.issue_type === 'SAME_DAY';
        return row.issue_type === 'DUPLICATE_SEAT';
    });

    const anomalyGroups = filteredAnomalyRows.reduce((acc, row) => {
        const fallbackType = row.reservation_type || '-';
        const key = row.user_id
            ? `${row.user_id}||${row.user_name || '-'}||${row.user_email || '-'}`
            : `예약자미확인||예약타입:${fallbackType}||-`;
        if (!acc[key]) acc[key] = [];
        acc[key].push(row);
        return acc;
    }, {} as Record<string, ShtCarAnomalyRow[]>);

    // 카테고리 매칭 함수 (전체/픽업/드랍)
    const categoryMatches = (rawCat?: string, rawSeat?: string) => {
        if (selectedCategory === 'all') return true;
        const cat = String(rawCat || '').trim().toLowerCase();
        if (selectedCategory === 'pickup') return cat === 'pickup';
        if (selectedCategory === 'dropoff') return cat === 'dropoff' || cat === 'drop-off';
        return false;
    };

    const getBookerKey = (reservation: ShtCarReservation) => {
        const name = (reservation.booker_name || '').trim() || '예약자 미확인';
        const email = (reservation.booker_email || '').trim() || '-';
        return `${name}||${email}`;
    };

    // 카테고리 필터 적용된 예약 목록 (렌더/통계용)
    const filteredReservations = reservations.filter(r => categoryMatches(r.sht_category, r.seat_number));
    const filteredBookerReservations = filteredReservations.reduce((groups, reservation) => {
        const key = getBookerKey(reservation);
        if (!groups[key]) groups[key] = [];
        groups[key].push(reservation);
        return groups;
    }, {} as Record<string, ShtCarReservation[]>);
    const nonPairBookerKeys = new Set(
        Object.entries(filteredBookerReservations)
            .filter(([, rows]) => rows.length !== 2)
            .map(([key]) => key)
    );
    const displayReservations = groupByBooker && showOnlyNonPairUsers
        ? filteredReservations.filter((reservation) => {
            const name = (reservation.booker_name || '').trim() || '예약자 미확인';
            const email = (reservation.booker_email || '').trim() || '-';
            return nonPairBookerKeys.has(`${name}||${email}`);
        })
        : filteredReservations;

    // 날짜별 그룹화
    const groupedReservations: { [date: string]: ShtCarReservation[] } = displayReservations.reduce((groups, reservation) => {
        const date = toKstDateKey(reservation.pickup_datetime);
        if (!date) return groups;
        if (!groups[date]) {
            groups[date] = [];
        }
        groups[date].push(reservation);
        return groups;
    }, {} as { [date: string]: ShtCarReservation[] });

    const getStatusColor = (status?: string) => {
        switch (status) {
            case 'confirmed':
                return 'bg-green-100 text-green-800';
            case 'approved':
                return 'bg-blue-100 text-blue-800';
            case 'pending':
                return 'bg-yellow-100 text-yellow-800';
            case 'cancelled':
                return 'bg-red-100 text-red-800';
            default:
                return 'bg-gray-100 text-gray-800';
        }
    };

    const getStatusText = (status?: string) => {
        switch (status) {
            case 'confirmed':
                return '확정';
            case 'approved':
                return '승인';
            case 'pending':
                return '대기';
            case 'cancelled':
                return '취소';
            default:
                return '미정';
        }
    };

    const getCategoryInfo = (raw?: string) => {
        const category = String(raw || '').trim().toLowerCase();
        if (category === 'pickup') {
            return { label: '픽업', className: 'bg-sky-100 text-sky-800' };
        }
        if (category === 'drop-off' || category === 'dropoff') {
            return { label: '드롭', className: 'bg-rose-100 text-rose-800' };
        }
        return { label: raw || '일반', className: 'bg-gray-100 text-gray-800' };
    };

    const getVehicleBadgeClass = (vehicle?: string) => {
        const value = String(vehicle || '').toLowerCase();
        if (value.includes('1') || value.includes('2')) return 'bg-violet-100 text-violet-800';
        if (value.includes('3') || value.includes('4')) return 'bg-teal-100 text-teal-800';
        return 'bg-amber-100 text-amber-800';
    };

    const getSeatBadgeClass = (seat?: string) => {
        const value = String(seat || '').toLowerCase();
        if (value.includes('all')) return 'bg-fuchsia-100 text-fuchsia-800';
        if (value.includes('a')) return 'bg-blue-100 text-blue-800';
        if (value.includes('b')) return 'bg-emerald-100 text-emerald-800';
        if (value.includes('c')) return 'bg-orange-100 text-orange-800';
        return 'bg-slate-100 text-slate-800';
    };

    const formatUsageDate = (value?: string) => {
        const date = toKstDateKey(value || '');
        if (!date) return '-';
        return new Date(date).toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        });
    };

    const handleDeleteReservation = async (reservation: ShtCarReservation) => {
        const categoryInfo = getCategoryInfo(reservation.sht_category);
        const detailMessage = [
            '아래 데이터를 삭제합니다.',
            `사용자: ${reservation.booker_name || '-'} (${reservation.booker_email || '-'})`,
            `사용일: ${formatUsageDate(reservation.pickup_datetime)}`,
            `구분: ${categoryInfo.label}`,
            `차량: ${reservation.vehicle_number || '-'}`,
            `좌석: ${reservation.seat_number || '-'}`,
            `픽업: ${reservation.pickup_location || '-'}`,
            `드롭: ${reservation.dropoff_location || '-'}`,
            '',
            '정말 삭제하시겠습니까?',
        ].join('\n');

        const confirmed = window.confirm(detailMessage);
        if (!confirmed) return;

        const { error } = await supabase
            .from('reservation_car_sht')
            .delete()
            .eq('id', reservation.id);

        if (error) {
            alert(`삭제 실패: ${error.message}`);
            return;
        }

        await loadReservations();
    };

    const handleEditReservation = (reservation: ShtCarReservation) => {
        if (!reservation.reservation_id) {
            alert('예약 ID가 없어 수정 페이지로 이동할 수 없습니다.');
            return;
        }
        router.push(`/manager/reservation-edit/sht?id=${encodeURIComponent(reservation.reservation_id)}`);
    };

    const toNextDayKstDate = (value?: string) => {
        const dateKey = toKstDateKey(value || '');
        if (!dateKey) return '';
        const base = new Date(`${dateKey}T00:00:00+09:00`);
        if (Number.isNaN(base.getTime())) return '';
        base.setDate(base.getDate() + 1);
        return toKstDateKey(base);
    };

    const getPickupRowForAutoDrop = (rows: ShtCarReservation[]) => {
        return rows.find((row) => normalizeCategory(row.sht_category) === 'pickup') || null;
    };

    const hasDropoffRow = (rows: ShtCarReservation[]) => {
        return rows.some((row) => normalizeCategory(row.sht_category) === 'dropoff');
    };

    const handleAddDropReservationForBooker = async (bookerKey: string, bookerReservations: ShtCarReservation[]) => {
        const pickupReservation = getPickupRowForAutoDrop(bookerReservations);
        if (!pickupReservation) {
            alert('픽업 데이터가 없어 드롭 예약을 추가할 수 없습니다.');
            return;
        }
        if (hasDropoffRow(bookerReservations)) {
            alert('이미 드롭 예약이 존재합니다.');
            return;
        }

        setCreatingDropKey(bookerKey);
        try {
            const { data: sourceRow, error: sourceError } = await supabase
                .from('reservation_car_sht')
                .select('id, reservation_id, vehicle_number, seat_number, pickup_datetime, pickup_location, dropoff_location, car_price_code, car_count, passenger_count, unit_price, request_note, accommodation_info')
                .eq('id', pickupReservation.id)
                .maybeSingle();

            if (sourceError || !sourceRow) {
                alert(`픽업 데이터 조회 실패: ${sourceError?.message || '데이터 없음'}`);
                return;
            }

            const nextDayDate = toNextDayKstDate(sourceRow.pickup_datetime || pickupReservation.pickup_datetime);
            if (!nextDayDate) {
                alert('픽업 사용일을 해석할 수 없어 드롭 예약을 추가할 수 없습니다.');
                return;
            }

            const { error: insertError } = await supabase
                .from('reservation_car_sht')
                .insert({
                    reservation_id: sourceRow.reservation_id || pickupReservation.reservation_id,
                    vehicle_number: sourceRow.vehicle_number || pickupReservation.vehicle_number || null,
                    seat_number: sourceRow.seat_number || pickupReservation.seat_number || null,
                    sht_category: 'dropoff',
                    pickup_datetime: nextDayDate,
                    usage_date: nextDayDate,
                    pickup_location: sourceRow.pickup_location ?? pickupReservation.pickup_location ?? null,
                    dropoff_location: sourceRow.dropoff_location ?? pickupReservation.dropoff_location ?? null,
                    car_price_code: sourceRow.car_price_code ?? null,
                    car_count: sourceRow.car_count ?? null,
                    passenger_count: sourceRow.passenger_count ?? null,
                    unit_price: sourceRow.unit_price ?? null,
                    car_total_price: 0,
                    request_note: sourceRow.request_note ?? null,
                    accommodation_info: sourceRow.accommodation_info ?? null,
                });

            if (insertError) {
                alert(`드롭 예약 추가 실패: ${insertError.message}`);
                return;
            }

            await loadReservations();
            alert('드롭 예약을 추가했습니다.');
        } catch (error: any) {
            alert(`드롭 예약 추가 실패: ${error?.message || '알 수 없는 오류'}`);
        } finally {
            setCreatingDropKey(null);
        }
    };

    const groupReservationsByBooker = (targetReservations: ShtCarReservation[]) => {
        return targetReservations.reduce((groups, reservation) => {
            const name = (reservation.booker_name || '').trim() || '예약자 미확인';
            const email = (reservation.booker_email || '').trim() || '-';
            const key = `${name}||${email}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(reservation);
            return groups;
        }, {} as Record<string, ShtCarReservation[]>);
    };

    const getEarliestUsageTime = (rows: ShtCarReservation[]) => {
        let min = Number.POSITIVE_INFINITY;
        rows.forEach((row) => {
            const dateKey = toKstDateKey(row.pickup_datetime);
            if (!dateKey) return;
            const t = new Date(`${dateKey}T00:00:00+09:00`).getTime();
            if (!Number.isNaN(t)) min = Math.min(min, t);
        });
        return min;
    };

    const sortBookerEntriesByUsageDate = (entries: [string, ShtCarReservation[]][]) => {
        return entries.sort(([keyA, rowsA], [keyB, rowsB]) => {
            const dateA = getEarliestUsageTime(rowsA);
            const dateB = getEarliestUsageTime(rowsB);
            if (dateA !== dateB) return dateA - dateB;
            return keyA.localeCompare(keyB);
        });
    };

    const renderReservationsByDisplayMode = (targetReservations: ShtCarReservation[]) => {
        if (displayMode === 'table') {
            return (
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-green-800 uppercase tracking-wider">
                                    예약타입
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-green-800 uppercase tracking-wider">
                                    차량번호
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-green-800 uppercase tracking-wider">
                                    좌석번호
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-green-800 uppercase tracking-wider">
                                    구분
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-green-800 uppercase tracking-wider">
                                    승차위치
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-green-800 uppercase tracking-wider">
                                    하차위치
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-green-800 uppercase tracking-wider">
                                    선착장
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-green-800 uppercase tracking-wider">
                                    예약자
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-green-800 uppercase tracking-wider">
                                    상태
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-green-800 uppercase tracking-wider">
                                    액션
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {targetReservations.map((reservation) => (
                                <tr key={reservation.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                                            {reservation.reservation_type || '-'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getVehicleBadgeClass(reservation.vehicle_number)}`}>
                                            {reservation.vehicle_number}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSeatBadgeClass(reservation.seat_number)}`}>
                                            {reservation.seat_number}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        {(() => {
                                            const info = getCategoryInfo(reservation.sht_category);
                                            return (
                                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${info.className}`}>
                                                    {info.label}
                                                </span>
                                            );
                                        })()}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        {reservation.pickup_location ? (
                                            <div className="flex items-center gap-1">
                                                <MapPin className="w-3 h-3 text-green-500" />
                                                <span>{reservation.pickup_location}</span>
                                            </div>
                                        ) : '-'
                                        }
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        {reservation.dropoff_location ? (
                                            <div className="flex items-center gap-1">
                                                <MapPin className="w-3 h-3 text-red-500" />
                                                <span>{reservation.dropoff_location}</span>
                                            </div>
                                        ) : '-'
                                        }
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        {(reservation.cruise_name || reservation.pier_location) ? (
                                            <div className="flex items-center gap-1">
                                                <MapPin className="w-3 h-3 text-blue-500" />
                                                <span>{reservation.cruise_name || reservation.pier_location}</span>
                                            </div>
                                        ) : '-'
                                        }
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        <div>
                                            <div className="font-medium">{reservation.booker_name || '-'}</div>
                                            <div className="text-xs text-gray-500">{reservation.booker_email || ''}</div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(reservation.reservation_status)}`}>
                                            {getStatusText(reservation.reservation_status)}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                        <div className="flex items-center gap-3">
                                            <button
                                                onClick={() => handleEditReservation(reservation)}
                                                className="text-emerald-600 hover:text-emerald-800 flex items-center gap-1"
                                            >
                                                <Pencil className="w-4 h-4" />
                                                수정
                                            </button>
                                            <button
                                                onClick={() => openSeatMap(reservation.vehicle_number, undefined, reservation.pickup_datetime)}
                                                className="text-blue-600 hover:text-blue-900 flex items-center gap-1"
                                            >
                                                <Eye className="w-4 h-4" />
                                                좌석도
                                            </button>
                                            <button
                                                onClick={() => handleDeleteReservation(reservation)}
                                                className="text-red-600 hover:text-red-800 flex items-center gap-1"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                                삭제
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        }

        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {targetReservations.map((reservation) => (
                    <div key={reservation.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between gap-2 mb-3">
                            <div className="min-w-0">
                                <div className="text-sm font-semibold text-gray-900 truncate">{reservation.booker_name || '-'}</div>
                                <div className="text-xs text-gray-500 truncate">{reservation.booker_email || ''}</div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(reservation.reservation_status)}`}>
                                    {getStatusText(reservation.reservation_status)}
                                </span>
                                <button
                                    onClick={() => openSeatMap(reservation.vehicle_number, undefined, reservation.pickup_datetime)}
                                    className="text-blue-600 hover:text-blue-900 p-1 rounded-md hover:bg-blue-50"
                                    title="상세"
                                >
                                    <Eye className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => handleEditReservation(reservation)}
                                    className="text-emerald-600 hover:text-emerald-800 p-1 rounded-md hover:bg-emerald-50"
                                    title="수정"
                                >
                                    <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => handleDeleteReservation(reservation)}
                                    className="text-red-600 hover:text-red-800 p-1 rounded-md hover:bg-red-50"
                                    title="삭제"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        <div className="space-y-1.5 text-sm mb-3">
                            <div className="flex items-center gap-2 flex-wrap">
                                {(() => {
                                    const categoryInfo = getCategoryInfo(reservation.sht_category);
                                    return (
                                        <>
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${categoryInfo.className}`}>
                                                {categoryInfo.label}
                                            </span>
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getVehicleBadgeClass(reservation.vehicle_number)}`}>
                                                {reservation.vehicle_number || '-'}
                                            </span>
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSeatBadgeClass(reservation.seat_number)}`}>
                                                {reservation.seat_number || '-'}
                                            </span>
                                        </>
                                    );
                                })()}
                            </div>
                            <div className="text-gray-700">
                                사용일: {formatUsageDate(reservation.pickup_datetime)}
                            </div>
                            <div className="text-gray-700">픽업: {reservation.pickup_location || '-'}</div>
                            <div className="text-gray-700">드롭: {reservation.dropoff_location || '-'}</div>
                        </div>

                        {(reservation.cruise_name || reservation.pier_location) && (
                            <div className="pt-2 border-t border-gray-100 text-sm text-gray-700">
                                선착장: {reservation.cruise_name || reservation.pier_location}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        );
    };

    if (loading) {
        return (
            <ManagerLayout title="스하차량 관리" activeTab="sht-car">
                <div className="flex justify-center items-center h-64">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                        <p className="mt-4 text-gray-600">스하차량 정보를 불러오는 중...</p>
                    </div>
                </div>
            </ManagerLayout>
        );
    }

    return (
        <ManagerLayout title="스하차량 관리" activeTab="sht-car">
            <div className="space-y-6">
                {/* 컨트롤 패널 */}
                <div className="bg-white rounded-lg shadow-md p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => navigateDate('prev')}
                                className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200"
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>

                            <h2 className="text-xl font-semibold">
                                {viewMode === 'custom'
                                    ? `${appliedStartDate || '-'} ~ ${appliedEndDate || '-'}`
                                    : selectedDate.toLocaleDateString('ko-KR', {
                                        year: 'numeric',
                                        month: 'long',
                                        ...(viewMode === 'day' && { day: 'numeric' })
                                    })}
                            </h2>

                            {viewMode === 'day' && (
                                <button
                                    onClick={() => setSelectedDate(getKstToday())}
                                    className="px-3 py-1 bg-blue-50 text-blue-600 rounded-lg border border-blue-200 text-sm font-medium hover:bg-blue-100"
                                >
                                    오늘
                                </button>
                            )}

                            <button
                                onClick={() => navigateDate('next')}
                                className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200"
                            >
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="flex gap-2 items-center flex-wrap justify-end">
                            <div className="inline-flex flex-row items-center gap-2 mr-1 whitespace-nowrap">
                                <span className="text-sm text-gray-600">기간:</span>
                                <input
                                    type="date"
                                    value={customStartDate}
                                    onChange={(e) => setCustomStartDate(e.target.value)}
                                    className="px-2 py-2 border border-gray-300 rounded-lg text-sm"
                                />
                                <span className="text-sm text-gray-500">~</span>
                                <input
                                    type="date"
                                    value={customEndDate}
                                    onChange={(e) => setCustomEndDate(e.target.value)}
                                    className="px-2 py-2 border border-gray-300 rounded-lg text-sm"
                                />
                                <button
                                    onClick={handleSearchCustomRange}
                                    className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700"
                                >
                                    검색
                                </button>
                            </div>
                            <button
                                onClick={() => setViewMode('day')}
                                className={`px-4 py-2 rounded-lg transition-colors ${viewMode === 'day' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'
                                    }`}
                            >
                                일간
                            </button>
                            <button
                                onClick={() => setViewMode('week')}
                                className={`px-4 py-2 rounded-lg transition-colors ${viewMode === 'week' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'
                                    }`}
                            >
                                주간
                            </button>
                            <button
                                onClick={() => setViewMode('month')}
                                className={`px-4 py-2 rounded-lg transition-colors ${viewMode === 'month' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'
                                    }`}
                            >
                                월간
                            </button>
                            <div className="w-full flex justify-end">
                                <button
                                    onClick={() => {
                                        setGroupByBooker(true);
                                        setShowOnlyNonPairUsers((prev) => !prev);
                                    }}
                                    className={`px-3 py-2 rounded-lg text-sm ${showOnlyNonPairUsers ? 'bg-rose-700 text-white' : 'bg-rose-600 text-white hover:bg-rose-700'}`}
                                >
                                    이상 배정 조회 {showOnlyNonPairUsers ? 'ON' : 'OFF'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* 구분/차량/보기 필터 - 한 행에 배치 */}
                    <div className="flex flex-wrap gap-4 items-center">
                        <div className="flex gap-2 items-center">
                            <Filter className="w-5 h-5 text-gray-600" />
                            <span className="text-sm text-gray-600">구분:</span>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setSelectedCategory('all')}
                                    className={`px-3 py-1 rounded-full text-xs transition-colors ${selectedCategory === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
                                >
                                    전체
                                </button>
                                <button
                                    onClick={() => setSelectedCategory('pickup')}
                                    className={`px-3 py-1 rounded-full text-xs transition-colors ${selectedCategory === 'pickup' ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700'}`}
                                >
                                    픽업
                                </button>
                                <button
                                    onClick={() => setSelectedCategory('dropoff')}
                                    className={`px-3 py-1 rounded-full text-xs transition-colors ${selectedCategory === 'dropoff' ? 'bg-yellow-600 text-white' : 'bg-gray-200 text-gray-700'}`}
                                >
                                    드랍
                                </button>
                            </div>
                        </div>

                        <div className="flex gap-2 items-center">
                            <span className="text-sm text-gray-600">차량:</span>
                            <div className="flex gap-2 flex-wrap">
                                <button
                                    onClick={() => setSelectedVehicle('all')}
                                    className={`px-3 py-1 rounded-full text-sm transition-colors ${selectedVehicle === 'all' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}`}
                                >
                                    전체 차량
                                </button>
                                {vehicles.map(vehicle => (
                                    <button
                                        key={vehicle}
                                        onClick={() => setSelectedVehicle(vehicle)}
                                        className={`px-3 py-1 rounded-full text-sm transition-colors ${selectedVehicle === vehicle ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}`}
                                    >
                                        {vehicle}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex gap-2 items-center">
                            <span className="text-sm text-gray-600">보기:</span>
                            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
                                <button
                                    onClick={() => setGroupByBooker((prev) => !prev)}
                                    className={`px-3 py-1 rounded-md text-sm transition-colors ${groupByBooker
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-white text-gray-700 hover:text-gray-900'
                                        }`}
                                >
                                    그룹기준: {groupByBooker ? '예약자' : '일자'}
                                </button>
                                <button
                                    onClick={() => setDisplayMode('card')}
                                    className={`px-3 py-1 rounded-md text-sm transition-colors flex items-center gap-2 ${displayMode === 'card'
                                        ? 'bg-white text-blue-600 shadow-sm'
                                        : 'text-gray-600 hover:text-gray-800'
                                        }`}
                                >
                                    <Grid3X3 className="w-4 h-4" />
                                    카드
                                </button>
                                <button
                                    onClick={() => setDisplayMode('table')}
                                    className={`px-3 py-1 rounded-md text-sm transition-colors flex items-center gap-2 ${displayMode === 'table'
                                        ? 'bg-white text-blue-600 shadow-sm'
                                        : 'text-gray-600 hover:text-gray-800'
                                        }`}
                                >
                                    <List className="w-4 h-4" />
                                    테이블
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 선택 차량 상세: Pickup / Drop-off 요약 카드 */}
                {selectedVehicle !== 'all' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {(['pickup', 'dropoff'] as const).map(cat => {
                            const list = reservations.filter(r => r.vehicle_number === selectedVehicle)
                                .filter(r => {
                                    const rc = String(r.sht_category || '').trim().toLowerCase();
                                    const seatAll = String(r.seat_number || '').trim().toLowerCase() === 'all';
                                    if (seatAll) return true; // 전체예약은 항상 포함
                                    return cat === 'pickup' ? rc === 'pickup' : (rc === 'dropoff' || rc === 'drop-off');
                                });
                            const seatChips: string[] = [];
                            const hasAll = list.some(r => String(r.seat_number || '').trim().toLowerCase() === 'all');
                            if (hasAll) {
                                seatChips.push('All');
                            } else {
                                const set = new Set<string>();
                                list.forEach(r => String(r.seat_number || '')
                                    .split(',').map(s => s.trim()).filter(Boolean).forEach(s => set.add(s))
                                );
                                seatChips.push(...Array.from(set));
                            }

                            // 해당 카테고리의 위치 정보 수집
                            const locations = list.map(r => ({
                                pickup: r.pickup_location,
                                dropoff: r.dropoff_location,
                                pier: r.pier_location,
                                cruise: r.cruise_name
                            })).filter(loc => loc.pickup || loc.dropoff || loc.pier);

                            return (
                                <div key={cat} className="bg-white rounded-lg shadow-md p-6">
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="text-base font-semibold flex items-center gap-2">
                                            {cat === 'pickup' ? 'Pickup 좌석' : 'Drop-off 좌석'}
                                        </h3>
                                        <button
                                            onClick={() => openSeatMap(selectedVehicle, cat)}
                                            className={`px-2 py-1 rounded text-xs ${cat === 'pickup' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}
                                        >좌석도</button>
                                    </div>

                                    {/* 좌석 정보 */}
                                    <div className="flex gap-2 flex-wrap mb-3">
                                        {seatChips.length === 0 ? (
                                            <span className="text-xs text-gray-500">좌석 없음</span>
                                        ) : (
                                            seatChips.map((s) => (
                                                <span key={s} className={`px-2 py-1 rounded-full text-xs ${s === 'All' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>{s}</span>
                                            ))
                                        )}
                                    </div>

                                    {/* 위치 정보 */}
                                    {locations.length > 0 && (
                                        <div className="space-y-2 text-xs">
                                            {locations[0].pickup && (
                                                <div className="flex items-center gap-1">
                                                    <MapPin className="w-3 h-3 text-green-500" />
                                                    <span className="text-gray-600">승차:</span>
                                                    <span className="text-gray-800">{locations[0].pickup}</span>
                                                </div>
                                            )}
                                            {locations[0].dropoff && (
                                                <div className="flex items-center gap-1">
                                                    <MapPin className="w-3 h-3 text-red-500" />
                                                    <span className="text-gray-600">하차:</span>
                                                    <span className="text-gray-800">{locations[0].dropoff}</span>
                                                </div>
                                            )}
                                            {(locations[0].cruise || locations[0].pier) && (
                                                <div className="flex items-center gap-1">
                                                    <MapPin className="w-3 h-3 text-blue-500" />
                                                    <span className="text-gray-600">선착장:</span>
                                                    <span className="text-gray-800">{locations[0].cruise || locations[0].pier}</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* 예약 목록 */}
                <div className="bg-white rounded-lg shadow-md">
                    <div className="p-6 border-b">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                            <Users className="w-6 h-6 text-blue-600" />
                            스하차량 예약 현황 ({displayReservations.length}건)
                        </h3>
                    </div>

                    {displayReservations.length === 0 ? (
                        <div className="p-8 text-center">
                            <Car className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-medium text-gray-600 mb-2">
                                예약된 스하차량이 없습니다
                            </h3>
                            <p className="text-gray-500">선택한 기간에 예약된 차량이 없습니다.</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {groupByBooker
                                ? sortBookerEntriesByUsageDate(Object.entries(groupReservationsByBooker(displayReservations)))
                                    .map(([bookerKey, bookerReservations]) => {
                                        const [bookerName, bookerEmail] = bookerKey.split('||');
                                        const pickupReservation = getPickupRowForAutoDrop(bookerReservations);
                                        const canAddDrop = !!pickupReservation && !hasDropoffRow(bookerReservations);
                                        const isCreatingDrop = creatingDropKey === bookerKey;
                                        return (
                                            <div key={bookerKey} className="border-b border-gray-200 pb-6 last:border-b-0">
                                                <div className="flex items-center justify-between gap-3 mb-4 p-4 bg-indigo-50 rounded-lg">
                                                    <div>
                                                        <h4 className="text-lg font-semibold text-indigo-800">{bookerName || '예약자 미확인'}</h4>
                                                        <div className="text-xs text-indigo-600">{bookerEmail || '-'}</div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm font-medium">
                                                            {bookerReservations.length}건 예약
                                                        </span>
                                                        {canAddDrop && (
                                                            <button
                                                                onClick={() => handleAddDropReservationForBooker(bookerKey, bookerReservations)}
                                                                disabled={isCreatingDrop}
                                                                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                                                            >
                                                                <Plus className="w-3.5 h-3.5" />
                                                                {isCreatingDrop ? '추가 중...' : '드롭 추가'}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="space-y-4">
                                                    <div className="p-4 border border-gray-200 rounded-lg">
                                                        {renderReservationsByDisplayMode(bookerReservations)}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                : Object.entries(groupedReservations)
                                    .sort(([a], [b]) => a.localeCompare(b))
                                    .map(([date, dateReservations]) => (
                                        <div key={date} className="border-b border-gray-200 pb-6 last:border-b-0">
                                            <div className="flex items-center gap-3 mb-4 p-4 bg-blue-50 rounded-lg">
                                                <Calendar className="w-5 h-5 text-blue-600" />
                                                <h4 className="text-lg font-semibold text-blue-800">
                                                    {new Date(date).toLocaleDateString('ko-KR', {
                                                        year: 'numeric',
                                                        month: 'long',
                                                        day: 'numeric',
                                                        weekday: 'long'
                                                    })}
                                                </h4>
                                                <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                                                    {dateReservations.length}건 예약
                                                </span>
                                            </div>

                                            <div className="space-y-4">
                                                <div className="p-4 border border-gray-200 rounded-lg">
                                                    {renderReservationsByDisplayMode(dateReservations)}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                        </div>
                    )}
                </div>
            </div>

            {/* 좌석 배치도 모달 */}
            <ShtCarSeatMap
                isOpen={isMapOpen}
                onClose={() => setIsMapOpen(false)}
                selectedDate={selectedDate}
                vehicleNumber={mapVehicle}
            />

            {isAnomalyModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="px-6 py-4 border-b flex items-center justify-between">
                            <h3 className="text-lg font-semibold">스하차량 이상 배정 조회 결과</h3>
                            <button
                                onClick={() => setIsAnomalyModalOpen(false)}
                                className="p-2 rounded-md hover:bg-gray-100"
                                title="닫기"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 overflow-auto">
                            {anomalyLoading ? (
                                <div className="flex justify-center items-center h-40">
                                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-rose-500"></div>
                                </div>
                            ) : anomalyRows.length === 0 ? (
                                <div className="text-center py-10 text-gray-500">이상 배정 데이터가 없습니다.</div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            onClick={() => setAnomalyFilter('all')}
                                            className={`px-3 py-1.5 rounded-full text-sm ${anomalyFilter === 'all' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-700'}`}
                                        >전체</button>
                                        <button
                                            onClick={() => setAnomalyFilter('pickup')}
                                            className={`px-3 py-1.5 rounded-full text-sm ${anomalyFilter === 'pickup' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700'}`}
                                        >픽업만</button>
                                        <button
                                            onClick={() => setAnomalyFilter('dropoff')}
                                            className={`px-3 py-1.5 rounded-full text-sm ${anomalyFilter === 'dropoff' ? 'bg-orange-600 text-white' : 'bg-orange-50 text-orange-700'}`}
                                        >드롭만</button>
                                        <button
                                            onClick={() => setAnomalyFilter('pair')}
                                            className={`px-3 py-1.5 rounded-full text-sm ${anomalyFilter === 'pair' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-700'}`}
                                        >짝불일치</button>
                                        <button
                                            onClick={() => setAnomalyFilter('mismatch')}
                                            className={`px-3 py-1.5 rounded-full text-sm ${anomalyFilter === 'mismatch' ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-700'}`}
                                        >좌석상이</button>
                                        <button
                                            onClick={() => setAnomalyFilter('sameday')}
                                            className={`px-3 py-1.5 rounded-full text-sm ${anomalyFilter === 'sameday' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-700'}`}
                                        >당일왕복</button>
                                        <button
                                            onClick={() => setAnomalyFilter('duplicate')}
                                            className={`px-3 py-1.5 rounded-full text-sm ${anomalyFilter === 'duplicate' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700'}`}
                                        >중복좌석</button>
                                    </div>

                                    {filteredAnomalyRows.length === 0 ? (
                                        <div className="text-center py-10 text-gray-500">선택한 유형의 데이터가 없습니다.</div>
                                    ) : (
                                        Object.entries(anomalyGroups).map(([groupKey, rows]) => {
                                            const [groupUserId, groupName, groupEmailOrType] = groupKey.split('||');
                                            return (
                                                <div key={groupKey} className="border border-gray-200 rounded-lg overflow-hidden">
                                                    <div className="px-4 py-3 bg-gray-50 border-b">
                                                        <div className="font-semibold text-gray-900">{groupName}</div>
                                                        <div className="text-xs text-gray-600">{groupEmailOrType}</div>
                                                        {groupUserId && groupUserId !== '예약자미확인' && (
                                                            <div className="text-[11px] text-gray-500 mt-0.5">user_id: {groupUserId}</div>
                                                        )}
                                                    </div>
                                                    <div className="overflow-x-auto">
                                                        <table className="w-full text-sm">
                                                            <thead className="bg-gray-50">
                                                                <tr>
                                                                    <th className="px-3 py-2 text-left">유형</th>
                                                                    <th className="px-3 py-2 text-left">예약타입</th>
                                                                    <th className="px-3 py-2 text-left">사용일</th>
                                                                    <th className="px-3 py-2 text-left">사용자ID</th>
                                                                    <th className="px-3 py-2 text-left">차량</th>
                                                                    <th className="px-3 py-2 text-left">좌석</th>
                                                                    <th className="px-3 py-2 text-left">구분</th>
                                                                    <th className="px-3 py-2 text-left">픽업</th>
                                                                    <th className="px-3 py-2 text-left">드롭</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {rows.map((row, idx) => {
                                                                    const issueBadgeMap: Record<ShtCarAnomalyRow['issue_type'], string> = {
                                                                        PICKUP_ONLY: 'bg-blue-100 text-blue-800',
                                                                        DROPOFF_ONLY: 'bg-orange-100 text-orange-800',
                                                                        PAIR_COUNT: 'bg-amber-100 text-amber-800',
                                                                        SEAT_MISMATCH: 'bg-purple-100 text-purple-800',
                                                                        SAME_DAY: 'bg-rose-100 text-rose-800',
                                                                        DUPLICATE_SEAT: 'bg-red-100 text-red-800',
                                                                    };
                                                                    const issueTextMap: Record<ShtCarAnomalyRow['issue_type'], string> = {
                                                                        PICKUP_ONLY: '픽업만',
                                                                        DROPOFF_ONLY: '드롭만',
                                                                        PAIR_COUNT: '짝불일치',
                                                                        SEAT_MISMATCH: '좌석상이',
                                                                        SAME_DAY: '당일왕복',
                                                                        DUPLICATE_SEAT: '좌석중복',
                                                                    };
                                                                    const issueBadge = issueBadgeMap[row.issue_type];
                                                                    const issueText = issueTextMap[row.issue_type];
                                                                    return (
                                                                        <tr key={`${row.issue_type}-${row.reservation_id}-${row.seat_number}-${idx}`} className="border-t">
                                                                            <td className="px-3 py-2">
                                                                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${issueBadge}`}>{issueText}</span>
                                                                            </td>
                                                                            <td className="px-3 py-2 whitespace-nowrap">{row.reservation_type}</td>
                                                                            <td className="px-3 py-2 whitespace-nowrap">{row.service_date}</td>
                                                                            <td className="px-3 py-2 whitespace-nowrap">{row.user_id || '-'}</td>
                                                                            <td className="px-3 py-2 whitespace-nowrap">{row.vehicle_number}</td>
                                                                            <td className="px-3 py-2 whitespace-nowrap">{row.seat_number}</td>
                                                                            <td className="px-3 py-2 whitespace-nowrap">{row.sht_category}</td>
                                                                            <td className="px-3 py-2">{row.pickup_location}</td>
                                                                            <td className="px-3 py-2">{row.dropoff_location}</td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </ManagerLayout>
    );
}
