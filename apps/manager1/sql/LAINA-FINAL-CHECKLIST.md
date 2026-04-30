# Laina 크루즈 요금 변동 - 최종 실행 체크리스트

## ✅ SQL 파일 상태
- **파일**: `2026-03-30-laina-cruise-oil-surcharge-rate-update.sql`
- **버전**: v4.2 (DISTINCT ON 문법 오류 수정 완료)
- **상태**: ✅ Supabase 실행 가능

## 📋 실행 절차

### Step 1️⃣: Supabase SQL Editor 열기
- https://app.supabase.com → 프로젝트 → SQL Editor

### Step 2️⃣: 파일 내용 전체 복사
- 저장소에서 `2026-03-30-laina-cruise-oil-surcharge-rate-update.sql` 파일 전체 복사

### Step 3️⃣: 진단 쿼리 먼저 실행 (1번만)
```sql
SELECT cruise_name, schedule_type, room_type, valid_from, valid_to, price_adult, is_active
FROM cruise_rate_card
WHERE (
  cruise_name ILIKE '%라이나%'
  OR cruise_name ILIKE '%laina%'
  OR cruise_name ILIKE '%그랜드 크루즈%'
)
  AND valid_year = 2026
ORDER BY cruise_name, schedule_type, room_type, valid_from;
```

**확인 사항:**
- 현재 DB에 어떤 크루즈 이름이 있는지 확인
- 라이나/라이라 변형이 모두 보이는지 확인

### Step 4️⃣: BEGIN~COMMIT 블록 실행
전체 파일에서 **다음 부분만 선택하여 한 번에 실행:**

```sql
BEGIN;
-- (파일의 라인 23부터 라인 141의 DROP TABLE까지)
...
COMMIT;
```

**예상 결과:**
- 메시지: `COMMIT`
- 오류: 없음

### Step 5️⃣: 3개 검증 쿼리 실행
파일의 **마지막 3개 SELECT 쿼리를 순차 실행:**

#### 검증 1) 요금 쌍 확인
```sql
SELECT cruise_name, schedule_type, room_type, season_name,
       valid_from, valid_to, price_adult, price_extra_bed, price_single
FROM cruise_rate_card
WHERE cruise_name = '라이라 그랜져 크루즈' AND valid_year = 2026
ORDER BY schedule_type, room_type, season_name, valid_from;
```

**기대값:**
- 각 schedule_type(1N2D, 2N3D) × room_type마다 2개 행씩
- 첫 번째: `valid_to = '2026-04-02'` (구요금)
- 두 번째: `valid_from = '2026-04-03'` (신요금, +인상)

#### 검증 2) 변형 이름 제거 확인
```sql
SELECT * FROM cruise_rate_card
WHERE cruise_name IN ('라이나 크루즈','Laina Cruise','그랜드 크루즈',
  'Laina Grand Cruise','라이나그랜드크루즈','라이나 그랜드 크루즈','라이라그랜져크루즈') 
AND valid_year = 2026;
```

**기대값:** **0행** (모든 변형 이름이 정규화되어 삭제됨)

#### 검증 3) NULL 값 없음 확인
```sql
SELECT * FROM cruise_rate_card
WHERE cruise_name = '라이라 그랜져 크루즈' AND valid_year = 2026
  AND (valid_from IS NULL OR valid_to IS NULL);
```

**기대값:** **0행** (모든 valid_from/valid_to가 채워짐)

## 🎯 최종 확인 (UI에서)

### 견적 페이지
- 경로: `/mypage/quotes/cruise` (또는 견적 크루즈 페이지)
- **확인:** 라이나 크루즈가 목록에 보이는가?
- **확인:** 2026-04-03 이후 탑승일로 선택했을 때 요금이 +250k/+500k 인상되었는가?

### 직접 예약 페이지
- 경로: `/mypage/direct-booking/cruise`
- **동일하게 확인**

## ⚠️ 문제 해결

| 문제 | 해결책 |
|------|--------|
| `syntax error` | 파일 전체를 복사하지 말고, BEGIN과 COMMIT 사이의 블록만 복사하여 실행 |
| `duplicate key value violates unique constraint` | 이미 1번 실행된 것. 2번 실행 시 나타남. 정상. |
| 검증 1에서 0행 | 라이나 크루즈 데이터가 DB에 없음. 진단 쿼리로 크루즈 이름 확인 후 수정 필요 |
| UI에서 여전히 안 보임 | 앱 캐시 무효화 (`Ctrl+Shift+Delete`) 또는 재시작 필요. 또는 관리자 캐시 클리어 |

## 📞 추가 지원
- SQL 실행 중 오류 발생 시: Supabase 에러 메시지 전체 공유
- UI에서 안 보일 시: 브라우저 개발자도구 → Network/Console 로그 확인
