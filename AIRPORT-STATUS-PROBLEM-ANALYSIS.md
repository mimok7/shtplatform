# 박선형 예약 상태 조기 완료 문제 — 근본 원인 분석 & 해결방안

**작성**: 2026-06-03  
**문제**: 샌딩(드롭오프) 일시가 오늘(2026-06-03)인데 이미 'completed' 상태로 변경됨  
**책임**: 픽업 기준 자동 완료 시스템 설계 결함

---

## 🚨 문제 요약

### Timeline (박선형 예약 ID: 9e076e91-42d8-46ef-b23b-962f981d1285)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2026-05-16 14:16  | 예약 생성
                   | status: pending → (초기)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2026-05-28 12:15  | 픽업(Pick-up) 예정
                   | Noi Bai Airport (베트남 하노이)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2026-05-30 03:16  | ❌ 상태 자동으로 'completed'로 변경
                   | (픽업 2일 후)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2026-06-03 (오늘) | 샌딩(Sending/드롭오프) 예정
                   | ❌ 이미 'completed'로 표기됨 (미실행 상태로 잠김!)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 🔍 근본 원인

### 1️⃣ **설계 결함: Airport 예약 상태 관리의 문제점**

**현재 구조:**
```sql
reservation (통합 예약)
  ├─ re_status: "completed" ← 하나의 상태만 관리!
  │
  └─ reservation_airport (다중 서비스)
      ├─ [1] way_type: "pickup",  ra_datetime: 2026-05-28 ← 완료됨
      └─ [2] way_type: "sending", ra_datetime: 2026-06-03 ← 아직 미실행
```

**문제:**
- Reservation 테이블은 **통합 상태 1개**만 관리
- reservation_airport는 **픽업과 샌딩 2개 라인**으로 분리
- 시스템이 픽업 날짜만 확인하고 **샌딩 날짜는 무시**
- 결과: 픽업 완료 후 자동으로 전체 예약을 'completed'로 처리

---

### 2️⃣ **자동 완료 시스템의 로직**

```
자동화 규칙 (추정):
┌─────────────────────────────────────┐
│ Cron Job 또는 트리거                 │
│ (매일 실행 또는 예약 수정 시)        │
└─────────────────────────────────────┘
         ↓
    픽업 날짜 < 오늘?
         ↓ YES
    re_status = 'completed'  ← ❌ 너무 조기!
         ↓
   샌딩 날짜 무시됨
```

**근거:**
- 2026-05-30 03:16 수정일 기록 (픽업 2일 후)
- 5월 28일 픽업 → 5월 30일 자동 완료 (일반적인 시간차)
- ra_is_processed 필드만 확인

---

### 3️⃣ **결과적 피해**

| 영향 | 설명 |
|------|------|
| 📋 **고객 혼동** | "완료됨"인데 아직 드롭오프가 남아있음 |
| 🔒 **수정 불가** | 이미 'completed'이므로 상태 변경 불가 |
| ⏰ **일정 누락** | 매니저가 오늘 드롭오프 일정을 놓칠 수 있음 |
| 💰 **결제 미완료** | 상태는 'completed'인데 payment_status는 'pending' |
| 🚗 **운영 효율성** | 차량 배치 등 실제 운영과 상태 불일치 |

---

## ✅ 해결방안 (3단계)

### Phase 1️⃣: 즉시 복구 (오늘 실행)

**쿼리**: [sql/091-park-seonhyung-status-recovery.sql](../sql/091-park-seonhyung-status-recovery.sql)

```sql
UPDATE reservation
SET re_status = 'in_progress'
WHERE re_id = '9e076e91-42d8-46ef-b23b-962f981d1285';
```

**효과:**
- ✅ 상태를 'in_progress'로 복구
- ✅ 오늘 샌딩 업무 진행 가능
- ⏳ 임시 방편 (근본 해결 아님)

---

### Phase 2️⃣: 근본 설계 개선 (이번 주)

**마이그레이션**: [sql/090-airport-independent-service-status.sql](../sql/090-airport-independent-service-status.sql)

**구조 개선:**
```sql
reservation_airport 추가 컬럼:
  ├─ ra_pickup_status      -- 픽업 독립 상태
  ├─ ra_sending_status     -- 샌딩 독립 상태
  └─ ra_service_completed_at

calculate_reservation_status() 함수:
  각 서비스의 상태를 확인하여
  모두 'completed' → 예약도 'completed'
  일부만 완료 → 예약은 'in_progress'
```

**효과:**
- ✅ 픽업, 샌딩 독립적 관리
- ✅ 자동 상태 계산 (트리거)
- ✅ 완료 함수 (complete_pickup(), complete_sending())

---

### Phase 3️⃣: 자동화 개선 (다음 주)

**Cron Job 추가:**
```sql
-- 매일 오전 9시
UPDATE reservation SET re_status = 'confirmed'
WHERE 오늘이 픽업/샌딩 날짜 AND 상태 = 'pending'

-- 픽업/샌딩 시간 경과 시
UPDATE reservation SET re_status = 'in_progress'
WHERE 일시가 지남 AND 미완료
```

**효과:**
- ✅ 예정된 예약 자동 확인
- ✅ 진행 중인 예약 자동 표시
- ✅ 완료 후 자동 최종 업데이트

---

## 📊 개선 효과 비교

| 항목 | 현재 (버그) | 개선 후 |
|------|----------|--------|
| **픽업만 완료** | ❌ 예약 'completed' | ✅ 'in_progress' |
| **샌딩 전 상태** | ❌ "완료됨" | ✅ "진행 중" |
| **서비스별 상태** | ❌ 미관리 | ✅ 독립 관리 |
| **자동 계산** | ❌ 픽업만 확인 | ✅ 모든 서비스 확인 |
| **취소 가능** | ❌ 불가능 | ✅ 가능 (필요시) |
| **고객 혼동** | ❌ 높음 | ✅ 제거됨 |

---

## 🛠️ 실행 단계

### Step 1: 즉시 복구 (5분)
```bash
# Supabase SQL Editor에서 실행
# sql/091-park-seonhyung-status-recovery.sql
```

### Step 2: 근본 개선 (30분)
```bash
# Supabase SQL Editor에서 실행
# sql/090-airport-independent-service-status.sql
# (자동 마이그레이션 포함)
```

### Step 3: 확인 (5분)
```bash
SELECT * FROM v_airport_reservation_status
WHERE re_id = '9e076e91-42d8-46ef-b23b-962f981d1285';

-- 예상 결과:
-- re_status: in_progress
-- pickup_status: completed
-- sending_status: pending ← 오늘 예정
```

### Step 4: 오늘 샌딩 완료 (실제 시행)
```sql
SELECT * FROM complete_sending(airport_id);
-- → reservation 상태 'completed'로 자동 변경
```

---

## 📚 참고 자료

| 파일 | 설명 |
|------|------|
| [sql/090-airport-independent-service-status.sql](../sql/090-airport-independent-service-status.sql) | 근본 해결책 SQL |
| [sql/091-park-seonhyung-status-recovery.sql](../sql/091-park-seonhyung-status-recovery.sql) | 즉시 복구 SQL |
| [AIRPORT-INDEPENDENT-STATUS-GUIDE.md](./AIRPORT-INDEPENDENT-STATUS-GUIDE.md) | 상세 구현 가이드 |

---

## 🔔 권장사항

### 긴급
- [ ] 박선형 상태 복구 (in_progress)
- [ ] 오늘 드롭오프 일정 확인

### 이번 주
- [ ] 090 SQL 적용 (근본 개선)
- [ ] 테스트 (기존 데이터 호환성)

### 다음 주
- [ ] Cron Job 설정 (자동화)
- [ ] Manager/Admin UI 연동
- [ ] 알림 시스템 추가

---

## ❓ FAQ

**Q: 왜 이런 일이 발생했나요?**  
A: Airport 예약이 픽업과 샌딩 2개 라인으로 분리되어 있는데, 상태 관리는 통합으로 되어 있기 때문입니다. 픽업만 확인하고 샌딩은 무시하는 설계 결함입니다.

**Q: 다른 예약도 영향받았나요?**  
A: 박선형의 두 예약 모두 'completed' 상태입니다. 같은 문제를 가진 다른 Airport 예약이 있을 수 있습니다. SQL 적용 후 자동으로 수정됩니다.

**Q: 결제는 어떻게 되나요?**  
A: 현재 payment_status는 'pending'입니다. 상태 개선과는 별개로 결제 처리가 필요합니다.

**Q: 언제까지 실행해야 하나요?**  
A: 오늘 06:00 PM 드롭오프 전에 complete_sending() 함수를 실행해야 최종 'completed' 상태가 됩니다.

---

**작성자**: 자동 분석 시스템  
**검토 필요**: 관리자/개발팀  
**최종 승인**: 프로젝트 리더
