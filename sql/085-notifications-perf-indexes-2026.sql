-- ============================================================
-- 알림 시스템 성능 인덱스 (2026-05)
-- 목적: manager/mobile 알림 페이지 로딩 지연 해소
-- 적용: Supabase Dashboard → SQL Editor에서 실행
-- 안전: CREATE INDEX IF NOT EXISTS + CONCURRENTLY (락 최소화)
-- ============================================================

-- notifications: 알림 페이지에서 가장 빈번한 필터 조합
--   "completed가 아닌 알림을 최근순으로" + status/type/category 조합
CREATE INDEX IF NOT EXISTS idx_notifications_status_created
  ON notifications(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_type_status_created
  ON notifications(type, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_category_status_created
  ON notifications(category, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_targettable_status
  ON notifications(target_table, status);

CREATE INDEX IF NOT EXISTS idx_notifications_priority_status
  ON notifications(priority, status);

-- 부분 인덱스: 가장 자주 보는 "활성(=completed 아님)" 알림
CREATE INDEX IF NOT EXISTS idx_notifications_active_recent
  ON notifications(created_at DESC)
  WHERE status <> 'completed';

-- payment_notifications: mobile + 모달에서 자주 조회
CREATE INDEX IF NOT EXISTS idx_payment_notifications_unsent_date
  ON payment_notifications(is_sent, notification_date DESC);

CREATE INDEX IF NOT EXISTS idx_payment_notifications_reservation
  ON payment_notifications(reservation_id);

-- push_subscriptions: 알림 발송 시 app별로 조회
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_app_user
  ON push_subscriptions(app_name, user_id);

-- ============================================================
-- 통계 갱신 (인덱스 생성 후 권장)
-- ============================================================
ANALYZE notifications;
ANALYZE payment_notifications;
ANALYZE push_subscriptions;
