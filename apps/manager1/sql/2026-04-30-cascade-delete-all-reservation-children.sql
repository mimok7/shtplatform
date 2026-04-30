-- =========================================================================
-- 예약 삭제 시 모든 서비스 자식 테이블이 자동 삭제되도록 FK CASCADE 일괄 적용
-- 대상: reservation_cruise, reservation_cruise_car, reservation_car_sht,
--       reservation_airport, reservation_hotel, reservation_tour,
--       reservation_rentcar, reservation_package
-- 참조 컬럼: reservation_id → reservation.re_id  (모두 동일 규칙)
-- 적용일: 2026-04-30
-- 안전성: 재실행 가능 (idempotent). 기존 동일 컬럼 FK는 모두 제거 후 재생성.
-- =========================================================================

DO $$
DECLARE
    child RECORD;
    fk_name TEXT;
    fk_rec RECORD;
BEGIN
    FOR child IN
        SELECT t.table_name
        FROM information_schema.tables t
        WHERE t.table_schema = 'public'
          AND t.table_name IN (
            'reservation_cruise',
            'reservation_cruise_car',
            'reservation_car_sht',
            'reservation_airport',
            'reservation_hotel',
            'reservation_tour',
            'reservation_rentcar',
            'reservation_package'
          )
    LOOP
        -- reservation_id 컬럼이 없으면 스킵
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='public'
              AND table_name = child.table_name
              AND column_name = 'reservation_id'
        ) THEN
            RAISE NOTICE '⏭  % : reservation_id 컬럼 없음 → 스킵', child.table_name;
            CONTINUE;
        END IF;

        -- 기존 reservation_id FK 모두 제거
        FOR fk_rec IN
            SELECT tc.constraint_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema   = kcu.table_schema
            WHERE tc.table_schema = 'public'
              AND tc.table_name   = child.table_name
              AND tc.constraint_type = 'FOREIGN KEY'
              AND kcu.column_name = 'reservation_id'
        LOOP
            EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I',
                           child.table_name, fk_rec.constraint_name);
            RAISE NOTICE '🗑  % : 기존 FK % 제거', child.table_name, fk_rec.constraint_name;
        END LOOP;

        -- CASCADE FK 재생성
        fk_name := 'fk_' || child.table_name || '_reservation_id';
        EXECUTE format(
            'ALTER TABLE public.%I
                ADD CONSTRAINT %I
                FOREIGN KEY (reservation_id)
                REFERENCES public.reservation(re_id)
                ON DELETE CASCADE',
            child.table_name, fk_name
        );
        RAISE NOTICE '✅ % : %  ON DELETE CASCADE 적용 완료', child.table_name, fk_name;
    END LOOP;
END$$;

-- =========================================================================
-- 적용 결과 검증
-- =========================================================================
SELECT
    tc.table_name             AS child_table,
    kcu.column_name           AS child_column,
    ccu.table_name            AS parent_table,
    ccu.column_name           AS parent_column,
    rc.delete_rule            AS on_delete,
    tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
 AND tc.table_schema   = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints rc
  ON rc.constraint_name  = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema    = 'public'
  AND tc.table_name IN (
    'reservation_cruise',
    'reservation_cruise_car',
    'reservation_car_sht',
    'reservation_airport',
    'reservation_hotel',
    'reservation_tour',
    'reservation_rentcar',
    'reservation_package'
  )
  AND kcu.column_name = 'reservation_id'
ORDER BY tc.table_name;

-- =========================================================================
-- (옵션) 이미 고아가 된 자식 행 정리: reservation에 부모가 없는 행 삭제
-- 필요 시 주석 해제 후 1회 실행
-- =========================================================================
-- DELETE FROM reservation_car_sht    WHERE reservation_id NOT IN (SELECT re_id FROM reservation);
-- DELETE FROM reservation_cruise     WHERE reservation_id NOT IN (SELECT re_id FROM reservation);
-- DELETE FROM reservation_cruise_car WHERE reservation_id NOT IN (SELECT re_id FROM reservation);
-- DELETE FROM reservation_airport    WHERE reservation_id NOT IN (SELECT re_id FROM reservation);
-- DELETE FROM reservation_hotel      WHERE reservation_id NOT IN (SELECT re_id FROM reservation);
-- DELETE FROM reservation_tour       WHERE reservation_id NOT IN (SELECT re_id FROM reservation);
-- DELETE FROM reservation_rentcar    WHERE reservation_id NOT IN (SELECT re_id FROM reservation);
-- DELETE FROM reservation_package    WHERE reservation_id NOT IN (SELECT re_id FROM reservation);
