-- ============================================================================
-- Query: Find mismatched pickup_datetime vs checkin dates
-- Purpose: Export JSON of reservations where pickup_datetime != checkin
-- ============================================================================

-- Step 1: Find mismatches with user details
SELECT 
  json_build_object(
    'mismatches', json_agg(
      json_build_object(
        'reservation_id', rc.reservation_id,
        'user_id', u.id,
        'user_name', u.name,
        'user_email', u.email,
        'user_phone', u.phone_number,
        'pickup_datetime', rcc.pickup_datetime,
        'checkin', rc.checkin,
        'difference_days', (rcc.pickup_datetime - rc.checkin)::INTEGER,
        'reservation_status', r.re_status,
        'reservation_type', r.re_type,
        'created_at', r.re_created_at,
        'cruise_details', json_build_object(
          'room_price_code', rc.room_price_code,
          'guest_count', rc.guest_count,
          'room_total_price', rc.room_total_price
        ),
        'car_details', json_build_object(
          'car_price_code', rcc.car_price_code,
          'car_count', rcc.car_count,
          'passenger_count', rcc.passenger_count,
          'pickup_location', rcc.pickup_location,
          'dropoff_location', rcc.dropoff_location,
          'car_total_price', rcc.car_total_price
        )
      )
      ORDER BY r.re_created_at DESC
    )
  ) AS export_data
FROM reservation_cruise_car rcc
INNER JOIN reservation_cruise rc ON rcc.reservation_id = rc.reservation_id
INNER JOIN reservation r ON rc.reservation_id = r.re_id
INNER JOIN users u ON r.re_user_id = u.id
WHERE rcc.pickup_datetime IS NOT NULL
  AND rc.checkin IS NOT NULL
  AND rcc.pickup_datetime != rc.checkin;

-- ============================================================================
-- Alternative: Row-based format (easier for CSV export)
-- ============================================================================
-- SELECT 
--   rc.reservation_id,
--   u.id as user_id,
--   u.name as user_name,
--   u.email as user_email,
--   u.phone_number as user_phone,
--   u.english_name,
--   u.nickname,
--   rcc.pickup_datetime,
--   rc.checkin,
--   (rcc.pickup_datetime - rc.checkin) as date_difference,
--   EXTRACT(DAY FROM (rcc.pickup_datetime - rc.checkin)) as difference_days,
--   r.re_status as reservation_status,
--   r.re_type as reservation_type,
--   r.re_created_at as reservation_created_at,
--   rc.room_price_code,
--   rc.guest_count,
--   rc.room_total_price,
--   rcc.car_price_code,
--   rcc.car_count,
--   rcc.passenger_count,
--   rcc.pickup_location,
--   rcc.dropoff_location,
--   rcc.car_total_price
-- FROM reservation_cruise_car rcc
-- INNER JOIN reservation_cruise rc ON rcc.reservation_id = rc.reservation_id
-- INNER JOIN reservation r ON rc.reservation_id = r.re_id
-- INNER JOIN users u ON r.re_user_id = u.id
-- WHERE rcc.pickup_datetime IS NOT NULL
--   AND rc.checkin IS NOT NULL
--   AND rcc.pickup_datetime != rc.checkin
-- ORDER BY r.re_created_at DESC;

-- ============================================================================
-- Summary count by difference
-- ============================================================================
-- SELECT 
--   (rcc.pickup_datetime - rc.checkin)::INTEGER as difference_days,
--   COUNT(*) as count,
--   json_agg(u.name) as user_names
-- FROM reservation_cruise_car rcc
-- INNER JOIN reservation_cruise rc ON rcc.reservation_id = rc.reservation_id
-- INNER JOIN reservation r ON rc.reservation_id = r.re_id
-- INNER JOIN users u ON r.re_user_id = u.id
-- WHERE rcc.pickup_datetime IS NOT NULL
--   AND rc.checkin IS NOT NULL
--   AND rcc.pickup_datetime != rc.checkin
-- GROUP BY difference_days
-- ORDER BY difference_days DESC;
