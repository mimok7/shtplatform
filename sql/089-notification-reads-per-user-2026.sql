-- ============================================================
-- 089: 계정별(사용자별) 알림 읽음 추적 테이블 재활성화
-- 목적:
--   - notifications.status는 completed/processing/dismissed (글로벌 업무 상태)만 담당
--   - read/unread는 notification_reads 테이블에서 사용자별로 추적
--   - A 계정에서 읽어도 B 계정은 미읽음 유지
-- 적용 앱: mobile, manager, manager1 (알림 페이지 코드와 연계)
-- 생성일: 2026-05-21
-- 적용: Supabase Dashboard → SQL Editor
-- ============================================================

BEGIN;

-- ============================================================
-- 1) 기존 deprecated 테이블 백업 (이미 없으면 무시)
-- ============================================================
-- _deprecated_notification_reads_20260517 은 이미 존재할 수 있음 → 그대로 보존

-- ============================================================
-- 2) notification_reads 테이블 재생성 (없을 때만)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notification_reads (
  id            uuid                      DEFAULT gen_random_uuid() PRIMARY KEY,
  notification_id uuid                   NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id       uuid                      NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at       timestamptz               NOT NULL DEFAULT now(),
  UNIQUE (notification_id, user_id)
);

COMMENT ON TABLE public.notification_reads IS
  '사용자별 알림 읽음 기록. notification.status에서 read/unread 역할을 대체.';

-- ============================================================
-- 3) 인덱스
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_notification_reads_user_id
  ON public.notification_reads(user_id);

CREATE INDEX IF NOT EXISTS idx_notification_reads_notification_id
  ON public.notification_reads(notification_id);

CREATE INDEX IF NOT EXISTS idx_notification_reads_user_noti
  ON public.notification_reads(user_id, notification_id);

-- ============================================================
-- 4) RLS 활성화
-- ============================================================
ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;

-- 기존 정책 초기화 (재실행 안전)
DROP POLICY IF EXISTS "Users can view own reads"    ON public.notification_reads;
DROP POLICY IF EXISTS "Users can insert own reads"  ON public.notification_reads;
DROP POLICY IF EXISTS "Users can delete own reads"  ON public.notification_reads;
DROP POLICY IF EXISTS "Managers can view all reads" ON public.notification_reads;

-- 본인 읽음 기록만 조회 가능
CREATE POLICY "Users can view own reads"
  ON public.notification_reads
  FOR SELECT
  USING (auth.uid() = user_id);

-- 본인 읽음 기록만 삽입 가능
CREATE POLICY "Users can insert own reads"
  ON public.notification_reads
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 본인 읽음 기록만 삭제 가능 (선택적으로 미읽음 복원 시 사용)
CREATE POLICY "Users can delete own reads"
  ON public.notification_reads
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 5) 기존 notifications.status = 'read' 인 레코드 마이그레이션
--    → 모든 사용자에 대해 읽음 기록이 없으므로 미읽음으로 리셋
--    (신규 방식으로 전환하므로 이전 'read' 상태는 'unread'으로 초기화)
-- ============================================================
-- 기존에 read로 처리된 알림은 글로벌 상태이므로 per-user 방식으로는 의미 없음.
-- 완전 초기화 대신, read 상태를 그대로 두면 
-- "notifications.status = 'read'인데 notification_reads에 행이 없음"
-- → 코드에서는 notification_reads 기준으로 판단하므로 자동으로 'unread'로 보임.
-- 별도 데이터 변경 불필요.

COMMIT;

-- ============================================================
-- 검증 쿼리
-- ============================================================
-- SELECT table_name, column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'notification_reads'
-- ORDER BY ordinal_position;
--
-- SELECT schemaname, tablename, policyname, cmd
-- FROM pg_policies
-- WHERE tablename = 'notification_reads';
