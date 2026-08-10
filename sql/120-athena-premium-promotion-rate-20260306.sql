-- 아테나 프리미엄 크루즈 2026 프로모션 요금을 추가하는 스크립트
-- 원본: 2026-03-06 네이버 카페 게시글. 기존 요금은 변경하지 않는다.
BEGIN;
WITH source_rows AS (
 SELECT * FROM (VALUES
 ('아테나 오션뷰'::text,4100000::numeric,3700000::numeric,4000000::numeric,4400000::numeric,7000000::numeric,true,true,1::integer),
 ('이그제큐티브 발코니'::text,4650000::numeric,3700000::numeric,4000000::numeric,4650000::numeric,7900000::numeric,true,true,2::integer),
 ('트리플 발코니'::text,4650000::numeric,3700000::numeric,NULL::numeric,NULL::numeric,NULL::numeric,false,false,3::integer),
 ('커넥팅 발코니'::text,4100000::numeric,3700000::numeric,4000000::numeric,4400000::numeric,NULL::numeric,true,false,4::integer),
 ('프리미엄 발코니 (욕조 있음)'::text,5125000::numeric,3700000::numeric,4000000::numeric,4650000::numeric,7900000::numeric,true,true,5::integer),
 ('프리미엄 발코니 (욕조 없음)'::text,4650000::numeric,3700000::numeric,4000000::numeric,4400000::numeric,7900000::numeric,true,true,6::integer),
 ('캡틴 뷰 스위트'::text,11250000::numeric,3700000::numeric,4000000::numeric,4700000::numeric,19100000::numeric,true,true,7::integer),
 ('엘리트 스위트'::text,13850000::numeric,3700000::numeric,4000000::numeric,4700000::numeric,23500000::numeric,true,true,8::integer),
 ('임페리얼 아테나'::text,42000000::numeric,3700000::numeric,4000000::numeric,4700000::numeric,63000000::numeric,true,true,9::integer)
 ) AS v(room_type,price_adult,price_child,price_child_extra_bed,price_extra_bed,price_single,extra_bed_available,single_available,display_order)
)
INSERT INTO public.cruise_rate_card (cruise_name,schedule_type,room_type,price_adult,price_child,price_child_older,price_child_extra_bed,price_infant,price_extra_bed,price_single,valid_year,valid_from,valid_to,display_order,currency,is_active,notes,extra_bed_available,infant_policy,season_name,is_promotion,child_age_range,single_available)
SELECT '아테나 프리미엄 크루즈'::text,'1N2D'::text,s.room_type,s.price_adult,s.price_child,s.price_child,s.price_child_extra_bed,NULL::numeric,s.price_extra_bed,s.price_single,2026::integer,DATE '2026-03-06',DATE '2026-12-31',s.display_order,'VND'::text,true,'2026-03-06 프로모션 요금. 5-10세 아동 적용. 성인 2인+5세 미만 아동 1인은 무료, 2인은 2,000,000동 추가. 승선 5일 전부터 신규 예약 불가.'::text,s.extra_bed_available,'5세 미만 아동 1인 무료, 2인은 2,000,000동 추가.'::text,'2026 프로모션'::text,true,'5-10세'::text,s.single_available
FROM source_rows s WHERE NOT EXISTS (SELECT 1 FROM public.cruise_rate_card e WHERE e.cruise_name='아테나 프리미엄 크루즈' AND e.schedule_type='1N2D' AND e.room_type=s.room_type AND e.valid_year=2026::integer AND e.valid_from=DATE '2026-03-06' AND e.valid_to=DATE '2026-12-31' AND e.is_promotion IS TRUE)
RETURNING room_type,price_adult,price_child,price_extra_bed,price_single,valid_from,valid_to;
WITH source_rows AS (SELECT * FROM (VALUES (DATE '2026-12-24',NULL::date,'크리스마스 이브'::text,1700000::numeric),(DATE '2026-12-31',NULL::date,'연말연시'::text,1700000::numeric)) AS v(holiday_date,holiday_date_end,holiday_name,surcharge_per_person))
INSERT INTO public.cruise_holiday_surcharge (cruise_name,schedule_type,holiday_date,holiday_date_end,holiday_name,surcharge_per_person,surcharge_type,valid_year,is_confirmed,currency,notes)
SELECT '아테나 프리미엄 크루즈'::text,'1N2D'::text,s.holiday_date,s.holiday_date_end,s.holiday_name,s.surcharge_per_person,'per_person'::text,2026::integer,true,'VND'::text,'2026 프로모션 휴일 추가요금.'::text FROM source_rows s WHERE NOT EXISTS (SELECT 1 FROM public.cruise_holiday_surcharge e WHERE e.cruise_name='아테나 프리미엄 크루즈' AND e.holiday_date=s.holiday_date AND e.valid_year=2026::integer) RETURNING holiday_name,holiday_date,surcharge_per_person;
SELECT room_type,price_adult,price_child,price_extra_bed,price_single FROM public.cruise_rate_card WHERE cruise_name='아테나 프리미엄 크루즈' AND is_promotion IS TRUE AND valid_from=DATE '2026-03-06' ORDER BY display_order; COMMIT;