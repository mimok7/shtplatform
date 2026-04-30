-- ============================================================
-- 태영치킨 지점 구분 (branch_name) 설정
-- 작성일: 2026-05-01
-- 목적: 동일 브랜드(태영치킨) 2개 지점을 사이드바/대시보드/관리 화면에서
--       명확히 구분하기 위해 branch_name 컬럼을 채움.
-- 정책: 멱등(idempotent) — 동일 partner_code 발견 시 갱신
-- ============================================================

BEGIN;

-- 하노이 호떠이(서호) 매장
UPDATE partner
   SET branch_name = '하노이 호떠이점',
       updated_at  = now()
 WHERE partner_code = 'TAEYEONG-HN-WESTLAKE';

-- 하노이 하롱베이 배달 지점
UPDATE partner
   SET branch_name = '하노이 하롱베이점',
       updated_at  = now()
 WHERE partner_code = 'TAEYEONG-HL-DELIVERY';

COMMIT;

-- 확인 쿼리
-- SELECT partner_code, name, branch_name
--   FROM partner
--  WHERE partner_code IN ('TAEYEONG-HN-WESTLAKE','TAEYEONG-HL-DELIVERY')
--  ORDER BY partner_code;
