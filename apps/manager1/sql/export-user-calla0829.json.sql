-- Export JSON for user `calla0829@hanmail.net` (최성운)
-- Returns user info and related cruise + car reservation rows

WITH user_rows AS (
  SELECT
    u.id AS user_id,
    u.name,
    u.email,
    rc.reservation_id AS cruise_reservation_id,
    rc.checkin,
    rcc.id AS car_row_id,
    rcc.pickup_datetime,
    CASE WHEN rcc.pickup_datetime IS NOT NULL THEN (rcc.pickup_datetime - rc.checkin)::INTEGER ELSE NULL END AS difference_days,
    r.re_status,
    r.re_type,
    r.re_created_at,
    rc.room_price_code,
    rc.guest_count,
    rc.room_total_price,
    rcc.car_price_code,
    rcc.car_count,
    rcc.passenger_count,
    rcc.pickup_location,
    rcc.dropoff_location,
    rcc.car_total_price
  FROM users u
  JOIN reservation r ON u.id = r.re_user_id
  JOIN reservation_cruise rc ON r.re_id = rc.reservation_id
  LEFT JOIN reservation_cruise_car rcc ON rc.reservation_id = rcc.reservation_id
  WHERE u.email = 'calla0829@hanmail.net' OR u.name = '최성운'
)

SELECT json_build_object(
  'user', json_build_object('id', user_id, 'name', name, 'email', email),
  'reservations', json_agg(reservation_row ORDER BY reservation_row->>'checkin' DESC)
) AS result
FROM (
  SELECT
    user_id,
    name,
    email,
    json_build_object(
      'cruise_reservation_id', cruise_reservation_id,
      'checkin', to_char(checkin, 'YYYY-MM-DD'),
      'pickup_datetime', CASE WHEN pickup_datetime IS NOT NULL THEN to_char(pickup_datetime, 'YYYY-MM-DD') ELSE NULL END,
      'difference_days', difference_days,
      'reservation_status', re_status,
      'reservation_type', re_type,
      'created_at', to_char(re_created_at, 'YYYY-MM-DD HH24:MI:SS'),
      'cruise', json_build_object('room_price_code', room_price_code, 'guest_count', guest_count, 'room_total_price', room_total_price),
      'car', json_build_object('car_row_id', car_row_id, 'car_price_code', car_price_code, 'car_count', car_count, 'passenger_count', passenger_count, 'pickup_location', pickup_location, 'dropoff_location', dropoff_location, 'car_total_price', car_total_price)
    ) AS reservation_row
  FROM user_rows
) s
GROUP BY user_id, name, email;
