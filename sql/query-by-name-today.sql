-- Usage examples:
-- 1) 생성일 기준 검색
--    SET database_url = 'postgres://user:pass@host:5432/db';
--    -- or set env var and use psql
--    NAME='박선형' psql "$DATABASE_URL" -f query-by-name-today.sql
--
-- 2) 체크인(오늘) 기준 검색: set MODE=checkin and call the script

-- 생성일(오늘) 기준
SELECT
  r.re_id,
  r.re_type,
  r.re_status,
  r.re_created_at,
  u.name,
  u.email,
  u.phone_number
FROM reservation r
LEFT JOIN users u ON u.id = r.re_user_id
WHERE r.re_created_at::date = current_date
  AND (u.name ILIKE '%박선형%')
ORDER BY r.re_created_at DESC;

-- 체크인(오늘) 기준 예시 (크루즈/호텔 등)
-- SELECT
--   r.re_id,
--   r.re_type,
--   r.re_status,
--   COALESCE(rc.checkin, rh.checkin) AS checkin,
--   u.name,
--   u.email,
--   u.phone_number
-- FROM reservation r
-- LEFT JOIN users u ON u.id = r.re_user_id
-- LEFT JOIN reservation_cruise rc ON rc.reservation_id = r.re_id
-- LEFT JOIN reservation_hotel rh ON rh.reservation_id = r.re_id
-- WHERE (rc.checkin::date = current_date OR rh.checkin::date = current_date)
--   AND u.name ILIKE '%박선형%'
-- ORDER BY checkin NULLS FIRST;
