// 한글 컬럼명을 DB 컬럼으로 매핑하는 설정 파일
// 필요에 맞게 헤더명을 실제 구글 시트의 컬럼명으로 수정하세요.

/** 공통 파서 유틸 */
const toNull = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : v);
const parseNumber = (v) => {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(String(v).replace(/[\,\s]/g, ''));
    return Number.isNaN(n) ? null : n;
};
const parseDate = (v) => {
    if (!v) return null;
    // 허용: YYYY-MM-DD | YYYY.MM.DD | MM/DD/YYYY
    let s = String(v).trim();
    if (/^\d{4}[./-]\d{1,2}[./-]\d{1,2}$/.test(s)) {
        s = s.replace(/[.]/g, '-').replace(/\//g, '-');
        const d = new Date(s);
        if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10); // date only
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};
const parseDateTime = (v) => {
    if (!v) return null;
    const d = new Date(String(v).replace(/[.]/g, '-'));
    return isNaN(d.getTime()) ? null : d.toISOString().replace('Z', ''); // naive timestamp
};

/**
 * 시트별 매핑 설정
 * - sheetName: 구글 시트 탭 이름
 * - targetTable: Supabase 테이블명
 * - idColumn: 시트 내 주문ID 컬럼명 (reservation_id로 매핑)
 * - requiredDbFields: 삽입 전 필수 DB 컬럼들 (누락 시 건너뜀)
 * - columnMap: { '한글헤더': 'db_column' }
 * - transforms: { db_column: (v) => any } 타입/형식 보정
 */
const sheetsConfig = [
    {
        sheetName: '렌트카',
        targetTable: 'reservation_rentcar',
        idColumn: '주문ID',
        requiredDbFields: ['reservation_id', 'rentcar_price_code'],
        columnMap: {
            주문ID: 'reservation_id',
            차량코드: 'rentcar_price_code',
            가격코드: 'rentcar_price_code',
            차량대수: 'rentcar_count',
            렌터카수: 'rentcar_count',
            금액: 'unit_price',
            단가: 'unit_price',
            승차인원: 'passenger_count',
            승객수: 'passenger_count',
            승차장소: 'pickup_location',
            픽업장소: 'pickup_location',
            목적지: 'destination',
            경유지: 'via_location',
            캐리어갯수: 'luggage_count',
            수하물: 'luggage_count',
            합계: 'total_price',
            총액: 'total_price',
            메모: 'request_note',
            요청사항: 'request_note',
        },
        transforms: {
            unit_price: parseNumber,
            total_price: parseNumber,
            rentcar_count: (v) => parseNumber(v) ?? 1,
            passenger_count: parseNumber,
            luggage_count: parseNumber,
            pickup_datetime: parseDateTime,
            request_note: toNull,
        },
        postProcess: (mapped, { row, header }) => {
            if (!mapped.pickup_datetime) {
                const dIdx = header.indexOf('승차일자');
                const tIdx = header.indexOf('승차시간');
                const d = dIdx >= 0 ? row[dIdx] : null;
                const t = tIdx >= 0 ? row[tIdx] : null;
                if (d || t) {
                    const s = [d || '', t || ''].join(' ').trim();
                    if (s) mapped.pickup_datetime = parseDateTime(s);
                }
            }
            return mapped;
        },
    },
    // 동의어 탭명 지원: '렌터카' (동일 매핑)
    {
        sheetName: '렌터카',
        targetTable: 'reservation_rentcar',
        idColumn: '주문ID',
        requiredDbFields: ['reservation_id', 'rentcar_price_code'],
        columnMap: {
            주문ID: 'reservation_id',
            차량코드: 'rentcar_price_code',
            가격코드: 'rentcar_price_code',
            차량대수: 'rentcar_count',
            렌터카수: 'rentcar_count',
            금액: 'unit_price',
            단가: 'unit_price',
            승차인원: 'passenger_count',
            승객수: 'passenger_count',
            승차장소: 'pickup_location',
            픽업장소: 'pickup_location',
            목적지: 'destination',
            경유지: 'via_location',
            캐리어갯수: 'luggage_count',
            수하물: 'luggage_count',
            합계: 'total_price',
            총액: 'total_price',
            메모: 'request_note',
            요청사항: 'request_note',
        },
        transforms: {
            unit_price: parseNumber,
            total_price: parseNumber,
            rentcar_count: (v) => parseNumber(v) ?? 1,
            passenger_count: parseNumber,
            luggage_count: parseNumber,
            pickup_datetime: parseDateTime,
            request_note: toNull,
        },
        postProcess: (mapped, { row, header }) => {
            if (!mapped.pickup_datetime) {
                const dIdx = header.indexOf('승차일자');
                const tIdx = header.indexOf('승차시간');
                const d = dIdx >= 0 ? row[dIdx] : null;
                const t = tIdx >= 0 ? row[tIdx] : null;
                if (d || t) {
                    const s = [d || '', t || ''].join(' ').trim();
                    if (s) mapped.pickup_datetime = parseDateTime(s);
                }
            }
            return mapped;
        },
    },
    {
        sheetName: '공항',
        targetTable: 'reservation_airport',
        idColumn: '주문ID',
        requiredDbFields: ['reservation_id', 'airport_price_code', 'ra_airport_location', 'ra_datetime', 'ra_passenger_count', 'ra_luggage_count'],
        columnMap: {
            주문ID: 'reservation_id',
            차량코드: 'airport_price_code',
            가격코드: 'airport_price_code',
            공항명: 'ra_airport_location',
            공항위치: 'ra_airport_location',
            항공편: 'ra_flight_number',
            경유지: 'ra_stopover_location',
            경유지대기시간: 'ra_stopover_wait_minutes',
            차량수: 'ra_car_count',
            승차인원: 'ra_passenger_count',
            승객수: 'ra_passenger_count',
            캐리어수량: 'ra_luggage_count',
            수하물: 'ra_luggage_count',
            일시: 'ra_datetime',
            일자: 'ra_datetime',
            시간: 'ra_datetime',
            금액: 'unit_price',
            단가: 'unit_price',
            합계: 'total_price',
            총액: 'total_price',
            요청사항: 'request_note',
            처리: 'ra_is_processed',
        },
        transforms: {
            ra_datetime: parseDateTime,
            ra_stopover_wait_minutes: parseNumber,
            ra_car_count: (v) => parseNumber(v) ?? 1,
            ra_passenger_count: parseNumber,
            ra_luggage_count: parseNumber,
            unit_price: parseNumber,
            total_price: parseNumber,
            request_note: toNull,
        },
        postProcess: (mapped, { row, header }) => {
            if (!mapped.ra_datetime) {
                const dIdx = header.indexOf('일자');
                const tIdx = header.indexOf('시간');
                const d = dIdx >= 0 ? row[dIdx] : null;
                const t = tIdx >= 0 ? row[tIdx] : null;
                if (d || t) {
                    const s = [d || '', t || ''].join(' ').trim();
                    if (s) mapped.ra_datetime = parseDateTime(s);
                }
            }
            return mapped;
        },
    },
    {
        sheetName: '호텔',
        targetTable: 'reservation_hotel',
        idColumn: '주문ID',
        requiredDbFields: ['reservation_id', 'hotel_price_code', 'checkin_date'],
        columnMap: {
            주문ID: 'reservation_id',
            호텔코드: 'hotel_price_code',
            가격코드: 'hotel_price_code',
            체크인날짜: 'checkin_date',
            체크인: 'checkin_date',
            객실수: 'room_count',
            조식서비스: 'breakfast_service',
            조식: 'breakfast_service',
            투숙인원: 'guest_count',
            투숙객수: 'guest_count',
            일정: 'schedule',
            스케줄: 'schedule',
            비고: 'request_note',
            요청사항: 'request_note',
            합계: 'total_price',
            총액: 'total_price',
        },
        transforms: {
            checkin_date: parseDate,
            room_count: parseNumber,
            guest_count: parseNumber,
            total_price: parseNumber,
            request_note: toNull,
        },
    },
    {
        sheetName: '크루즈',
        targetTable: 'reservation_cruise',
        idColumn: '주문ID',
        requiredDbFields: ['reservation_id', 'room_price_code', 'checkin', 'guest_count'],
        columnMap: {
            주문ID: 'reservation_id',
            객실코드: 'room_price_code',
            지난코드: 'room_price_code',  // 실제 시트의 컬럼명
            체크인: 'checkin',
            승선인원: 'guest_count',
            인원수: 'guest_count',
            ADULT: 'adult_count',
            CHILD: 'child_count',
            TODDLER: 'toddler_count',
            금액: 'unit_price',
            합계: 'room_total_price',
            승선도움: 'boarding_assist',
            비고: 'request_note',
            커넥팅룸: 'connecting_room',
            Email: 'user_email',
        },
        transforms: {
            checkin: parseDate,
            guest_count: parseNumber,
            adult_count: parseNumber,
            child_count: parseNumber,
            toddler_count: parseNumber,
            unit_price: parseNumber,
            room_total_price: parseNumber,
            request_note: toNull,
        },
        postProcess: (mapped, { row, header }) => {
            // 승선인원이 비어있다면 ADULT + CHILD + TODDLER 합계로 계산
            if (mapped.guest_count == null) {
                const adult = mapped.adult_count || 0;
                const child = mapped.child_count || 0;
                const toddler = mapped.toddler_count || 0;
                if (adult > 0 || child > 0 || toddler > 0) {
                    mapped.guest_count = adult + child + toddler;
                }
            }
            return mapped;
        },
    },
    {
        sheetName: '크루즈 차량',
        targetTable: 'reservation_cruise_car',
        idColumn: '주문ID',
        requiredDbFields: ['reservation_id'],
        columnMap: {
            주문ID: 'reservation_id',
            차량코드: 'car_price_code',
            차량수: 'car_count',
            승차인원: 'passenger_count',
            승차일시: 'pickup_datetime',
            승차위치: 'pickup_location',
            하차위치: 'dropoff_location',
            합계: 'car_total_price',
            금액: 'car_total_price',
            비고: 'request_note',
            메모: 'request_note',
            요청사항: 'request_note',
        },
        transforms: {
            car_count: parseNumber,
            passenger_count: parseNumber,
            pickup_datetime: parseDateTime,
            car_total_price: parseNumber,
            request_note: toNull,
        },
    },
    // 실제 시트명 '차량'으로 추가
    {
        sheetName: '차량',
        targetTable: 'reservation_cruise_car',
        idColumn: '주문ID',
        requiredDbFields: ['reservation_id'],
        columnMap: {
            주문ID: 'reservation_id',
            차량코드: 'car_price_code',
            차량수: 'car_count',
            승차인원: 'passenger_count',
            승차일시: 'pickup_datetime',
            승차위치: 'pickup_location',
            하차위치: 'dropoff_location',
            합계: 'car_total_price',
            금액: 'car_total_price',
            구분: 'car_type',
            분류: 'car_category',
            크루즈: 'cruise_name',
            차량종류: 'vehicle_type',
            Email: 'user_email',
        },
        transforms: {
            car_count: parseNumber,
            passenger_count: parseNumber,
            pickup_datetime: parseDateTime,
            car_total_price: parseNumber,
            request_note: toNull,
        },
    },
    {
        sheetName: '투어',
        targetTable: 'reservation_tour',
        idColumn: '주문ID',
        requiredDbFields: ['reservation_id', 'tour_price_code'],
        columnMap: {
            주문ID: 'reservation_id',
            투어코드: 'tour_price_code',
            가격코드: 'tour_price_code',
            투어인원: 'tour_capacity',
            투어정원: 'tour_capacity',
            픽업위치: 'pickup_location',
            픽업장소: 'pickup_location',
            드랍위치: 'dropoff_location',
            하차장소: 'dropoff_location',
            합계: 'total_price',
            총액: 'total_price',
            메모: 'request_note',
            요청사항: 'request_note',
        },
        transforms: {
            tour_capacity: parseNumber,
            total_price: parseNumber,
            request_note: toNull,
        },
    },
];

module.exports = {
    sheetsConfig,
    parseNumber,
    parseDate,
    parseDateTime,
    toNull,
};
