# SQL 쿼리 생성 워크플로우

## 🎯 개요

이 문서는 **검증된 크루즈 가격 데이터**를 받아 **Supabase 실행 가능한 SQL**로 변환하는 워크플로우입니다.

---

## 📋 필수 입력 정보

SQL 생성 전에 다음을 준비해야 합니다:

### 1. 크루즈 기본정보
```
- cruise_name: 크루즈 정확한 이름 (예: "그랜드 파이어니스 크루즈")
- valid_year: 연도 (예: 2026)
- currency: 통화 (예: VND)
- schedule_type: 여행형태 (예: 1N2D, 2N3D)
```

### 2. 시즌 정보 (반복)
```
- season_id: S1, S2, S3 (또는 순번)
- valid_from: YYYY-MM-DD
- valid_to: YYYY-MM-DD
- description: 시즌 설명 (예: "정가", "30% 할인")
```

### 3. 객실 정보 (반복)
```
- room_type: 객실명
- room_type_en: 영문 객실명
- price_adult: 성인가
- price_child: 아동가 (NULL 가능)
- price_infant: 유아가 (NULL 가능)
- price_extra_bed: 엑스트라베드
- price_child_extra_bed: 아동 엑스트라베드
- price_single: 싱글차지
- extra_bed_available: true/false
```

### 4. 휴일 추가요금 정보 (반복)
```
- holiday_date: YYYY-MM-DD
- holiday_date_end: YYYY-MM-DD (또는 NULL)
- holiday_name: 휴일명
- surcharge_per_person: 추가요금
```

---

## 🔨 SQL 생성 단계

### Step 1: 템플릿 선택 (기존 크루즈)

| 크루즈 | 난이도 | 사용할 파일 | 이유 |
|--------|--------|-----------|------|
| Diana | ⭐ | diana-rate-card.sql | 단순 2시즌, 계산식 포함 |
| Katherine | ⭐ | katherine-rate-card.sql | 1시즌 단순형 |
| Halora | ⭐⭐ | halora-rate-card.sql | 2시즌 + 특수 정책 |
| Lyra Granjer | ⭐⭐⭐ | lyra-granjer-rate-card.sql | 3시즌 + 패키지 객실 + 계산식 |
| Grand Fairyness | ⭐⭐⭐ | grand-fairyness-rate-card-generated.sql | 2시즌 + 정책변화 + 럭셔리 제외 |
| Calista | ⭐⭐⭐ | calista-rate-card.sql | 3시즌 + 18객실 대량 |

---

### Step 2: SQL 구조 준비

**기본 구조** (주의: 기존 예약이 있는 운영 DB에는 그대로 사용하면 안 됨):

```sql
-- 1. 주석 헤더: 크루즈명, 목적, 입력 기준 데이터
-- ============================================================================

-- 2. 운영 DB 주의
-- cruise_rate_card.id 는 기존 reservation_cruise.room_price_code 에서 직접 참조할 수 있으므로
-- 운영중인 크루즈 요금표는 DELETE 후 INSERT 방식으로 교체하면 안 됨.
-- 기존 예약에 연결된 요금행은 유지한 채 UPDATE / INSERT / 비활성화 방식으로 처리해야 함.

-- ============================================================================
-- 3. INSERT 객실 가격 (시즌별 섹션으로 분류)
-- ============================================================================

-- Section 1: Season 1 (기간 설명)
INSERT INTO cruise_rate_card (
  cruise_name, schedule_type, room_type, ..., currency, is_active
) VALUES
  (크루즈명, schedule_type, 객실1, ..., 'VND', true),
  (크루즈명, schedule_type, 객실2, ..., 'VND', true),
  ...;

-- Section 2: Season 2 (기간 설명)
INSERT INTO cruise_rate_card (...) VALUES
  (...),
  ...;

-- ============================================================================
-- 4. INSERT 휴일 추가요금
-- ============================================================================

INSERT INTO cruise_holiday_surcharge (...) VALUES
  (크루즈명, schedule_type, holiday_date, holiday_date_end, ..., true),
  ...;

-- ============================================================================
-- 5. Verification Queries (검증용)
-- ============================================================================

-- 검증 1: 시즌별 객실 개수
SELECT schedule_type, COUNT(*) FROM cruise_rate_card 
WHERE cruise_name = '크루즈명' GROUP BY schedule_type;

-- 검증 2: 휴일 개수
SELECT COUNT(*) FROM cruise_holiday_surcharge 
WHERE cruise_name = '크루즈명';

-- 검증 3: 가격 범위
SELECT MIN(price_adult), MAX(price_adult) FROM cruise_rate_card
WHERE cruise_name = '크루즈명';
```

---

## 운영 DB 안전 원칙

`cruise_rate_card` 는 단순 코드 테이블이 아니라 기존 예약이 참조하는 이력 데이터로 취급해야 합니다.

### 금지

- `DELETE FROM cruise_rate_card WHERE cruise_name = ...`
- 기존 예약이 참조할 가능성이 있는 요금행의 UUID 재생성
- 기존 시즌 전체 삭제 후 재삽입

### 권장

- 현재/미래에만 적용할 가격 수정은 기존 행 `UPDATE`
- 새로운 시즌/새 객실만 `INSERT`
- 더 이상 판매하지 않을 요금은 `is_active = false` 또는 `valid_to` 조정
- 요금행 삭제가 꼭 필요하면 먼저 참조 예약 건수 0건 확인

### 운영 전 사전 점검 쿼리

```sql
-- 1. 수정 대상 요금행 중 기존 예약이 참조중인 건수 확인
SELECT
  crc.id,
  crc.cruise_name,
  crc.schedule_type,
  crc.room_type,
  crc.valid_from,
  crc.valid_to,
  COUNT(rc.id) AS reservation_count
FROM public.cruise_rate_card crc
LEFT JOIN public.reservation_cruise rc
  ON rc.room_price_code = crc.id::text
WHERE crc.cruise_name = '크루즈명'
GROUP BY crc.id, crc.cruise_name, crc.schedule_type, crc.room_type, crc.valid_from, crc.valid_to
ORDER BY reservation_count DESC, crc.valid_from, crc.room_type;
```

### 운영 후 사후 검증 쿼리

```sql
-- 2. 예약이 참조하지만 요금표에 없는 고아 room_price_code 확인
SELECT
  rc.room_price_code,
  COUNT(*) AS reservation_count
FROM public.reservation_cruise rc
LEFT JOIN public.cruise_rate_card crc
  ON crc.id::text = rc.room_price_code
WHERE rc.room_price_code IS NOT NULL
  AND crc.id IS NULL
GROUP BY rc.room_price_code
ORDER BY reservation_count DESC;
```

상세 운영 절차는 [CRUISE-RATE-UPDATE-GUIDELINE.md](/C:/SHT-DATA/sht-platform/docs/CRUISE-RATE-UPDATE-GUIDELINE.md) 문서를 따릅니다.

---

### Step 3: 각 시즌별 INSERT 구문 작성

#### 예: Grand Fairyness 시즌1

**입력 데이터**:
```python
season1_rooms = [
  {
    "room": "오션스위트룸",
    "room_en": "Ocean Suite Room",
    "prices": {
      "adult": 5250000,
      "child": 3200000,
      "extra_bed": 4800000,
      "child_extra_bed": 4250000,
      "single": 8600000
    }
  },
  ...
]

season1_period = {
  "from": "2026-02-01",
  "to": "2026-02-28",
  "schedule_type": "1N2D-S1"
}
```

**생성 SQL**:
```sql
INSERT INTO cruise_rate_card (
  cruise_name,
  schedule_type,
  room_type,
  room_type_en,
  price_adult,
  price_child,
  price_infant,
  price_extra_bed,
  price_child_extra_bed,
  price_single,
  extra_bed_available,
  valid_year,
  valid_from,
  valid_to,
  currency,
  is_active
) VALUES
(
  '그랜드 파이어니스 크루즈',
  '1N2D-S1',
  '오션스위트룸',
  'Ocean Suite Room',
  5250000,
  3200000,
  NULL,
  4800000,
  4250000,
  8600000,
  true,
  2026,
  '2026-02-01',
  '2026-02-28',
  'VND',
  true
),
-- 다음 객실...
```

---

### Step 4: 특수 정책 적용

#### 유형 1: 아동가 = 성인가 (패키지형)

```sql
(
  '크루즈명',
  'schedule_type',
  '더 오너스 스위트 (2인)',
  'The Owns Suite (2pax)',
  22900000,
  22900000,  -- ← price_adult과 동일
  NULL,
  NULL,      -- 엑스트라 불가
  NULL,
  NULL,      -- 싱글차지 없음
  false,
  2026,
  '2026-02-01',
  '2026-02-28',
  'VND',
  true
)
```

#### 유형 2: 아동 불가

```sql
(
  '크루즈명',
  'schedule_type',
  '오션스위트 트리플룸',
  'Ocean Suite Triple Room',
  5300000,
  NULL,      -- ← 아동 불가
  NULL,
  NULL,      -- 엑스트라 불가
  NULL,
  NULL,      -- 싱글차지 불가
  false,
  2026,
  '2026-02-01',
  '2026-02-28',
  'VND',
  true
)
```

#### 유형 3: 유아가 = 성인가 × 30% (계산식)

**입력**:
```python
price_adult = 15000000
price_infant_ratio = 0.30  # 30%
```

**생성 SQL**:
```sql
price_infant = ROUND(15000000 * 0.30)  -- 또는 직접 계산값 4500000
```

#### 유형 4: 시즌 간 일정 비율 할인

**입력**:
```python
season1_adult = 5250000
discount_rate = 0.92  # 8% 할인 (92% 유지)
```

**계산 및 생성**:
```python
season2_adult = int(season1_adult * discount_rate)  # 4830000
```

**생성 SQL**:
```sql
(
  '크루즈명',
  '1N2D-S2',
  '오션스위트룸',
  'Ocean Suite Room',
  4830000,  -- ← 자동 계산값
  ...
)
```

---

### Step 5: 휴일 추가요금 INSERT

**입력 데이터**:
```python
holidays = [
  {
    "date": "2026-01-28",
    "date_end": "2026-01-31",
    "name": "명절 연휴",
    "surcharge": 1500000
  },
  {
    "date": "2026-12-24",
    "date_end": None,  # 단일 날짜
    "name": "크리스마스 이브",
    "surcharge": 1500000
  }
]
```

**생성 SQL**:
```sql
INSERT INTO cruise_holiday_surcharge (
  cruise_name,
  schedule_type,
  holiday_date,
  holiday_date_end,
  holiday_name,
  surcharge_per_person,
  surcharge_type,
  valid_year,
  currency,
  is_confirmed
) VALUES
(
  '그랜드 파이어니스 크루즈',
  '1N2D',
  '2026-01-28',
  '2026-01-31',
  '명절 연휴',
  1500000,
  'per_person',
  2026,
  'VND',
  true
),
(
  '그랜드 파이어니스 크루즈',
  '1N2D',
  '2026-12-24',
  NULL,  -- ← 단일 날짜는 NULL
  '크리스마스 이브',
  1500000,
  'per_person',
  2026,
  'VND',
  true
)
```

---

### Step 6: 검증 쿼리 생성

**필수 검증 쿼리**:

```sql
-- 1. 시즌별 객실 개수 확인
SELECT 
  schedule_type as "시즌",
  COUNT(*) as "객실수"
FROM cruise_rate_card
WHERE cruise_name = '그랜드 파이어니스 크루즈'
GROUP BY schedule_type
ORDER BY schedule_type;

-- Expected Output:
-- 시즌 | 객실수
-- 1N2D-S1 | 10
-- 1N2D-S2 | 10

-- 2. 휴일 추가요금 개수 확인
SELECT COUNT(*) as "휴일수"
FROM cruise_holiday_surcharge
WHERE cruise_name = '그랜드 파이어니스 크루즈';

-- Expected Output: 6

-- 3. 가격 범위 확인
SELECT 
  MIN(price_adult) as "최저성인가",
  MAX(price_adult) as "최고성인가"
FROM cruise_rate_card
WHERE cruise_name = '그랜드 파이어니스 크루즈';

-- Expected Output: 5,200,000 ~ 22,900,000
```

---

## 🚀 Supabase 실행 절차

### Phase 1: 미리보기 (Safe Preview)

```sql
-- 삭제될 기존 데이터 미리보기
SELECT COUNT(*) FROM cruise_rate_card WHERE cruise_name = '그랜드 파이어니스 크루즈';
SELECT COUNT(*) FROM cruise_holiday_surcharge WHERE cruise_name = '그랜드 파이어니스 크루즈';
```

### Phase 2: 트랜잭션 실행

```sql
BEGIN;

-- DELETE 구문
DELETE FROM cruise_rate_card WHERE cruise_name = '그랜드 파이어니스 크루즈';
DELETE FROM cruise_holiday_surcharge WHERE cruise_name = '그랜드 파이어니스 크루즈';

-- INSERT 구문 (Section 1, 2, 3, ...)
INSERT INTO cruise_rate_card (...) VALUES (...);
INSERT INTO cruise_rate_card (...) VALUES (...);
INSERT INTO cruise_holiday_surcharge (...) VALUES (...);

COMMIT;
```

### Phase 3: 결과 검증

위 "Step 6: 검증 쿼리" 실행 → 기대값과 일치 확인

---

## 📄 SQL 파일명 규칙

```
📁 sql/
├── {cruise-name}-rate-card-{YYYYMMDD}.sql    (신규 버전)
├── {cruise-name}-rate-card.sql                (최신 프로덕션 안정버전)
└── archive/
    ├── {cruise-name}-rate-card-20260101.sql  (이력 보관)
    └── {cruise-name}-rate-card-20260215.sql
```

**예**:
- `grand-fairyness-rate-card-20260221.sql` (오늘 생성)
- `grand-fairyness-rate-card.sql` (최신 발행본)

---

## 🔄 재사용 가능한 이 템플릿

새 크루즈를 추가할 때마다 이 문서를 참조하여:

1. **Step 1**: 유사 크루즈 템플릿 선택
2. **Step 2**: SQL 구조 복사
3. **Step 3-5**: 입력 데이터로 INSERT 값 생성
4. **Step 6**: 검증 쿼리로 결과 확인

---

**마지막 업데이트**: 2026년 2월 21일
