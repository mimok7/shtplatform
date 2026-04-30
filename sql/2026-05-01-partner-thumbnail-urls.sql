-- ============================================================
-- 제휴업체 썸네일 이미지 일괄 등록
-- 작성일: 2026-05-01
-- 대상 경로: /images/partners/<file>  (apps/partner/public/images/partners/)
-- 정책: 멱등(idempotent) — 동일 partner_code 발견 시 thumbnail_url 갱신
-- ============================================================

BEGIN;

UPDATE partner SET thumbnail_url = '/images/partners/nhamnham.gif', updated_at = now()
WHERE partner_code = 'NHAMNHAM-HL-001';

UPDATE partner SET thumbnail_url = '/images/partners/solcafe.gif', updated_at = now()
WHERE partner_code = 'SOLCAFE-HL-001';

UPDATE partner SET thumbnail_url = '/images/partners/taeyeong.gif', updated_at = now()
WHERE partner_code = 'TAEYEONG-HN-WESTLAKE';

UPDATE partner SET thumbnail_url = '/images/partners/taeyeong.gif', updated_at = now()
WHERE partner_code = 'TAEYEONG-HL-DELIVERY';

UPDATE partner SET thumbnail_url = '/images/partners/mon.jpg', updated_at = now()
WHERE partner_code = 'MON-HL-NIGHTMKT';

UPDATE partner SET thumbnail_url = '/images/partners/serene.jpg', updated_at = now()
WHERE partner_code = 'SERENE-HN-001';

UPDATE partner SET thumbnail_url = '/images/partners/cucchi.jpg', updated_at = now()
WHERE partner_code = 'CUCCHI-HL-AOZAI';

COMMIT;

-- 확인 쿼리
-- SELECT partner_code, name, thumbnail_url FROM partner
-- WHERE partner_code IN ('NHAMNHAM-HL-001','SOLCAFE-HL-001','TAEYEONG-HN-WESTLAKE','TAEYEONG-HL-DELIVERY','MON-HL-NIGHTMKT','SERENE-HN-001','CUCCHI-HL-AOZAI')
-- ORDER BY partner_code;
