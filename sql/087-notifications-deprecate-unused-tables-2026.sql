-- ============================================================
-- 알림 시스템 미사용 테이블 정리 (2026-05)
-- 목적: 코드 호출 0건인 테이블을 안전하게 deprecate (rename → 1개월 후 DROP)
-- 안전: DROP 하지 않고 _deprecated_ 접두사 부착 + 백업
-- 적용: Supabase Dashboard → SQL Editor
-- ============================================================

-- 점검 결과 (코드 grep 기준):
--   notification_templates  : 0 references → safe to deprecate
--   notification_reads      : 0 references → safe to deprecate
--   business_notifications  : GlobalNotificationPopup join + DB trigger 사용 가능성 → 유지
--   customer_notifications  : SendNotificationModal insert + popup join → 유지

-- 1. 백업 (FULL COPY)
CREATE TABLE IF NOT EXISTS _backup_notification_templates_20260517
  AS SELECT *, NOW() AS _snapshot_at FROM notification_templates;

CREATE TABLE IF NOT EXISTS _backup_notification_reads_20260517
  AS SELECT *, NOW() AS _snapshot_at FROM notification_reads;

-- 2. RENAME (즉시 사용 차단, 데이터는 보존)
ALTER TABLE IF EXISTS notification_templates
  RENAME TO _deprecated_notification_templates_20260517;

ALTER TABLE IF EXISTS notification_reads
  RENAME TO _deprecated_notification_reads_20260517;

-- 3. (선택) 1개월 후 완전 삭제
-- DROP TABLE IF EXISTS _deprecated_notification_templates_20260517;
-- DROP TABLE IF EXISTS _deprecated_notification_reads_20260517;
-- DROP TABLE IF EXISTS _backup_notification_templates_20260517;
-- DROP TABLE IF EXISTS _backup_notification_reads_20260517;

-- ============================================================
-- 롤백 (응급)
-- ============================================================
-- ALTER TABLE _deprecated_notification_templates_20260517 RENAME TO notification_templates;
-- ALTER TABLE _deprecated_notification_reads_20260517 RENAME TO notification_reads;
