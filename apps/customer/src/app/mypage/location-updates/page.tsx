'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import PageWrapper from '@/components/PageWrapper';
import SectionBox from '@/components/SectionBox';
import { isLocationFieldKey, normalizeLocationEnglishUpper } from '@/lib/locationInput';
import { useLoadingTimeout } from '@/hooks/useLoadingTimeout';
import { getAuthUserSafe } from '@/lib/authSafe';
import { clearInvalidSession, isInvalidRefreshTokenError } from '@/lib/authRecovery';
import { Home } from 'lucide-react';

type ReservationType = 'airport' | 'rentcar' | 'tour' | 'car' | 'cruise_car' | 'sht_car' | 'sht' | 'car_sht' | 'cruise' | 'hotel';

interface ReservationRow {
  re_id: string;
  re_type: string;
  re_status: string;
  re_quote_id: string | null;
  re_created_at: string;
}

interface ServiceFieldConfig {
  key: string;
  label: string;
}

interface ServiceConfig {
  table: string;
  fields: ServiceFieldConfig[];
}

interface UpdatingFieldItem {
  uid: string;
  reservationId: string;
  reservationType: string;
  reservationStatus: string;
  quoteId: string | null;
  quoteTitle: string;
  table: string;
  rowId: string;
  fieldKey: string;
  fieldLabel: string;
  currentValue: string;
  createdAt: string | null;
  groupKey: string;
  groupTitle: string;
  groupMeta?: string;
}

interface LocationRequestHistoryItem {
  id: string;
  reservationId: string;
  reType: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  submittedAt: string;
  reviewedAt: string | null;
  quoteTitle: string;
  customerNote: string | null;
  managerNote: string | null;
}

const SERVICE_CONFIGS: Record<string, ServiceConfig> = {
  airport: {
    table: 'reservation_airport',
    fields: [{ key: 'accommodation_info', label: '숙소정보' }]
  },
  rentcar: {
    table: 'reservation_rentcar',
    fields: [
      { key: 'pickup_location', label: '픽업위치' },
      { key: 'destination', label: '하차도착지' },
      { key: 'return_pickup_location', label: '리턴픽업위치' },
      { key: 'return_destination', label: '리턴하차위치' }
    ]
  },
  tour: {
    table: 'reservation_tour',
    fields: [
      { key: 'pickup_location', label: '픽업위치' },
      { key: 'dropoff_location', label: '드롭위치' }
    ]
  },
  car: {
    table: 'reservation_cruise_car',
    fields: [
      { key: 'pickup_location', label: '승차위치' },
      { key: 'dropoff_location', label: '하차위치' }
    ]
  },
  cruise_car: {
    table: 'reservation_cruise_car',
    fields: [
      { key: 'pickup_location', label: '승차위치' },
      { key: 'dropoff_location', label: '하차위치' }
    ]
  },
  sht_car: {
    table: 'reservation_car_sht',
    fields: [
      { key: 'pickup_location', label: '픽업위치' },
      { key: 'dropoff_location', label: '드롭위치' }
    ]
  },
  sht: {
    table: 'reservation_car_sht',
    fields: [
      { key: 'pickup_location', label: '픽업위치' },
      { key: 'dropoff_location', label: '드롭위치' }
    ]
  },
  car_sht: {
    table: 'reservation_car_sht',
    fields: [
      { key: 'pickup_location', label: '픽업위치' },
      { key: 'dropoff_location', label: '드롭위치' }
    ]
  }
};

const RE_TYPE_CANONICAL_MAP: Record<string, string> = {
  airport: 'airport',
  hotel: 'hotel',
  rentcar: 'rentcar',
  tour: 'tour',
  cruise: 'cruise',
  car_sht: 'car_sht',
  sht_car: 'car_sht',
  sht: 'car_sht',
  car: 'cruise_car',
  cruise_car: 'cruise_car'
};

const CHANGE_TABLE_MAP: Record<string, string> = {
  airport: 'reservation_change_airport',
  hotel: 'reservation_change_hotel',
  rentcar: 'reservation_change_rentcar',
  tour: 'reservation_change_tour',
  cruise: 'reservation_change_cruise',
  car_sht: 'reservation_change_car_sht',
  cruise_car: 'reservation_change_cruise_car'
};

const REQUEST_STATUS_LABEL: Record<string, string> = {
  pending: '대기',
  approved: '승인',
  rejected: '반려',
  cancelled: '취소'
};

const REQUEST_STATUS_CLASS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-700'
};

const getTypeName = (type: string) => {
  switch (type) {
    case 'airport': return '공항';
    case 'rentcar': return '렌터카';
    case 'tour': return '투어';
    case 'car':
    case 'cruise_car': return '크루즈 차량';
    case 'sht_car':
    case 'sht':
    case 'car_sht': return '스하 차량';
    case 'cruise': return '크루즈';
    case 'hotel': return '호텔';
    default: return type;
  }
};

const getAirportAccommodationLabel = (wayType: unknown) => {
  const normalized = String(wayType || '').trim().toLowerCase();
  if (normalized === 'pickup' || normalized === '픽업') return '픽업 숙소정보';
  if (normalized === 'sending' || normalized === '샌딩') return '샌딩 숙소정보';
  return '숙소정보';
};

const formatKstDateTime = (value: unknown) => {
  if (!value) return '-';
  const raw = String(value).trim();
  if (!raw) return '-';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
};

export default function LocationUpdatesPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<UpdatingFieldItem[]>([]);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [selectedEntryKeys, setSelectedEntryKeys] = useState<string[]>([]);
  const [requestHistory, setRequestHistory] = useState<LocationRequestHistoryItem[]>([]);

  useLoadingTimeout(loading, setLoading, 12000);
  useLoadingTimeout(saving, setSaving, 15000);

  const ensureAuthenticatedUser = useCallback(async () => {
    try {
      // 세션을 먼저 깨워 두면 장시간 유휴 복귀 시 getUser 지연을 줄일 수 있다.
      const { error: sessionError } = await supabase.auth.getSession();
      if (sessionError && isInvalidRefreshTokenError(sessionError)) {
        await clearInvalidSession();
        alert('세션이 만료되었습니다. 다시 로그인해 주세요.');
        router.push('/login');
        return null;
      }

      const { user, error: userError, timedOut } = await getAuthUserSafe({ timeoutMs: 8000, retries: 1 });
      if (timedOut) {
        alert('세션 확인이 지연되었습니다. 다시 로그인해 주세요.');
        router.push('/login');
        return null;
      }

      if (userError && isInvalidRefreshTokenError(userError)) {
        await clearInvalidSession();
        alert('세션이 만료되었습니다. 다시 로그인해 주세요.');
        router.push('/login');
        return null;
      }

      if (userError || !user) {
        router.push('/login');
        return null;
      }

      return user;
    } catch (error) {
      if (isInvalidRefreshTokenError(error)) {
        await clearInvalidSession();
      }
      router.push('/login');
      return null;
    }
  }, [router]);

  const loadUpdatingFields = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const user = await ensureAuthenticatedUser();
      if (!user) return;

      const { data: reservations, error: reservationError } = await supabase
        .from('reservation')
        .select('re_id, re_type, re_status, re_quote_id, re_created_at')
        .eq('re_user_id', user.id)
        .neq('re_status', 'cancelled')
        .order('re_created_at', { ascending: false });

      if (reservationError) throw reservationError;

      const reservationRows = (reservations || []) as ReservationRow[];
      if (reservationRows.length === 0) {
        setItems([]);
        return;
      }

      const quoteIds = Array.from(new Set(reservationRows.map(r => r.re_quote_id).filter(Boolean))) as string[];
      const quoteTitleById: Record<string, string> = {};

      if (quoteIds.length > 0) {
        const { data: quotes } = await supabase
          .from('quote')
          .select('id, title')
          .in('id', quoteIds);

        (quotes || []).forEach((q: any) => {
          quoteTitleById[q.id] = q.title || '제목 없음';
        });
      }

      const reservationsByType = reservationRows.reduce((acc, row) => {
        const type = row.re_type as ReservationType;
        if (!SERVICE_CONFIGS[type]) return acc;
        (acc[type] ||= []).push(row);
        return acc;
      }, {} as Record<string, ReservationRow[]>);

      const allItems: UpdatingFieldItem[] = [];
      const reservationById = new Map(reservationRows.map(row => [row.re_id, row]));

      for (const [type, rows] of Object.entries(reservationsByType)) {
        const cfg = SERVICE_CONFIGS[type];
        if (!cfg) continue;

        const reservationIds = rows.map(r => r.re_id);
        if (reservationIds.length === 0) continue;

        const { data: serviceRows, error: serviceError } = await supabase
          .from(cfg.table)
          .select('*')
          .in('reservation_id', reservationIds)
          .order('created_at', { ascending: true });

        if (serviceError) {
          console.error(`${cfg.table} 조회 오류:`, serviceError);
          continue;
        }

        let tourNameByPricingId = new Map<string, string>();
        if (type === 'tour') {
          const tourPriceCodes = Array.from(
            new Set((serviceRows || []).map((row: any) => row.tour_price_code).filter(Boolean))
          );

          if (tourPriceCodes.length > 0) {
            const { data: pricingRows, error: pricingError } = await supabase
              .from('tour_pricing')
              .select('pricing_id, tour_id')
              .in('pricing_id', tourPriceCodes);

            if (pricingError) {
              console.error('tour_pricing 조회 오류:', pricingError);
            } else {
              const tourIds = Array.from(new Set((pricingRows || []).map((row: any) => row.tour_id).filter(Boolean)));

              if (tourIds.length > 0) {
                const { data: toursData, error: toursError } = await supabase
                  .from('tour')
                  .select('tour_id, tour_name')
                  .in('tour_id', tourIds);

                if (toursError) {
                  console.error('tour 조회 오류:', toursError);
                } else {
                  const tourNameById = new Map((toursData || []).map((row: any) => [row.tour_id, row.tour_name || '투어명 미정']));
                  tourNameByPricingId = new Map(
                    (pricingRows || []).map((row: any) => [row.pricing_id, tourNameById.get(row.tour_id) || '투어명 미정'])
                  );
                }
              }
            }
          }
        }

        const reservationMap = new Map(rows.map(r => [r.re_id, r]));

        (serviceRows || []).forEach((serviceRow: any) => {
          const reservation = reservationMap.get(serviceRow.reservation_id);
          if (!reservation) return;

          cfg.fields.forEach(field => {
            if (type === 'car_sht' || type === 'sht' || type === 'sht_car') {
              const rawCategory = String(serviceRow.sht_category || '').trim().toLowerCase();
              const isPickupRow = rawCategory.includes('pickup') || rawCategory.includes('픽업');
              const isDropoffRow = rawCategory.includes('drop') || rawCategory.includes('드롭');
              if (isPickupRow && field.key === 'dropoff_location') return;
              if (isDropoffRow && field.key === 'pickup_location') return;
            }

            const value = serviceRow[field.key];
            const currentValue = typeof value === 'string' ? value : value == null ? '' : String(value);
            const fieldLabel =
              type === 'airport' && field.key === 'accommodation_info'
                ? getAirportAccommodationLabel(serviceRow.way_type)
                : field.label;

            const tourName =
              type === 'tour'
                ? (tourNameByPricingId.get(serviceRow.tour_price_code) || '투어명 미정')
                : '';

            let segmentKey = 'default';
            let segmentTitle = `${getTypeName(reservation.re_type)}`;

            if (type === 'airport') {
              const way = String(serviceRow.way_type || '').trim().toLowerCase();
              const isSending = way === 'sending' || way === '샌딩';
              segmentKey = isSending ? 'sending' : 'pickup';
              segmentTitle = isSending ? '공항 샌딩' : '공항 픽업';
            } else if (type === 'rentcar') {
              const isReturnField = field.key.startsWith('return_');
              segmentKey = isReturnField ? 'return' : 'pickup';
              segmentTitle = isReturnField ? '렌트카 리턴' : '렌트카 픽업';
            } else if (type === 'car_sht' || type === 'sht' || type === 'sht_car') {
              const isDropoffField = field.key === 'dropoff_location';
              segmentKey = isDropoffField ? 'dropoff' : 'pickup';
              segmentTitle = isDropoffField ? '스하차량 드롭' : '스하차량 픽업';
            } else if (type === 'car' || type === 'cruise_car') {
              const isDropoffField = field.key === 'dropoff_location';
              segmentKey = isDropoffField ? 'dropoff' : 'pickup';
              segmentTitle = isDropoffField ? '크루즈 차량 드롭' : '크루즈 차량 픽업';
            } else if (type === 'tour') {
              segmentKey = 'tour';
              segmentTitle = `투어 ${tourName}`;
            }

            const groupKey = `${reservation.re_id}:${serviceRow.id}:${segmentKey}`;
            const groupTitle = segmentTitle;
            const groupMeta =
              type === 'rentcar'
                ? `픽업 일시: ${formatKstDateTime(serviceRow.pickup_datetime)} / 리턴 일시: ${formatKstDateTime(serviceRow.return_datetime)}`
                : undefined;

            allItems.push({
              uid: `${cfg.table}:${serviceRow.id}:${field.key}`,
              reservationId: reservation.re_id,
              reservationType: reservation.re_type,
              reservationStatus: reservation.re_status,
              quoteId: reservation.re_quote_id,
              quoteTitle: reservation.re_quote_id ? (quoteTitleById[reservation.re_quote_id] || '제목 없음') : '견적 미연결',
              table: cfg.table,
              rowId: serviceRow.id,
              fieldKey: field.key,
              fieldLabel,
              currentValue,
              createdAt: serviceRow.created_at || null,
              groupKey,
              groupTitle,
              groupMeta
            });
          });
        });
      }

      allItems.sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      });

      setItems(allItems);
      setFormValues(
        allItems.reduce((acc, item) => {
          acc[item.uid] = item.currentValue;
          return acc;
        }, {} as Record<string, string>)
      );

      const canonicalTypes = Array.from(new Set(Object.values(RE_TYPE_CANONICAL_MAP)));
      const { data: reqRows, error: reqError } = await supabase
        .from('reservation_change_request')
        .select('id, reservation_id, re_type, status, submitted_at, reviewed_at, customer_note, manager_note')
        .eq('requester_user_id', user.id)
        .in('re_type', canonicalTypes)
        .order('submitted_at', { ascending: false })
        .limit(30);

      if (!reqError) {
        const mapped = (reqRows || []).map((row: any) => {
          const reservation = reservationById.get(row.reservation_id);
          const quoteTitle = reservation?.re_quote_id
            ? (quoteTitleById[reservation.re_quote_id] || '제목 없음')
            : '견적 미연결';

          return {
            id: row.id,
            reservationId: row.reservation_id,
            reType: row.re_type,
            status: row.status,
            submittedAt: row.submitted_at,
            reviewedAt: row.reviewed_at,
            quoteTitle,
            customerNote: row.customer_note,
            managerNote: row.manager_note
          } as LocationRequestHistoryItem;
        });

        setRequestHistory(mapped);
      } else {
        setRequestHistory([]);
      }
    } catch (e: any) {
      console.error('장소 데이터 조회 오류:', e);
      setError(e?.message || '데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [ensureAuthenticatedUser]); // ✅ 인증 가드 의존성 포함

  useEffect(() => {
    loadUpdatingFields();
  }, [loadUpdatingFields]);

  const groupedItems = useMemo(() => {
    return items.reduce((acc, item) => {
      const key = item.groupKey;
      (acc[key] ||= []).push(item);
      return acc;
    }, {} as Record<string, UpdatingFieldItem[]>);
  }, [items]);

  const locationEntries = useMemo(() => {
    return Object.entries(groupedItems)
      .map(([key, entryItems]) => {
        const head = entryItems[0];
        return {
          key,
          title: head.groupTitle,
          meta: head.groupMeta,
          items: entryItems,
          createdAt: head.createdAt || ''
        };
      })
      .sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      });
  }, [groupedItems]);

  useEffect(() => {
    if (locationEntries.length === 0) {
      setSelectedEntryKeys([]);
      return;
    }

    setSelectedEntryKeys(prev => {
      const valid = prev.filter(key => locationEntries.some(entry => entry.key === key));
      if (valid.length > 0) return valid;
      return [locationEntries[0].key];
    });
  }, [locationEntries]);

  const handleSelectEntry = (index: number, entryKey: string) => {
    setSelectedEntryKeys(prev => prev.map((key, i) => (i === index ? entryKey : key)));
  };

  const handleAddEntry = () => {
    setSelectedEntryKeys(prev => {
      if (locationEntries.length === 0) return prev;
      if (prev.length >= locationEntries.length) return prev;
      const used = new Set(prev);
      const next = locationEntries.find(entry => !used.has(entry.key))?.key || locationEntries[0].key;
      return [...prev, next];
    });
  };

  const handleRemoveEntry = (index: number) => {
    setSelectedEntryKeys(prev => prev.filter((_, i) => i !== index));
  };

  const handleValueChange = (uid: string, key: string, value: string) => {
    const normalized = isLocationFieldKey(key)
      ? normalizeLocationEnglishUpper(value)
      : value;

    setFormValues(prev => ({
      ...prev,
      [uid]: normalized
    }));
  };

  const handleSave = async () => {
    if (saving) return;

    const selectedSet = new Set(selectedEntryKeys);

    const filledItems = items.filter(item => {
      if (!selectedSet.has(item.groupKey)) return false;
      const value = formValues[item.uid] ?? '';
      return value.trim() !== item.currentValue.trim();
    });

    if (filledItems.length === 0) {
      alert('수정된 장소가 없습니다.');
      return;
    }

    const updatesByRow = filledItems.reduce((acc, item) => {
      const rowKey = `${item.reservationId}:${item.rowId}`;
      (acc[rowKey] ||= {
        reservationId: item.reservationId,
        reservationType: item.reservationType,
        table: item.table,
        rowId: item.rowId,
        payload: {} as Record<string, string>
      }).payload[item.fieldKey] = formValues[item.uid].trim();
      return acc;
    }, {} as Record<string, {
      reservationId: string;
      reservationType: string;
      table: string;
      rowId: string;
      payload: Record<string, string>;
    }>);

    try {
      setSaving(true);

      const user = await ensureAuthenticatedUser();
      if (!user) return;

      const requestIdByReservationType: Record<string, string> = {};
      const snapshotByRequestKey: Record<string, {
        originalByRowId: Record<string, any>;
        requestedByRowId: Record<string, any>;
      }> = {};

      for (const rowUpdate of Object.values(updatesByRow) as Array<{
        reservationId: string;
        reservationType: string;
        table: string;
        rowId: string;
        payload: Record<string, string>;
      }>) {
        const canonicalType = RE_TYPE_CANONICAL_MAP[rowUpdate.reservationType] || rowUpdate.reservationType;
        const changeTable = CHANGE_TABLE_MAP[canonicalType];
        if (!changeTable) {
          throw new Error(`지원하지 않는 서비스 타입입니다: ${rowUpdate.reservationType}`);
        }

        const requestKey = `${rowUpdate.reservationId}:${canonicalType}`;
        let requestId = requestIdByReservationType[requestKey];

        if (!requestId) {
          const { data: pendingReq, error: pendingReqError } = await supabase
            .from('reservation_change_request')
            .select('id')
            .eq('reservation_id', rowUpdate.reservationId)
            .eq('re_type', canonicalType)
            .eq('status', 'pending')
            .maybeSingle();

          if (pendingReqError) throw pendingReqError;

          if (pendingReq?.id) {
            requestId = pendingReq.id;
          } else {
            const { data: createdReq, error: createReqError } = await supabase
              .from('reservation_change_request')
              .insert({
                reservation_id: rowUpdate.reservationId,
                re_type: canonicalType,
                requester_user_id: user.id,
                status: 'pending',
                customer_note: '장소 추가 페이지에서 위치 정보 업데이트 요청'
              })
              .select('id')
              .single();

            if (createReqError) throw createReqError;
            requestId = createdReq.id;
          }

          requestIdByReservationType[requestKey] = requestId;
        }

        const { data: baseRow, error: baseRowError } = await supabase
          .from(rowUpdate.table)
          .select('*')
          .eq('id', rowUpdate.rowId)
          .maybeSingle();

        if (baseRowError) throw baseRowError;
        if (!baseRow) throw new Error(`원본 데이터를 찾을 수 없습니다: ${rowUpdate.table} (${rowUpdate.rowId})`);

        const requestSnapshot = (snapshotByRequestKey[requestKey] ||= {
          originalByRowId: {},
          requestedByRowId: {}
        });
        requestSnapshot.originalByRowId[rowUpdate.rowId] = baseRow;
        requestSnapshot.requestedByRowId[rowUpdate.rowId] = {
          ...baseRow,
          ...rowUpdate.payload
        };

        // 변경요청 임시 테이블은 원본 예약 테이블과 컬럼 구성이 다르므로
        // location-updates에서 필요한 컬럼만 안전하게 전송한다.
        const tempPayload: Record<string, any> = {
          request_id: requestId,
          reservation_id: rowUpdate.reservationId,
          ...rowUpdate.payload
        };

        const codeFieldByTable: Record<string, string[]> = {
          reservation_airport: ['airport_price_code'],
          reservation_hotel: ['hotel_price_code'],
          reservation_rentcar: ['rentcar_price_code'],
          reservation_tour: ['tour_price_code'],
          reservation_cruise: ['room_price_code'],
          reservation_cruise_car: ['car_price_code', 'rentcar_price_code'],
          reservation_car_sht: ['car_price_code']
        };

        for (const codeField of codeFieldByTable[rowUpdate.table] || []) {
          if (baseRow?.[codeField] !== undefined) {
            tempPayload[codeField] = baseRow[codeField];
          }
        }

        const { data: existingTempRow, error: existingTempRowError } = await supabase
          .from(changeTable)
          .select('id')
          .eq('request_id', requestId)
          .eq('reservation_id', rowUpdate.reservationId)
          .maybeSingle();

        if (existingTempRowError) throw existingTempRowError;

        if (existingTempRow?.id) {
          const { error: tempUpdateError } = await supabase
            .from(changeTable)
            .update(tempPayload)
            .eq('id', existingTempRow.id);

          if (tempUpdateError) throw tempUpdateError;
        } else {
          const { error: tempInsertError } = await supabase
            .from(changeTable)
            .insert(tempPayload);

          if (tempInsertError) throw tempInsertError;
        }

        const { error: reqUpdateError } = await supabase
          .from('reservation_change_request')
          .update({
            customer_note: '장소 추가 페이지에서 위치 정보 업데이트 요청',
            submitted_at: new Date().toISOString(),
            status: 'pending',
            snapshot_data: {
              original: Object.values(requestSnapshot.originalByRowId),
              requested: Object.values(requestSnapshot.requestedByRowId)
            }
          })
          .eq('id', requestId);

        if (reqUpdateError) throw reqUpdateError;
      }

      alert('장소 변경 요청이 저장되었습니다. 매니저 승인 후 반영됩니다.');

      // 비동기로 데이터 갱신 (UI 로딩 상태는 즉시 해제)
      loadUpdatingFields().catch(err => {
        console.error('장소 데이터 갱신 오류:', err);
      });
    } catch (e: any) {
      console.error('장소 저장 오류:', e);
      alert(`저장 중 오류가 발생했습니다: ${e?.message || '알 수 없는 오류'}`);
    } finally {
      setSaving(false);
    }
  };

  const renderRequestHistory = () => {
    if (requestHistory.length === 0) {
      return (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-4 text-sm text-gray-600">
          아직 장소 변경 요청 내역이 없습니다.
        </div>
      );
    }

    return (
      <>
        {/* 데스크톱 테이블 뷰 */}
        <div className="hidden md:block border border-gray-200 rounded-xl overflow-hidden">
          <div className="grid grid-cols-5 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-700">
            <div className="px-3 py-2">서비스</div>
            <div className="px-3 py-2">행복여행 이름</div>
            <div className="px-3 py-2">상태</div>
            <div className="px-3 py-2">요청일</div>
            <div className="px-3 py-2">매니저 메모</div>
          </div>

          <div className="divide-y divide-gray-100">
            {requestHistory.map((req) => (
              <div key={req.id} className="grid grid-cols-5 text-sm">
                <div className="px-3 py-2 text-gray-700">{getTypeName(req.reType)}</div>
                <div className="px-3 py-2 text-gray-700">{req.quoteTitle}</div>
                <div className="px-3 py-2">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${REQUEST_STATUS_CLASS[req.status] || REQUEST_STATUS_CLASS.pending}`}>
                    {REQUEST_STATUS_LABEL[req.status] || req.status}
                  </span>
                </div>
                <div className="px-3 py-2 text-gray-600">{new Date(req.submittedAt).toLocaleString('ko-KR')}</div>
                <div className="px-3 py-2 text-gray-600">{req.managerNote || '-'}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 모바일 카드 뷰 */}
        <div className="md:hidden space-y-3">
          {requestHistory.map((req) => (
            <div key={req.id} className="border border-gray-200 rounded-lg bg-white p-4 space-y-2.5">
              <div className="flex justify-between items-start">
                <span className="text-xs font-semibold text-gray-600">서비스:</span>
                <span className="text-sm text-gray-800 font-medium">{getTypeName(req.reType)}</span>
              </div>
              <div className="flex justify-between items-start">
                <span className="text-xs font-semibold text-gray-600">이름:</span>
                <span className="text-sm text-gray-800">{req.quoteTitle}</span>
              </div>
              <div className="flex justify-between items-start">
                <span className="text-xs font-semibold text-gray-600">상태:</span>
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${REQUEST_STATUS_CLASS[req.status] || REQUEST_STATUS_CLASS.pending}`}>
                  {REQUEST_STATUS_LABEL[req.status] || req.status}
                </span>
              </div>
              <div className="flex justify-between items-start">
                <span className="text-xs font-semibold text-gray-600">요청일:</span>
                <span className="text-sm text-gray-600">{new Date(req.submittedAt).toLocaleString('ko-KR')}</span>
              </div>
              <div className="flex justify-between items-start">
                <span className="text-xs font-semibold text-gray-600">매니저 메모:</span>
                <span className="text-sm text-gray-600">{req.managerNote || '-'}</span>
              </div>
            </div>
          ))}
        </div>
      </>
    );
  };

  if (loading) {
    return (
      <PageWrapper>
        <div className="flex justify-center items-center h-72">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper title="📍 장소 수정" actions={
      <button
        type="button"
        onClick={() => router.push('/mypage')}
        className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium"
      >
        <Home className="w-4 h-4" />
        홈
      </button>
    }>
      <SectionBox title="장소 수정">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              아래 위치 정보만 표시되며, 모든 값을 바로 수정 요청할 수 있습니다.
            </p>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {items.length === 0 ? (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-5 text-sm text-green-700">
              수정 가능한 위치 정보가 없습니다.
            </div>
          ) : (
            <>
              <div className="text-xs text-gray-500">
                총 {locationEntries.length}개 장소
              </div>

              <div className="space-y-4">
                {selectedEntryKeys.map((selectedKey, index) => {
                  const selectedEntry = locationEntries.find(entry => entry.key === selectedKey);
                  const typedItems = selectedEntry?.items || [];
                  const head = typedItems[0];

                  return (
                    <div key={`${selectedKey}-${index}`} className="border border-gray-200 rounded-xl overflow-hidden">
                      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs text-gray-700 font-semibold">수정 항목 {index + 1}</div>
                          {selectedEntryKeys.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveEntry(index)}
                              className="px-2 py-1 text-xs rounded-md bg-red-50 text-red-600 hover:bg-red-100"
                            >
                              항목 제거
                            </button>
                          )}
                        </div>

                        <select
                          value={selectedKey}
                          onChange={e => handleSelectEntry(index, e.target.value)}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
                        >
                          {locationEntries.map(entry => (
                            <option key={entry.key} value={entry.key}>
                              {entry.title}
                            </option>
                          ))}
                        </select>
                      </div>

                      {head && (
                        <>
                          <div className="bg-white px-4 py-3 border-b border-gray-100">
                            <div className="text-sm font-semibold text-gray-800">{head.groupTitle}</div>
                            {head.groupMeta && (
                              <div className="text-xs text-gray-600 mt-1">{head.groupMeta}</div>
                            )}
                          </div>

                          <div className="p-4 space-y-4">
                            {typedItems.map(item => (
                              <div key={item.uid} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
                                <div className="md:col-span-1">
                                  <div className="text-xs font-semibold text-blue-700">{item.fieldLabel}</div>
                                  <div className="text-xs text-gray-500 mt-1">현재값: {item.currentValue}</div>
                                </div>
                                <div className="md:col-span-2">
                                  <input
                                    type="text"
                                    value={formValues[item.uid] || ''}
                                    onChange={e => handleValueChange(item.uid, item.fieldKey, e.target.value)}
                                    placeholder="수정할 값을 입력하세요"
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-blue-300"
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}

                <div className="flex justify-start">
                  <button
                    type="button"
                    onClick={handleAddEntry}
                    disabled={selectedEntryKeys.length >= locationEntries.length}
                    className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    항목 추가
                  </button>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {saving ? '저장 중...' : '장소 변경 요청 저장'}
                </button>
              </div>
            </>
          )}

          <div className="pt-6 border-t border-gray-200">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">장소 변경 요청 내역</h3>
            {renderRequestHistory()}
          </div>
        </div>
      </SectionBox>
    </PageWrapper>
  );
}
