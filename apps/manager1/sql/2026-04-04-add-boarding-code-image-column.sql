BEGIN;

ALTER TABLE reservation_cruise
ADD COLUMN IF NOT EXISTS boarding_code_image text;

COMMENT ON COLUMN reservation_cruise.boarding_code_image IS
'승선코드 이미지(base64 data URL, client-side resized JPEG)';

COMMIT;

-- 검증
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'reservation_cruise'
--   AND column_name = 'boarding_code_image';
