---
name: notifications-management-guide
description: "알림 시스템 일원화 및 운영 가이드 (2026.05.17) — 테이블 구조, 영문 정규화 규칙, 개발/운영 방법, Cron 자동화"
applyTo: "apps/**/components/*Notification*.tsx, apps/**/app/**notifications/page.tsx, sql/08*-notifications*.sql, apps/admin/app/api/cron/payment-notifications-generate/route.ts"
---

# 알림 시스템 관리 지침 (Notifications Management)

## 📋 개요

스테이하롱 예약 시스템의 알림 시스템은 **4가지 알림 채널** + **자동 Cron** + **리스트 기반 관리 화면**으로 구성됨.
- **Notifications**: 중앙 알림 테이블 (manager UI + admin UI 관리)
- **Business Notifications**: 비즈니스 이벤트 알림 (고객센터/예약팀 대상)
- **Customer Notifications**: 고객 알림 (예약자 이메일/SMS)
- **Payment Notifications**: 미결제 알림 (자동 Cron 생성, 매일 09:00 KST)
- **Push Subscriptions**: 웹푸시 구독자 관리

---

## 🏗️ 테이블 구조

### Core Tables

#### `notifications` (중앙 알림 테이블)
**용도**: Manager/Admin이 직접 생성·관리하는 알림  
**Creator**: Manager → SendNotificationModal 또는 Admin → Supabase Dashboard

| 컬럼 | 타입 | 설명 | 예시 |
|------|------|------|------|
| `noti_id` | BIGSERIAL | PK | 1, 2, 3... |
| `type` | TEXT | 알림 분류 | `'quotation'`, `'reservation'`, `'payment'`, `'system'` |
| `category` | TEXT | 세부 분류 (검색용) | `'new_quote'`, `'quote_approved'`, `'reservation_confirmed'` |
| `priority` | ENUM | 영문 표준 (**중요**) | `'low'`, `'normal'`, `'high'`, `'urgent'` |
| `status` | ENUM | 영문 표준 (**중요**) | `'unread'`, `'read'`, `'processing'`, `'completed'`, `'dismissed'` |
| `title` | TEXT | 알림 제목 | `'새로운 견적 요청'` |
| `message` | TEXT | 알림 본문 | `'[여행] 보라카이 4박5일 견적 요청 대기중'` |
| `target_table` | TEXT | 연관 테이블 | `'quote'`, `'reservation'`, `'customer_request'` |
| `target_id` | BIGINT | 연관 PK | `quote_id`, `reservation_id` |
| `subcategory` | TEXT | 추가 분류 | `'general'`, `'urgent_payment'` |
| `created_at` | TIMESTAMPTZ | 생성 시간 | `2026-05-17 10:30:00+00` |
| `updated_at` | TIMESTAMPTZ | 수정 시간 | (자동 갱신) |

**CHECK 제약** (B 마이그레이션 후):
```sql
status IN ('unread','read','processing','completed','dismissed')
priority IN ('low','normal','high','urgent')
```

**인덱스** (A 마이그레이션):
```sql
-- 성능 인덱스 (85번 SQL)
idx_notifications_status_created
idx_notifications_type_status_created
idx_notifications_category_status_created
idx_notifications_target_table_status
idx_notifications_priority_status
idx_notifications_active_recent (partial: status <> 'completed')
```

---

#### `business_notifications` (비즈니스 채널)
**용도**: 고객센터/예약팀/관리팀이 받는 내부 알림  
**자동 생성**: DB 트리거 (quote 상태 변경 시)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `bn_id` | BIGSERIAL | PK |
| `notification_id` | BIGINT | `notifications.noti_id` FK |
| `department` | TEXT | `'customer_service'`, `'reservation'`, `'accounting'` |
| `recipient_role` | TEXT | `'manager'`, `'admin'` |
| `is_read` | BOOLEAN | 읽음 여부 |
| `created_at` | TIMESTAMPTZ | 생성 시간 |

**사용처**:
- `manager/notifications`, `manager1/notifications` 리스트 페이지에서 필터/상태 기반으로 관리
- 팝업 UI는 운영 정책상 비활성화 (리스트 전용)

---

#### `customer_notifications` (고객 채널)
**용도**: 예약자에게 보내는 이메일/SMS 알림  
**생성 방법**: Manager가 SendNotificationModal에서 생성 → DB 자동 INSERT

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `cn_id` | BIGSERIAL | PK |
| `notification_id` | BIGINT | `notifications.noti_id` FK |
| `recipient_email` | TEXT | 고객 이메일 |
| `recipient_phone` | TEXT | 고객 전화번호 |
| `message_content` | TEXT | 이메일/SMS 본문 |
| `is_sent` | BOOLEAN | 발송 여부 |
| `sent_at` | TIMESTAMPTZ | 발송 시간 |
| `created_at` | TIMESTAMPTZ | 생성 시간 |

**주의**: 한글 priority/status 값 금지 (CHECK 제약 위반)

---

#### `payment_notifications` (결제 추적 채널)
**용도**: 미결제 예약 자동 추적 (매일 Cron으로 생성)  
**자동 생성**: Admin 앱 Cron `/api/cron/payment-notifications-generate` (매일 09:00 KST)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `pn_id` | BIGSERIAL | PK |
| `reservation_id` | BIGINT | 예약 PK |
| `notification_type` | TEXT | `'payment_due'`, `'payment_overdue'` |
| `notification_date` | DATE | 알림 날짜 (중복 방지 키) |
| `message_content` | TEXT | 알림 내용 (예: "미결제 잔액 1,000,000원") |
| `recipient_email` | TEXT | 고객 이메일 |
| `recipient_phone` | TEXT | 고객 전화번호 |
| `is_sent` | BOOLEAN | 발송 여부 (기본 false) |
| `sent_at` | TIMESTAMPTZ | 발송 시간 |
| `created_at` | TIMESTAMPTZ | 생성 시간 |

**Cron 로직**:
1. 매일 09:00 KST (`schedule: "0 0 * * *"` = UTC 00:00)
2. `reservation.payment_status IN ('pending','partial','overdue')` 조회
3. 중복 check: 오늘 날짜로 같은 `reservation_id` + `notification_type='payment_due'` 존재 여부
4. 없으면 INSERT → 발송 대상 (별도 발송 스크립트에서 is_sent=true 처리)

---

#### `push_subscriptions` (웹푸시 구독)
**용도**: 웹푸시 구독자 정보 저장  
**생성**: 고객/매니저가 브라우저 알림 수락 시

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `ps_id` | BIGSERIAL | PK |
| `user_id` | UUID | `users.id` FK (또는 NULL = 게스트) |
| `app_name` | TEXT | `'customer'`, `'manager'`, `'admin'` |
| `subscription_json` | JSONB | VAPID public key 형식 |
| `is_active` | BOOLEAN | 활성 여부 |
| `created_at` | TIMESTAMPTZ | 등록 시간 |

**인덱스** (A 마이그레이션):
```sql
idx_push_subscriptions_app_user
idx_push_subscriptions_reservation_id
```

---

### Deprecated Tables (E 마이그레이션)
현재 코드에서 사용 **0건** — 1개월 후 완전 삭제 예정

| 테이블 | 상태 | 삭제 일정 |
|--------|------|---------|
| `_deprecated_notification_templates_20260517` | RENAMED from `notification_templates` | 2026.06.17 |
| `_deprecated_notification_reads_20260517` | RENAMED from `notification_reads` | 2026.06.17 |
| `_backup_notification_templates_20260517` | 백업 (참고용) | 2026.06.17 |
| `_backup_notification_reads_20260517` | 백업 (참고용) | 2026.06.17 |

---

## 📝 값 정규화 규칙 (B 마이그레이션 — 영문 표준)

### Priority (우선순위)
**원칙**: 한글 입력 금지 — 모든 INSERT에서 영문만 사용

| 이전 (한글) | 정규화 (영문) | 의미 |
|-----------|-------------|------|
| `'낮음'` | `'low'` | Low priority |
| `'보통'`, `'일반'`, `'중간'` | `'normal'` | Normal priority |
| `'높음'` | `'high'` | High priority |
| `'긴급'`, `'매우높음'` | `'urgent'` | Urgent priority |
| NULL, 기타 | `'normal'` (기본값) | Fallback |

### Status (상태)
**원칙**: 한글 입력 금지 — 모든 UPDATE에서 영문만 사용

| 이전 (한글) | 정규화 (영문) | 의미 |
|-----------|-------------|------|
| `'읽지않음'`, `'미읽음'`, `'신규'` | `'unread'` | Not read |
| `'읽음'`, `'확인'` | `'read'` | Read |
| `'처리중'`, `'진행중'` | `'processing'` | Processing |
| `'완료'`, `'처리완료'` | `'completed'` | Completed |
| `'무시'`, `'무시됨'`, `'취소'` | `'dismissed'` | Dismissed |
| NULL, 기타 | `'unread'` (기본값) | Fallback |

### Subcategory (세부분류)
| 이전 | 정규화 | 의미 |
|-----|-------|------|
| `'일반'` | `'general'` | General |
| NULL | `'general'` (기본값) | Fallback |

### CHECK 제약 적용
```sql
-- (B 마이그레이션에서 자동 생성)
ALTER TABLE notifications ADD CONSTRAINT notifications_status_check 
  CHECK (status IN ('unread','read','processing','completed','dismissed'));

ALTER TABLE notifications ADD CONSTRAINT notifications_priority_check 
  CHECK (priority IN ('low','normal','high','urgent'));
```

**CHECK 위반 시 오류**:
```
ERROR: new row for relation "notifications" violates check constraint "notifications_status_check"
DETAIL: Failing row contains (1, 'quotation', '신규', ...).
```

---

## 👨‍💻 개발자 사용 방법

### 1️⃣ 알림 생성 (Manager → SendNotificationModal)

**위치**: `apps/manager/src/components/SendNotificationModal.tsx`  
**사용 시나리오**: 매니저가 새 견적/예약에 대해 고객에게 알림 발송

```typescript
// ✅ 올바른 방법 (영문 priority)
const notificationPayload = {
  type: 'quotation',
  category: 'new_quote',
  priority: 'high',        // ← 영문만 (CHECK 제약 준수)
  status: 'unread',        // ← 영문만
  title: '새로운 견적 요청',
  message: '[여행] 보라카이 4박 5일 견적 요청 확인 부탁드립니다.',
  target_table: 'quote',
  target_id: quoteId,
  subcategory: 'general'
};

// ❌ 절대 금지 (한글 priority)
const BAD_PAYLOAD = {
  priority: '긴급',  // ← CHECK 제약 위반! ERROR 발생
  status: '신규',    // ← CHECK 제약 위반! ERROR 발생
};
```

**코드 실행**:
```typescript
// SendNotificationModal.tsx 내부
const handleSend = async () => {
  try {
    // 1. notifications 테이블에 INSERT
    const { data: noti, error: notiErr } = await supabase
      .from('notifications')
      .insert({
        type: selectedType,
        category: selectedCategory,
        priority: selectedPriority,     // ← 영문: 'low'|'normal'|'high'|'urgent'
        status: 'unread',               // ← 신규 알림은 항상 'unread'
        title: formTitle,
        message: formMessage,
        target_table: targetTable,
        target_id: targetId,
        subcategory: 'general'
      })
      .select()
      .single();
    if (notiErr) throw notiErr;

    // 2. business_notifications 체인 INSERT (자동 FK 참조)
    const { error: bnErr } = await supabase
      .from('business_notifications')
      .insert({
        notification_id: noti.noti_id,
        department: 'customer_service',
        recipient_role: 'manager',
        is_read: false
      });
    if (bnErr) console.warn('⚠️ 비즈니스 알림 INSERT 실패:', bnErr);

    // 3. customer_notifications 체인 INSERT (이메일 발송 대상)
    const { error: cnErr } = await supabase
      .from('customer_notifications')
      .insert({
        notification_id: noti.noti_id,
        recipient_email: recipientEmail,
        recipient_phone: recipientPhone,
        message_content: formMessage,
        is_sent: false  // ← 별도 발송 스크립트에서 true로 변경
      });
    if (cnErr) console.warn('⚠️ 고객 알림 INSERT 실패:', cnErr);

    alert('알림이 발송되었습니다.');
  } catch (err) {
    console.error('알림 전송 실패:', err);
    // CHECK 제약 위반 시: "violates check constraint"
  }
};
```

---

### 2️⃣ 알림 조회 (Manager/Admin → 알림 리스트 페이지)

**위치**: `apps/manager/src/app/manager/notifications/page.tsx`, `apps/manager1/app/manager/notifications/page.tsx`  
**동작**: 알림은 팝업 없이 리스트에서만 조회/처리

```typescript
// ✅ 표준 쿼리 (C 마이그레이션)
const loadNotifications = useCallback(async () => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStartIso = todayStart.toISOString();

  try {
    // 1. 오늘 생성된 알림만 조회 (created_at >= 00:00:00)
    // 2. status != 'completed' (이미 처리된 것 제외)
    // 3. priority 영문/한글 모두 처리 (마이그레이션 중 혼재 가능)
    // 4. LIMIT 50 (성능)
    const { data, error } = await supabase
      .from('notifications')
      .select(`
        noti_id, type, category, priority, status, title, message,
        target_table, target_id, created_at,
        business_notifications(bn_id, department, recipient_role)
      `)
      .gte('created_at', todayStartIso)           // ← 오늘 이후만
      .neq('status', 'completed')                 // ← 완료 제외
      .in('priority', ['low','normal','high','urgent', '낮음','보통','높음','긴급'])  // ← 영문/한글 모두
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    setNotifications(data || []);
  } catch (err) {
    console.error('알림 조회 실패:', err);
  }
}, []);

// 폴링 (5분마다)
useEffect(() => {
  loadNotifications();
  const interval = setInterval(loadNotifications, 300000);  // 5분 = 300,000ms
  return () => clearInterval(interval);
}, [loadNotifications]);
```

---

### 3️⃣ 알림 상태 업데이트 (Manager → 읽음/처리)

**위치**: `apps/manager/src/app/manager/notifications/page.tsx`  
**사용 시나리오**: 매니저가 알림 목록에서 상태 변경

```typescript
// ✅ 올바른 방법 (영문 status)
const updateNotificationStatus = async (notiId: number, newStatus: string) => {
  const validStatuses = ['unread', 'read', 'processing', 'completed', 'dismissed'];
  
  if (!validStatuses.includes(newStatus)) {
    console.error(`❌ 잘못된 status: ${newStatus}. 허용값: ${validStatuses.join(',')}`);
    return;
  }

  try {
    const { error } = await supabase
      .from('notifications')
      .update({ status: newStatus })  // ← 영문만
      .eq('noti_id', notiId);
    
    if (error) throw error;
    alert('상태가 변경되었습니다.');
  } catch (err) {
    console.error('상태 업데이트 실패:', err);
    // CHECK 제약 위반 시: "violates check constraint"
  }
};

// 사용 예
updateNotificationStatus(123, 'read');         // ✅ OK
updateNotificationStatus(123, 'processing');   // ✅ OK
updateNotificationStatus(123, '읽음');         // ❌ CHECK 제약 위반!
```

---

### 4️⃣ 자동 결제 알림 생성 (Admin Cron)

**위치**: `apps/admin/app/api/cron/payment-notifications-generate/route.ts`  
**스케줄**: 매일 KST 09:00 (`schedule: "0 0 * * *"` = UTC 00:00)  
**자동 실행**: Vercel 배포 후 자동 (수동 개입 불필요)

**코드 흐름**:
```typescript
// 매일 09:00 KST 자동 실행
export async function GET(request: NextRequest) {
  // 1. 인증 확인
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 2. 미결제 예약 조회
    const { data: reservations, error: resErr } = await supabase
      .from('reservation')
      .select('*')
      .in('payment_status', ['pending', 'partial', 'overdue'])
      .gt('total_amount', 0);

    if (resErr) throw resErr;

    // 3. 클라이언트 필터 (total_amount > paid_amount)
    const dueReservations = reservations.filter(r => r.total_amount > (r.paid_amount || 0));

    // 4. 각 예약에 대해 오늘 알림 존재 확인
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayDate = today.toISOString().split('T')[0];  // YYYY-MM-DD

    for (const reservation of dueReservations) {
      // 5. 중복 확인
      const { data: existing } = await supabase
        .from('payment_notifications')
        .select('pn_id', { count: 'exact' })
        .eq('reservation_id', reservation.re_id)
        .eq('notification_type', 'payment_due')
        .eq('notification_date', todayDate);

      if (existing && existing.length > 0) {
        console.log(`✓ 이미 있음: reservation_id=${reservation.re_id}, date=${todayDate}`);
        continue;  // 스킵
      }

      // 6. 사용자 정보 조회
      const { data: user } = await supabase
        .from('users')
        .select('email, phone_number')
        .eq('id', reservation.re_user_id)
        .single();

      // 7. payment_notifications INSERT
      const remaining = reservation.total_amount - (reservation.paid_amount || 0);
      const { error: insertErr } = await supabase
        .from('payment_notifications')
        .insert({
          reservation_id: reservation.re_id,
          notification_type: 'payment_due',
          notification_date: todayDate,
          message_content: `[${reservation.re_type}] 미결제 잔액 ${remaining.toLocaleString()}원 확인 부탁드립니다.`,
          recipient_email: user?.email || '',
          recipient_phone: user?.phone_number || '',
          is_sent: false
        });

      if (insertErr) {
        console.error(`✗ INSERT 실패: reservation_id=${reservation.re_id}`, insertErr);
      } else {
        console.log(`✓ INSERT 성공: reservation_id=${reservation.re_id}`);
      }
    }

    return NextResponse.json({ success: true, processed: dueReservations.length });
  } catch (error) {
    console.error('Cron 오류:', error);
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 });
  }
}
```

---

## 🚀 운영 절차 (SQL 마이그레이션)

### Step 1: 성능 인덱스 추가 (A 마이그레이션)
**파일**: `sql/085-notifications-perf-indexes-2026.sql`  
**목적**: 30,000행 쿼리를 1,000ms → 50ms로 최적화

```bash
# Supabase Dashboard → SQL Editor → 다음 파일 복사-붙여넣기-실행
sql/085-notifications-perf-indexes-2026.sql
```

**확인**:
```sql
-- SQL Editor에서 실행
SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read
FROM pg_stat_user_indexes
WHERE tablename = 'notifications'
ORDER BY indexname;

-- idx_scan > 0이면 인덱스 사용 중
```

---

### Step 2: 값 정규화 (B 마이그레이션)
**파일**: `sql/086-notifications-normalize-values-2026.sql`  
**목적**: 한글/영문 혼재 → 영문 표준화 + CHECK 제약

```bash
# Supabase Dashboard → SQL Editor → 다음 파일 복사-붙여넣기-실행
sql/086-notifications-normalize-values-2026.sql
```

**확인**:
```sql
-- 정규화 완료 확인
SELECT DISTINCT priority FROM notifications ORDER BY priority;
-- 결과: low, normal, high, urgent (한글 없음)

SELECT DISTINCT status FROM notifications ORDER BY status;
-- 결과: unread, read, processing, completed, dismissed (한글 없음)
```

**한글 데이터 감지** (이상 상황):
```sql
-- CHECK 제약 위반 시
SELECT COUNT(*) FROM notifications 
WHERE status NOT IN ('unread','read','processing','completed','dismissed');
-- 결과: 0 (정상)
```

---

### Step 3: 미사용 테이블 Deprecate (E 마이그레이션)
**파일**: `sql/087-notifications-deprecate-unused-tables-2026.sql`  
**목적**: 미사용 테이블 안전 제거 (RENAME, 1개월 후 DROP)

```bash
# Supabase Dashboard → SQL Editor → 다음 파일 복사-붙여넣기-실행
sql/087-notifications-deprecate-unused-tables-2026.sql
```

**확인**:
```sql
-- 이전 테이블명 사용 불가
SELECT * FROM notification_templates;
-- 오류: relation "notification_templates" does not exist

-- 백업/Deprecated 테이블 확인
SELECT tablename FROM pg_tables 
WHERE tablename LIKE '%notification%'
ORDER BY tablename;
-- 결과: 
--   _backup_notification_reads_20260517
--   _backup_notification_templates_20260517
--   _deprecated_notification_reads_20260517
--   _deprecated_notification_templates_20260517
--   business_notifications (활성)
--   customer_notifications (활성)
--   notifications (활성)
--   payment_notifications (활성)
--   push_subscriptions (활성)
```

**1개월 후 완전 삭제** (2026.06.17):
```sql
-- 수동 실행 필요 (자동 아님)
DROP TABLE IF EXISTS _deprecated_notification_templates_20260517;
DROP TABLE IF EXISTS _deprecated_notification_reads_20260517;
DROP TABLE IF EXISTS _backup_notification_templates_20260517;
DROP TABLE IF EXISTS _backup_notification_reads_20260517;
```

---

### Step 4: Admin 앱 재배포 (F 마이그레이션)
**목적**: Payment Cron 활성화 (매일 09:00 KST 미결제 알림 자동 생성)

```powershell
# 터미널에서 (모노레포 루트)
cd c:\SHT-DATA\sht-platform\apps\admin

# Cron 활성화 (vercel.json 자동 배포)
vercel deploy --prod --archive=tgz --yes
```

**배포 확인**:
1. Vercel Dashboard → Admin 프로젝트 → Deployments
2. 최신 배포 선택 → "Crons" 탭
3. `/api/cron/payment-notifications-generate` 표시 확인

**Cron 실행 로그** (Vercel Dashboard):
1. Admin 프로젝트 → Functions → Crons
2. `/api/cron/payment-notifications-generate` 클릭
3. 최근 실행 기록 + 결과 확인

---

## 🔧 트러블슈팅

### Q1: "violates check constraint notifications_priority_check" 오류
**원인**: 한글 priority 값 INSERT 시도 (예: `'긴급'`, `'높음'`)  
**해결**:
```typescript
// ❌ 잘못됨
priority: '긴급'

// ✅ 올바름
priority: 'urgent'
```

**변환표**:
| 한글 | 영문 |
|-----|------|
| 낮음 | low |
| 보통/일반/중간 | normal |
| 높음 | high |
| 긴급/매우높음 | urgent |

---

### Q2: "violates check constraint notifications_status_check" 오류
**원인**: 한글 status 값 UPDATE 시도 (예: `'읽음'`, `'처리중'`)  
**해결**:
```typescript
// ❌ 잘못됨
status: '읽음'

// ✅ 올바름
status: 'read'
```

**변환표**:
| 한글 | 영문 |
|-----|------|
| 읽지않음/미읽음/신규 | unread |
| 읽음/확인 | read |
| 처리중/진행중 | processing |
| 완료/처리완료 | completed |
| 무시/무시됨/취소 | dismissed |

---

### Q3: GlobalNotificationPopup에 어제 알림까지 표시됨
**원인**: `gte('created_at', todayStart)` 필터 미적용 (C 마이그레이션 미완료)  
**해결**:
```typescript
// ❌ 잘못됨
const { data } = await supabase
  .from('notifications')
  .select('*')
  .neq('status', 'completed')
  .limit(50);

// ✅ 올바름
const todayStart = new Date();
todayStart.setHours(0, 0, 0, 0);
const todayStartIso = todayStart.toISOString();

const { data } = await supabase
  .from('notifications')
  .select('*')
  .gte('created_at', todayStartIso)    // ← 추가
  .neq('status', 'completed')
  .limit(50);
```

---

### Q4: Payment Cron이 실행되지 않음
**원인**: 
1. Admin 앱 미재배포 (vercel.json Cron 미등록)
2. CRON_SECRET 환경변수 미등록 (Vercel 프로덕션)

**해결**:
```powershell
# 1. 재배포
cd c:\SHT-DATA\sht-platform\apps\admin
vercel deploy --prod --archive=tgz --yes

# 2. CRON_SECRET 등록 (필수)
vercel env add CRON_SECRET --prod
# (값 입력)
```

**수동 테스트**:
```bash
# 로컬에서 테스트
curl -X GET http://localhost:3004/api/cron/payment-notifications-generate \
  -H "Authorization: Bearer <CRON_SECRET>"

# Vercel 프로덕션에서 테스트
curl -X GET https://admin.staycruise.kr/api/cron/payment-notifications-generate \
  -H "Authorization: Bearer <CRON_SECRET>"
```

---

### Q5: Payment Cron에서 "ERROR: insert or update on table "payment_notifications" violates foreign key"
**원인**: 존재하지 않는 `reservation_id` INSERT 시도  
**해결**:
```typescript
// ❌ 위험
const { error } = await supabase
  .from('payment_notifications')
  .insert({
    reservation_id: 999999,  // ← 존재하지 않음
    notification_type: 'payment_due',
    ...
  });

// ✅ 안전
const { data: exists } = await supabase
  .from('reservation')
  .select('re_id', { count: 'exact' })
  .eq('re_id', reservationId)
  .single();

if (exists) {
  await supabase.from('payment_notifications').insert({...});
}
```

---

### Q6: Manager1 알림 페이지 접근 불가 (404)
**원인**: A 마이그레이션 미완료 (manager1 파일 복사 미실행)  
**해결**:
```powershell
# 파일 복사 (PowerShell)
New-Item -ItemType Directory -Force -Path apps\manager1\app\manager\notifications | Out-Null
Copy-Item apps\manager\src\app\manager\notifications\page.tsx apps\manager1\app\manager\notifications\page.tsx -Force
Copy-Item apps\manager\src\lib\notificationFeature.ts apps\manager1\lib\notificationFeature.ts -Force
Copy-Item apps\manager\src\components\SendNotificationModal.tsx apps\manager1\components\SendNotificationModal.tsx -Force

# Sidebar 수동 추가 (필요 시)
# apps/manager1/components/ManagerSidebar.tsx에서 NavItem 확인
```

---

## ✅ 체크리스트

### 배포 전
- [ ] A 마이그레이션: manager1 파일 복사 완료
- [ ] B 마이그레이션: SQL 086 준비 완료
- [ ] C 마이그레이션: GlobalNotificationPopup 코드 검증
- [ ] E 마이그레이션: SQL 087 준비 완료
- [ ] F 마이그레이션: Admin Cron 코드 준비 완료

### Supabase SQL 실행 (순서대로)
- [ ] sql/085-notifications-perf-indexes-2026.sql 실행
- [ ] sql/086-notifications-normalize-values-2026.sql 실행
- [ ] sql/087-notifications-deprecate-unused-tables-2026.sql 실행
- [ ] 정규화 확인 쿼리 실행 (status/priority 값 확인)

### Admin 앱 배포
- [ ] CRON_SECRET 환경변수 등록 (Vercel production)
- [ ] `vercel deploy --prod` 실행
- [ ] Vercel Dashboard에서 Crons 탭 확인

### 기능 검증
- [ ] Manager 알림 페이지 접근 (`/manager/notifications`)
- [ ] Manager1 알림 페이지 접근 (`manager1.staycruise.kr/manager/notifications`)
- [ ] Manager1 사이드바에 🔔 알림 관리 항목 표시
- [ ] 팝업 미표시 확인 (전역/페이지 모두 비활성화)
- [ ] SendNotificationModal 전송 (영문 priority 확인)
- [ ] Payment Cron 실행 (매일 09:00 KST)

### 모니터링 (배포 후)
- [ ] Manager UI — 알림 목록 로딩 시간 < 2초
- [ ] Admin 대시보드 — Cron 실행 로그 확인
- [ ] Payment Notifications 테이블 — 매일 INSERT 행 카운트 확인
- [ ] Supabase Logs — 오류 메시지 모니터링

---

## 📚 참고 자료

### 관련 파일
- 지침: `.github/instructions/notifications-management-guide.instructions.md` (현재)
- DB 마이그레이션: `sql/085-087-notifications-*.sql`
- Manager UI: `apps/manager/src/app/manager/notifications/page.tsx`
- Manager1 UI: `apps/manager1/app/manager/notifications/page.tsx`
- Admin Cron: `apps/admin/app/api/cron/payment-notifications-generate/route.ts`
- 컴포넌트: `apps/*/components/*Notification*.tsx`

### 외부 문서
- Supabase RLS: https://supabase.com/docs/guides/auth/row-level-security
- Web Push API: https://developer.mozilla.org/en-US/docs/Web/API/Push_API
- VAPID Keys: https://tools.ietf.org/html/draft-thomson-webpush-vapid

### 사전 성능 최적화
- **30,000행 쿼리** → **인덱스 추가** (85번 SQL) → **50ms 달성**
- **60초 폴링** → **5분 폴링** (300,000ms)
- **완료 알림 누적** → **status != 'completed' 필터** + **오늘 필터**
- **한글/영문 혼재** → **영문 표준** + **CHECK 제약**
