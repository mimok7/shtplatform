# 🔍 라이나 크루즈 최종 진단 쿼리

사용자님이 Supabase SQL Editor에서 **다음 쿼리만 실행해주세요.**

## 🚨 우선 실행: 현재 DB 상태 확인

```sql
-- 1️⃣ 라이나/라이라 모든 변형 이름 검색
SELECT COUNT(*) as total_rows,
       COUNT(DISTINCT cruise_name) as unique_names,
       COUNT(DISTINCT CASE WHEN is_active = true THEN 1 END) as active_count,
       COUNT(DISTINCT CASE WHEN is_active = false THEN 1 END) as inactive_count
FROM cruise_rate_card
WHERE (cruise_name ILIKE '%라이%' OR cruise_name ILIKE '%laina%')
  AND valid_year = 2026;

-- 2️⃣ 정확한 크루즈 이름 목록 (모두)
SELECT DISTINCT cruise_name, COUNT(*) as row_count, 
       COUNT(CASE WHEN is_active = true THEN 1 END) as active_rows
FROM cruise_rate_card
WHERE (cruise_name ILIKE '%라이%' OR cruise_name ILIKE '%laina%')
  AND valid_year = 2026
GROUP BY cruise_name
ORDER BY cruise_name;

-- 3️⃣ 라이라 그랜져 크루즈만 상세 (현재 상태)
SELECT id, cruise_name, schedule_type, room_type, 
       valid_from, valid_to, price_adult, is_active, notes
FROM cruise_rate_card
WHERE cruise_name = '라이라 그랜져 크루즈'
  AND valid_year = 2026
ORDER BY schedule_type, room_type, valid_from;

-- 4️⃣ 상태별 요금 카운트 (라이라 그랜져 크루즈)
SELECT is_active, schedule_type, COUNT(*) as row_count
FROM cruise_rate_card
WHERE cruise_name = '라이라 그랜져 크루즈'
  AND valid_year = 2026
GROUP BY is_active, schedule_type
ORDER BY is_active DESC, schedule_type;

-- 5️⃣ 활성화된 것만 (=UI에 보이는 것)
SELECT cruise_name, schedule_type, COUNT(*) as available_combos
FROM cruise_rate_card
WHERE is_active = true
  AND valid_year = 2026
  AND (cruise_name ILIKE '%라이%' OR cruise_name ILIKE '%laina%')
GROUP BY cruise_name, schedule_type
ORDER BY cruise_name, schedule_type;
```

## 📊 결과 확인 및 조치

### 만약 쿼리 2️⃣ 결과가 0행이면:
- **의미**: DB에 라이나 크루즈가 완전히 없음
- **조치**: 원본 라이나 크루즈 데이터를 DB에 먼저 삽입해야 함

### 만약 쿼리 3️⃣ 결과가 0행이면:
- **의미**: '라이라 그랜져 크루즈' 정규 이름으로 데이터가 없음
- **조치**: 쿼리 2️⃣ 결과의 정확한 이름으로 SQL 수정 필요

### 만약 쿼리 3️⃣이 데이터 있는데 4️⃣에서 active_count = 0이면:
- **의미**: 라이나 크루즈가 비활성화(is_active = false)됨
- **조치**: 아래 쿼리 실행하여 활성화:

```sql
UPDATE cruise_rate_card
SET is_active = true
WHERE cruise_name = '라이라 그랜져 크루즈'
  AND valid_year = 2026;
```

### 만약 쿼리 5️⃣에서 라이나 크루즈가 안 보이면:
- **의미**: 활성화된 라이나 크루즈가 0개
- **조치**: 위의 UPDATE 쿼리 실행 후 재확인

## 🎯 최종 목표

쿼리 5️⃣ 결과:
```
라이라 그랜져 크루즈 | 1N2D | 2
라이라 그랜져 크루즈 | 2N3D | 2
```

이렇게 보이면 **성공!** 라이나 크루즈가 UI에 나타날 것입니다.

---

**위 진단 쿼리 결과를 알려주세요.** 그러면 정확한 원인을 파악할 수 있습니다! 🔍
