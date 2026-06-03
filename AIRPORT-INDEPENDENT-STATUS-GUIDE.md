# Airport 차량 서비스 독립 상태 관리 개선

**날짜**: 2026-06-03  
**상태**: 준비 완료  
**목표**: 픽업, 드롭오프(샌딩) 서비스를 독립적으로 관리

---

## 📋 문제점

### 현재 상황
```
2026-05-16: 예약 생성
2026-05-28: 픽업 일시 (완료)
2026-05-30: 예약 상태 → 'completed' ❌ (너무 조기!)
2026-06-03: 샌딩 일시 (아직 미실행) ← 이미 완료로 표기됨
```

### 문제
1. ❌ **픽업만 완료되어도 전체 예약을 'completed'로 처리**
2. ❌ **샌딩(드롭오프)이 아직 남아있는데도 완료로 표기**
3. ❌ **서비스별 독립적 상태 관리 불가능**
4. ❌ **결과: 고객/매니저 혼동, 작업 누락 위험**

---

## ✅ 해결방안

### 1️⃣ 새 컬럼 추가
```sql
ALTER TABLE reservation_airport
ADD COLUMN ra_pickup_status VARCHAR(50) DEFAULT 'pending',
ADD COLUMN ra_sending_status VARCHAR(50) DEFAULT 'pending',
ADD COLUMN ra_service_completed_at TIMESTAMP WITH TIME ZONE;
```

**상태 값**:
- `pending`: 예정
- `confirmed`: 확인됨
- `in_progress`: 진행 중
- `completed`: 완료
- `cancelled`: 취소

---

### 2️⃣ 자동 상태 계산 함수
```sql
calculate_reservation_status(reservation_id)
```

**로직**:
- 모든 서비스가 'completed' → 예약 상태 'completed'
- 일부만 완료 → 예약 상태 'in_progress'
- 모두 'pending' → 예약 상태 'pending'
- 모두 'cancelled' → 예약 상태 'cancelled'

---

### 3️⃣ 서비스별 완료 함수

#### 픽업 완료
```sql
SELECT * FROM complete_pickup(airport_id)
```
- 픽업 상태만 'completed'로 변경
- 전체 예약 상태는 자동 계산

#### 샌딩 완료
```sql
SELECT * FROM complete_sending(airport_id)
```
- 샌딩 상태만 'completed'로 변경
- 모든 서비스 완료 시에만 예약이 'completed'로 변경

---

### 4️⃣ 상태 조회 뷰
```sql
SELECT * FROM v_airport_reservation_status
WHERE re_id = '9e076e91-42d8-46ef-b23b-962f981d1285'
```

**반환 정보**:
```json
{
  "re_id": "...",
  "re_status": "in_progress",
  "pickup_status": "completed",
  "pickup_datetime": "2026-05-28T12:15:00+09:00",
  "sending_status": "pending",
  "sending_datetime": "2026-06-03T...",
  "services": [...]
}
```

---

## 🚀 적용 단계

### Step 1: SQL 실행
```bash
# Supabase Dashboard → SQL Editor에서 실행
# 또는
psql $DATABASE_URL -f sql/090-airport-independent-service-status.sql
```

### Step 2: 기존 데이터 마이그레이션
SQL 내 자동 마이그레이션 코드가 실행됨:
```sql
UPDATE reservation_airport
SET ra_pickup_status = ..., ra_sending_status = ...
```

### Step 3: 현재 상태 복구
박선형 예약 상태를 'in_progress'로 복구:
```sql
UPDATE reservation
SET re_status = 'in_progress',
    re_update_at = NOW()
WHERE re_id = '9e076e91-42d8-46ef-b23b-962f981d1285';
```

### Step 4: 검증
```sql
SELECT * FROM v_airport_reservation_status
WHERE re_id = '9e076e91-42d8-46ef-b23b-962f981d1285';
```

**예상 결과**:
```
re_status: in_progress (✅ 복구됨)
pickup_status: completed
sending_status: pending ← 아직 오늘 미실행
```

---

## 📝 사용 방법

### 픽업 완료 처리 (Manager/Admin)
```sql
SELECT * FROM complete_pickup(
  (SELECT id FROM reservation_airport 
   WHERE reservation_id = '9e076e91-42d8-46ef-b23b-962f981d1285' 
   AND way_type = 'pickup' LIMIT 1)
);
```

**결과**:
```
success: true
message: "Pick-up completed successfully"
new_status: "in_progress" (샌딩은 아직 pending이므로)
```

---

### 샌딩 완료 처리 (Manager/Admin)
```sql
SELECT * FROM complete_sending(
  (SELECT id FROM reservation_airport 
   WHERE reservation_id = '9e076e91-42d8-46ef-b23b-962f981d1285' 
   AND way_type = 'sending' LIMIT 1)
);
```

**결과**:
```
success: true
message: "Sending completed successfully"
new_status: "completed" (모든 서비스 완료!)
```

---

## 🔄 자동화 (향후 계획)

### Cron Job 1: 오늘 서비스 상태 확인
```sql
-- 매일 오전 9시 실행
UPDATE reservation r
SET re_status = 'confirmed'
FROM reservation_airport ra
WHERE r.re_id = ra.reservation_id
  AND r.re_type = 'airport'
  AND ra.ra_datetime::date = CURRENT_DATE
  AND (ra.ra_pickup_status = 'pending' OR ra.ra_sending_status = 'pending');
```

### Cron Job 2: 진행 중 상태로 변경
```sql
-- 픽업/샌딩 시간이 지나면 'in_progress'로 변경
UPDATE reservation r
SET re_status = 'in_progress'
FROM reservation_airport ra
WHERE r.re_id = ra.reservation_id
  AND r.re_type = 'airport'
  AND ra.ra_datetime < NOW()
  AND ra.ra_is_processed = false;
```

---

## 📊 개선 효과

| 항목 | 이전 | 이후 |
|------|------|------|
| **픽업만 완료** | ❌ 예약이 'completed' | ✅ 'in_progress' |
| **샌딩 전 상태** | ❌ '완료됨' 표기 | ✅ '진행 중' 표기 |
| **서비스별 관리** | ❌ 불가능 | ✅ 독립적 관리 |
| **고객 혼동** | ❌ 높음 | ✅ 없음 |
| **누락 위험** | ❌ 높음 | ✅ 낮음 |

---

## 🛠️ 추가 기능 (선택)

### 예약 서비스 히스토리 추가
```sql
CREATE TABLE reservation_airport_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  airport_id UUID REFERENCES reservation_airport(id),
  status_before VARCHAR(50),
  status_after VARCHAR(50),
  completed_at TIMESTAMP WITH TIME ZONE,
  completed_by UUID,  -- Manager ID
  notes TEXT
);
```

### 알림 트리거
```sql
-- 샌딩 날짜가 되면 Manager에게 알림
-- 픽업 완료 후 샌딩 확인 필요 알림
```

---

## ✅ 검증 체크리스트

- [ ] SQL 실행 완료
- [ ] 마이그레이션 성공 (기존 데이터 변환)
- [ ] 박선형 예약 상태 'in_progress'로 복구 확인
- [ ] 픽업 완료 함수 테스트
- [ ] 샌딩 완료 함수 테스트
- [ ] 뷰 조회 테스트
- [ ] 트리거 동작 확인

---

## 📞 문의사항

- SQL 적용 중 오류 발생 시
- 기존 데이터와 호환성 확인 필요
- Manager/Admin UI에 함수 연동 필요
