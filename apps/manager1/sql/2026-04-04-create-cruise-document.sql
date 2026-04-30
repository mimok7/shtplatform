-- ============================================================
-- cruise_document 테이블 생성
-- 여권 사진 및 승선코드 이미지 저장용
-- 크루즈 체크아웃 후 3일 경과 시 자동 삭제 대상
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS cruise_document (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    reservation_id uuid,
    document_type text NOT NULL CHECK (document_type IN ('passport', 'boarding_code')),
    image_data text NOT NULL,
    checkout_date date,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_cruise_document_user_id ON cruise_document(user_id);
CREATE INDEX IF NOT EXISTS idx_cruise_document_reservation_id ON cruise_document(reservation_id) WHERE reservation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cruise_document_type ON cruise_document(document_type);
CREATE INDEX IF NOT EXISTS idx_cruise_document_checkout ON cruise_document(checkout_date) WHERE checkout_date IS NOT NULL;

-- 유니크 제약: 동일 사용자의 여권은 1개, 동일 예약의 승선코드 이미지는 1개
CREATE UNIQUE INDEX IF NOT EXISTS idx_cruise_document_passport_user
    ON cruise_document(user_id) WHERE document_type = 'passport';
CREATE UNIQUE INDEX IF NOT EXISTS idx_cruise_document_boarding_reservation
    ON cruise_document(reservation_id) WHERE document_type = 'boarding_code' AND reservation_id IS NOT NULL;

-- RLS 활성화
ALTER TABLE cruise_document ENABLE ROW LEVEL SECURITY;

-- RLS 정책: 인증된 사용자는 자신의 문서만 조회/삽입/수정/삭제
CREATE POLICY cruise_document_select ON cruise_document
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY cruise_document_insert ON cruise_document
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY cruise_document_update ON cruise_document
    FOR UPDATE TO authenticated
    USING (true);

CREATE POLICY cruise_document_delete ON cruise_document
    FOR DELETE TO authenticated
    USING (true);

COMMIT;

-- ============================================================
-- 검증 쿼리
-- ============================================================
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'cruise_document'
-- ORDER BY ordinal_position;
