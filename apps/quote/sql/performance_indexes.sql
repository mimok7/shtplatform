-- 성능 최적화를 위한 데이터베이스 인덱스 추가
-- 자주 조회되는 필드에 인덱스 생성

-- 1. reservation 테이블 최적화
CREATE INDEX IF NOT EXISTS idx_reservation_user_id ON reservation(re_user_id);
CREATE INDEX IF NOT EXISTS idx_reservation_quote_id ON reservation(re_quote_id);
CREATE INDEX IF NOT EXISTS idx_reservation_status ON reservation(re_status);
CREATE INDEX IF NOT EXISTS idx_reservation_created_at ON reservation(re_created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reservation_user_created ON reservation(re_user_id, re_created_at DESC);

-- 2. reservation_cruise 테이블 최적화
CREATE INDEX IF NOT EXISTS idx_reservation_cruise_reservation_id ON reservation_cruise(reservation_id);
CREATE INDEX IF NOT EXISTS idx_reservation_cruise_room_price_code ON reservation_cruise(room_price_code);
CREATE INDEX IF NOT EXISTS idx_reservation_cruise_checkin ON reservation_cruise(checkin);

-- 3. reservation_cruise_car 테이블 최적화
CREATE INDEX IF NOT EXISTS idx_reservation_cruise_car_reservation_id ON reservation_cruise_car(reservation_id);
CREATE INDEX IF NOT EXISTS idx_reservation_cruise_car_car_price_code ON reservation_cruise_car(car_price_code);

-- 4. reservation_airport 테이블 최적화
CREATE INDEX IF NOT EXISTS idx_reservation_airport_reservation_id ON reservation_airport(reservation_id);
CREATE INDEX IF NOT EXISTS idx_reservation_airport_price_code ON reservation_airport(airport_price_code);
CREATE INDEX IF NOT EXISTS idx_reservation_airport_datetime ON reservation_airport(ra_datetime);

-- 5. reservation_hotel 테이블 최적화
CREATE INDEX IF NOT EXISTS idx_reservation_hotel_reservation_id ON reservation_hotel(reservation_id);
CREATE INDEX IF NOT EXISTS idx_reservation_hotel_price_code ON reservation_hotel(hotel_price_code);
CREATE INDEX IF NOT EXISTS idx_reservation_hotel_checkin ON reservation_hotel(checkin_date);

-- 6. reservation_rentcar 테이블 최적화
CREATE INDEX IF NOT EXISTS idx_reservation_rentcar_reservation_id ON reservation_rentcar(reservation_id);
CREATE INDEX IF NOT EXISTS idx_reservation_rentcar_price_code ON reservation_rentcar(rentcar_price_code);
CREATE INDEX IF NOT EXISTS idx_reservation_rentcar_pickup ON reservation_rentcar(pickup_datetime);

-- 7. reservation_tour 테이블 최적화
CREATE INDEX IF NOT EXISTS idx_reservation_tour_reservation_id ON reservation_tour(reservation_id);
CREATE INDEX IF NOT EXISTS idx_reservation_tour_price_code ON reservation_tour(tour_price_code);
CREATE INDEX IF NOT EXISTS idx_reservation_tour_usage_date ON reservation_tour(usage_date);

-- 8. quote 테이블 최적화
CREATE INDEX IF NOT EXISTS idx_quote_user_id ON quote(user_id);
CREATE INDEX IF NOT EXISTS idx_quote_status ON quote(status);
CREATE INDEX IF NOT EXISTS idx_quote_created_at ON quote(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quote_user_created ON quote(user_id, created_at DESC);

-- 9. quote_item 테이블 최적화
CREATE INDEX IF NOT EXISTS idx_quote_item_quote_id ON quote_item(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_item_service_type ON quote_item(service_type);
CREATE INDEX IF NOT EXISTS idx_quote_item_service_ref_id ON quote_item(service_ref_id);

-- 10. room_price 테이블 최적화 (가장 많이 조회됨)
CREATE INDEX IF NOT EXISTS idx_room_price_cruise ON room_price(cruise);
CREATE INDEX IF NOT EXISTS idx_room_price_schedule ON room_price(schedule);
CREATE INDEX IF NOT EXISTS idx_room_price_payment ON room_price(payment);
CREATE INDEX IF NOT EXISTS idx_room_price_room_category ON room_price(room_category);
CREATE INDEX IF NOT EXISTS idx_room_price_dates ON room_price(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_room_price_lookup ON room_price(cruise, schedule, start_date, end_date);

-- 11. car_price 테이블 최적화
CREATE INDEX IF NOT EXISTS idx_car_price_cruise ON car_price(cruise);
CREATE INDEX IF NOT EXISTS idx_car_price_schedule ON car_price(schedule);
CREATE INDEX IF NOT EXISTS idx_car_price_category ON car_price(car_category);
CREATE INDEX IF NOT EXISTS idx_car_price_lookup ON car_price(cruise, car_category, schedule);

-- 12. airport_price 테이블 최적화
CREATE INDEX IF NOT EXISTS idx_airport_price_category ON airport_price(airport_category);
CREATE INDEX IF NOT EXISTS idx_airport_price_route ON airport_price(airport_route);
CREATE INDEX IF NOT EXISTS idx_airport_price_car_type ON airport_price(airport_car_type);

-- 13. hotel_price 테이블 최적화
CREATE INDEX IF NOT EXISTS idx_hotel_price_name ON hotel_price(hotel_name);
CREATE INDEX IF NOT EXISTS idx_hotel_price_room_name ON hotel_price(room_name);
CREATE INDEX IF NOT EXISTS idx_hotel_price_dates ON hotel_price(start_date, end_date);

-- 14. tour_price 테이블 최적화
CREATE INDEX IF NOT EXISTS idx_tour_price_name ON tour_price(tour_name);
CREATE INDEX IF NOT EXISTS idx_tour_price_vehicle ON tour_price(tour_vehicle);
CREATE INDEX IF NOT EXISTS idx_tour_price_type ON tour_price(tour_type);

-- 15. rentcar_price 테이블 최적화
CREATE INDEX IF NOT EXISTS idx_rentcar_price_way_type ON rentcar_price(way_type);
CREATE INDEX IF NOT EXISTS idx_rentcar_price_category ON rentcar_price(category);
CREATE INDEX IF NOT EXISTS idx_rentcar_price_route ON rentcar_price(route);

-- 16. reservation_payment 테이블 최적화
CREATE INDEX IF NOT EXISTS idx_reservation_payment_reservation_id ON reservation_payment(reservation_id);
CREATE INDEX IF NOT EXISTS idx_reservation_payment_user_id ON reservation_payment(user_id);
CREATE INDEX IF NOT EXISTS idx_reservation_payment_status ON reservation_payment(payment_status);
CREATE INDEX IF NOT EXISTS idx_reservation_payment_created ON reservation_payment(created_at DESC);

-- 17. users 테이블 최적화
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- 복합 인덱스 성능 확인을 위한 주석
-- 인덱스 사용률 확인: 
-- SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch 
-- FROM pg_stat_user_indexes 
-- ORDER BY idx_scan DESC;

-- 테이블 크기 확인:
-- SELECT schemaname, tablename, 
--        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
-- FROM pg_tables
-- WHERE schemaname = 'public'
-- ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
