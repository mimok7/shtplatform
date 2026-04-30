-- ============================================================
-- 제휴업체(Partner) 시스템 신규 테이블 + RLS + 인덱스
-- 작성일: 2026-04-30
-- 범위: 호텔/숙박 카테고리 우선 (구조는 카테고리 자유 확장)
-- 정책: 기존 reservation/* 테이블 미수정. partner_* 신규 테이블로 완전 분리.
-- ============================================================

BEGIN;

-- 1) partner — 제휴업체 마스터 ----------------------------------
CREATE TABLE IF NOT EXISTS partner (
    partner_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_code    text UNIQUE NOT NULL,
    name            text NOT NULL,
    category        text NOT NULL DEFAULT 'hotel',  -- 'hotel','tour','rentcar' ...
    region          text,
    address         text,
    contact_name    text,
    contact_phone   text,
    contact_email   text,
    description     text,
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 2) partner_service — 업체별 판매 서비스(객실/플랜) -----------
CREATE TABLE IF NOT EXISTS partner_service (
    service_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id      uuid NOT NULL REFERENCES partner(partner_id) ON DELETE CASCADE,
    service_type    text NOT NULL DEFAULT 'room',   -- 'room','suite','dorm' ...
    service_name    text NOT NULL,
    description     text,
    capacity        int,
    default_price   numeric(14,2) NOT NULL DEFAULT 0,
    currency        text NOT NULL DEFAULT 'VND',
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 3) partner_price — 시즌·기간별 가격 (크루즈 패턴) ------------
CREATE TABLE IF NOT EXISTS partner_price (
    price_code      text PRIMARY KEY,
    service_id      uuid NOT NULL REFERENCES partner_service(service_id) ON DELETE CASCADE,
    valid_from      date,
    valid_to        date,
    price           numeric(14,2) NOT NULL,
    condition_label text,                   -- '주중','주말','성수기' 등
    note            text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- 4) partner_user — 제휴업체 담당자 매핑 (다대일) --------------
CREATE TABLE IF NOT EXISTS partner_user (
    pu_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pu_user_id      uuid NOT NULL UNIQUE,           -- = users.id (auth.uid)
    pu_partner_id   uuid NOT NULL REFERENCES partner(partner_id) ON DELETE CASCADE,
    role            text NOT NULL DEFAULT 'staff',  -- 'staff','manager'
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- 5) partner_reservation — 메인 예약 ----------------------------
CREATE TABLE IF NOT EXISTS partner_reservation (
    pr_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pr_user_id      uuid NOT NULL,                   -- = users.id (예약자)
    pr_partner_id   uuid NOT NULL REFERENCES partner(partner_id) ON DELETE RESTRICT,
    pr_service_id   uuid NOT NULL REFERENCES partner_service(service_id) ON DELETE RESTRICT,
    pr_price_code   text REFERENCES partner_price(price_code) ON DELETE SET NULL,
    checkin_date    date NOT NULL,
    checkout_date   date NOT NULL,
    nights          int NOT NULL DEFAULT 1,
    guest_count     int NOT NULL DEFAULT 1,
    room_count      int NOT NULL DEFAULT 1,
    unit_price      numeric(14,2) NOT NULL DEFAULT 0,
    total_price     numeric(14,2) NOT NULL DEFAULT 0,
    currency        text NOT NULL DEFAULT 'VND',
    status          text NOT NULL DEFAULT 'pending', -- pending|confirmed|cancelled|completed
    request_note    text,
    contact_name    text,
    contact_phone   text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 6) users.role 확장: 'partner' 허용 ----------------------------
-- 기존 check 제약이 있다면 ALTER 필요 (없으면 무해)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage
        WHERE table_name='users' AND column_name='role'
    ) THEN
        BEGIN
            ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
        EXCEPTION WHEN others THEN NULL;
        END;
    END IF;
END$$;

-- 7) 인덱스 ----------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_partner_active            ON partner(is_active, category);
CREATE INDEX IF NOT EXISTS idx_partner_service_partner   ON partner_service(partner_id, is_active);
CREATE INDEX IF NOT EXISTS idx_partner_price_service     ON partner_price(service_id, valid_from, valid_to);
CREATE INDEX IF NOT EXISTS idx_partner_user_user         ON partner_user(pu_user_id);
CREATE INDEX IF NOT EXISTS idx_partner_user_partner      ON partner_user(pu_partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_res_user          ON partner_reservation(pr_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_partner_res_partner_date  ON partner_reservation(pr_partner_id, checkin_date);
CREATE INDEX IF NOT EXISTS idx_partner_res_status_date   ON partner_reservation(status, checkin_date);

-- 8) RLS 활성화 ------------------------------------------------
ALTER TABLE partner             ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_service     ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_price       ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_user        ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_reservation ENABLE ROW LEVEL SECURITY;

-- 9) 정책: 헬퍼 (사용자 role 조회) -------------------------------
-- users 테이블은 이미 존재한다고 가정. role 컬럼에 'guest','member','partner','manager','admin'
-- 매니저/관리자 판별을 위한 EXISTS 서브쿼리를 직접 사용한다(함수 생성 없이).

-- ----- partner 정책 -----
DROP POLICY IF EXISTS partner_select_all     ON partner;
DROP POLICY IF EXISTS partner_admin_all      ON partner;
CREATE POLICY partner_select_all ON partner
    FOR SELECT TO authenticated
    USING (true);
CREATE POLICY partner_admin_all ON partner
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('manager','admin')))
    WITH CHECK (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('manager','admin')));

-- ----- partner_service 정책 -----
DROP POLICY IF EXISTS partner_service_select_all ON partner_service;
DROP POLICY IF EXISTS partner_service_admin_all  ON partner_service;
CREATE POLICY partner_service_select_all ON partner_service
    FOR SELECT TO authenticated
    USING (true);
CREATE POLICY partner_service_admin_all ON partner_service
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('manager','admin')))
    WITH CHECK (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('manager','admin')));

-- ----- partner_price 정책 -----
DROP POLICY IF EXISTS partner_price_select_all ON partner_price;
DROP POLICY IF EXISTS partner_price_admin_all  ON partner_price;
CREATE POLICY partner_price_select_all ON partner_price
    FOR SELECT TO authenticated
    USING (true);
CREATE POLICY partner_price_admin_all ON partner_price
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('manager','admin')))
    WITH CHECK (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('manager','admin')));

-- ----- partner_user 정책 -----
DROP POLICY IF EXISTS partner_user_self_select ON partner_user;
DROP POLICY IF EXISTS partner_user_admin_all   ON partner_user;
CREATE POLICY partner_user_self_select ON partner_user
    FOR SELECT TO authenticated
    USING (pu_user_id = auth.uid());
CREATE POLICY partner_user_admin_all ON partner_user
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('manager','admin')))
    WITH CHECK (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('manager','admin')));

-- ----- partner_reservation 정책 -----
-- (a) 예약자: 본인 행만 SELECT/INSERT/UPDATE
-- (b) 매니저/관리자: 전체
-- (c) 제휴업체 담당자: 자기 partner_id 예약 SELECT만
DROP POLICY IF EXISTS partner_res_owner_select   ON partner_reservation;
DROP POLICY IF EXISTS partner_res_owner_insert   ON partner_reservation;
DROP POLICY IF EXISTS partner_res_owner_update   ON partner_reservation;
DROP POLICY IF EXISTS partner_res_admin_all      ON partner_reservation;
DROP POLICY IF EXISTS partner_res_partner_select ON partner_reservation;

CREATE POLICY partner_res_owner_select ON partner_reservation
    FOR SELECT TO authenticated
    USING (pr_user_id = auth.uid());
CREATE POLICY partner_res_owner_insert ON partner_reservation
    FOR INSERT TO authenticated
    WITH CHECK (pr_user_id = auth.uid());
CREATE POLICY partner_res_owner_update ON partner_reservation
    FOR UPDATE TO authenticated
    USING (pr_user_id = auth.uid())
    WITH CHECK (pr_user_id = auth.uid());

CREATE POLICY partner_res_admin_all ON partner_reservation
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('manager','admin')))
    WITH CHECK (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role IN ('manager','admin')));

CREATE POLICY partner_res_partner_select ON partner_reservation
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM partner_user pu
            WHERE pu.pu_user_id = auth.uid()
              AND pu.pu_partner_id = partner_reservation.pr_partner_id
        )
    );

COMMIT;

-- ============================================================
-- 검증 쿼리(수동 실행 권장)
-- ============================================================
-- SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'partner%';
-- SELECT policyname, tablename FROM pg_policies WHERE tablename LIKE 'partner%';
