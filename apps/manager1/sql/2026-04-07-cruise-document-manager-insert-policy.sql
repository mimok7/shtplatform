-- ============================================================
-- cruise_document INSERT 정책 보강
-- 목적: 매니저/관리자가 고객 여권/승선코드를 업로드할 수 있도록 허용
-- ============================================================

BEGIN;

DROP POLICY IF EXISTS cruise_document_insert ON cruise_document;

CREATE POLICY cruise_document_insert ON cruise_document
    FOR INSERT TO authenticated
    WITH CHECK (
        (
            user_id = auth.uid()
            AND (
                document_type <> 'passport'
                OR reservation_id IS NOT NULL
            )
        )
        OR (
            EXISTS (
                SELECT 1
                FROM users u
                WHERE u.id = auth.uid()
                  AND u.role IN ('manager', 'admin')
            )
            AND (
                document_type <> 'passport'
                OR reservation_id IS NOT NULL
            )
        )
    );

COMMIT;
