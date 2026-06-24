// SHT 좌석 요금 내역 JSONB 유틸리티
// 좌석 문자열 → seat_pricing_breakdown JSONB 배열 변환 함수

export interface SeatPricingBucket {
  bucket: string;         // 'A' | 'B' | 'C' | 'ALL'
  seats: string[];        // 개별 좌석 ID 목록
  price_code: string;     // rentcar_price의 rent_code
  unit_price: number;     // 좌석군 단가 (VND)
  quantity: number;       // 좌석 수
  total_price: number;    // unit_price * quantity
}

/**
 * 좌석 ID → 좌석 버킷 타입 매핑
 * A1~A6 → 'A', B1~B3 → 'B', C계열 → 'C', 'ALL' → 'ALL'
 */
export function getSeatBucket(seatId: string): 'A' | 'B' | 'C' | 'ALL' {
  const id = seatId.trim().toUpperCase();
  if (id === 'ALL') return 'ALL';
  if (id.startsWith('A')) return 'A';
  if (id.startsWith('B')) return 'B';
  if (id.startsWith('C')) return 'C';
  return 'A'; // 기본값
}

/**
 * 좌석 문자열 → SeatPricingBucket[] 배열 계산
 *
 * @param seatStr   "A1,A2,B1" 또는 "ALL" 형태의 좌석 문자열
 * @param priceMap  버킷 타입 → 단가 맵 (예: { A: 1050000, B: 850000, ALL: 5400000 })
 * @param codeMap   버킷 타입 → rent_code 맵 (예: { A: 'SHT_LIMO_A_2WAY' })
 */
export function calcSeatPricingBreakdown(
  seatStr: string,
  priceMap: Record<string, number>,
  codeMap: Record<string, string> = {},
): SeatPricingBucket[] {
  if (!seatStr || !seatStr.trim()) return [];

  const seats = seatStr
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  if (seats.length === 0) return [];

  // 단독(ALL) 처리
  if (seats.length === 1 && seats[0] === 'ALL') {
    const unitPrice = priceMap['ALL'] ?? 0;
    return [
      {
        bucket: 'ALL',
        seats: ['ALL'],
        price_code: codeMap['ALL'] ?? '',
        unit_price: unitPrice,
        quantity: 1,
        total_price: unitPrice,
      },
    ];
  }

  // 버킷별 그룹화
  const groups: Record<string, string[]> = {};
  for (const seat of seats) {
    if (seat === 'ALL') continue; // 혼합 데이터에서 ALL이 있으면 무시
    const bucket = getSeatBucket(seat);
    if (!groups[bucket]) groups[bucket] = [];
    groups[bucket].push(seat);
  }

  return Object.entries(groups).map(([bucket, seatList]) => {
    const unitPrice = priceMap[bucket] ?? 0;
    return {
      bucket,
      seats: seatList,
      price_code: codeMap[bucket] ?? '',
      unit_price: unitPrice,
      quantity: seatList.length,
      total_price: unitPrice * seatList.length,
    };
  });
}

/**
 * SeatPricingBucket[] → 총액 합산
 */
export function sumSeatPricingBreakdown(breakdown: SeatPricingBucket[]): number {
  return breakdown.reduce((sum, b) => sum + b.total_price, 0);
}

/**
 * JSONB 배열(DB 조회값) → SeatPricingBucket[] 파싱
 * DB에서 읽어온 JSON 배열을 타입 안전하게 변환
 */
export function parseSeatPricingBreakdown(raw: unknown): SeatPricingBucket[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item): item is SeatPricingBucket =>
        item !== null &&
        typeof item === 'object' &&
        typeof (item as any).bucket === 'string',
    )
    .map((item) => ({
      bucket: String(item.bucket),
      seats: Array.isArray(item.seats) ? item.seats.map(String) : [],
      price_code: String(item.price_code ?? ''),
      unit_price: Number(item.unit_price ?? 0),
      quantity: Number(item.quantity ?? 0),
      total_price: Number(item.total_price ?? 0),
    }));
}
