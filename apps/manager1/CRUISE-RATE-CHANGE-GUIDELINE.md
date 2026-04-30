# 크루즈 요금 변동 운영 지침 (v4)

## 목적
크루즈 요금 인상/인하를 안전하고 재현 가능하게 적용한다.

## 핵심 원칙
1. **TEMP TABLE 스냅샷**: 변경 전 원본을 임시 테이블에 캡처 → 이후 변경이 소스에 영향 없음
2. **DELETE + RE-INSERT**: UPDATE 대신 삭제 후 재삽입 → unique constraint 충돌 원천 차단
3. **NULL valid_from 처리**: `(valid_from IS NULL OR valid_from < cutoff)` → NULL 행 누락 방지
4. **이름 정규화는 스냅샷에서**: CASE 식으로 _cname 생성 → UPDATE 정규화의 충돌 문제 제거
5. **멱등성(idempotent)**: 몇 번 실행해도 동일 결과
6. **valid_to는 반드시 명시**: NULL 금지 → 앱 쿼리 `.gte('valid_to', date)`에서 누락 방지

## ⚠️ v1~v3에서 발생한 문제와 해결

| 버전 | 문제 | 원인 |
|------|------|------|
| v1 (CTE) | 23505 중복 키 | CTE 스냅샷 격리: DELETE와 INSERT가 같은 초기 상태를 봄 |
| v2 (6단계) | 소스 0행 | `valid_to = exact_date` 조건이 이전 단계 결과에 의존 |
| v3 (5단계) | 소스 0행, 크루즈 사라짐 | **NULL valid_from**: `valid_from < cutoff` → NULL = FALSE |
| v3 (5단계) | UPDATE 정규화 충돌 | 정규이름 행이 이미 존재하면 unique 위반 |

**v4 해결책**: TEMP TABLE에 스냅샷 → 전체 DELETE → 구요금+신요금 RE-INSERT

## 기준일 정책 (SQL 상단 주석에 반드시 명시)
1. **탑승일 기준** (기본): check-in date 기반
2. **예약일 기준**: 공지에 "신규예약부터" 명시 시

## 표준 SQL 패턴 (4단계)

```sql
BEGIN;
-- ① 소스 스냅샷 (TEMP TABLE - 변경 전 원본 캡처)
-- ② 대상 행 전체 삭제 (해당 크루즈 + 해당 연도)
-- ③ 구요금 재삽입 (정규 이름, 원본 가격, cutoff-1까지)
-- ④ 신요금 삽입 (정규 이름, 인상 가격, cutoff~12/31)
DROP TABLE _temp;
COMMIT;
```

### ① 소스 스냅샷

변경 전의 원본 데이터를 TEMP TABLE에 저장한다.

**핵심 포인트:**
- `(valid_from IS NULL OR valid_from < cutoff)`: NULL valid_from 행도 포함
- CASE 식으로 변형 이름→정규이름 매핑 (`_cname` 컬럼)
- DISTINCT ON에서 `cruise_name` 대신 정규이름(`_cname`) 사용 → 변형 간 중복 제거
- ORDER BY `valid_from DESC NULLS LAST`: 최신 요금 우선, NULL은 마지막

```sql
CREATE TEMP TABLE _src AS
SELECT DISTINCT ON (
  CASE
    WHEN cruise_name IN ('variant1','variant2') THEN '정규이름'
    ELSE cruise_name
  END,
  schedule_type, room_type, COALESCE(season_name,'')
)
  *,
  CASE
    WHEN cruise_name IN ('variant1','variant2') THEN '정규이름'
    ELSE cruise_name
  END AS _cname
FROM cruise_rate_card
WHERE cruise_name IN ('정규이름','variant1','variant2')
  AND valid_year = 2026
  AND (valid_from IS NULL OR valid_from < DATE '기준일')
ORDER BY
  CASE
    WHEN cruise_name IN ('variant1','variant2') THEN '정규이름'
    ELSE cruise_name
  END,
  schedule_type, room_type, COALESCE(season_name,''),
  valid_from DESC NULLS LAST, id DESC;
```

### ② 대상 행 전체 삭제

해당 크루즈의 해당 연도 데이터를 전부 삭제한다. ①에서 스냅샷을 이미 저장했으므로 안전.

```sql
DELETE FROM cruise_rate_card
WHERE cruise_name IN ('정규이름','variant1','variant2')
  AND valid_year = 2026;
```

### ③ 구요금 재삽입

원본 가격 그대로, 정규 이름 + 구체적 날짜로 재삽입한다.

```sql
INSERT INTO cruise_rate_card (...)
SELECT
  _cname,                                    -- 정규이름
  schedule_type, room_type, room_type_en,
  price_adult, price_child, ...              -- 원본 가격 그대로
  valid_year,
  COALESCE(valid_from, DATE '2026-01-01'),   -- NULL → 1/1 고정
  DATE '기준일-1',                            -- 구요금 종료
  display_order, currency, true,
  '구요금(~기준일-1)',
  ...
FROM _src;
```

### ④ 신요금 삽입

인상/인하된 가격으로 삽입한다.

```sql
INSERT INTO cruise_rate_card (...)
SELECT
  _cname,
  schedule_type, room_type, room_type_en,
  price_adult + 인상액, ...                   -- 가격 변동 반영
  valid_year,
  DATE '기준일',                              -- 신요금 시작
  DATE '2026-12-31',                         -- 반드시 명시!
  display_order, currency, true,
  '인상 +금액 (기준일~)',
  ...
FROM _src;
```

## 멱등성 검증 (재실행 시 동작)

| 단계 | 첫 실행 | 재실행 |
|------|---------|--------|
| ① 스냅샷 | 원본(NULL 포함) 캡처 | 이전 ③의 결과 캡처 (정규이름, 구체적 날짜, 원본 가격) |
| ② 삭제 | 원본 전체 삭제 | 이전 ③+④ 결과 삭제 |
| ③ 구요금 | 정규이름+구체적 날짜로 삽입 | 동일 데이터 재삽입 (동일 결과) |
| ④ 신요금 | 원본+인상액으로 삽입 | 동일 데이터 재삽입 (동일 결과) |

## 컬럼별 변동 규칙
1. `price_adult`: 인상액 반영
2. `price_extra_bed`: NULL이 아니면 인상액 반영, NULL이면 NULL 유지
3. `price_single`: NULL이 아니면 인상액 반영, NULL이면 NULL 유지
4. `price_child`, `price_infant`, `price_child_extra_bed` 등: 공지 없으면 유지

## 표시 안정성 규칙
- **valid_from**: `COALESCE(valid_from, DATE '2026-01-01')` → NULL 금지
- **valid_to**: `DATE '2026-12-31'` → NULL 금지
- **is_active**: `true` → 비활성 행은 목록에서 제외됨
- **이유**: 앱 쿼리가 `.lte('valid_from', date).gte('valid_to', date)` 사용 → NULL은 매칭 안 됨

## 검증 체크리스트
실행 후 반드시 아래 검증:

```sql
-- 1) 오늘 날짜 기준 조회 (반드시 결과 있어야 함)
SELECT cruise_name, schedule_type, room_type, valid_from, valid_to, price_adult
FROM cruise_rate_card
WHERE cruise_name = '크루즈명' AND valid_year = 2026 AND is_active = true
  AND valid_from <= CURRENT_DATE AND valid_to >= CURRENT_DATE;

-- 2) NULL valid_from/valid_to 없어야 함 (0행)
SELECT * FROM cruise_rate_card
WHERE cruise_name = '크루즈명' AND valid_year = 2026
  AND (valid_from IS NULL OR valid_to IS NULL);

-- 3) 변형 이름 없어야 함 (0행)
SELECT * FROM cruise_rate_card
WHERE cruise_name IN ('variant1','variant2') AND valid_year = 2026;

-- 4) 중복 확인 (0행)
SELECT cruise_name, schedule_type, room_type, COALESCE(season_name,'') AS sn,
       valid_year, valid_from, COUNT(*)
FROM cruise_rate_card WHERE cruise_name = '크루즈명' AND valid_year = 2026
GROUP BY 1,2,3,4,5,6 HAVING COUNT(*) > 1;

-- 5) 구요금/신요금 쌍 확인
SELECT cruise_name, schedule_type, room_type, valid_from, valid_to, price_adult
FROM cruise_rate_card
WHERE cruise_name = '크루즈명' AND valid_year = 2026
ORDER BY schedule_type, room_type, valid_from;
```

## 파일 작성 규칙
- 파일명: `YYYY-MM-DD-<cruise>-<change-summary>.sql`
- SQL 상단 주석 필수: 기준일, 인상/인하액, 대상 크루즈, 패키지 포함 여부

## 최근 반영 사례
1. `sql/2026-03-30-laina-cruise-oil-surcharge-rate-update.sql`
2. `sql/2026-03-30-ambassador-overnight-signature-rate-increase-from-2026-04-15.sql`
