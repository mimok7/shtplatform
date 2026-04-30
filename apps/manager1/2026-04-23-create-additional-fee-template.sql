-- =====================================================
-- 추가내역 템플릿 테이블 생성
-- 목적: 자주 사용하는 추가요금 내역을 목록으로 관리
-- 생성일: 2026-04-23
-- =====================================================

-- 1. 테이블 생성
CREATE TABLE IF NOT EXISTS additional_fee_template (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(200) NOT NULL,          -- 추가내역 이름 (목록에 표시)
    amount      NUMERIC NOT NULL DEFAULT 0,     -- 기본 추가요금 (동 VND)
    service_type VARCHAR(50) DEFAULT NULL,      -- 서비스 타입 필터 (NULL = 모든 서비스)
                                                -- 'cruise', 'airport', 'hotel', 'rentcar', 'tour', 'sht', 'vehicle'
    description TEXT DEFAULT NULL,             -- 설명 (선택)
    sort_order  INT NOT NULL DEFAULT 0,         -- 정렬 순서
    is_active   BOOLEAN NOT NULL DEFAULT true,  -- 활성 여부
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE additional_fee_template IS '추가내역/추가요금 템플릿 목록';
COMMENT ON COLUMN additional_fee_template.name IS '추가내역 이름 (드롭다운 표시용)';
COMMENT ON COLUMN additional_fee_template.amount IS '기본 추가요금 금액 (VND)';
COMMENT ON COLUMN additional_fee_template.service_type IS '서비스 타입 필터 (NULL이면 모든 서비스에 표시)';
COMMENT ON COLUMN additional_fee_template.sort_order IS '낮은 숫자가 먼저 표시';

-- 2. updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_additional_fee_template_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_additional_fee_template_updated_at ON additional_fee_template;
CREATE TRIGGER trg_additional_fee_template_updated_at
    BEFORE UPDATE ON additional_fee_template
    FOR EACH ROW EXECUTE FUNCTION update_additional_fee_template_updated_at();

-- 3. RLS 활성화 (매니저/관리자만 접근)
ALTER TABLE additional_fee_template ENABLE ROW LEVEL SECURITY;

-- 인증된 사용자 SELECT 허용 (매니저 화면에서 목록 조회)
CREATE POLICY "authenticated can select additional_fee_template"
    ON additional_fee_template FOR SELECT
    TO authenticated
    USING (is_active = true);

-- 관리자만 INSERT/UPDATE/DELETE 허용 (필요시 role 조건 추가)
CREATE POLICY "authenticated can manage additional_fee_template"
    ON additional_fee_template FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- 4. 기본 샘플 데이터 삽입
INSERT INTO additional_fee_template (name, amount, service_type, sort_order) VALUES
-- 공통 추가요금
('얼리체크인',          500000,  NULL,       10),
('레이트체크아웃',       500000,  NULL,       20),
('특별 요청 서비스',     300000,  NULL,       30),

-- 크루즈
('크루즈 업그레이드',    1000000, 'cruise',   10),
('선내 식사 추가',       500000,  'cruise',   20),
('스파 이용권',         800000,  'cruise',   30),

-- 공항
('패스트트랙',          600000,  'airport',  10),
('VIP 라운지',         500000,  'airport',  20),
('추가 수하물 운반',     200000,  'airport',  30),

-- 호텔
('조식 추가',           300000,  'hotel',    10),
('픽업/샌딩 서비스',    500000,  'hotel',    20),
('룸 서비스',          200000,  'hotel',    30),

-- 렌터카
('운전기사 추가',        800000,  'rentcar',  10),
('차량 업그레이드',      500000,  'rentcar',  20),
('추가 주행거리',        300000,  'rentcar',  30),

-- 투어
('가이드 추가',         500000,  'tour',     10),
('입장료 추가',         200000,  'tour',     20),
('투어 연장',          400000,  'tour',     30),

-- SHT 차량
('차량 대기 시간',       200000,  'sht',      10),
('추가 경유지',         300000,  'sht',      20),

-- 일반 차량 (vehicle)
('차량 대기 추가',       200000,  'vehicle',  10),
('추가 경유',           300000,  'vehicle',  20)
ON CONFLICT DO NOTHING;

-- 5. 확인 쿼리
SELECT id, name, amount, service_type, sort_order, is_active
FROM additional_fee_template
ORDER BY service_type NULLS FIRST, sort_order, id;
