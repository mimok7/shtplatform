# 라이나 크루즈 요금 변동 SQL 실행 가이드

## 파일
- `2026-03-30-laina-cruise-oil-surcharge-rate-update.sql`

## 실행 방법 (Supabase)

### 1️⃣ Supabase Dashboard 접속
- https://app.supabase.com → 프로젝트 선택 → SQL Editor

### 2️⃣ 진단 쿼리 실행 (선택사항 - 현재 상태 확인)
파일의 **가장 상단** 진단 SELECT를 실행:
```sql
-- 라이나 변형 이름 모두 검색 (ILIKE 기반)
SELECT COUNT(*) as total_count, COUNT(DISTINCT cruise_name) as unique_names
FROM cruise_rate_card
WHERE (cruise_name ILIKE '라이나%' OR cruise_name ILIKE '라이라%' OR cruise_name ILIKE 'laina%')
  AND valid_year = 2026;
```
**기대값**: 존재하는 라이나/라이라 변형 이름 행 개수 표시

### 3️⃣ 요금 변동 적용 (필수)
파일의 **BEGIN~COMMIT 블록 전체를 복사하여 실행**:
- Diagnostic SELECT 이후부터 DROP TABLE까지
- COMMIT까지 한 번에 실행 (트랜잭션)

**기대값**: `COMMIT` 메시지 표시, 오류 없음

### 4️⃣ 검증 쿼리 실행 (필수)
파일의 **마지막 3개 검증 쿼리를 순차 실행**:

**검증 1) 구요금과 신요금 쌍 확인**
```
- 조건: 2026-04-02까지 원본, 2026-04-03부터 +인상
- 기대값: 각 schedule_type(1N2D, 2N3D) × room_type 당 2개 행씩
```

**검증 2) 변형 이름 제거 확인**
```
- 기대값: 0행 (변형 이름이 모두 정규화됨)
```

**검증 3) NULL 필드 확인**
```
- 기대값: 0행 (모든 valid_from/valid_to가 채워짐)
```

## 예상 결과
- 라이나 크루즈 2026년 요금이 다음과 같이 설정됨:
  - **~2026-04-02**: 원본 요금
  - **2026-04-03~**: 1N2D +250,000 VND, 2N3D +500,000 VND 인상

## 문제 해결
| 문제 | 해결책 |
|------|--------|
| `syntax error` | 파일 전체를 복사하지 말고, BEGIN과 COMMIT 사이만 복사 |
| `duplicate key value violates` | 2번째 실행 시 나타남. `DELETE` 스텝이 정상 작동한 것. 원본 데이터 상태 확인 필요 |
| `0행 결과` (데이터 없음) | 진단 SELECT로 cruise_name 확인 - 정규화되지 않은 변형 이름일 수 있음 |

## 문의
- 요금이 UI에 반영되지 않으면: 캐시 무효화 또는 앱 재시작 필요
- SQL 오류: 파일의 주석 확인 및 Supabase 에러 메시지 확인
