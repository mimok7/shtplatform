-- =============================================================
-- 080: push_subscriptions 테이블 생성 (Web Push 구독 정보 저장)
-- =============================================================
-- 실행 위치: Supabase Dashboard → SQL Editor
-- 작성일: 2026.05.16

-- ───────────────────────────────────────────────
-- 1. push_subscriptions 테이블
-- ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  endpoint    TEXT UNIQUE NOT NULL,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  app_name    TEXT,          -- 어느 앱에서 구독했는지 (customer/manager/partner 등)
  user_agent  TEXT,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

-- ───────────────────────────────────────────────
-- 2. 인덱스
-- ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id  ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_is_active ON push_subscriptions(is_active);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_app_name  ON push_subscriptions(app_name);

-- ───────────────────────────────────────────────
-- 3. RLS 활성화
-- ───────────────────────────────────────────────
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- 본인 구독만 조회 가능
CREATE POLICY "push_subscriptions: user can view own"
  ON push_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- 본인 구독 등록 가능
CREATE POLICY "push_subscriptions: user can insert own"
  ON push_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 본인 구독 삭제 가능
CREATE POLICY "push_subscriptions: user can delete own"
  ON push_subscriptions FOR DELETE
  USING (auth.uid() = user_id);

-- 서비스 롤은 모든 구독 조회 가능 (admin/manager가 푸시 발송 시 사용)
CREATE POLICY "push_subscriptions: service_role full access"
  ON push_subscriptions FOR ALL
  USING (auth.role() = 'service_role');
