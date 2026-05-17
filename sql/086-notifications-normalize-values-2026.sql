-- ============================================================
-- 알림 status/priority/subcategory 값 정규화 (2026-05)
-- 목적: 한글/영문 혼재 → 영문 표준으로 통일
-- 안전: UPDATE만 수행, 컬럼/타입 변경 없음
-- 적용: Supabase Dashboard → SQL Editor
-- 롤백: 아래 _backup_notifications_normalize_20260517 테이블 사용
-- ============================================================

-- 1. 백업 (롤백용)
CREATE TABLE IF NOT EXISTS _backup_notifications_normalize_20260517 AS
SELECT id, status, priority, subcategory, updated_at, NOW() AS _snapshot_at
FROM notifications;

-- 2. status 정규화 (한글 → 영문)
UPDATE notifications SET status = 'unread'     WHERE status IN ('읽지않음', '미읽음', '신규');
UPDATE notifications SET status = 'read'       WHERE status IN ('읽음', '확인');
UPDATE notifications SET status = 'processing' WHERE status IN ('처리중', '진행중');
UPDATE notifications SET status = 'completed'  WHERE status IN ('완료', '처리완료');
UPDATE notifications SET status = 'dismissed'  WHERE status IN ('무시', '무시됨', '취소');

-- 3. priority 정규화 (한글 → 영문)
UPDATE notifications SET priority = 'low'    WHERE priority IN ('낮음', '낮');
UPDATE notifications SET priority = 'normal' WHERE priority IN ('보통', '일반', '중간');
UPDATE notifications SET priority = 'high'   WHERE priority IN ('높음', '높');
UPDATE notifications SET priority = 'urgent' WHERE priority IN ('긴급', '매우높음');

-- 4. subcategory 기본값 정규화 (한글 '일반' → 영문 'general')
UPDATE notifications SET subcategory = 'general' WHERE subcategory = '일반';

-- 5. NULL/잘못된 값 안전 기본값으로
UPDATE notifications SET status = 'unread'  WHERE status IS NULL OR status NOT IN ('unread','read','processing','completed','dismissed');
UPDATE notifications SET priority = 'normal' WHERE priority IS NULL OR priority NOT IN ('low','normal','high','urgent');

-- 6. CHECK 제약 (영문값만 허용 - 향후 한글 유입 차단)
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_status_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_status_check
  CHECK (status IN ('unread','read','processing','completed','dismissed'));

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_priority_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_priority_check
  CHECK (priority IN ('low','normal','high','urgent'));

-- 7. 통계 갱신
ANALYZE notifications;

-- ============================================================
-- 결과 확인 쿼리 (선택)
-- ============================================================
-- SELECT status, COUNT(*) FROM notifications GROUP BY status ORDER BY 2 DESC;
-- SELECT priority, COUNT(*) FROM notifications GROUP BY priority ORDER BY 2 DESC;

-- ============================================================
-- 롤백 (응급 상황)
-- ============================================================
-- ALTER TABLE notifications DROP CONSTRAINT notifications_status_check;
-- ALTER TABLE notifications DROP CONSTRAINT notifications_priority_check;
-- UPDATE notifications n SET status = b.status, priority = b.priority, subcategory = b.subcategory
-- FROM _backup_notifications_normalize_20260517 b WHERE n.id = b.id;
