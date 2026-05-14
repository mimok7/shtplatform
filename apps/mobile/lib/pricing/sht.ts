/**
 * SHT 차량 좌석별 단가 계산 유틸.
 * 좌석 ID 규칙: A1~A6 -> 'A', B1~B3 -> 'B', C1 -> 'C', 'ALL' -> 단독.
 * 단가(VND): A=490,000 / B=350,000 / C=590,000 / ALL=4,900,000
 */
export const SHT_SEAT_PRICES: Record<string, number> = {
  A: 490_000,
  B: 350_000,
  C: 590_000,
  ALL: 4_900_000,
};

export function getSeatType(seatId: string): 'A' | 'B' | 'C' | 'ALL' {
  const id = seatId.trim().toUpperCase();
  if (id === 'ALL') return 'ALL';
  if (id.startsWith('A')) return 'A';
  if (id.startsWith('B')) return 'B';
  if (id.startsWith('C')) return 'C';
  return 'A';
}

export interface SeatGroup {
  type: 'A' | 'B' | 'C' | 'ALL';
  seats: string[];
  unit_price: number;
  subtotal: number;
}

export interface SeatPriceResult {
  groups: SeatGroup[];
  total: number;
}

/**
 * 좌석 문자열(쉼표 구분) -> 좌석 타입별 그룹화 + 합계 계산.
 * 예: "A1,A2,B1,C1" -> A(2)x490,000 + B(1)x350,000 + C(1)x590,000 = 1,920,000
 */
export function calculateShtSeatPrice(seatNumberStr: string): SeatPriceResult {
  const seats = (seatNumberStr || '')
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const byType: Record<'A' | 'B' | 'C' | 'ALL', string[]> = { A: [], B: [], C: [], ALL: [] };
  for (const s of seats) {
    const t = getSeatType(s);
    byType[t].push(s);
  }

  const groups: SeatGroup[] = [];
  let total = 0;
  (['ALL', 'A', 'B', 'C'] as const).forEach((t) => {
    const arr = byType[t];
    if (arr.length === 0) return;
    const unit = SHT_SEAT_PRICES[t] ?? 0;
    const subtotal = unit * arr.length;
    groups.push({ type: t, seats: arr, unit_price: unit, subtotal });
    total += subtotal;
  });

  return { groups, total };
}
