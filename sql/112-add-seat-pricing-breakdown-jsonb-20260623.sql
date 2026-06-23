-- reservation_car_sht 테이블에 seat_pricing_breakdown JSONB 컬럼 추가
-- 좌석군(A/B/C/ALL)별 단가와 수량, 소계를 1행에 보존하기 위한 컬럼
-- 2026-06-23

-- 1. 컬럼 추가 (이미 존재하면 무시)
ALTER TABLE reservation_car_sht
ADD COLUMN IF NOT EXISTS seat_pricing_breakdown jsonb DEFAULT '[]'::jsonb;

-- 2. 컬럼 코멘트
COMMENT ON COLUMN reservation_car_sht.seat_pricing_breakdown IS
'좌석군별 요금 내역 배열. 예: [{"bucket":"A","seats":["A1","A2"],"price_code":"SHT_A","unit_price":1050000,"quantity":2,"total_price":2100000}]';

-- 3. 기존 분리 저장 데이터 백필
-- 같은 reservation_id + sht_category에 여러 행이 있는 경우
-- (좌석군별로 쪼개어 저장한 구버전 데이터)를 1행으로 병합한다.
-- 주의: 이 스크립트는 데이터를 수정하므로 실행 전 백업 권장.

-- 3-1. 분리 저장된 그룹 파악 (확인용, 실행해도 안전)
-- SELECT reservation_id, sht_category, COUNT(*) as row_count
-- FROM reservation_car_sht
-- GROUP BY reservation_id, sht_category
-- HAVING COUNT(*) > 1
-- ORDER BY row_count DESC;

-- 3-2. 분리 저장 행을 seat_pricing_breakdown JSONB로 집계 후 대표 1행만 남기고 나머지 삭제
-- (같은 reservation_id + sht_category 내에서 created_at이 가장 오래된 행을 대표로 유지)
DO $$
DECLARE
    rec RECORD;
    merged_seats TEXT;
    merged_total NUMERIC;
    merged_pax INTEGER;
    merged_breakdown JSONB;
    keep_id UUID;
BEGIN
    -- 중복 그룹 순회
    FOR rec IN
        SELECT reservation_id, sht_category
        FROM reservation_car_sht
        GROUP BY reservation_id, sht_category
        HAVING COUNT(*) > 1
    LOOP
        -- 가장 오래된 행의 ID를 대표 행으로 선택
        SELECT id INTO keep_id
        FROM reservation_car_sht
        WHERE reservation_id = rec.reservation_id
          AND sht_category = rec.sht_category
        ORDER BY created_at ASC
        LIMIT 1;

        -- 모든 행의 좌석, 합계, 인원 집계
        SELECT
            string_agg(DISTINCT TRIM(s.seat), ',' ORDER BY TRIM(s.seat)) AS merged_seats,
            SUM(car_total_price) AS merged_total,
            SUM(passenger_count) AS merged_pax
        INTO merged_seats, merged_total, merged_pax
        FROM reservation_car_sht rcs
        CROSS JOIN LATERAL unnest(string_to_array(rcs.seat_number, ',')) AS s(seat)
        WHERE rcs.reservation_id = rec.reservation_id
          AND rcs.sht_category = rec.sht_category;

        -- seat_pricing_breakdown을 각 행의 기존 값 통합
        SELECT jsonb_agg(b ORDER BY b)
        INTO merged_breakdown
        FROM (
            SELECT DISTINCT b
            FROM reservation_car_sht,
                 jsonb_array_elements(
                     COALESCE(seat_pricing_breakdown, '[]'::jsonb)
                 ) AS b
            WHERE reservation_id = rec.reservation_id
              AND sht_category = rec.sht_category
              AND jsonb_array_length(COALESCE(seat_pricing_breakdown, '[]'::jsonb)) > 0
        ) sub;

        -- 대표 행 업데이트
        UPDATE reservation_car_sht
        SET
            seat_number = merged_seats,
            car_total_price = COALESCE(merged_total, car_total_price),
            passenger_count = COALESCE(merged_pax, passenger_count),
            seat_pricing_breakdown = COALESCE(merged_breakdown, '[]'::jsonb)
        WHERE id = keep_id;

        -- 나머지 중복 행 삭제
        DELETE FROM reservation_car_sht
        WHERE reservation_id = rec.reservation_id
          AND sht_category = rec.sht_category
          AND id <> keep_id;

        RAISE NOTICE 'Merged % rows for reservation_id=%, category=%',
            (SELECT COUNT(*) FROM reservation_car_sht WHERE reservation_id = rec.reservation_id AND sht_category = rec.sht_category),
            rec.reservation_id, rec.sht_category;
    END LOOP;
END $$;

-- 4. 완료 확인
-- SELECT reservation_id, sht_category, COUNT(*) as row_count
-- FROM reservation_car_sht
-- GROUP BY reservation_id, sht_category
-- HAVING COUNT(*) > 1;
-- 위 쿼리 결과가 0이어야 정상.
