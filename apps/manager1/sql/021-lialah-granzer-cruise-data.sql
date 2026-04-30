-- =====================================================
-- 021-lialah-granzer-cruise-data.sql
-- 라이라 그랜져 크루즈 상세 정보 (5개 객실 타입)
-- =====================================================
-- 실행 전 011-cruise-info-columns.sql 먼저 실행 필요

-- 기존 라이라 그랜져 크루즈 데이터 삭제 (재실행 가능하도록)
DELETE FROM cruise_info
WHERE cruise_code LIKE 'LIALAH-%'
   OR cruise_name = '라이라 그랜져 크루즈';

-- 공통 일정/규정/포함사항은 각 객실 행에 동일하게 저장

-- =====================================================
-- 1) 오아시스 스위트 (OASIS SUITE - 1층)
-- =====================================================
INSERT INTO cruise_info (
  cruise_code, cruise_name, name, description, duration, category,
  room_name, room_area, room_description,
  bed_type, max_adults, max_guests, has_balcony, is_vip, has_butler,
  is_recommended, connecting_available, extra_bed_available,
  special_amenities, warnings,
  itinerary, cancellation_policy, inclusions, exclusions,
  star_rating, capacity, awards, facilities, display_order,
  features
) VALUES (
  'LIALAH-OS', '라이라 그랜져 크루즈', 'Lialah Granzer Cruise',
  '란하베이 최상위 5성급 크루즈로 워터슬라이드와 맑고 깨끗한 바다에서의 수영을 즐길 수 있는 대규모 라운지형 크루즈입니다. 커플, 가족, 청년 단체 모두에게 인기 있는 크루즈로 란하베이 2박 3일 크루즈 여행의 최고 추천 크루즈입니다.',
  '1박2일', NULL,
  '오아시스 스위트', '32m²',
  '크루즈 1층에 위치한 기본형 객실. 킹베드 또는 트윈베드 선택 가능. 전 객실 완전한 오션뷰 발코니 제공. 싱글차지 1인 혼자 사용 가능. 기본인원 성인 2인, 최대인원 성인 3인(엑스트라베드) 또는 성인 2인 + 아동 2인(아동 1인은 성인 엑스트라 요금).',
  '킹 또는 트윈', 3, 3, true, false, false,
  false, true, true,
  '오션뷰 발코니, 욕조, 스탠딩샤워, 커넥팅룸',
  NULL,
  '[{"day": 1, "title": "1일차", "schedule": [{"time": "08:00", "activity": "하노이 호텔 앞 차량 픽업 (전날 밤 9시경 시간 안내)"}, {"time": "11:00", "activity": "뚜언쩌우 선착장 도착 및 체크인 (예약확인서 불필요, 여권 사진 가능)"}, {"time": "12:00", "activity": "텐더보트 승선 후 란하로 이동 (약 40분)"}, {"time": "12:40", "activity": "크루즈 승선 - 웰컴드링크 및 안전지침 안내"}, {"time": "13:00", "activity": "점심 뷔페식사 (음료 및 주류 별도)"}, {"time": "14:00", "activity": "객실 체크인 및 휴식"}, {"time": "15:00", "activity": "바다수영 / 워터슬라이드 (구명조끼 제공)"}, {"time": "17:00", "activity": "해피아워 (까나페, 제철과일, 선셋파티, 칵테일 1+1)"}, {"time": "19:00", "activity": "디너식사 (베지테리언/키즈메뉴 가능)"}, {"time": "21:00", "activity": "오징어 낚시, 마사지, 사우나, 자유시간"}, {"time": "22:00", "activity": "1일차 공식 일정 종료"}]}, {"day": 2, "title": "2일차", "schedule": [{"time": "05:30", "activity": "하롱의 일출감상 (객실 또는 선데크)"}, {"time": "06:00", "activity": "태극권 스트레칭 (선데크, 자율참여)"}, {"time": "06:15", "activity": "이른 조식뷔페 (빵, 과일, 차)"}, {"time": "06:45", "activity": "다크앤브라이트 동굴 (카약 또는 뱀부보트, 약 100m)"}, {"time": "09:00", "activity": "객실 체크아웃 (객실카드 반납, 음료 결제)"}, {"time": "09:30", "activity": "브런치 뷔페 (마지막 식사)"}, {"time": "10:30", "activity": "크루즈 하선 (텐더보트)"}, {"time": "11:30", "activity": "복귀차량 승차 (통상 11시~11시30분)"}, {"time": "14:00", "activity": "하노이 도착 (교통상황 따라 상이)"}]}]'::jsonb,
  '[{"condition": "크루즈 승선코드 발급 전", "penalty": "수수료 없는 무료 취소 (승선일자 변경 무료)"}, {"condition": "승선코드 발급 후 이용일자 31일 전까지", "penalty": "총 금액에서 100만동 위약금 발생 (1인당 아님)"}, {"condition": "이용일자 21~30일 전", "penalty": "15% 위약금 발생"}, {"condition": "이용일자 17~20일 전", "penalty": "50% 위약금 발생"}, {"condition": "이용일자 16일 전부터", "penalty": "취소/환불/날짜변경 불가"}, {"condition": "천재지변, 태풍, 정부명령, 승선인원 미달, 크루즈사 사정 결항", "penalty": "전액 환불 보장 (추가 보상 없음)"}, {"condition": "고객 사유 항공편 결항", "penalty": "환불 대상 제외"}, {"condition": "교통사고/중대한 질병 (영문 진단서 제출)", "penalty": "환자 본인 1인에 한해 심사 후 예외 환불 가능"}, {"condition": "예약 후 요금 인하", "penalty": "원칙적으로 차액 환불 없음 (프로모션 예외 가능)"}, {"condition": "환불 처리 기간", "penalty": "통상 취소신청서 작성일 기준 약 2개월 (주말/공휴일/명절 제외)"}]'::jsonb,
  '웰컴드링크\n총 4번의 식사\n외부투어 시 영어가이드\n워터슬라이드 및 바다수영\n다크앤브라이트 동굴 카약/뱀부보트\n해피아워 까나페\n선상안전보험 및 서비스 차지',
  '이동차량 서비스\n별도 주문하는 음료 및 주류\n마사지 및 스파 서비스\n노래방\n항공요금 및 공항픽드랍 서비스\n생일 및 기념일 이벤트',
  '5', '캡슐 지역별 상이',
  '란하베이 최고 추천 크루즈',
  '["수영장", "워터슬라이드", "스파 (마사지)", "사우나", "GYM (휘트니스)", "레스토랑", "POOL BAR", "로비/리셉션", "포켓볼", "테이블 미니축구", "노래방"]'::jsonb,
  1,
  '{"pool": true, "spa": true, "gym": true, "waterslide": true, "restaurant": true, "pool_bar": true, "karaoke": true, "full_ocean_view": true, "balcony": true}'::jsonb
);

-- =====================================================
-- 2) 하모니 스위트 (HARMONY SUITE - 2층)
-- =====================================================
INSERT INTO cruise_info (
  cruise_code, cruise_name, name, description, duration, category,
  room_name, room_area, room_description,
  bed_type, max_adults, max_guests, has_balcony, is_vip, has_butler,
  is_recommended, connecting_available, extra_bed_available,
  special_amenities, warnings,
  itinerary, cancellation_policy, inclusions, exclusions,
  star_rating, capacity, awards, facilities, display_order,
  features
) VALUES (
  'LIALAH-HM', '라이라 그랜져 크루즈', 'Lialah Granzer Cruise',
  '란하베이 최상위 5성급 크루즈로 워터슬라이드와 맑고 깨끗한 바다에서의 수영을 즐길 수 있는 대규모 라운지형 크루즈입니다. 커플, 가족, 청년 단체 모두에게 인기 있는 크루즈로 란하베이 2박 3일 크루즈 여행의 최고 추천 크루즈입니다.',
  '1박2일', NULL,
  '하모니 스위트', '32m²',
  '크루즈 2층에 위치한 기본형 객실. 킹베드 또는 트윈베드 선택 가능. 전 객실 완전한 오션뷰 발코니 제공. 싱글차지 1인 혼자 사용 가능. 기본인원 성인 2인, 최대인원 성인 3인(엑스트라베드) 또는 성인 2인 + 아동 2인(아동 1인은 성인 엑스트라 요금).',
  '킹 또는 트윈', 3, 3, true, false, false,
  false, true, true,
  '오션뷰 발코니, 욕조, 스탠딩샤워, 커넥팅룸',
  NULL,
  '[{"day": 1, "title": "1일차", "schedule": [{"time": "08:00", "activity": "하노이 호텔 앞 차량 픽업 (전날 밤 9시경 시간 안내)"}, {"time": "11:00", "activity": "뚜언쩌우 선착장 도착 및 체크인 (예약확인서 불필요, 여권 사진 가능)"}, {"time": "12:00", "activity": "텐더보트 승선 후 란하로 이동 (약 40분)"}, {"time": "12:40", "activity": "크루즈 승선 - 웰컴드링크 및 안전지침 안내"}, {"time": "13:00", "activity": "점심 뷔페식사 (음료 및 주류 별도)"}, {"time": "14:00", "activity": "객실 체크인 및 휴식"}, {"time": "15:00", "activity": "바다수영 / 워터슬라이드 (구명조끼 제공)"}, {"time": "17:00", "activity": "해피아워 (까나페, 제철과일, 선셋파티, 칵테일 1+1)"}, {"time": "19:00", "activity": "디너식사 (베지테리언/키즈메뉴 가능)"}, {"time": "21:00", "activity": "오징어 낚시, 마사지, 사우나, 자유시간"}, {"time": "22:00", "activity": "1일차 공식 일정 종료"}]}, {"day": 2, "title": "2일차", "schedule": [{"time": "05:30", "activity": "하롱의 일출감상 (객실 또는 선데크)"}, {"time": "06:00", "activity": "태극권 스트레칭 (선데크, 자율참여)"}, {"time": "06:15", "activity": "이른 조식뷔페 (빵, 과일, 차)"}, {"time": "06:45", "activity": "다크앤브라이트 동굴 (카약 또는 뱀부보트, 약 100m)"}, {"time": "09:00", "activity": "객실 체크아웃 (객실카드 반납, 음료 결제)"}, {"time": "09:30", "activity": "브런치 뷔페 (마지막 식사)"}, {"time": "10:30", "activity": "크루즈 하선 (텐더보트)"}, {"time": "11:30", "activity": "복귀차량 승차 (통상 11시~11시30분)"}, {"time": "14:00", "activity": "하노이 도착 (교통상황 따라 상이)"}]}]'::jsonb,
  '[{"condition": "크루즈 승선코드 발급 전", "penalty": "수수료 없는 무료 취소 (승선일자 변경 무료)"}, {"condition": "승선코드 발급 후 이용일자 31일 전까지", "penalty": "총 금액에서 100만동 위약금 발생 (1인당 아님)"}, {"condition": "이용일자 21~30일 전", "penalty": "15% 위약금 발생"}, {"condition": "이용일자 17~20일 전", "penalty": "50% 위약금 발생"}, {"condition": "이용일자 16일 전부터", "penalty": "취소/환불/날짜변경 불가"}, {"condition": "천재지변, 태풍, 정부명령, 승선인원 미달, 크루즈사 사정 결항", "penalty": "전액 환불 보장 (추가 보상 없음)"}, {"condition": "고객 사유 항공편 결항", "penalty": "환불 대상 제외"}, {"condition": "교통사고/중대한 질병 (영문 진단서 제출)", "penalty": "환자 본인 1인에 한해 심사 후 예외 환불 가능"}, {"condition": "예약 후 요금 인하", "penalty": "원칙적으로 차액 환불 없음 (프로모션 예외 가능)"}, {"condition": "환불 처리 기간", "penalty": "통상 취소신청서 작성일 기준 약 2개월 (주말/공휴일/명절 제외)"}]'::jsonb,
  '웰컴드링크\n총 4번의 식사\n외부투어 시 영어가이드\n워터슬라이드 및 바다수영\n다크앤브라이트 동굴 카약/뱀부보트\n해피아워 까나페\n선상안전보험 및 서비스 차지',
  '이동차량 서비스\n별도 주문하는 음료 및 주류\n마사지 및 스파 서비스\n노래방\n항공요금 및 공항픽드랍 서비스\n생일 및 기념일 이벤트',
  '5', '캡슐 지역별 상이',
  '란하베이 최고 추천 크루즈',
  '["수영장", "워터슬라이드", "스파 (마사지)", "사우나", "GYM (휘트니스)", "레스토랑", "POOL BAR", "로비/리셉션", "포켓볼", "테이블 미니축구", "노래방"]'::jsonb,
  2,
  '{"pool": true, "spa": true, "gym": true, "waterslide": true, "restaurant": true, "pool_bar": true, "karaoke": true, "full_ocean_view": true, "balcony": true}'::jsonb
);

-- =====================================================
-- 3) 패밀리 스위트 (FAMILY SUITE - 2층)
-- =====================================================
INSERT INTO cruise_info (
  cruise_code, cruise_name, name, description, duration, category,
  room_name, room_area, room_description,
  bed_type, max_adults, max_guests, has_balcony, is_vip, has_butler,
  is_recommended, connecting_available, extra_bed_available,
  special_amenities, warnings,
  itinerary, cancellation_policy, inclusions, exclusions,
  star_rating, capacity, awards, facilities, display_order,
  features
) VALUES (
  'LIALAH-FM', '라이라 그랜져 크루즈', 'Lialah Granzer Cruise',
  '란하베이 최상위 5성급 크루즈로 워터슬라이드와 맑고 깨끗한 바다에서의 수영을 즐길 수 있는 대규모 라운지형 크루즈입니다. 커플, 가족, 청년 단체 모두에게 인기 있는 크루즈로 란하베이 2박 3일 크루즈 여행의 최고 추천 크루즈입니다.',
  '1박2일', NULL,
  '패밀리 스위트', '43m²',
  '크루즈 2층에 위치한 패밀리 전용 객실. 슈퍼 킹베드 + 싱글베드 3개 구성. 전 객실 완전한 오션뷰 발코니 제공. 커넥팅룸 불가능. 기본인원 성인 5인, 최대인원 성인 5인 + 아동 1인. 엑스트라베드 불가.',
  '슈퍼 킹 + 싱글×3', 5, 6, true, false, false,
  false, false, false,
  '오션뷰 발코니, 욕조, 스탠딩샤워, 넓은 공간',
  NULL,
  '[{"day": 1, "title": "1일차", "schedule": [{"time": "08:00", "activity": "하노이 호텔 앞 차량 픽업 (전날 밤 9시경 시간 안내)"}, {"time": "11:00", "activity": "뚜언쩌우 선착장 도착 및 체크인 (예약확인서 불필요, 여권 사진 가능)"}, {"time": "12:00", "activity": "텐더보트 승선 후 란하로 이동 (약 40분)"}, {"time": "12:40", "activity": "크루즈 승선 - 웰컴드링크 및 안전지침 안내"}, {"time": "13:00", "activity": "점심 뷔페식사 (음료 및 주류 별도)"}, {"time": "14:00", "activity": "객실 체크인 및 휴식"}, {"time": "15:00", "activity": "바다수영 / 워터슬라이드 (구명조끼 제공)"}, {"time": "17:00", "activity": "해피아워 (까나페, 제철과일, 선셋파티, 칵테일 1+1)"}, {"time": "19:00", "activity": "디너식사 (베지테리언/키즈메뉴 가능)"}, {"time": "21:00", "activity": "오징어 낚시, 마사지, 사우나, 자유시간"}, {"time": "22:00", "activity": "1일차 공식 일정 종료"}]}, {"day": 2, "title": "2일차", "schedule": [{"time": "05:30", "activity": "하롱의 일출감상 (객실 또는 선데크)"}, {"time": "06:00", "activity": "태극권 스트레칭 (선데크, 자율참여)"}, {"time": "06:15", "activity": "이른 조식뷔페 (빵, 과일, 차)"}, {"time": "06:45", "activity": "다크앤브라이트 동굴 (카약 또는 뱀부보트, 약 100m)"}, {"time": "09:00", "activity": "객실 체크아웃 (객실카드 반납, 음료 결제)"}, {"time": "09:30", "activity": "브런치 뷔페 (마지막 식사)"}, {"time": "10:30", "activity": "크루즈 하선 (텐더보트)"}, {"time": "11:30", "activity": "복귀차량 승차 (통상 11시~11시30분)"}, {"time": "14:00", "activity": "하노이 도착 (교통상황 따라 상이)"}]}]'::jsonb,
  '[{"condition": "크루즈 승선코드 발급 전", "penalty": "수수료 없는 무료 취소 (승선일자 변경 무료)"}, {"condition": "승선코드 발급 후 이용일자 31일 전까지", "penalty": "총 금액에서 100만동 위약금 발생 (1인당 아님)"}, {"condition": "이용일자 21~30일 전", "penalty": "15% 위약금 발생"}, {"condition": "이용일자 17~20일 전", "penalty": "50% 위약금 발생"}, {"condition": "이용일자 16일 전부터", "penalty": "취소/환불/날짜변경 불가"}, {"condition": "천재지변, 태풍, 정부명령, 승선인원 미달, 크루즈사 사정 결항", "penalty": "전액 환불 보장 (추가 보상 없음)"}, {"condition": "고객 사유 항공편 결항", "penalty": "환불 대상 제외"}, {"condition": "교통사고/중대한 질병 (영문 진단서 제출)", "penalty": "환자 본인 1인에 한해 심사 후 예외 환불 가능"}, {"condition": "예약 후 요금 인하", "penalty": "원칙적으로 차액 환불 없음 (프로모션 예외 가능)"}, {"condition": "환불 처리 기간", "penalty": "통상 취소신청서 작성일 기준 약 2개월 (주말/공휴일/명절 제외)"}]'::jsonb,
  '웰컴드링크\n총 4번의 식사\n외부투어 시 영어가이드\n워터슬라이드 및 바다수영\n다크앤브라이트 동굴 카약/뱀부보트\n해피아워 까나페\n선상안전보험 및 서비스 차지',
  '이동차량 서비스\n별도 주문하는 음료 및 주류\n마사지 및 스파 서비스\n노래방\n항공요금 및 공항픽드랍 서비스\n생일 및 기념일 이벤트',
  '5', '캡슐 지역별 상이',
  '란하베이 최고 추천 크루즈',
  '["수영장", "워터슬라이드", "스파 (마사지)", "사우나", "GYM (휘트니스)", "레스토랑", "POOL BAR", "로비/리셉션", "포켓볼", "테이블 미니축구", "노래방"]'::jsonb,
  3,
  '{"pool": true, "spa": true, "gym": true, "waterslide": true, "restaurant": true, "pool_bar": true, "karaoke": true, "full_ocean_view": true, "family_suite": true}'::jsonb
);

-- =====================================================
-- 4) 스카이 패밀리 스위트 (SKY FAMILY SUITE - 3층)
-- =====================================================
INSERT INTO cruise_info (
  cruise_code, cruise_name, name, description, duration, category,
  room_name, room_area, room_description,
  bed_type, max_adults, max_guests, has_balcony, is_vip, has_butler,
  is_recommended, connecting_available, extra_bed_available,
  special_amenities, warnings,
  itinerary, cancellation_policy, inclusions, exclusions,
  star_rating, capacity, awards, facilities, display_order,
  features
) VALUES (
  'LIALAH-SKY', '라이라 그랜져 크루즈', 'Lialah Granzer Cruise',
  '란하베이 최상위 5성급 크루즈로 워터슬라이드와 맑고 깨끗한 바다에서의 수영을 즐길 수 있는 대규모 라운지형 크루즈입니다. 커플, 가족, 청년 단체 모두에게 인기 있는 크루즈로 란하베이 2박 3일 크루즈 여행의 최고 추천 크루즈입니다.',
  '1박2일', NULL,
  '스카이 패밀리 스위트', '42m²',
  '크루즈 3층에 위치한 패밀리 전용 객실. 슈퍼 킹베드 + 싱글베드 2개 구성. 전 객실 완전한 오션뷰 발코니 제공. 커넥팅룸 불가능. 기본인원 성인 4인, 최대인원 성인 4인 + 아동 1인. 엑스트라베드 불가.',
  '슈퍼 킹 + 싱글×2', 4, 5, true, false, false,
  false, false, false,
  '오션뷰 발코니, 욕조, 스탠딩샤워, 넓은 공간, 3층 위치',
  NULL,
  '[{"day": 1, "title": "1일차", "schedule": [{"time": "08:00", "activity": "하노이 호텔 앞 차량 픽업 (전날 밤 9시경 시간 안내)"}, {"time": "11:00", "activity": "뚜언쩌우 선착장 도착 및 체크인 (예약확인서 불필요, 여권 사진 가능)"}, {"time": "12:00", "activity": "텐더보트 승선 후 란하로 이동 (약 40분)"}, {"time": "12:40", "activity": "크루즈 승선 - 웰컴드링크 및 안전지침 안내"}, {"time": "13:00", "activity": "점심 뷔페식사 (음료 및 주류 별도)"}, {"time": "14:00", "activity": "객실 체크인 및 휴식"}, {"time": "15:00", "activity": "바다수영 / 워터슬라이드 (구명조끼 제공)"}, {"time": "17:00", "activity": "해피아워 (까나페, 제철과일, 선셋파티, 칵테일 1+1)"}, {"time": "19:00", "activity": "디너식사 (베지테리언/키즈메뉴 가능)"}, {"time": "21:00", "activity": "오징어 낚시, 마사지, 사우나, 자유시간"}, {"time": "22:00", "activity": "1일차 공식 일정 종료"}]}, {"day": 2, "title": "2일차", "schedule": [{"time": "05:30", "activity": "하롱의 일출감상 (객실 또는 선데크)"}, {"time": "06:00", "activity": "태극권 스트레칭 (선데크, 자율참여)"}, {"time": "06:15", "activity": "이른 조식뷔페 (빵, 과일, 차)"}, {"time": "06:45", "activity": "다크앤브라이트 동굴 (카약 또는 뱀부보트, 약 100m)"}, {"time": "09:00", "activity": "객실 체크아웃 (객실카드 반납, 음료 결제)"}, {"time": "09:30", "activity": "브런치 뷔페 (마지막 식사)"}, {"time": "10:30", "activity": "크루즈 하선 (텐더보트)"}, {"time": "11:30", "activity": "복귀차량 승차 (통상 11시~11시30분)"}, {"time": "14:00", "activity": "하노이 도착 (교통상황 따라 상이)"}]}]'::jsonb,
  '[{"condition": "크루즈 승선코드 발급 전", "penalty": "수수료 없는 무료 취소 (승선일자 변경 무료)"}, {"condition": "승선코드 발급 후 이용일자 31일 전까지", "penalty": "총 금액에서 100만동 위약금 발생 (1인당 아님)"}, {"condition": "이용일자 21~30일 전", "penalty": "15% 위약금 발생"}, {"condition": "이용일자 17~20일 전", "penalty": "50% 위약금 발생"}, {"condition": "이용일자 16일 전부터", "penalty": "취소/환불/날짜변경 불가"}, {"condition": "천재지변, 태풍, 정부명령, 승선인원 미달, 크루즈사 사정 결항", "penalty": "전액 환불 보장 (추가 보상 없음)"}, {"condition": "고객 사유 항공편 결항", "penalty": "환불 대상 제외"}, {"condition": "교통사고/중대한 질병 (영문 진단서 제출)", "penalty": "환자 본인 1인에 한해 심사 후 예외 환불 가능"}, {"condition": "예약 후 요금 인하", "penalty": "원칙적으로 차액 환불 없음 (프로모션 예외 가능)"}, {"condition": "환불 처리 기간", "penalty": "통상 취소신청서 작성일 기준 약 2개월 (주말/공휴일/명절 제외)"}]'::jsonb,
  '웰컴드링크\n총 4번의 식사\n외부투어 시 영어가이드\n워터슬라이드 및 바다수영\n다크앤브라이트 동굴 카약/뱀부보트\n해피아워 까나페\n선상안전보험 및 서비스 차지',
  '이동차량 서비스\n별도 주문하는 음료 및 주류\n마사지 및 스파 서비스\n노래방\n항공요금 및 공항픽드랍 서비스\n생일 및 기념일 이벤트',
  '5', '캡슐 지역별 상이',
  '란하베이 최고 추천 크루즈',
  '["수영장", "워터슬라이드", "스파 (마사지)", "사우나", "GYM (휘트니스)", "레스토랑", "POOL BAR", "로비/리셉션", "포켓볼", "테이블 미니축구", "노래방"]'::jsonb,
  4,
  '{"pool": true, "spa": true, "gym": true, "waterslide": true, "restaurant": true, "pool_bar": true, "karaoke": true, "full_ocean_view": true, "family_suite": true}'::jsonb
);

-- =====================================================
-- 5) 스카이 테라스 패밀리 스위트 (SKY TERRACE FAMILY SUITE - 3층)
-- =====================================================
INSERT INTO cruise_info (
  cruise_code, cruise_name, name, description, duration, category,
  room_name, room_area, room_description,
  bed_type, max_adults, max_guests, has_balcony, is_vip, has_butler,
  is_recommended, connecting_available, extra_bed_available,
  special_amenities, warnings,
  itinerary, cancellation_policy, inclusions, exclusions,
  star_rating, capacity, awards, facilities, display_order,
  features
) VALUES (
  'LIALAH-SKYTR', '라이라 그랜져 크루즈', 'Lialah Granzer Cruise',
  '란하베이 최상위 5성급 크루즈로 워터슬라이드와 맑고 깨끗한 바다에서의 수영을 즐길 수 있는 대규모 라운지형 크루즈입니다. 커플, 가족, 청년 단체 모두에게 인기 있는 크루즈로 란하베이 2박 3일 크루즈 여행의 최고 추천 크루즈입니다.',
  '1박2일', NULL,
  '스카이 테라스 패밀리 스위트', '53m²',
  '크루즈 3층에 위치한 최고급 테라스 구조 패밀리 객실. 슈퍼 킹베드 + 싱글베드 2개 구성. 전 객실 완전한 오션뷰 발코니 및 테라스 제공. 커넥팅룸 불가능. 기본인원 성인 4인, 최대인원 성인 4인 + 아동 1인. 엑스트라베드 불가.',
  '슈퍼 킹 + 싱글×2', 4, 5, true, false, false,
  false, false, false,
  '오션뷰 발코니, 독립 테라스, 욕조, 스탠딩샤워, 최고급 공간',
  NULL,
  '[{"day": 1, "title": "1일차", "schedule": [{"time": "08:00", "activity": "하노이 호텔 앞 차량 픽업 (전날 밤 9시경 시간 안내)"}, {"time": "11:00", "activity": "뚜언쩌우 선착장 도착 및 체크인 (예약확인서 불필요, 여권 사진 가능)"}, {"time": "12:00", "activity": "텐더보트 승선 후 란하로 이동 (약 40분)"}, {"time": "12:40", "activity": "크루즈 승선 - 웰컴드링크 및 안전지침 안내"}, {"time": "13:00", "activity": "점심 뷔페식사 (음료 및 주류 별도)"}, {"time": "14:00", "activity": "객실 체크인 및 휴식"}, {"time": "15:00", "activity": "바다수영 / 워터슬라이드 (구명조끼 제공)"}, {"time": "17:00", "activity": "해피아워 (까나페, 제철과일, 선셋파티, 칵테일 1+1)"}, {"time": "19:00", "activity": "디너식사 (베지테리언/키즈메뉴 가능)"}, {"time": "21:00", "activity": "오징어 낚시, 마사지, 사우나, 자유시간"}, {"time": "22:00", "activity": "1일차 공식 일정 종료"}]}, {"day": 2, "title": "2일차", "schedule": [{"time": "05:30", "activity": "하롱의 일출감상 (객실 또는 테라스/선데크)"}, {"time": "06:00", "activity": "태극권 스트레칭 (선데크, 자율참여)"}, {"time": "06:15", "activity": "이른 조식뷔페 (빵, 과일, 차)"}, {"time": "06:45", "activity": "다크앤브라이트 동굴 (카약 또는 뱀부보트, 약 100m)"}, {"time": "09:00", "activity": "객실 체크아웃 (객실카드 반납, 음료 결제)"}, {"time": "09:30", "activity": "브런치 뷔페 (마지막 식사)"}, {"time": "10:30", "activity": "크루즈 하선 (텐더보트)"}, {"time": "11:30", "activity": "복귀차량 승차 (통상 11시~11시30분)"}, {"time": "14:00", "activity": "하노이 도착 (교통상황 따라 상이)"}]}]'::jsonb,
  '[{"condition": "크루즈 승선코드 발급 전", "penalty": "수수료 없는 무료 취소 (승선일자 변경 무료)"}, {"condition": "승선코드 발급 후 이용일자 31일 전까지", "penalty": "총 금액에서 100만동 위약금 발생 (1인당 아님)"}, {"condition": "이용일자 21~30일 전", "penalty": "15% 위약금 발생"}, {"condition": "이용일자 17~20일 전", "penalty": "50% 위약금 발생"}, {"condition": "이용일자 16일 전부터", "penalty": "취소/환불/날짜변경 불가"}, {"condition": "천재지변, 태풍, 정부명령, 승선인원 미달, 크루즈사 사정 결항", "penalty": "전액 환불 보장 (추가 보상 없음)"}, {"condition": "고객 사유 항공편 결항", "penalty": "환불 대상 제외"}, {"condition": "교통사고/중대한 질병 (영문 진단서 제출)", "penalty": "환자 본인 1인에 한해 심사 후 예외 환불 가능"}, {"condition": "예약 후 요금 인하", "penalty": "원칙적으로 차액 환불 없음 (프로모션 예외 가능)"}, {"condition": "환불 처리 기간", "penalty": "통상 취소신청서 작성일 기준 약 2개월 (주말/공휴일/명절 제외)"}]'::jsonb,
  '웰컴드링크\n총 4번의 식사\n외부투어 시 영어가이드\n워터슬라이드 및 바다수영\n다크앤브라이트 동굴 카약/뱀부보트\n해피아워 까나페\n선상안전보험 및 서비스 차지',
  '이동차량 서비스\n별도 주문하는 음료 및 주류\n마사지 및 스파 서비스\n노래방\n항공요금 및 공항픽드랍 서비스\n생일 및 기념일 이벤트',
  '5', '캡슐 지역별 상이',
  '란하베이 최고 추천 크루즈',
  '["수영장", "워터슬라이드", "스파 (마사지)", "사우나", "GYM (휘트니스)", "레스토랑", "POOL BAR", "로비/리셉션", "포켓볼", "테이블 미니축구", "노래방"]'::jsonb,
  5,
  '{"pool": true, "spa": true, "gym": true, "waterslide": true, "restaurant": true, "pool_bar": true, "karaoke": true, "full_ocean_view": true, "private_terrace": true, "family_suite": true}'::jsonb
);

-- =====================================================
-- 검증 쿼리 (실행 후 확인용)
-- =====================================================
-- SELECT cruise_code, cruise_name, room_name, room_area, display_order, is_vip
-- FROM cruise_info
-- WHERE cruise_name = '라이라 그랜져 크루즈'
-- ORDER BY display_order;
-- 기대 결과: 5행 (LIALAH-OS, LIALAH-HM, LIALAH-FM, LIALAH-SKY, LIALAH-SKYTR)
