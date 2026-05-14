import React from 'react';
import { X, Ship, Plane, Building, MapPin, Car, FileText, User } from 'lucide-react';

/* ── 유틸 ── */
const fmt = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '미정';
  try {
    const raw = String(dateStr).replace(' ', 'T');
    const parsed = new Date(raw);
    if (isNaN(parsed.getTime())) return String(dateStr);
    const plus8 = new Date(parsed.getTime() + 8 * 60 * 60 * 1000);
    const yyyy = plus8.getFullYear();
    const mm = String(plus8.getMonth() + 1).padStart(2, '0');
    const dd = String(plus8.getDate()).padStart(2, '0');
    const hh = plus8.getHours();
    const min = String(plus8.getMinutes()).padStart(2, '0');
    return `${yyyy}. ${mm}. ${dd}. ${hh < 12 ? '오전' : '오후'} ${hh % 12 || 12}:${min}`;
  } catch { return String(dateStr); }
};

const normalizeWayType = (value: string | null | undefined) => {
  const way = (value || '').toLowerCase();
  if (way === 'pickup' || way === '픽업') return '픽업';
  if (way === 'sending' || way === 'dropoff' || way === '샌딩') return '샌딩';
  return value || '-';
};

const fmtDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '미정';
  const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}. ${m[2]}. ${m[3]}.` : String(dateStr);
};

const fmtWhenPresent = (dateStr: string | null | undefined) => dateStr ? fmt(dateStr) : null;
const fmtMoney = (value: number) => `${value.toLocaleString('ko-KR')}동`;
const KEY_LABELS: Record<string, string> = {
  reservation_id: '예약ID',
  reservationId: '예약ID',
  re_quote_id: '견적ID',
  quoteId: '견적ID',
  vehicle_number: '차량번호',
  seat_number: '좌석번호',
  ra_flight_number: '항공편',
  ra_airport_location: '공항',
  ra_datetime: '공항일시',
  pickup_datetime: '픽업일시',
  checkin_date: '체크인',
  request_note: '요청사항',
  airport_price_code: '공항코드',
  room_price_code: '객실코드',
  car_price_code: '차량코드',
  rentcar_price_code: '렌터카코드',
};

const getServiceType = (item: any) => {
  if (item.cruise && item.checkin) return 'cruise';
  if (item.boardingDate && item.vehicleNumber) return 'vehicle';
  const hasAirportHint = !!(item.tripType || item.route || item.airportName || item.flightNumber || item.placeName);
  if (hasAirportHint && (item.date || item.time || item.airportName)) return 'airport';
  if (item.hotelName && item.checkinDate) return 'hotel';
  if (item.tourName && item.startDate) return 'tour';
  if (item.pickupDate && item.usagePeriod) return 'rentcar';
  if (item.pickupDatetime && !item.boardingDate && !item.pickupDate) return 'car';
  return 'unknown';
};

/* ── 서비스별 색상 & 메타 ── */
type ServiceMeta = { icon: any; label: string; bg: string; border: string; title: string; iconColor: string };
const SERVICE_META: Record<string, ServiceMeta> = {
  cruise:  { icon: Ship,     label: '크루즈',    bg: 'bg-blue-50',   border: 'border-blue-200',   title: 'text-blue-800',   iconColor: 'text-blue-600'   },
  car:     { icon: Car,      label: '차량',      bg: 'bg-cyan-50',   border: 'border-cyan-200',   title: 'text-cyan-800',   iconColor: 'text-cyan-600'   },
  vehicle: { icon: Car,      label: '스하차량',  bg: 'bg-purple-50', border: 'border-purple-200', title: 'text-purple-800', iconColor: 'text-purple-600' },
  airport: { icon: Plane,    label: '공항차량',  bg: 'bg-green-50',  border: 'border-green-200',  title: 'text-green-800',  iconColor: 'text-green-600'  },
  hotel:   { icon: Building, label: '호텔',      bg: 'bg-orange-50', border: 'border-orange-200', title: 'text-orange-800', iconColor: 'text-orange-600' },
  tour:    { icon: MapPin,   label: '투어',      bg: 'bg-pink-50',   border: 'border-pink-200',   title: 'text-pink-800',   iconColor: 'text-pink-600'   },
  rentcar: { icon: Car,      label: '렌터카',    bg: 'bg-indigo-50', border: 'border-indigo-200', title: 'text-indigo-800', iconColor: 'text-indigo-600' },
};
const DEFAULT_META: ServiceMeta = { icon: FileText, label: '서비스', bg: 'bg-gray-50', border: 'border-gray-200', title: 'text-gray-800', iconColor: 'text-gray-600' };

/* ── 필드 행 ── */
function Field({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) {
  if (value === undefined || value === null || value === '' || value === '-') return null;
  return (
    <div className="flex justify-between items-start gap-2 py-1">
      <span className="text-gray-500 font-medium text-xs whitespace-nowrap shrink-0">{label}</span>
      <span className={`text-sm font-semibold text-right break-words ${highlight ? 'text-green-600 text-base' : 'text-gray-900'}`}>{value}</span>
    </div>
  );
}

/* ── 서비스별 상세 섹션 ── */
function ServiceDetails({ item, type, meta }: { item: any; type: string; meta: ServiceMeta }) {
  const excludedKeys = new Set([
    'source', 'orderId', 'reservationId', 're_user_id', 're_quote_id', 'quoteId',
    'customerName', 'customerEnglishName', 'email', 'totalAmount', 'amount',
    'cruise', 'cruiseName', 'roomType', 'category', 'checkin', 'roomCount', 'room_count',
    'adult', 'adult_count', 'child', 'child_count', 'toddler', 'infant_count', 'discount',
    'paymentMethod', 'payment_method', 'room_total_price',
    'carType', 'carCategory', 'carCount', 'car_count', 'passengerCount', 'passenger_count',
    'pickupDatetime', 'pickup_datetime', 'pickupLocation', 'pickup_location',
    'dropoffLocation', 'dropoff_location', 'car_total_price',
    'boardingDate', 'usageDate', 'usage_date', 'serviceType', 'sht_category', 'vehicleNumber', 'vehicle_number',
    'seatNumber', 'seat_number', 'name',
    'tripType', 'wayType', 'way_type', 'ra_way_type', 'route', 'date', 'time',
    'airportName', 'ra_airport_location', 'flightNumber', 'ra_flight_number',
    'vehicleType', 'placeName', 'accommodation_info', 'stopover', 'ra_datetime',
    'ra_passenger_count', 'ra_car_count', 'total_price',
    'hotelName', 'roomName', 'days', 'nights', 'checkinDate', 'checkin_date', 'guestCount', 'guest_count',
    'tourName', 'tourType', 'tourDate', 'tourCapacity', 'tour_capacity', 'startDate', 'endDate', 'participants',
    'pickupDate', 'pickupTime', 'destination', 'usagePeriod', 'rental_days',
    'luggageCount', 'luggage_count', 'dispatchCode', 'dispatch_code',
    'viaLocation', 'via_location', 'viaWaiting', 'via_waiting',
    'returnDatetime', 'return_datetime', 'returnPickupLocation', 'return_pickup_location',
    'returnDestination', 'return_destination', 'returnViaLocation', 'return_via_location',
    'returnViaWaiting', 'return_via_waiting', 'unitPrice', 'unit_price', 'totalPrice',
    'requestNote',
  ]);
  const requestNote =
    item.requestNote || item.request_note || item.special_requests || item.memo || item.notes || '';
  const unitPrice = Number(item.unitPrice ?? item.unit_price ?? 0);
  const totalPrice = Number(item.totalPrice ?? item.total_price ?? item.car_total_price ?? item.room_total_price ?? 0);
  const extraEntries = Object.entries(item || {}).filter(([key, value]) => {
    if (excludedKeys.has(key)) return false;
    if (value === undefined || value === null || value === '' || value === '-') return false;
    if (typeof value === 'object') return false;
    return true;
  });

  return (
    <div className={`${meta.bg} border ${meta.border} rounded-lg p-4`}>
      <h4 className={`font-semibold ${meta.title} mb-3 flex items-center gap-2 text-sm`}>
        <meta.icon className={`w-4 h-4 ${meta.iconColor}`} />
        {meta.label} 상세
      </h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0">
        {type === 'cruise' && <>
          <Field label="크루즈명"  value={item.cruiseName || item.cruise} />
          <Field label="객실타입"  value={item.roomType ? <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs">{item.roomType}</span> : null} />
          <Field label="객실수"    value={(item.room_count || item.roomCount) ? `${item.room_count || item.roomCount}실` : null} />
          <Field label="체크인"    value={fmtDate(item.checkin)} />
          <Field label="결제방식"  value={item.paymentMethod || item.payment_method} />
        </>}

        {type === 'car' && <>
          <Field label="구분"      value={item.carCategory || item.sht_category || item.category} />
          <Field label="차량타입"  value={item.carType ? <span className="bg-cyan-100 text-cyan-800 px-2 py-0.5 rounded text-xs">{item.carType}</span> : null} />
          <Field label="경로"      value={item.route} />
          <Field label="총인원수"  value={item.passengerCount != null ? `${item.passengerCount}명` : null} />
          <Field label="픽업일시"  value={fmtWhenPresent(item.pickupDatetime || item.pickup_datetime)} />
          <Field label="픽업위치"  value={item.pickupLocation || item.pickup_location} />
          <Field label="드랍위치"  value={item.dropoffLocation || item.dropoff_location || item.destination} />
          <Field label="차량번호"  value={item.vehicleNumber || item.vehicle_number} />
        </>}

        {type === 'vehicle' && <>
          <Field label="사용일"    value={item.usageDate ? fmt(item.usageDate) : (item.boardingDate ? fmtDate(item.boardingDate) : null)} />
          <Field label="구분"      value={item.category || item.sht_category || item.serviceType} />
          <Field label="차량번호"  value={item.vehicleNumber} />
          <Field label="좌석"      value={item.seatNumber} />
          <Field label="픽업장소"  value={item.pickupLocation || item.pickup_location} />
          <Field label="드롭장소"  value={item.dropoffLocation || item.dropoff_location} />
        </>}

        {type === 'airport' && <>
          <Field label="구분"      value={item.category || item.way_type || normalizeWayType(item.tripType || item.wayType)} />
          <Field label="경로"      value={item.route} />
          <Field label="차량"      value={item.carType || item.vehicleType} />
          <Field label="일시"      value={item.ra_datetime ? fmt(item.ra_datetime) : (item.date || item.time ? `${fmtDate(item.date)} ${item.time || ''}`.trim() : null)} />
          <Field label="항공편"    value={item.flightNumber || item.ra_flight_number} />
          <Field label="공항"      value={item.airportName || item.ra_airport_location} />
          {(() => {
            const airportTypeRaw = String(item.category || item.way_type || '').toLowerCase();
            const isSending = airportTypeRaw.includes('sending') || airportTypeRaw.includes('샌딩');
            const locationLabel = isSending ? '승차위치' : '하차위치';
            const locationValue = item.accommodation_info || item.placeName || item.pickupLocation || item.dropoffLocation;
            return <Field label={locationLabel} value={locationValue} />;
          })()}
          <Field label="경유지"    value={item.stopover} />
          <Field label="인원"      value={item.passengerCount ? `${item.passengerCount}명` : null} />
        </>}

        {type === 'hotel' && <>
          <Field label="호텔명"    value={item.hotelName ? <span className="bg-orange-100 text-orange-800 px-2 py-0.5 rounded text-xs font-semibold">{item.hotelName}</span> : null} />
          <Field label="객실타입"  value={item.roomType} />
          <Field label="체크인"    value={fmtDate(item.checkinDate)} />
          {item.checkinDate && (item.nights || item.days) ? (
            <Field label="체크아웃" value={(() => {
              const checkin = new Date(item.checkinDate);
              const checkout = new Date(checkin);
              checkout.setDate(checkout.getDate() + Number(item.nights || item.days || 0));
              return isNaN(checkout.getTime()) ? null : checkout.toISOString().split('T')[0];
            })()} />
          ) : null}
          <Field label="숙박일정"  value={(item.nights || item.days) ? `${item.nights || item.days}박 ${Number(item.nights || item.days) + 1}일` : null} />
          <Field label="인원"      value={item.guestCount != null ? `${item.guestCount}명` : null} />
        </>}

        {type === 'tour' && <>
          <Field label="투어명"    value={item.tourName ? <span className="bg-pink-100 text-pink-800 px-2 py-0.5 rounded text-xs font-semibold">{item.tourName}</span> : null} />
          <Field label="투어일자"  value={fmtDate(item.tourDate || item.startDate)} />
          <Field label="인원수"    value={(item.tourCapacity || item.participants) ? `${item.tourCapacity || item.participants}명` : null} />
          <Field label="차량"      value={item.carCount ? `${item.carCount}대` : null} />
          <Field label="픽업장소"  value={item.pickupLocation} />
          <Field label="드랍장소"  value={item.dropoffLocation || item.dropoff_location} />
        </>}

        {type === 'rentcar' && <>
          <Field label="차량 타입" value={item.carType ? <span className="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded text-xs">{item.carType}{item.capacity ? ` (${item.capacity}인승)` : ''}</span> : null} />
          <Field label="경로"      value={item.route} />
          <Field label="이용방식"  value={item.category || item.way_type} />
          <Field label="차량 수"   value={item.carCount != null ? `${item.carCount}대` : null} />
          <Field label="탑승 인원" value={item.passengerCount != null ? `${item.passengerCount}명` : null} />
          <Field label="수하물"    value={item.luggageCount != null && Number(item.luggageCount) > 0 ? `${item.luggageCount}개` : null} />
          <Field label="차량번호"  value={item.dispatchCode || item.dispatch_code} />
          <Field label="픽업 시간" value={fmtWhenPresent(item.pickupDatetime || item.pickup_datetime)} />
          <Field label="픽업장소"  value={item.pickupLocation || item.pickup_location} />
          <Field label="드롭장소"  value={item.destination || item.dropoffLocation || item.dropoff_location} />
          <Field label="경유지"    value={item.viaLocation || item.via_location} />
          <Field label="대기"      value={item.viaWaiting || item.via_waiting} />
          <Field label="리턴 시간" value={fmtWhenPresent(item.returnDatetime || item.return_datetime)} />
          <Field label="리턴 픽업장소" value={item.returnPickupLocation || item.return_pickup_location} />
          <Field label="리턴 드롭장소" value={item.returnDestination || item.return_destination} />
          <Field label="리턴 경유지" value={item.returnViaLocation || item.return_via_location} />
          <Field label="리턴 대기" value={item.returnViaWaiting || item.return_via_waiting} />
        </>}
      </div>
      {(unitPrice > 0 || totalPrice > 0) && (
        <div className="mt-3 pt-3 border-t border-gray-200 space-y-1">
          {unitPrice > 0 && (
            <Field label="단가" value={fmtMoney(unitPrice)} />
          )}
          {totalPrice > 0 && (
            <Field label="총 금액" value={<span className="font-bold text-blue-600">{fmtMoney(totalPrice)}</span>} />
          )}
        </div>
      )}
      {extraEntries.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-300 bg-white rounded p-3">
          <p className="text-xs font-semibold text-gray-700 mb-2">추가 상세</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0">
            {extraEntries.map(([key, value]) => (
              <Field key={key} label={KEY_LABELS[key] || key} value={String(value)} />
            ))}
          </div>
        </div>
      )}
      {requestNote && (
        <div className="mt-3 pt-3 border-t border-yellow-300 bg-yellow-50 rounded p-3">
          <p className="text-xs font-semibold text-yellow-800 mb-1">📝 요청사항</p>
          <p className="text-sm text-gray-900 whitespace-pre-wrap">{requestNote}</p>
        </div>
      )}
    </div>
  );
}

/* ── 메인 모달 ── */
export default function ReservationDetailModal({
  isOpen,
  onClose,
  onEdit,
  item,
  items,
}: {
  isOpen: boolean;
  onClose: () => void;
  onEdit?: (item: any) => void;
  item: any;
  items?: any[];
}) {
  if (!isOpen || !item) return null;

  const type = getServiceType(item);
  const meta = SERVICE_META[type] || DEFAULT_META;
  const Icon = meta.icon;
  const groupedItems = (items && items.length > 0) ? items : [item];
  const totalAmount = groupedItems.reduce((sum, current) => {
    const n = Number(current?.totalAmount ?? current?.total_amount ?? current?.amount ?? 0);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
  const groupKey = item?.source === 'sh'
    ? `주문번호 ${item?.orderId || '-'}`
    : `견적ID ${item?.quoteId || item?.re_quote_id || item?.quote_id || '-'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-start justify-center pt-0 sm:pt-2">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white w-full sm:w-[95%] sm:max-w-2xl rounded-t-2xl sm:rounded-xl shadow-2xl flex flex-col max-h-[95vh] sm:max-h-[90vh]">

        {/* 모달 헤더 */}
        <div className="flex items-center gap-3 px-4 py-3 border-b bg-white rounded-t-2xl sm:rounded-t-xl sticky top-0 z-10">
          <div className={`w-10 h-10 flex items-center justify-center rounded-xl ${meta.bg} border ${meta.border}`}>
            <Icon className={`w-5 h-5 ${meta.iconColor}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`font-bold text-base ${meta.title}`}>{meta.label} 상세 정보</span>
              {item.source === 'sh' && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-600 font-medium">Old</span>
              )}
              {item.source === 'new' && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">New</span>
              )}
            </div>
            <p className="text-sm text-gray-500 truncate">
              {item.customerName || item.name || '고객 정보 없음'}
              {item.customerEnglishName ? ` (${item.customerEnglishName})` : ''}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">{groupKey} · 연결 서비스 {groupedItems.length}건</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 shrink-0">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* 모달 바디 */}
        <div className="overflow-y-auto p-4 space-y-4 flex-1">

          {/* 고객 기본 정보 */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h4 className="font-semibold text-gray-700 mb-3 flex items-center gap-2 text-sm">
              <User className="w-4 h-4 text-gray-500" />
              고객 정보
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
              <Field label="이메일"     value={item.email} />
              <Field label="한글이름"   value={item.customerName} />
              <Field label="영문이름"   value={item.customerEnglishName} />
            </div>
          </div>

          {/* 연결된 서비스 상세 */}
          <div className="space-y-3">
            {groupedItems.map((serviceItem, idx) => {
              const serviceType = getServiceType(serviceItem);
              const serviceMeta = SERVICE_META[serviceType] || DEFAULT_META;
              return (
                <div key={`${serviceItem?.orderId || serviceItem?.re_id || 'item'}-${idx}`}>
                  {groupedItems.length > 1 && (
                    <div className="mb-2 text-xs text-gray-500 font-medium">
                      서비스 {idx + 1}
                    </div>
                  )}
                  <ServiceDetails item={serviceItem} type={serviceType} meta={serviceMeta} />
                </div>
              );
            })}
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-green-800">총금액</span>
              <span className="text-lg font-bold text-green-700">{fmtMoney(totalAmount)}</span>
            </div>
          </div>

        </div>
        <div className="px-4 pb-4">
          <button
            type="button"
            onClick={() => onEdit?.(item)}
            disabled={!onEdit}
            className="w-full h-11 rounded-lg bg-blue-600 text-white font-semibold disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
          >
            수정
          </button>
        </div>
      </div>
    </div>
  );
}
