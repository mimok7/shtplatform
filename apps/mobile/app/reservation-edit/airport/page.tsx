'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '@/lib/supabase';
import { saveAdditionalFeeTemplateFromInput } from '@/lib/additionalFeeTemplate';
import { recordReservationChange } from '@/lib/reservationChangeTracker';
import { calculateReservationPricing } from '@/lib/pricing';
import ManagerLayout from '../_components/MobileReservationLayout';
import {
    Save,
    ArrowLeft,
    Calendar,
    Plane,
    MapPin,
    Clock,
    User,
    Phone,
    Mail
} from 'lucide-react';

interface AirportReservation {
    reservation: {
        re_id: string;
        re_status: string;
        re_created_at: string;
        users: {
            name: string;
            email: string;
            phone: string;
        };
        quote: {
            title: string;
        } | null;
    };
}

type AirportWayKey = 'pickup' | 'sending';
const FASTTRACK_USD_PER_PERSON = 25;

interface AirportPriceRow {
    airport_code: string;
    service_type: string; // '픽업' | '샌딩'
    route: string;
    route_from?: string | null;
    route_to?: string | null;
    vehicle_type: string;
    price: number;
}

interface AirportWayFormData {
    ra_airport_name: string; // 공항명 (ra_airport_location에 저장)
    accommodation_info: string; // 승차/하차 위치 (accommodation_info에 저장)
    ra_flight_number: string;
    ra_datetime: string;
    ra_guest_count: number;
    ra_car_count: number;
    ra_passenger_count: number;
    unit_price: number;
    total_price: number;
    ra_request_note: string;
    route: string;               // UI 표시용 (airport_price.route)
    vehicle_type: string;        // UI 표시용 (DB 저장 안 함 — vehicle_type 컬럼 없음)
    airport_price_code: string;  // DB 저장 (reservation_airport.airport_price_code)
}

interface AirportDetailRow {
    id?: string;
    way_type?: string | null;
    ra_airport_name?: string | null;
    ra_airport_location?: string | null;
    accommodation_info?: string | null;
    ra_flight_number?: string | null;
    ra_datetime?: string | null;
    ra_car_count?: number | null;
    ra_passenger_count?: number | null;
    unit_price?: number | null;
    total_price?: number | null;
    request_note?: string | null;
    airport_price_code?: string | null;
}

const EMPTY_AIRPORT_FORM: AirportWayFormData = {
    ra_airport_name: '',
    accommodation_info: '',
    ra_flight_number: '',
    ra_datetime: '',
    ra_guest_count: 0,
    ra_car_count: 0,
    ra_passenger_count: 0,
    unit_price: 0,
    total_price: 0,
    ra_request_note: '',
    route: '',
    vehicle_type: '',
    airport_price_code: '',
};

function normalizeWayType(wayType?: string | null): AirportWayKey {
    const raw = String(wayType || '').trim().toLowerCase();
    if (raw === 'sending' || raw === '샌딩') return 'sending';
    return 'pickup';
}

function normalizeReservationId(value?: string | null): string {
    if (!value) return '';
    return String(value).split(':')[0].trim();
}

function toInputDateTime(value?: string | null): string {
    if (!value) return '';
    const raw = String(value).trim();
    if (!raw) return '';

    // timezone 정보가 없는 DB 값은 파싱 없이 그대로 datetime-local 형식으로 사용
    const hasTimezone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw);
    if (!hasTimezone) {
        return raw.replace(' ', 'T').slice(0, 16);
    }

    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) {
        return raw.replace(' ', 'T').slice(0, 16);
    }

    // timezone 포함 값은 KST로 변환해 입력 필드에 표시
    const parts = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Seoul',
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).formatToParts(d);

    const pick = (type: string) => parts.find(p => p.type === type)?.value || '';
    return `${pick('year')}-${pick('month')}-${pick('day')}T${pick('hour')}:${pick('minute')}`;
}

function toDbDateTimeKst(value?: string | null): string | null {
    if (!value) return null;
    const v = String(value).trim();
    if (!v) return null;

    // datetime-local(YYYY-MM-DDTHH:mm)을 명시적 KST 오프셋으로 저장
    const normalized = v.replace(' ', 'T');
    if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$/.test(normalized)) {
        return `${normalized}:00+09:00`;
    }

    return normalized;
}

function toWayFormData(row?: AirportDetailRow | null): AirportWayFormData {
    return {
        // 공항명은 ra_airport_location 컬럼에서 읽기
        ra_airport_name: row?.ra_airport_location || '',
        // 승차/하차 위치는 accommodation_info 컬럼에서 읽기
        accommodation_info: row?.accommodation_info || '',
        ra_flight_number: row?.ra_flight_number || '',
        ra_datetime: toInputDateTime(row?.ra_datetime),
        ra_guest_count: Number(row?.ra_passenger_count || 0),
        ra_car_count: Number(row?.ra_car_count || 0),
        ra_passenger_count: Number(row?.ra_passenger_count || 0),
        unit_price: Number(row?.unit_price || 0),
        total_price: Number(row?.total_price || 0),
        ra_request_note: row?.request_note || '',
        route: '',                   // airport_price_code로부터 역조회 후 채움
        vehicle_type: '',            // airport_price_code로부터 역조회 후 채움
        airport_price_code: row?.airport_price_code || '',
    };
}

function normalizeText(value?: string | null): string {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function AirportReservationEditContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const reservationId = searchParams.get('id');

    const [reservation, setReservation] = useState<AirportReservation | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeWay, setActiveWay] = useState<AirportWayKey>('pickup');
    const [airportForms, setAirportForms] = useState<Record<AirportWayKey, AirportWayFormData>>({
        pickup: { ...EMPTY_AIRPORT_FORM },
        sending: { ...EMPTY_AIRPORT_FORM },
    });
    const [airportRowIds, setAirportRowIds] = useState<Partial<Record<AirportWayKey, string>>>({});
    const [airportNameOptions, setAirportNameOptions] = useState<string[]>([]);
    const [airportPriceRows, setAirportPriceRows] = useState<AirportPriceRow[]>([]);
    const [fastTrackSummary, setFastTrackSummary] = useState<{ pickup: number; sending: number; total: number; storedUsdTotal: number; storedKrwTotal: number }>({
        pickup: 0,
        sending: 0,
        total: 0,
        storedUsdTotal: 0,
        storedKrwTotal: 0,
    });
    const [usdRateToKrw, setUsdRateToKrw] = useState<number>(1400);
    const [additionalFee, setAdditionalFee] = useState(0);
    const [additionalFeeDetail, setAdditionalFeeDetail] = useState('');
    const [feeTemplates, setFeeTemplates] = useState<{ id: number; name: string; amount: number }[]>([]);

    const formData = airportForms[activeWay];
    const fastTrackUsdTotal = fastTrackSummary.storedUsdTotal > 0
        ? fastTrackSummary.storedUsdTotal
        : fastTrackSummary.total * FASTTRACK_USD_PER_PERSON;
    const fastTrackKrwTotal = fastTrackSummary.storedKrwTotal > 0
        ? fastTrackSummary.storedKrwTotal
        : Math.round(fastTrackUsdTotal * usdRateToKrw);
    const airportBaseTotal = (airportForms.pickup.total_price || 0) + (airportForms.sending.total_price || 0);
    const airportFinalTotal = airportBaseTotal + additionalFee;

    const updateActiveForm = (updates: Partial<AirportWayFormData>) => {
        setAirportForms(prev => ({
            ...prev,
            [activeWay]: {
                ...prev[activeWay],
                ...updates,
            }
        }));
    };

    const getServiceTypeLabel = (way: AirportWayKey): string => (way === 'pickup' ? '픽업' : '샌딩');

    // service_type별 고유 경로 목록
    const getRouteOptions = (way: AirportWayKey): string[] => {
        const serviceTypeLabel = normalizeText(getServiceTypeLabel(way));
        const routes = airportPriceRows
            .filter(r => normalizeText(r.service_type) === serviceTypeLabel)
            .map(r => String(r.route || '').trim())
            .filter(Boolean);
        return Array.from(new Set(routes)).sort((a, b) => a.localeCompare(b));
    };

    // service_type + route별 차종 목록
    const getVehicleTypeOptions = (way: AirportWayKey, route: string): AirportPriceRow[] => {
        const serviceTypeLabel = normalizeText(getServiceTypeLabel(way));
        const normalizedRoute = normalizeText(route);
        if (!normalizedRoute) return [];
        return Array.from(
            new Map(
                airportPriceRows
                    .filter(r =>
                        normalizeText(r.service_type) === serviceTypeLabel &&
                        normalizeText(r.route) === normalizedRoute &&
                        normalizeText(r.vehicle_type)
                    )
                    .map(row => [normalizeText(row.vehicle_type), row])
            ).values()
        );
    };

    // 가격 행 직접 조회 (way + route + vehicle_type)
    const findPriceRow = (
        way: AirportWayKey,
        route: string,
        vehicleType: string
    ): AirportPriceRow | null => {
        const serviceTypeLabel = normalizeText(getServiceTypeLabel(way));
        const normalizedRoute = normalizeText(route);
        const normalizedVehicleType = normalizeText(vehicleType);
        if (!normalizedRoute || !normalizedVehicleType) return null;
        return (
            airportPriceRows.find(r =>
                normalizeText(r.service_type) === serviceTypeLabel &&
                normalizeText(r.route) === normalizedRoute &&
                normalizeText(r.vehicle_type) === normalizedVehicleType
            ) || null
        );
    };

    useEffect(() => {
        if (reservationId) {
            loadReservation();
        } else {
            router.push('/reservation-edit');
        }
    }, [reservationId]);

    useEffect(() => {
        const loadAirportNames = async () => {
            const { data, error } = await supabase
                .from('airport_name')
                .select('airport_name')
                .order('airport_id', { ascending: true });

            if (error) {
                console.warn('⚠️ 공항명 목록 로드 실패:', error);
                return;
            }

            const names = Array.from(
                new Set((data || []).map((r: any) => String(r.airport_name || '').trim()).filter(Boolean))
            ) as string[];
            setAirportNameOptions(names);
        };

        const loadVehicleTypes = async () => {
            const { data } = await supabase
                .from('airport_price')
                .select('airport_code, service_type, route, route_from, route_to, vehicle_type, price')
                .eq('is_active', true);
            const rows = (data || []).filter((r: any) => r.vehicle_type && r.airport_code) as AirportPriceRow[];
            setAirportPriceRows(rows);
        };

        loadAirportNames();
        loadVehicleTypes();
        supabase
            .from('additional_fee_template')
            .select('id, name, amount')
            .or('service_type.is.null,service_type.eq.airport')
            .eq('is_active', true)
            .order('sort_order')
            .then(({ data }) => { if (data) setFeeTemplates(data); });
    }, []);

    useEffect(() => {
        const loadUsdRate = async () => {
            try {
                const { data: usdRate } = await supabase
                    .from('exchange_rates')
                    .select('rate_to_krw')
                    .eq('currency_code', 'USD')
                    .maybeSingle();

                if (usdRate?.rate_to_krw && Number(usdRate.rate_to_krw) > 0) {
                    setUsdRateToKrw(Number(usdRate.rate_to_krw));
                }
            } catch (error) {
                console.warn('⚠️ USD 환율 로드 실패:', error);
            }
        };

        loadUsdRate();
    }, []);

    // airport_price_code → vehicle_type 역조회 (DB 로드 후 채움)
    useEffect(() => {
        if (airportPriceRows.length === 0) return;
        setAirportForms(prev => {
            const next = { ...prev };
            let changed = false;
            (Object.keys(next) as AirportWayKey[]).forEach(way => {
                const form = next[way];
                if (form.airport_price_code) {
                    const match = airportPriceRows.find(r => r.airport_code === form.airport_price_code);
                    if (match) {
                        const syncedUnitPrice = Number(match.price || 0);
                        const syncedTotalPrice = (form.ra_car_count || 0) * syncedUnitPrice;
                        const needsSync =
                            form.route !== (match.route || '') ||
                            form.vehicle_type !== match.vehicle_type ||
                            form.unit_price !== syncedUnitPrice ||
                            form.total_price !== syncedTotalPrice;

                        if (needsSync) {
                            next[way] = {
                                ...form,
                                route: match.route || '',
                                vehicle_type: match.vehicle_type,
                                unit_price: syncedUnitPrice,
                                total_price: syncedTotalPrice,
                            };
                            changed = true;
                        }
                    }
                }
            });

            return changed ? next : prev;
        });
    }, [airportPriceRows]);

    const handleDeleteWay = async (way: AirportWayKey) => {
        if (!window.confirm(`${way === 'pickup' ? '픽업' : '샌딩'} 서비스를 삭제하시겠습니까?`)) return;

        try {
            setLoading(true);
            const rowId = airportRowIds[way];

            if (!rowId) {
                alert('삭제할 데이터가 없습니다.');
                return;
            }

            const { error } = await supabase
                .from('reservation_airport')
                .delete()
                .eq('id', rowId);

            if (error) throw error;

            alert(`${way === 'pickup' ? '픽업' : '샌딩'} 서비스가 삭제되었습니다.`);
            setAirportForms(p => ({ ...p, [way]: EMPTY_AIRPORT_FORM }));
            setAirportRowIds(p => { const newIds = { ...p }; delete newIds[way]; return newIds; });

            // 메인 예약 테이블도 업데이트
            const remainingTotal = Object.entries(airportForms)
                .filter(([k]) => k !== way)
                .reduce((sum, [k]) => sum + ((airportForms[k as AirportWayKey] || {}).total_price || 0), 0);

            await supabase
                .from('reservation')
                .update({ total_amount: remainingTotal, re_update_at: new Date().toISOString() })
                .eq('re_id', reservation!.reservation.re_id);

        } catch (error) {
            console.error('❌ 삭제 오류:', error);
            alert('삭제 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const loadReservation = async () => {
        try {
            console.log('🔄 공항 서비스 예약 데이터 로드 시작...', reservationId);
            setLoading(true);
            const normalizedReservationId = normalizeReservationId(reservationId);
            if (!normalizedReservationId) {
                router.push('/reservation-edit');
                return;
            }

            // 1) 예약 기본 정보 + 고객 정보 조회
            const { data: resRow, error: resErr } = await supabase
                .from('reservation')
                .select('re_id, re_type, re_status, re_created_at, re_quote_id, re_user_id, total_amount, manual_additional_fee, manual_additional_fee_detail')
                .eq('re_id', normalizedReservationId)
                .maybeSingle();

            if (resErr) throw resErr;
            if (!resRow) {
                alert('해당 예약을 찾을 수 없습니다. 목록으로 이동합니다.');
                router.push('/reservation-edit');
                return;
            }

            // 1.5) 고객 정보 조회
            let customerInfo = { name: '정보 없음', email: '', phone: '' };
            if (resRow.re_user_id) {
                const { data: userRow } = await supabase
                    .from('users')
                    .select('name, email, phone_number')
                    .eq('id', resRow.re_user_id)
                    .single();
                if (userRow) {
                    customerInfo = { ...customerInfo, ...userRow, phone: userRow.phone_number };
                }
            }

            // 2) 서비스 상세 (공항) - 없을 수도 있음 (삭제/오류 등) -> 빈 값으로 처리
            const { data: airportRows, error: airportErr } = await supabase
                .from('reservation_airport')
                .select('*')
                .eq('reservation_id', normalizedReservationId)
                .order('created_at', { ascending: true });

            if (airportErr) {
                console.warn('⚠️ 공항 예약 상세 조회 실패 (데이터 없음?):', airportErr);
            }

            const { data: fastTrackRows } = await supabase
                .from('reservation_airport_fasttrack')
                .select('*')
                .eq('reservation_id', normalizedReservationId);

            const pickupFastTrackCount = (fastTrackRows || []).filter((row: any) => String(row.way_type || '').toLowerCase() === 'pickup').length;
            const sendingFastTrackCount = (fastTrackRows || []).filter((row: any) => String(row.way_type || '').toLowerCase() === 'sending').length;
            const storedUsdTotal = (fastTrackRows || []).reduce((sum: number, row: any) => sum + Number(row.total_price_usd || 0), 0);
            const storedKrwTotal = (fastTrackRows || []).reduce((sum: number, row: any) => sum + Number(row.total_price_krw || 0), 0);
            setFastTrackSummary({
                pickup: pickupFastTrackCount,
                sending: sendingFastTrackCount,
                total: pickupFastTrackCount + sendingFastTrackCount,
                storedUsdTotal,
                storedKrwTotal,
            });

            // 3) 견적 타이틀
            let quoteInfo = null as { title: string } | null;
            if (resRow.re_quote_id) {
                const { data: q, error: qErr } = await supabase
                    .from('quote')
                    .select('title')
                    .eq('id', resRow.re_quote_id)
                    .single();
                if (!qErr && q) quoteInfo = q;
            }

            const fullReservation: AirportReservation = {
                reservation: {
                    re_id: resRow.re_id,
                    re_status: resRow.re_status,
                    re_created_at: resRow.re_created_at,
                    users: {
                        name: customerInfo.name,
                        email: customerInfo.email,
                        phone: customerInfo.phone,
                    },
                    quote: quoteInfo,
                },
            };

            setReservation(fullReservation);
            const rowMap: Partial<Record<AirportWayKey, AirportDetailRow>> = {};
            const rowIdMap: Partial<Record<AirportWayKey, string>> = {};
            for (const row of (airportRows || []) as AirportDetailRow[]) {
                const key = normalizeWayType(row.way_type);
                rowMap[key] = row;
                if (row.id) rowIdMap[key] = row.id;
            }

            setAirportForms({
                pickup: toWayFormData(rowMap.pickup),
                sending: toWayFormData(rowMap.sending),
            });
            setAirportRowIds(rowIdMap);
            setAdditionalFee(Number(resRow.manual_additional_fee || 0));
            setAdditionalFeeDetail(String(resRow.manual_additional_fee_detail || ''));

            if (rowMap.sending && !rowMap.pickup) {
                setActiveWay('sending');
            } else {
                setActiveWay('pickup');
            }

        } catch (error) {
            console.error('❌ 공항 서비스 예약 로드 실패:', error);
            alert('공항 서비스 예약 정보를 불러오는데 실패했습니다.');
            router.push('/reservation-edit');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!reservation) return;

        try {
            setSaving(true);
            const targetReservationId = reservation.reservation.re_id;
            const wayKeys: AirportWayKey[] = ['pickup', 'sending'];

            const hasAnyAirportData = (form: AirportWayFormData) => Boolean(
                form.ra_airport_name || form.accommodation_info || form.ra_flight_number ||
                form.ra_datetime || form.ra_request_note || form.airport_price_code ||
                form.ra_car_count > 0 || form.ra_passenger_count > 0 ||
                form.unit_price > 0 || form.total_price > 0
            );

            for (const way of wayKeys) {
                const wayForm = airportForms[way];
                const payload = {
                    ra_airport_location: wayForm.ra_airport_name,
                    accommodation_info: wayForm.accommodation_info,
                    ra_flight_number: wayForm.ra_flight_number,
                    ra_datetime: toDbDateTimeKst(wayForm.ra_datetime),
                    ra_car_count: wayForm.ra_car_count,
                    ra_passenger_count: wayForm.ra_passenger_count,
                    unit_price: wayForm.unit_price,
                    total_price: wayForm.total_price,
                    request_note: wayForm.ra_request_note,
                    way_type: way,
                    airport_price_code: wayForm.airport_price_code || null,
                    // vehicle_type 컬럼은 reservation_airport에 없으므로 저장 안 함
                };

                const rowId = airportRowIds[way];
                if (rowId) {
                    const { error: updateError } = await supabase
                        .from('reservation_airport')
                        .update(payload)
                        .eq('id', rowId);
                    if (updateError) throw updateError;
                } else if (hasAnyAirportData(wayForm)) {
                    const { error: insertError } = await supabase
                        .from('reservation_airport')
                        .insert({ reservation_id: targetReservationId, ...payload });
                    if (insertError) throw insertError;
                }
            }

            const mergedTotalPrice = wayKeys.reduce((sum, way) => sum + (airportForms[way].total_price || 0), 0);
            const mergedPax = wayKeys.reduce((max, way) => Math.max(max, airportForms[way].ra_passenger_count || 0), 0);
            const pricing = calculateReservationPricing({
                serviceType: 'airport',
                baseTotal: mergedTotalPrice,
                additionalFee,
                additionalFeeDetail,
                lineItems: wayKeys
                    .filter((way) => airportForms[way].total_price > 0 || airportForms[way].unit_price > 0)
                    .map((way) => ({
                        label: way === 'pickup' ? '공항 픽업' : '공항 샌딩',
                        code: airportForms[way].airport_price_code || null,
                        unit_price: airportForms[way].unit_price || 0,
                        quantity: airportForms[way].ra_car_count || airportForms[way].ra_passenger_count || 1,
                        total: airportForms[way].total_price || 0,
                        metadata: {
                            way_type: way,
                            airport_name: airportForms[way].ra_airport_name || null,
                            route: airportForms[way].route || null,
                            vehicle_type: airportForms[way].vehicle_type || null,
                            passenger_count: airportForms[way].ra_passenger_count || 0,
                            car_count: airportForms[way].ra_car_count || 0,
                        },
                    })),
                metadata: {
                    fast_track_krw_total: fastTrackKrwTotal,
                    active_way: activeWay,
                },
            });

            const { error: reservationError } = await supabase
                .from('reservation')
                .update({
                    total_amount: pricing.total_amount,
                    pax_count: mergedPax,
                    price_breakdown: pricing.price_breakdown,
                    manual_additional_fee: additionalFee,
                    manual_additional_fee_detail: additionalFeeDetail || null,
                    re_update_at: new Date().toISOString(),
                })
                .eq('re_id', targetReservationId);

            if (reservationError) {
                console.error('⚠️ 예약 테이블 동기화 실패:', reservationError);
            }

            await saveAdditionalFeeTemplateFromInput({
                serviceType: 'airport',
                detail: additionalFeeDetail,
                amount: additionalFee,
            });

            // 변경 추적 기록
            try {
                const changeAirportRows = wayKeys
                    .filter((way) => airportForms[way].total_price > 0 || airportForms[way].unit_price > 0 || airportForms[way].ra_airport_name)
                    .map((way) => {
                        const f = airportForms[way];
                        return {
                            way_type: way,
                            airport_price_code: f.airport_price_code || null,
                            ra_airport_location: f.ra_airport_name || null,
                            ra_airport_name: f.ra_airport_name || null,
                            accommodation_info: f.accommodation_info || null,
                            ra_flight_number: f.ra_flight_number || null,
                            ra_datetime: toDbDateTimeKst(f.ra_datetime),
                            ra_car_count: f.ra_car_count || 0,
                            ra_passenger_count: f.ra_passenger_count || 0,
                            unit_price: f.unit_price || 0,
                            total_price: f.total_price || 0,
                            request_note: f.ra_request_note || null,
                            vehicle_type: f.vehicle_type || null,
                        };
                    });
                await recordReservationChange({
                    reservationId: targetReservationId,
                    reType: 'airport',
                    rows: { airport: changeAirportRows },
                    managerNote: '공항 서비스 예약 매니저 직접 수정',
                    snapshotData: {
                        price_breakdown: pricing.price_breakdown,
                        total_amount: pricing.total_amount,
                        manual_additional_fee: additionalFee,
                    },
                });
            } catch (trackErr) {
                console.warn('⚠️ 변경 추적 기록 실패(저장은 계속):', trackErr);
            }

            alert('공항 서비스 예약이 성공적으로 수정되었습니다.');
            router.refresh();
            await loadReservation();

        } catch (error) {
            console.error('❌ 저장 오류:', error);
            alert('저장 중 오류가 발생했습니다.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <ManagerLayout title="✈️ 공항 서비스 예약 수정" activeTab="reservation-edit-airport">
                <div className="flex justify-center items-center h-64">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                        <p className="mt-4 text-gray-600">공항 서비스 예약 데이터를 불러오는 중...</p>
                    </div>
                </div>
            </ManagerLayout>
        );
    }

    if (!reservation) {
        return (
            <ManagerLayout title="✈️ 공항 서비스 예약 수정" activeTab="reservation-edit-airport">
                <div className="text-center py-12">
                    <Plane className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">예약을 찾을 수 없습니다</h3>
                    <p className="text-gray-600 mb-4">요청하신 공항 서비스 예약 정보를 찾을 수 없습니다.</p>
                    <button
                        onClick={() => router.push('/reservation-edit')}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        예약 목록으로 돌아가기
                    </button>
                </div>
            </ManagerLayout>
        );
    }

    return (
        <ManagerLayout title="✈️ 공항 서비스 예약 수정" activeTab="reservation-edit-airport">
            <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* 좌측: 예약 정보 */}
                    <div className="lg:col-span-2 space-y-6">
{/* 수정 가능한 필드들 */}
                        <div className="bg-white rounded-lg shadow-sm p-4">
                            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
                                <Plane className="w-5 h-5" />
                                공항 서비스 세부사항 수정
                            </h3>
                            <div className="mb-4 flex gap-2 flex-wrap items-center">
                                <button
                                    type="button"
                                    onClick={() => setActiveWay('pickup')}
                                    className={`px-3 py-1.5 rounded-lg border text-sm ${activeWay === 'pickup'
                                        ? 'bg-blue-50 border-blue-400 text-blue-700'
                                        : 'bg-white border-gray-200 text-gray-600'
                                        }`}
                                >
                                    픽업 수정
                                </button>
                                {airportRowIds.pickup && (
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteWay('pickup')}
                                        className="px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-600 text-sm hover:bg-red-100 transition-colors"
                                    >
                                        픽업 삭제
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setActiveWay('sending')}
                                    className={`px-3 py-1.5 rounded-lg border text-sm ${activeWay === 'sending'
                                        ? 'bg-blue-50 border-blue-400 text-blue-700'
                                        : 'bg-white border-gray-200 text-gray-600'
                                        }`}
                                >
                                    샌딩 수정
                                </button>
                                {airportRowIds.sending && (
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteWay('sending')}
                                        className="px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-600 text-sm hover:bg-red-100 transition-colors"
                                    >
                                        샌딩 삭제
                                    </button>
                                )}
                                <span className="text-xs text-gray-500 self-center ml-auto">
                                    현재 수정: {activeWay === 'pickup' ? '픽업' : '샌딩'}
                                </span>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        <Plane className="inline w-4 h-4 mr-1" />
                                        공항명
                                    </label>
                                    <select
                                        value={formData.ra_airport_name}
                                        onChange={(e) => updateActiveForm({ ra_airport_name: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    >
                                        <option value="">공항명을 선택하세요</option>
                                        {airportNameOptions.map((name) => (
                                            <option key={name} value={name}>{name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        📍 경로 ({activeWay === 'pickup' ? '픽업' : '샌딩'})
                                    </label>
                                    {(() => {
                                        const routeOptions = getRouteOptions(activeWay);
                                        return routeOptions.length > 0 ? (
                                            <select
                                                value={formData.route}
                                                onChange={(e) => {
                                                    const nextRoute = e.target.value;
                                                    updateActiveForm({
                                                        route: nextRoute,
                                                        vehicle_type: '',
                                                        airport_price_code: '',
                                                        unit_price: 0,
                                                        total_price: 0,
                                                    });
                                                }}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            >
                                                <option value="">경로를 선택하세요</option>
                                                {routeOptions.map((r) => (
                                                    <option key={r} value={r}>{r}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <input
                                                type="text"
                                                value={formData.route}
                                                onChange={(e) => updateActiveForm({ route: e.target.value })}
                                                placeholder="예: 하롱 노바이 공항 → 하롱 시내"
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            />
                                        );
                                    })()}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        🚗 차종
                                    </label>
                                    {(() => {
                                        const options = getVehicleTypeOptions(activeWay, formData.route);
                                        return (
                                            <div className="flex gap-2 items-center">
                                                {options.length > 0 ? (
                                                    <select
                                                        value={formData.vehicle_type}
                                                        onChange={(e) => {
                                                            const vt = e.target.value;
                                                            const match = findPriceRow(activeWay, formData.route, vt);
                                                            const unitPrice = Number(match?.price || 0);
                                                            updateActiveForm({
                                                                vehicle_type: vt,
                                                                airport_price_code: match?.airport_code || '',
                                                                unit_price: unitPrice,
                                                                total_price: (formData.ra_car_count || 0) * unitPrice,
                                                            });
                                                        }}
                                                        disabled={!formData.route}
                                                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
                                                    >
                                                        <option value="">{formData.route ? '차종 선택' : '먼저 경로를 선택하세요'}</option>
                                                        {options.map((r) => (
                                                            <option key={r.airport_code} value={r.vehicle_type}>
                                                                {r.vehicle_type} ({Number(r.price || 0).toLocaleString()}동)
                                                            </option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <input
                                                        type="text"
                                                        value={formData.vehicle_type}
                                                        onChange={(e) => updateActiveForm({ vehicle_type: e.target.value })}
                                                        placeholder={formData.route ? '예: 4인승 세단, 7인승 미니밴' : '먼저 경로를 선택하세요'}
                                                        disabled={!formData.route}
                                                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
                                                    />
                                                )}
                                                <div className="shrink-0">
                                                    <label className="block text-[10px] text-gray-400 mb-0.5">가격코드 (읽기전용)</label>
                                                    <input
                                                        type="text"
                                                        value={formData.airport_price_code}
                                                        readOnly
                                                        className="w-24 px-2 py-2 border border-gray-200 bg-gray-50 rounded-lg text-xs text-gray-500 cursor-not-allowed font-mono"
                                                        placeholder="코드"
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        <MapPin className="inline w-4 h-4 mr-1" />
                                        {activeWay === 'pickup' ? '하차 위치' : '승차 위치'}
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.accommodation_info}
                                        onChange={(e) => updateActiveForm({ accommodation_info: e.target.value })}
                                        placeholder={activeWay === 'pickup' ? '예: 하차 위치(호텔/숙소)' : '예: 승차 위치(호텔/숙소)'}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        <Plane className="inline w-4 h-4 mr-1" />
                                        항공편명
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.ra_flight_number}
                                        onChange={(e) => updateActiveForm({ ra_flight_number: e.target.value })}
                                        placeholder="예: VN123, VJ456"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        <Clock className="inline w-4 h-4 mr-1" />
                                        일시
                                    </label>
                                    <input
                                        type="datetime-local"
                                        value={formData.ra_datetime}
                                        onChange={(e) => updateActiveForm({ ra_datetime: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            차량 수
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={formData.ra_car_count}
                                            onChange={(e) => {
                                                const count = parseInt(e.target.value) || 0;
                                                updateActiveForm({
                                                    ra_car_count: count,
                                                    total_price: count * formData.unit_price
                                                });
                                            }}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            승객 수 (Payload)
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={formData.ra_passenger_count}
                                            onChange={(e) => updateActiveForm({
                                                ra_passenger_count: parseInt(e.target.value) || 0,
                                                ra_guest_count: parseInt(e.target.value) || 0
                                            })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            기존 승객 수 (Legacy)
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={formData.ra_guest_count}
                                            readOnly
                                            className="w-full px-3 py-2 border border-gray-200 bg-gray-50 rounded-lg text-gray-500 cursor-not-allowed"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            단가 (동)
                                        </label>
                                        <input
                                            type="number"
                                            value={formData.unit_price}
                                            onChange={(e) => {
                                                const price = parseInt(e.target.value) || 0;
                                                updateActiveForm({
                                                    unit_price: price,
                                                    total_price: formData.ra_car_count * price
                                                });
                                            }}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            총 금액 (동)
                                        </label>
                                        <input
                                            type="number"
                                            value={formData.total_price}
                                            onChange={(e) => updateActiveForm({ total_price: parseInt(e.target.value) || 0 })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-bold text-green-600"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        요청사항
                                    </label>
                                    <textarea
                                        rows={4}
                                        value={formData.ra_request_note}
                                        onChange={(e) => updateActiveForm({ ra_request_note: e.target.value })}
                                        placeholder="픽업 장소, 특별 요청사항, 추가 서비스 등을 입력하세요..."
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 우측: 요금/추가내역 */}
                    <div className="space-y-6">
                        {/* 요금/추가내역 */}
                        <div className="bg-white rounded-lg shadow-sm p-4">
                            <h3 className="text-lg font-medium text-gray-900 mb-4">요금/추가내역</h3>
                            <div className="space-y-3">
                                <div className="pt-4 mt-4 border-t border-gray-100 space-y-4">
                                    <div>
                                        <h4 className="text-sm font-semibold text-gray-800">추가내역 / 추가요금</h4>
                                        <p className="text-xs text-gray-500 mt-1">추가요금을 조정하면 최종 합계를 바로 확인할 수 있습니다.</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">추가내역 선택</label>
                                        <select
                                            title="추가내역 선택"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                                            value=""
                                            onChange={(e) => {
                                                const tpl = feeTemplates.find(t => String(t.id) === e.target.value);
                                                if (tpl) { setAdditionalFee(tpl.amount); setAdditionalFeeDetail(tpl.name); }
                                            }}
                                        >
                                            <option value="">-- 추가내역 선택 --</option>
                                            {feeTemplates.map(t => (
                                                <option key={t.id} value={t.id}>{t.name} ({t.amount.toLocaleString()}동)</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">추가요금 (VND)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={additionalFee}
                                            onChange={(e) => setAdditionalFee(parseInt(e.target.value, 10) || 0)}
                                            title="추가요금"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">추가요금 내역</label>
                                        <textarea
                                            value={additionalFeeDetail}
                                            onChange={(e) => setAdditionalFeeDetail(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            rows={2}
                                            placeholder="추가요금 사유 또는 내역을 입력하세요"
                                        />
                                    </div>
                                </div>
                                {(airportBaseTotal > 0 || additionalFee > 0) && (
                                    <div className="pt-4 mt-4 border-t border-gray-100 space-y-2">
                                        <div className="flex justify-between text-sm text-gray-700">
                                            <span>기본 공항 금액</span>
                                            <span className="font-semibold">{airportBaseTotal.toLocaleString()}동</span>
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            {activeWay === 'pickup' ? '픽업' : '샌딩'} 현재 선택 금액 {formData.total_price.toLocaleString()}동 · 전체 합계 {airportBaseTotal.toLocaleString()}동
                                        </div>
                                        <div className="flex justify-between text-sm text-orange-600">
                                            <span>추가요금</span>
                                            <span className="font-semibold">+{additionalFee.toLocaleString()}동</span>
                                        </div>
                                        {additionalFeeDetail.trim() && (
                                            <div className="text-xs text-gray-500 whitespace-pre-wrap">{additionalFeeDetail}</div>
                                        )}
                                        <div className="pt-2 border-t border-gray-200">
                                            <label className="block text-sm font-medium text-gray-700">최종 총 금액</label>
                                            <div className="text-xl font-bold text-green-600">
                                                {airportFinalTotal.toLocaleString()}동
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 저장 버튼 */}
                        <div className="bg-white rounded-lg shadow-sm p-4">
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {saving ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                        저장 중...
                                    </>
                                ) : (
                                    <>
                                        <Save className="w-4 h-4" />
                                        수정사항 저장
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </ManagerLayout>
    );
}

export default function AirportReservationEditPage() {
    return (
        <Suspense fallback={
            <ManagerLayout title="✈️ 공항 서비스 예약 수정" activeTab="reservation-edit-airport">
                <div className="flex justify-center items-center h-64">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                        <p className="mt-4 text-gray-600">페이지를 불러오는 중...</p>
                    </div>
                </div>
            </ManagerLayout>
        }>
            <AirportReservationEditContent />
        </Suspense>
    );
}
