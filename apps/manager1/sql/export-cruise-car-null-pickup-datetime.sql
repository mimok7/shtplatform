-- ========================================
-- 크루즈 차량 예약 중 pickup_datetime이 NULL인 데이터 조회 및 내보내기
-- ========================================
-- 목적: reservation_cruise_car 테이블에서 pickup_datetime이 NULL인 예약 데이터를 
--      사용자 명(name)과 함께 조회하여 데이터 검증 및 보정 필요성 파악

-- ① 데이터 검증: NULL 데이터 확인
SELECT 
    rcc.id,
    rcc.reservation_id,
    rcc.car_price_code,
    rcc.car_count,
    rcc.passenger_count,
    rcc.pickup_datetime,
    rcc.pickup_location,
    rcc.dropoff_location,
    rcc.car_total_price,
    rcc.request_note,
    rcc.created_at,
    rcc.updated_at,
    r.re_id,
    r.re_type,
    r.re_status,
    r.re_created_at,
    u.id as user_id,
    u.email,
    u.phone_number,
    u.name as user_name,
    u.created_at as user_created_at
FROM 
    reservation_cruise_car rcc
    LEFT JOIN reservation r ON rcc.reservation_id = r.re_id
    LEFT JOIN users u ON r.re_user_id = u.id
WHERE 
    rcc.pickup_datetime IS NULL
ORDER BY 
    rcc.created_at DESC;

-- ② CSV 내보내기용 쿼리
-- 다음 쿼리 결과를 CSV로 내보내기하면 됩니다:
SELECT 
    rcc.id,
    rcc.reservation_id,
    rcc.car_price_code,
    rcc.car_count,
    rcc.passenger_count,
    rcc.pickup_datetime,
    rcc.pickup_location,
    rcc.dropoff_location,
    rcc.car_total_price,
    rcc.created_at,
    u.name as user_name,
    u.email as user_email,
    u.phone_number as user_phone,
    r.re_status as reservation_status,
    r.re_created_at as reservation_created_at
FROM 
    reservation_cruise_car rcc
    LEFT JOIN reservation r ON rcc.reservation_id = r.re_id
    LEFT JOIN users u ON r.re_user_id = u.id
WHERE 
    rcc.pickup_datetime IS NULL
ORDER BY 
    rcc.created_at DESC;

-- ③ 통계: NULL 데이터 건수
SELECT 
    COUNT(*) as null_pickup_datetime_count,
    COUNT(DISTINCT rcc.reservation_id) as affected_reservations,
    COUNT(DISTINCT r.re_user_id) as affected_users,
    MIN(rcc.created_at) as oldest_record,
    MAX(rcc.created_at) as newest_record
FROM 
    reservation_cruise_car rcc
    LEFT JOIN reservation r ON rcc.reservation_id = r.re_id
WHERE 
    rcc.pickup_datetime IS NULL;

-- ④ 예약자별 NULL 데이터 분포
SELECT 
    u.name as user_name,
    u.email,
    COUNT(*) as null_count,
    COUNT(DISTINCT rcc.reservation_id) as affected_reservations,
    MIN(rcc.created_at) as oldest_date,
    MAX(rcc.created_at) as latest_date
FROM 
    reservation_cruise_car rcc
    LEFT JOIN reservation r ON rcc.reservation_id = r.re_id
    LEFT JOIN users u ON r.re_user_id = u.id
WHERE 
    rcc.pickup_datetime IS NULL
GROUP BY 
    u.id, u.name, u.email
ORDER BY 
    null_count DESC;
