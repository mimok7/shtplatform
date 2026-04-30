# 🚀 LAINA 크루즈 요금 변동 - 즉시 실행 명령어

## ⚡ 빠른 실행

### Supabase SQL Editor에 **이 전체 내용을 복사-붙여넣기:**

```sql
-- ============================================================
-- 라이라 그랜져 크루즈 유가 인상 (2026-04-03부터)
-- ============================================================

-- 1️⃣ 현재 상태 확인
SELECT COUNT(*), COUNT(DISTINCT cruise_name)
FROM cruise_rate_card
WHERE cruise_name ILIKE '%라이나%' OR cruise_name ILIKE '%라이라%'
  AND valid_year = 2026;

BEGIN;

-- 2️⃣ 원본 데이터 스냅샷
CREATE TEMP TABLE _laina_src AS
SELECT DISTINCT ON (
  schedule_type, room_type, COALESCE(season_name,'')
)
  *,
  '라이라 그랜져 크루즈' AS _cname
FROM cruise_rate_card
WHERE cruise_name IN (
    '라이라 그랜져 크루즈', '라이나 그랜드 크루즈', '라이나 크루즈',
    'Laina Cruise', 'Laina Grand Cruise', '그랜드 크루즈',
    '라이나그랜드크루즈', '라이라그랜져크루즈'
  )
  AND valid_year = 2026
  AND (valid_from IS NULL OR valid_from < DATE '2026-04-03')
ORDER BY
  schedule_type, room_type, COALESCE(season_name,''),
  valid_from DESC NULLS LAST, id DESC;

-- 3️⃣ 기존 데이터 삭제
DELETE FROM cruise_rate_card
WHERE cruise_name IN (
    '라이라 그랜져 크루즈', '라이나 그랜드 크루즈', '라이나 크루즈',
    'Laina Cruise', 'Laina Grand Cruise', '그랜드 크루즈',
    '라이나그랜드크루즈', '라이라그랜져크루즈'
  )
  AND valid_year = 2026;

-- 4️⃣ 구요금 재삽입 (~2026-04-02)
INSERT INTO cruise_rate_card (
  cruise_name, schedule_type, room_type, room_type_en,
  price_adult, price_child, price_infant, price_extra_bed, price_single,
  valid_year, valid_from, valid_to,
  display_order, currency, is_active, notes,
  price_child_extra_bed, extra_bed_available, includes_vehicle, vehicle_type,
  infant_policy, season_name, is_promotion, price_child_older,
  child_age_range, single_available
)
SELECT
  _cname, schedule_type, room_type, room_type_en,
  price_adult, price_child, price_infant, price_extra_bed, price_single,
  valid_year, COALESCE(valid_from, DATE '2026-01-01'), DATE '2026-04-02',
  display_order, currency, true, '구요금(~2026-04-02)',
  price_child_extra_bed, extra_bed_available, includes_vehicle, vehicle_type,
  infant_policy, season_name, is_promotion, price_child_older,
  child_age_range, single_available
FROM _laina_src;

-- 5️⃣ 신요금 삽입 (2026-04-03~, +250k/+500k)
INSERT INTO cruise_rate_card (
  cruise_name, schedule_type, room_type, room_type_en,
  price_adult, price_child, price_infant, price_extra_bed, price_single,
  valid_year, valid_from, valid_to,
  display_order, currency, is_active, notes,
  price_child_extra_bed, extra_bed_available, includes_vehicle, vehicle_type,
  infant_policy, season_name, is_promotion, price_child_older,
  child_age_range, single_available
)
SELECT
  _cname, schedule_type, room_type, room_type_en,
  price_adult + CASE WHEN schedule_type = '2N3D' THEN 500000 ELSE 250000 END,
  price_child, price_infant,
  CASE WHEN price_extra_bed IS NULL THEN NULL
       ELSE price_extra_bed + CASE WHEN schedule_type = '2N3D' THEN 500000 ELSE 250000 END END,
  CASE WHEN price_single IS NULL THEN NULL
       ELSE price_single + CASE WHEN schedule_type = '2N3D' THEN 500000 ELSE 250000 END END,
  valid_year, DATE '2026-04-03', DATE '2026-12-31',
  display_order, currency, true,
  CASE WHEN schedule_type = '2N3D'
    THEN '유가인상 +500,000 (2026-04-03~)'
    ELSE '유가인상 +250,000 (2026-04-03~)' END,
  price_child_extra_bed, extra_bed_available, includes_vehicle, vehicle_type,
  infant_policy, season_name, is_promotion, price_child_older,
  child_age_range, single_available
FROM _laina_src;

DROP TABLE _laina_src;
COMMIT;

-- ✅ 검증 1: 요금 쌍 확인 (각 schedule_type × room_type마다 2개=구요금+신요금)
SELECT cruise_name, schedule_type, room_type, season_name,
       valid_from, valid_to, price_adult
FROM cruise_rate_card
WHERE cruise_name = '라이라 그랜져 크루즈' AND valid_year = 2026
ORDER BY schedule_type, room_type, season_name, valid_from;

-- ✅ 검증 2: 변형 이름 제거 확인 (결과 0행)
SELECT COUNT(*) FROM cruise_rate_card
WHERE cruise_name IN ('라이나 크루즈','Laina Cruise','그랜드 크루즈',
  'Laina Grand Cruise','라이나그랜드크루즈','라이나 그랜드 크루즈','라이라그랜져크루즈')
AND valid_year = 2026;

-- ✅ 검증 3: NULL 없음 확인 (결과 0행)
SELECT COUNT(*) FROM cruise_rate_card
WHERE cruise_name = '라이라 그랜져 크루즈' AND valid_year = 2026
  AND (valid_from IS NULL OR valid_to IS NULL);
```

## 📋 실행 단계

1. **Supabase 열기**: https://app.supabase.com → SQL Editor
2. **전체 복사**: 위 SQL 전체 선택-복사
3. **붙여넣기**: SQL Editor에 붙여넣기
4. **실행**: Ctrl+Enter 또는 Run 버튼
5. **확인**: 아래 3개 검증 쿼리 결과 확인

## ✅ 예상 결과

- **검증 1**: 각 schedule_type(1N2D, 2N3D) × room_type마다 정확히 2개 행
  - 첫 행: `valid_to = '2026-04-02'` (구요금)
  - 둘째 행: `valid_from = '2026-04-03'` (신요금, +인상)
- **검증 2**: 정확히 `0` (모든 변형 이름 제거됨)
- **검증 3**: 정확히 `0` (NULL 값 없음)

## 🎯 실행 후 확인 (UI)

```
✅ 견적 만들기 → 크루즈 선택 → 라이나 크루즈가 보이는가?
✅ 탑승일 2026-04-03 이후 선택 → 요금이 +250k(1N2D) 또는 +500k(2N3D) 인상?
✅ 직접예약 페이지도 동일 확인
```

## 🆘 오류 발생 시

| 오류 | 해결 |
|------|------|
| `duplicate key violation` | 이미 한 번 실행됨. 정상. 2번 실행하면 나타남. |
| `syntax error` | 복사 도중 줄바꿈 손상. 전체 다시 복사-붙여넣기 |
| 검증 0행 | 라이나 데이터가 처음 FROM에서 0개. DB 상태 확인 필요. |

**실행 후 결과 공유해주세요!** 🚀
