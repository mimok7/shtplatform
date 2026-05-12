---
name: reservation-edit-change-tracking
description: "예약 수정 변경 추적 (2026.05.11) — 매니저 편집 시 모든 변경 내용을 reservation_change_* 테이블에 저장 + 모달에서 우선 조회"
applyTo: "apps/**/reservation-edit/**/*.tsx, apps/**/components/{ConfirmationGenerateModal,PaymentDetailModal}.tsx, sql/080-*.sql"
---

# 예약 수정 변경 추적 지침 (2026.05.11)

## 개요

매니저가 예약(크루즈/호텔/공항/투어/렌터카/스하/패키지)을 수정할 때:
1. **쓰기**: `recordReservationChange()` 호출 → 모든 변경 내용 `reservation_change_*` 테이블에 저장
2. **읽기**: `applyChangeOverlay()` 호출 → 모달 조회 시 변경 내용 먼저 반영
3. **안전**: 변경 추적 실패해도 예약 저장은 계속 진행 (콘솔 경고만)

**목표 달성**:
- ✅ 예약 수정 내역 완전 추적 (7개 서비스 타입)
- ✅ 모달/확인서/결제 페이지에서 최신 수정 내용 자동 반영
- ✅ manager + manager1 동기화
- ✅ typecheck 통과

---

## 적용된 변경

### 1️⃣ 데이터베이스 스키마 (SQL 마이그레이션)

**파일**: `sql/080-reservation-change-schema-augment-2026.sql`

#### 누락 컬럼 추가
```sql
-- public.reservation_change_airport 보강
ALTER TABLE public.reservation_change_airport
    ADD COLUMN IF NOT EXISTS vehicle_type text,           -- 공항 차량 유형 기록
    ADD COLUMN IF NOT EXISTS ra_is_processed text;        -- 공항 처리 상태
```

#### 누락 테이블 신규 생성
```sql
-- reservation_change_package 신규 (30개 컬럼)
CREATE TABLE IF NOT EXISTS public.reservation_change_package (
    id uuid PRIMARY KEY,
    request_id uuid NOT NULL,  -- FK to reservation_change_request
    reservation_id uuid NOT NULL,
    package_id uuid,
    adult_count, child_extra_bed, child_no_extra_bed, ... (28개 추가 필드)
    created_at, updated_at
);
```

#### 인덱스 추가 (16개)
- `idx_rc_package_reservation_id`, `idx_rc_package_request_id`
- `idx_rc_request_reservation_status` (reservation_id + status + submitted_at DESC)
- 각 change_* 테이블별 `(reservation_id)`, `(request_id)` 인덱스 추가

**⚠️ 실행 필수**: Supabase SQL Editor에서 직접 실행해야만 package/airport 추적 활성화됨.

---

### 2️⃣ 변경 기록 쓰기 헬퍼

**경로**: 
- `apps/manager/src/lib/reservationChangeTracker.ts`
- `apps/manager1/lib/reservationChangeTracker.ts` (미러)

**핵심 함수**: `recordReservationChange(options)`

```typescript
await recordReservationChange({
    reservationId,                    // UUID
    reType: 'cruise' | 'hotel' | 'airport' | 'tour' | 'rentcar' | 'car_sht' | 'cruise_car' | 'package',
    rows: {
        cruise: [...],                // 각 서비스별 변경된 행들
        cruise_car: [...],
        // 기타 서비스
    },
    managerNote?: string,             // 매니저 메모 (선택)
    snapshotData?: {
        price_breakdown?: any,        // 가격 분석 데이터
        total_amount?: number,        // 총액
        manual_additional_fee?: number // 추가 요금
    },
    status?: 'approved' | 'pending' | 'applied'  // 기본값: 'approved'
});
```

**동작 흐름**:
1. `reservation_change_request` 행 신규 INSERT (요청 헤더)
   - `request_date` = 현재 시간
   - `submitted_at` = 현재 시간
   - `reviewed_at` / `reviewed_by` = 자동 설정 (status='approved'일 때)
   - `status` = 'approved' (기본)

2. 각 서비스별 `reservation_change_<type>` 테이블에 INSERT
   - 예: `rows.cruise` → `reservation_change_cruise` 테이블
   - 예: `rows.cruise_car` → `reservation_change_cruise_car` 테이블
   - 특수: `rows.car_sht` → `reservation_change_car_sht` 테이블 (매핑)

3. ID/타임스탬프 자동 제거 (sanitization)
   - `id`, `created_at`, `updated_at` 제거
   - `request_id`, `reservation_id` 자동 추가

4. 에러 처리
   - **절대 throw 하지 않음** (return `{ requestId, error, childErrors }`)
   - 콘솔에만 경고 로그 출력
   - 예: `console.warn('⚠️ 변경 추적 기록 실패(저장은 계속):', err)`

**사용 패턴** (모든 edit page):
```typescript
try {
    await recordReservationChange({
        reservationId,
        reType: 'cruise',
        rows: { cruise: [...], cruise_car: [...] },
        managerNote: '크루즈 예약 매니저 직접 수정',
        snapshotData: { price_breakdown, total_amount, manual_additional_fee }
    });
} catch (trackErr) {
    console.warn('⚠️ 변경 추적 기록 실패(저장은 계속):', trackErr);
}
```

---

### 3️⃣ 변경 내용 읽기 오버레이 헬퍼

**경로**:
- `apps/manager/src/lib/reservationChangeOverlay.ts`
- `apps/manager1/lib/reservationChangeOverlay.ts` (미러)

#### 함수 1: `fetchLatestActiveChangeRequests(reservationIds)`

```typescript
const metaMap = await fetchLatestActiveChangeRequests([
    'uuid1', 'uuid2', 'uuid3'
]);

// 반환: Map<reservationId, ChangeMeta>
// ChangeMeta = { requestId, status, submitted_at, reviewed_by, ... }
```

**동작**:
- 각 예약 ID별 가장 최신 '활성' 변경 요청만 조회
- '활성' = status가 'approved' 또는 'applied'
- 정렬: `submitted_at DESC` (최신 먼저)
- 결과를 Map으로 반환 (빠른 O(1) lookup)

#### 함수 2: `applyChangeOverlay(serviceType, baseRows, options)`

```typescript
const overlayedRows = await applyChangeOverlay('cruise', baseRows, {
    metaMap: changeMetaMap,           // 함수 1에서 받은 Map
    replaceMultiRow: true             // cruise/airport의 경우 전체 행 교체
});

// 반환: 변경 내용이 반영된 baseRows (같은 구조)
```

**동작**:
1. `metaMap`에서 각 행의 `reservation_id` 찾기
2. `reservation_change_<serviceType>` 테이블에서 해당 변경 행 조회
3. 변경 행의 non-null 필드만 baseRow에 덮어씀
4. `_change_meta` 필드 추가 (변경 요청 메타정보)
5. `replaceMultiRow: true`면 baseRows 전체를 변경 행으로 교체

**특수 매핑**:
- `reType='sht'` → serviceType `'car_sht'` 사용
- `reType='cruise'` → child types `['cruise', 'cruise_car']` 동시 조회
- `reType='airport'` → child types `['airport']` (이미 다중 행)

---

### 4️⃣ 편집 페이지 통합 (쓰기 경로)

**수정된 파일** (manager + manager1 동기화):
```
apps/manager/src/app/manager/reservation-edit/{cruise,hotel,airport,tour,rentcar,sht,vehicle,package}/page.tsx
apps/manager1/app/manager/reservation-edit/{cruise,hotel,airport,tour,rentcar,sht,vehicle,package}/page.tsx
```

**각 페이지의 패턴**:

```typescript
// 상단에 import 추가
import { recordReservationChange } from '@/lib/reservationChangeTracker';

// handleSave() 함수 내 끝부분 (alert 전)
await saveAdditionalFeeTemplateFromInput({ ... });  // 기존 코드

// ✨ NEW: 변경 추적 기록
try {
    await recordReservationChange({
        reservationId,
        reType: 'cruise',
        rows: {
            cruise: cruiseRows.map(r => ({ ...필드들... })),
            cruise_car: carRows.map(c => ({ ...필드들... }))
        },
        managerNote: '크루즈 예약 매니저 직접 수정',
        snapshotData: {
            price_breakdown: priceBreakdown,
            total_amount: grandTotal,
            manual_additional_fee: totalAdditionalFee
        }
    });
} catch (trackErr) {
    console.warn('⚠️ 변경 추적 기록 실패(저장은 계속):', trackErr);
}

alert('크루즈 예약이 저장되었습니다.');
```

**서비스별 rows 구조**:

| 서비스 | rows 구조 | 설명 |
|--------|---------|------|
| cruise | `{ cruise: [...], cruise_car: [...] }` | 크루즈 1+차량 다중 |
| hotel | `{ hotel: [{ hotel_price_code, checkin_date, ... }] }` | 호텔 단일 |
| airport | `{ airport: [{ way_type: 'pickup', ... }, { way_type: 'sending', ... }] }` | 공항 다중 (픽업/샌딩) |
| tour | `{ tour: [{ tour_price_code, usage_date, ... }] }` | 투어 단일 |
| rentcar | `{ rentcar: [{ rentcar_price_code, car_count, ... }] }` | 렌터카 단일 |
| sht | `{ car_sht: [{ entire payload }] }` | 스하차량 단일 |
| vehicle | `{ cruise_car: [{ car_price_code, ... }] }` | 차량 다중 |
| package | `{ package: [{ package_id, adult_count, ... }] }` | 패키지 단일 |

---

### 5️⃣ 모달 컴포넌트에 "수정된 내용 먼저 보기" 적용 (읽기 경로)

**수정된 파일** (manager + manager1 동기화):
```
apps/manager/src/components/ConfirmationGenerateModal.tsx
apps/manager1/components/ConfirmationGenerateModal.tsx
apps/manager/src/components/PaymentDetailModal.tsx
apps/manager1/components/PaymentDetailModal.tsx
```

#### ConfirmationGenerateModal.tsx (예약 확인서 생성)

```typescript
// 상단 import
import { fetchLatestActiveChangeRequests, applyChangeOverlay } from '@/lib/reservationChangeOverlay';

// 8개 병렬 조회 후
const [cruiseResult, airportResult, hotelResult, ...] = await Promise.all([...]);

// ✨ NEW: 변경 요청 우선 조회
const changeMetaMap = await fetchLatestActiveChangeRequests(reservationIds);

// ✨ NEW: 각 결과에 오버레이 적용
const cruiseDetails = await applyChangeOverlay('cruise', cruiseResult.data || [], { 
    metaMap: changeMetaMap, 
    replaceMultiRow: true 
});
const airportDetails = await applyChangeOverlay('airport', airportResult.data || [], { 
    metaMap: changeMetaMap,
    replaceMultiRow: true 
});
const hotelDetails = await applyChangeOverlay('hotel', hotelResult.data || [], { metaMap: changeMetaMap });
// ... (기타 6개 서비스)

// 이후 cruiseDetails, hotelDetails 등 사용 → 자동으로 수정된 내용 포함
```

#### PaymentDetailModal.tsx (결제 상세)

```typescript
// 상단 import
import { fetchLatestActiveChangeRequests, applyChangeOverlay } from '@/lib/reservationChangeOverlay';

// 8개 병렬 조회 후
const [reservationRes, cruiseRes, airportRes, ...] = await Promise.all([...]);

// ✨ NEW: 변경 요청 우선 조회
const changeMetaMap = await fetchLatestActiveChangeRequests(ids);

// ✨ NEW: 오버레이 적용 (ticket 제외, 변경 테이블 없음)
const cruiseRows = await applyChangeOverlay('cruise', cruiseRes.data || [], { 
    metaMap: changeMetaMap,
    replaceMultiRow: true 
});
const airportRows = await applyChangeOverlay('airport', airportRes.data || [], { 
    metaMap: changeMetaMap,
    replaceMultiRow: true 
});
const hotelRows = await applyChangeOverlay('hotel', hotelRes.data || [], { metaMap: changeMetaMap });
// ... (기타 5개, ticket 제외)

// 이후 cruiseRows, hotelRows 등에 대해 price_info enrichment 진행
// → enrichment 후에도 변경 내용 유지됨
```

---

## 실행 체크리스트

### 사전 준비
- [ ] `sql/080-reservation-change-schema-augment-2026.sql` 읽음
- [ ] Supabase 프로젝트 접근 가능 확인

### SQL 마이그레이션 (필수)
- [ ] Supabase SQL Editor 열기
- [ ] `sql/080-reservation-change-schema-augment-2026.sql` 복사-붙여넣기
- [ ] **실행** (Ctrl+Enter 또는 Run 버튼)
- [ ] 결과 확인 (no error)
- [ ] 테이블 생성 확인: `SELECT * FROM pg_tables WHERE tablename LIKE '%change_package%'`
- [ ] 컬럼 추가 확인: `\d public.reservation_change_airport` (vehicle_type, ra_is_processed 표시됨)

### 앱 실행
- [ ] `pnpm --filter @sht/manager dev` 시작
- [ ] `pnpm --filter @sht/manager1 dev` 시작 (선택)
- [ ] http://localhost:3001/manager/reservation-edit (manager)
- [ ] http://localhost:3005/manager/reservation-edit (manager1)

### 기능 테스트
1. **예약 수정 저장**
   - [ ] 크루즈/호텔/공항 예약 수정 → 저장
   - [ ] 브라우저 콘솔: `recordReservationChange...` 로그 보임 (no error)

2. **모달에서 변경 내용 반영**
   - [ ] 예약 상세 모달 열기 → 수정된 내용 표시됨
   - [ ] 예약 확인서 생성 → 수정된 내용 포함됨
   - [ ] 결제 상세 모달 → 수정된 내용 표시됨

3. **Supabase 데이터 확인**
   - [ ] Supabase Dashboard → `reservation_change_request` 테이블 → 새 행 생성됨
   - [ ] `reservation_change_cruise` 등 상세 테이블에 해당 행 추가됨

---

## 트러블슈팅

### Q: "변경 추적 기록 실패(저장은 계속)" 메시지 자주 나옴

**A**: SQL 마이그레이션 미실행 가능성
- Supabase SQL Editor에서 `080-reservation-change-schema-augment-2026.sql` 실행 여부 확인
- 특히 `reservation_change_package` 테이블 존재 확인: `SELECT 1 FROM information_schema.tables WHERE table_name='reservation_change_package'`

### Q: 모달에서 변경된 내용이 안 보임

**A**: 오버레이 함수 호출 확인
- `ConfirmationGenerateModal.tsx` / `PaymentDetailModal.tsx`에서 `applyChangeOverlay` 호출 확인
- 변경 요청이 'approved' 또는 'applied' 상태인지 확인 (pending/rejected는 무시됨)
- 브라우저 콘솔: Network 탭에서 `fetchLatestActiveChangeRequests` API 응답 확인

### Q: typecheck 실패

**A**: import 경로 확인
- manager: `import { recordReservationChange } from '@/lib/reservationChangeTracker'`
- manager1: 동일 (manager1도 `@/` 앨리어스 사용)
- 파일 존재 확인: `ls apps/manager/src/lib/reservationChange*.ts`

---

## 향후 확장

- [ ] 새 서비스 타입 추가 시 `CHILD_TABLE` map에 등록 (trackerTs)
- [ ] `reservation_change_*` 테이블에 새 컬럼 추가 필요 시 SQL 마이그레이션 추가
- [ ] 변경 요청 승인/거절 UI 추가 (현재: manager 직접 수정 = 자동 'approved')
- [ ] 변경 이력 조회 페이지 추가 (타임라인 뷰)

---

## 참고 자료

- **Schema**: [sql/db.csv](sql/db.csv) — reservation_change_* 테이블 구조
- **Helpers**: [apps/manager/src/lib/reservationChangeTracker.ts](apps/manager/src/lib/reservationChangeTracker.ts)
- **Overlay**: [apps/manager/src/lib/reservationChangeOverlay.ts](apps/manager/src/lib/reservationChangeOverlay.ts)
- **Edit Pages**: [apps/manager/src/app/manager/reservation-edit/](apps/manager/src/app/manager/reservation-edit/)
- **Modals**: [apps/manager/src/components/{ConfirmationGenerateModal,PaymentDetailModal}.tsx](apps/manager/src/components/)
