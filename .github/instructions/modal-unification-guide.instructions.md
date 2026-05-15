---
title: "모달 통일 가이드 (Modal Unification Guide)"
date: "2026-05-15"
description: "동일한 기능의 모달이 여러 페이지에서 서로 다르게 작동하는 문제 해결 및 통일 방법"
applyTo: 
  - "apps/mobile/app/**/page.tsx"
  - "apps/manager/app/**/page.tsx"
  - "apps/manager1/app/**/page.tsx"
tags:
  - "modal"
  - "data-loading"
  - "db-queries"
  - "unification"
severity: "high"
status: "active"
---

# 모달 통일 가이드 (2026.05.15)

## 개요
모바일 앱(`apps/mobile`)에서 동일한 기능을 사용하는 여러 페이지가 서로 다른 모달을 구현하여 데이터 불일치가 발생하는 문제를 해결하기 위한 표준 절차입니다.

---

## 1. 문제 상황 사례

### 증상
- **schedule/page.tsx** (신구구분): 모달에 모든 서비스 표시 안 됨
- **reservations/page.tsx** (예약처리): 모달에 모든 서비스 표시됨
- **원인**: 동일한 모달 컴포넌트를 사용하지만, 페이지에서 전달하는 **데이터 로드 방식이 다름**

### 구체적 원인 분석

#### Schedule 페이지 (데이터 누락)
```typescript
const openDetail = (item: any) => {
  // ❌ 문제: allData 캐시에서만 필터링
  const related = allData.filter(d => d?.source === 'new' && d?.quoteId === item.quoteId);
  setSelectedItems(related);  // 일부 서비스만 포함됨
};
```

**문제점**:
- `allData`는 화면 렌더링용 카드 목록으로 메모리 상태
- Supabase 1000행 제한 또는 매핑 누락으로 일부 서비스 미포함
- DB에는 모든 서비스가 있지만, 캐시에만 의존해 누락된 서비스 표시 안 됨

#### Reservations 페이지 (정상)
```typescript
const handleViewDetail = async (reservation: ReservationItem) => {
  // ✅ 정상: DB에서 직접 조회
  const { data: allReservations } = await supabase
    .from('reservation')
    .select('re_id, re_type, re_status, re_user_id')
    .eq('re_quote_id', quoteId);
  
  // 8개 서비스 테이블 병렬 조회
  const [cruiseRes, carRes, airportRes, ...] = await Promise.all([...]);
};
```

**정상 이유**:
- 모달 호출 시마다 DB에서 fresh 데이터 조회
- 모든 서비스 테이블을 포괄적으로 조회
- 메모리 캐시에 의존하지 않음

---

## 2. 근본 원인: 데이터 로드 패턴 불일치

| 항목 | Schedule | Reservations |
|------|----------|--------------|
| 초기 데이터 로드 | `loadData()`: sh_*/reservation 통합 로드 → `allData` | `loadReservations()`: reservation 테이블만 + `services: []` 메타 |
| 모달 호출 시 | 캐시 필터링 only | **DB 8개 테이블 직접 조회** |
| 서비스 상세 | 카드용 매핑만 제공 | 모달용 상세 데이터 재조회 |
| 결과 | ❌ 누락된 서비스 있음 | ✅ 모든 서비스 표시 |

---

## 3. 해결 방법

### 3.1 패턴 선택 기준

**원칙**: 모달은 항상 DB에서 fresh 데이터를 직접 조회해야 함

```
초기 로드 (화면 카드용)
    ↓
캐시 표시 (allData 렌더링)
    ↓
모달 호출 ← DB 직접 조회 (반드시)
    ↓
모달에 전체 데이터 표시
```

### 3.2 수정 코드 템플릿

#### 문제가 있는 패턴 (❌ 금지)
```typescript
const openDetail = (item: any) => {
  // ❌ allData 캐시만 사용
  const related = allData.filter(d => d?.quoteId === item.quoteId);
  setSelectedItems(related);  // 누락 가능성 높음
};
```

#### 정상 패턴 (✅ 권장)
```typescript
const openDetail = async (item: any) => {
  // 1. 먼저 모달 열기 (즉시 피드백)
  setSelectedItem(item);
  setSelectedItems([item]);
  setModalOpen(true);

  // 2. 백그라운드에서 DB 재조회
  try {
    const quoteId = item?.quoteId || item?.re_quote_id;
    const { data: allReservations } = await supabase
      .from('reservation')
      .select('re_id, re_type, re_status, re_user_id, re_created_at')
      .eq('re_quote_id', quoteId);

    if (!allReservations?.length) return;

    // 3. 8개 서비스 테이블 병렬 조회
    const serviceIds = allReservations.map(r => r.re_id);
    const [cruiseRes, carRes, airportRes, hotelRes, tourRes, ticketRes, rentcarRes, shtRes] = await Promise.all([
      supabase.from('reservation_cruise').select('*').in('reservation_id', cruiseIds),
      supabase.from('reservation_cruise_car').select('*').in('reservation_id', carIds),
      supabase.from('reservation_airport').select('*').in('reservation_id', airportIds),
      supabase.from('reservation_hotel').select('*').in('reservation_id', hotelIds),
      supabase.from('reservation_tour').select('*').in('reservation_id', tourIds),
      supabase.from('reservation_ticket').select('*').in('reservation_id', ticketIds),
      supabase.from('reservation_rentcar').select('*').in('reservation_id', rentcarIds),
      supabase.from('reservation_car_sht').select('*').in('reservation_id', shtIds),
    ]);

    // 4. 모달 데이터 구성
    const modalItems = [];
    
    // cruise, airport, hotel, tour, ticket, rentcar, sht 각각 forEach로 modalItems에 push
    // (자세한 코드는 아래 "전체 구현 예시" 참조)
    
    // 5. 모달 업데이트
    if (modalItems.length > 0) {
      setSelectedItems(modalItems);
      setSelectedItem(modalItems[0]);
    }
  } catch (err) {
    console.error('상세 조회 실패:', err);
    // 에러 시에도 초기 단일 아이템(item)은 이미 표시 중
  }
};
```

### 3.3 전체 구현 예시 (schedule/page.tsx)

**변경 전**:
```typescript
const openDetail = (item: any) => {
  let related: any[] = [item];
  if (item?.source === 'sh') {
    related = allData.filter(d => d?.source === 'sh' && d?.orderId === item.orderId);
  } else {
    related = allData.filter(d => d?.source === 'new' && d?.quoteId === item.quoteId);
  }
  setSelectedItem(item);
  setSelectedItems(related);  // ❌ 누락된 서비스 있을 수 있음
  setModalOpen(true);
};
```

**변경 후**:
```typescript
const openDetail = async (item: any) => {
  // 1. 먼저 모달을 열고 클릭된 아이템 단일 표시 (로딩 중 fallback)
  setSelectedItem(item);
  setSelectedItems([item]);
  setModalOpen(true);

  if (item?.source === 'sh') {
    // 2a. 구 sh 소스: allData 캐시에서 같은 orderId 그룹핑 (기존 방식 유지)
    if (item?.orderId) {
      const related = allData.filter(d => d?.source === 'sh' && d?.orderId === item.orderId);
      if (related.length > 0) setSelectedItems(related);
    }
    return;
  }

  // 2b. 신 reservation 소스: DB 직접 조회 (new 방식)
  const quoteId = item?.quoteId || item?.re_quote_id;
  if (!quoteId) return;

  try {
    // 3. 이 예약의 모든 서비스 조회
    const { data: allReservations } = await supabase
      .from('reservation')
      .select('re_id, re_type, re_status, re_user_id, re_created_at, re_quote_id')
      .eq('re_quote_id', quoteId);

    if (!allReservations?.length) return;

    // 4. 사용자 정보 조회
    const userId = allReservations[0]?.re_user_id;
    let userData: any = null;
    if (userId) {
      const { data } = await supabase
        .from('users')
        .select('name, english_name, email, phone_number')
        .eq('id', userId)
        .single();
      userData = data;
    }

    // 5. 서비스별 ID 필터링
    const cruiseIds = allReservations.filter(s => s.re_type === 'cruise').map(s => s.re_id);
    const carIds = allReservations.filter(s => ['car', 'cruise'].includes(s.re_type)).map(s => s.re_id);
    const airportIds = allReservations.filter(s => s.re_type === 'airport').map(s => s.re_id);
    const hotelIds = allReservations.filter(s => s.re_type === 'hotel').map(s => s.re_id);
    const tourIds = allReservations.filter(s => s.re_type === 'tour').map(s => s.re_id);
    const ticketIds = allReservations.filter(s => s.re_type === 'ticket').map(s => s.re_id);
    const rentcarIds = allReservations.filter(s => s.re_type === 'rentcar').map(s => s.re_id);
    const shtIds = allReservations.filter(s => ['sht', 'car_sht'].includes(s.re_type)).map(s => s.re_id);

    // 6. 병렬 조회
    const [cruiseRes, cruiseCarRes, airportRes, hotelRes, tourRes, ticketRes, rentcarRes, shtRes] = await Promise.all([
      cruiseIds.length > 0 ? supabase.from('reservation_cruise').select('*').in('reservation_id', cruiseIds) : { data: [] },
      carIds.length > 0 ? supabase.from('reservation_cruise_car').select('*').in('reservation_id', carIds) : { data: [] },
      airportIds.length > 0 ? supabase.from('reservation_airport').select('*').in('reservation_id', airportIds) : { data: [] },
      hotelIds.length > 0 ? supabase.from('reservation_hotel').select('*').in('reservation_id', hotelIds) : { data: [] },
      tourIds.length > 0 ? supabase.from('reservation_tour').select('*').in('reservation_id', tourIds) : { data: [] },
      ticketIds.length > 0 ? supabase.from('reservation_ticket').select('*').in('reservation_id', ticketIds) : { data: [] },
      rentcarIds.length > 0 ? supabase.from('reservation_rentcar').select('*').in('reservation_id', rentcarIds) : { data: [] },
      shtIds.length > 0 ? supabase.from('reservation_car_sht').select('*').in('reservation_id', shtIds) : { data: [] },
    ]);

    const statusMap = new Map(allReservations.map(s => [s.re_id, s.re_status]));
    const typeMap = new Map(allReservations.map(s => [s.re_id, s.re_type]));

    const baseHeader = {
      source: 'new' as const,
      re_quote_id: quoteId,
      quoteId: quoteId,
      customerName: userData?.name || item.customerName || '',
      customerEnglishName: userData?.english_name || item.customerEnglishName || '',
      email: userData?.email || item.email || '',
      phone: userData?.phone_number || item.phone || '',
      re_created_at: allReservations[0]?.re_created_at || '',
    };

    const modalItems: any[] = [];

    // 7. 각 서비스별로 modalItems에 push
    (cruiseRes.data || []).forEach((r: any) => {
      modalItems.push({
        ...baseHeader, ...r,
        serviceType: 'cruise', re_type: 'cruise',
        reservation_id: r.reservation_id, reservationId: r.reservation_id, re_id: r.reservation_id,
        status: statusMap.get(r.reservation_id) || 'pending',
        note: r.request_note || '',
      });
    });

    (cruiseCarRes.data || []).forEach((r: any) => {
      const reType = typeMap.get(r.reservation_id);
      const normalizedType = reType === 'car' ? 'car' : 'vehicle';
      modalItems.push({
        ...baseHeader, ...r,
        serviceType: normalizedType, re_type: normalizedType,
        reservation_id: r.reservation_id, reservationId: r.reservation_id, re_id: r.reservation_id,
        status: statusMap.get(r.reservation_id) || 'pending',
        carType: r.vehicle_type || r.car_price_code || '',
        pickupDatetime: r.pickup_datetime || '',
        pickupLocation: r.pickup_location || '',
        dropoffLocation: r.dropoff_location || '',
        passengerCount: Number(r.passenger_count || 0),
        totalPrice: Number(r.car_total_price || 0),
        note: r.request_note || '',
      });
    });

    // ... 나머지 서비스들도 동일하게 처리 (자세한 코드는 schedule/page.tsx 참조)
    (airportRes.data || []).forEach((r: any) => { /* ... */ });
    (hotelRes.data || []).forEach((r: any) => { /* ... */ });
    (tourRes.data || []).forEach((r: any) => { /* ... */ });
    (ticketRes.data || []).forEach((r: any) => { /* ... */ });
    (rentcarRes.data || []).forEach((r: any) => { /* ... */ });
    (shtRes.data || []).forEach((r: any) => { /* ... */ });

    // 8. 모달 업데이트
    if (modalItems.length > 0) {
      setSelectedItems(modalItems);
      setSelectedItem(modalItems[0]);
    }
  } catch (err) {
    console.error('상세 조회 실패:', err);
  }
};
```

---

## 4. 모달 컴포넌트 공유화 (추가 권장사항)

### 4.1 문제: 같은 모달을 여러 위치에서 구현

```
apps/mobile/
  ├── app/schedule/ReservationDetailModal.tsx      ❌ 중복
  └── components/ReservationDetailModal.tsx        ✅ 공유
```

### 4.2 해결: 공유 폴더로 통일

**Step 1**: 모달 파일을 `components/` 공유 폴더로 이동
```bash
Copy-Item "apps/mobile/app/schedule/ReservationDetailModal.tsx" \
          "apps/mobile/components/ReservationDetailModal.tsx"
```

**Step 2**: 두 페이지의 import 통일
```typescript
// Before (inconsistent)
// schedule/page.tsx: import ReservationDetailModal from './ReservationDetailModal';
// reservations/page.tsx: import ReservationDetailModal from '@/app/schedule/ReservationDetailModal';

// After (unified)
// Both: import ReservationDetailModal from '@/components/ReservationDetailModal';
```

**Step 3**: 기존 파일을 re-export 래퍼로 교체 (하위 호환성)
```typescript
// apps/mobile/app/schedule/ReservationDetailModal.tsx
// ⚠️ 이 파일은 더 이상 직접 사용하지 않습니다.
// components/ReservationDetailModal.tsx 를 사용하세요.
export { default } from '@/components/ReservationDetailModal';
```

---

## 5. 검증 절차

### 5.1 코드 레벨 검증
```bash
# 1. TypeScript 에러 확인
pnpm --filter @sht/mobile typecheck

# 2. ESLint 확인
pnpm --filter @sht/mobile lint

# 3. Build 테스트
pnpm --filter @sht/mobile build
```

### 5.2 UI/UX 검증

| 단계 | 체크리스트 |
|------|-----------|
| 모달 데이터 로드 | ✅ 모달 열기 시 DB에서 fresh 데이터 조회 |
| 서비스 표시 | ✅ 크루즈, 차량, 공항, 호텔, 투어, 티켓, 렌트카, SHT 모두 표시 |
| 정렬 | ✅ 서비스별 정렬 정상 작동 |
| 상세 표시 | ✅ 가격, 일정, 옵션 모두 정확하게 표시 |
| 에러 처리 | ✅ DB 오류 시에도 모달은 열림 (단일 아이템 표시) |

### 5.3 성능 검증

```typescript
// 콘솔에 로깅하여 응답 시간 확인
const start = Date.now();
await openDetail(item);
console.log(`조회 시간: ${Date.now() - start}ms`);
```

**기준**:
- 모달 즉시 열기: < 100ms
- DB 조회 완료: < 1000ms (네트워크 조건에 따름)

---

## 6. 모바일 앱 특성 (apps/mobile)

### 6.1 왜 schedule과 reservations가 다른 방식이었나?

| 원인 | 설명 |
|------|------|
| **schedule** | 날짜별 카드 뷰 (many per screen) → 초기 bulk load |
| **reservations** | 예약 상태별 리스트 (many per screen) → 초기 meta만 load, 상세는 on-demand |
| **설계 철학 차이** | schedule은 빠른 렌더링 우선, reservations는 정확한 데이터 우선 |

### 6.2 통일 후 성능 영향

**개선점**:
- ✅ 모달에서 누락된 서비스 문제 해결
- ✅ 두 페이지 모두 fresh 데이터 사용
- ✅ 동시 수정 시 데이터 불일치 없음

**트레이드오프**:
- ⚠️ 모달 호출 시 DB 쿼리 증가 (1회 → 8회 병렬)
- 완화책: Supabase RLS + connection pooling 활용

---

## 7. 체크리스트: 모달 통일 수행 시

- [ ] 문제 페이지 식별 (어느 페이지 모달이 불완전한가?)
- [ ] 원본 페이지(정상) 모달 조회 로직 분석
- [ ] 문제 페이지 `openDetail` 함수를 DB 직접 조회로 재작성
- [ ] 8개 서비스 테이블 모두 커버 확인
- [ ] `baseHeader` + 서비스별 forEach 로직 구성
- [ ] TypeScript 에러 없음 확인
- [ ] 모달 파일 공유 폴더로 이동
- [ ] 양쪽 페이지 import 통일
- [ ] 기존 페이지 파일을 re-export 래퍼로 교체
- [ ] 로컬 테스트: 모달에 모든 서비스 표시 확인
- [ ] 커밋 및 PR

---

## 8. 참고 링크

- 적용 사례: [schedule/page.tsx](../../../apps/mobile/app/schedule/page.tsx#L185-L380)
- 적용 사례: [reservations/page.tsx](../../../apps/mobile/app/reservations/page.tsx#L356-L500)
- 모달 컴포넌트: [ReservationDetailModal.tsx](../../../apps/mobile/components/ReservationDetailModal.tsx)
- 변경 추적 연동: [reservation-edit-change-tracking.instructions.md](./reservation-edit-change-tracking.instructions.md)

---

## 9. FAQ

**Q**: 왜 캐시만 사용하면 안 되나?  
**A**: 초기 로드 시 Supabase 1000행 제한, 매핑 누락, 필터링 오류 등으로 일부 서비스가 캐시에 누락될 수 있기 때문입니다.

**Q**: 모달이 느려질까?  
**A**: 모달 호출 시마다 DB 쿼리가 추가되지만, 병렬화하고 RLS로 최적화하면 무시할 수 있는 수준입니다.

**Q**: 다른 앱(manager, manager1)도 적용해야 하나?  
**A**: 네. manager/manager1도 예약 상세 모달이 있으면 동일한 원칙을 따릅니다.

**Q**: 구 sh 데이터는 왜 allData 캐시를 유지하나?  
**A**: 구 시스템은 별도 테이블(`sh_*`)에서 로드되며, 초기 데이터가 complete하므로 캐시 사용 가능합니다.
