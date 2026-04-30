-- =====================================================
-- 020-diana-cruise-data.sql
-- 다이아나 크루즈 상세 정보 (6개 객실 타입)
-- =====================================================
-- 실행 전 011-cruise-info-columns.sql 먼저 실행 필요

-- 기존 다이아나 크루즈 데이터 삭제 (재실행 가능하도록)
DELETE FROM cruise_info
WHERE cruise_code LIKE 'DIANA-%'
   OR cruise_name = '다이아나 크루즈';

-- 공통 일정/규정/포함사항은 각 객실 행에 동일하게 저장

-- =====================================================
-- 1) 주니어 발코니 (JUNIOR BALCONY)
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
  'DIANA-JB', '다이아나 크루즈', 'Diana Cruise',
  '5성급 비너스 크루즈가 2025년 12월 선보인 6성급 크루즈. 하롱베이의 청정해역 란하베이를 운항. 비교적 신형크루즈이지만 시설 만족도가 다소 떨어짐. 전객실 완전한 오션뷰 발코니 제공. 특별함 없는 편안한 쉼을 원하시는 분들께 적합.',
  '1박2일', NULL,
  '주니어 발코니', '34m²',
  '크루즈 1층 가장 앞쪽에 위치한 기본형 객실. 더블베드 고정타입. 싱글차지 1인 혼자 사용 가능. 기본인원 성인 2인, 최대인원 성인 3인(엑스트라베드) 또는 성인 2인 + 아동 2인(아동 1인은 성인 엑스트라 요금).',
  '더블 고정', 3, 3, true, false, false,
  false, true, true,
  '오션뷰 발코니, 커넥팅룸, 욕조, 스탠딩샤워',
  '크루즈 1층 가장 앞쪽으로 승선 내리거나 올릴 때 심한 소음이 있을 수 있습니다. 발코니에 라운드 펜스로 일부 시야가 가려집니다.',
  '[
    {"day": 1, "title": "1일차", "schedule": [
      {"time": "08:00", "activity": "하노이 호텔 앞 차량 픽업 (전날 밤 9시경 시간 안내)"},
      {"time": "11:00", "activity": "하롱베이 선착장 도착 및 체크인 (예약확인서 불필요, 여권 사진 가능)"},
      {"time": "11:45", "activity": "텐더보트 승선 후 크루즈로 이동 (약 40분)"},
      {"time": "12:30", "activity": "크루즈 승선 - 웰컴드링크 및 안전지침/투어일정 안내"},
      {"time": "13:00", "activity": "점심 뷔페식사 (음료 및 주류 별도)"},
      {"time": "15:00", "activity": "다크앤브라이트 동굴투어 (카약/뱀부보트, 약 100미터 동굴)"},
      {"time": "17:00", "activity": "바다수영 (구명조끼 제공, 에메랄드빛 청정해역)"},
      {"time": "17:30", "activity": "해피아워 (비스킷, 제철과일, 선셋파티, 칵테일 1+1)"},
      {"time": "19:30", "activity": "디너식사 (베지테리언/키즈메뉴 가능, 30인 이상 시 뷔페, 음료/주류 별도)"},
      {"time": "21:00", "activity": "자유시간 (자쿠지, 야경감상, 라운지 등)"},
      {"time": "22:00", "activity": "1일차 공식 일정 종료"}
    ]},
    {"day": 2, "title": "2일차", "schedule": [
      {"time": "05:30", "activity": "하롱의 일출감상 (객실 또는 선데크)"},
      {"time": "06:30", "activity": "태극권 스트레칭 (선데크, 자율참여)"},
      {"time": "07:00", "activity": "이른 조식 (페스츄리, 커피, 차)"},
      {"time": "08:00", "activity": "전통 다도체험 (6층 로프탑, 베트남 전통 다도)"},
      {"time": "09:00", "activity": "객실 체크아웃 (객실카드 반납, 음료 결제)"},
      {"time": "09:20", "activity": "브런치 뷔페 (하선 전 마지막 식사)"},
      {"time": "10:30", "activity": "크루즈 하선"},
      {"time": "11:30", "activity": "복귀차량 승차 (통상 11시~11시30분)"},
      {"time": "14:00", "activity": "하노이 도착 (교통상황 따라 상이)"}
    ]}
  ]'::jsonb,
  '[
    {"condition": "크루즈 승선코드 발급 전", "penalty": "수수료 없는 무료 취소 (승선일자 변경 무료)"},
    {"condition": "승선코드 발급 후 이용일자 31일 전까지", "penalty": "총 금액에서 100만동 위약금 발생 (1인당 아님)"},
    {"condition": "이용일자 21~30일 전", "penalty": "15% 위약금 발생"},
    {"condition": "이용일자 17~20일 전", "penalty": "50% 위약금 발생"},
    {"condition": "이용일자 16일 전부터", "penalty": "취소/환불/날짜변경 불가"},
    {"condition": "천재지변, 태풍, 정부명령, 승선인원 미달, 크루즈사 사정 결항", "penalty": "전액 환불 보장 (추가 보상 없음)"},
    {"condition": "고객 사유 항공편 결항", "penalty": "환불 대상 제외"},
    {"condition": "교통사고/중대한 질병 (영문 진단서 제출)", "penalty": "환자 본인 1인에 한해 심사 후 예외 환불 가능"},
    {"condition": "예약 후 요금 인하", "penalty": "원칙적으로 차액 환불 없음 (프로모션 예외 가능)"},
    {"condition": "환불 처리 기간", "penalty": "통상 취소신청서 작성일 기준 약 2개월 (주말/공휴일/명절 제외)"}
  ]'::jsonb,
  '웰컴드링크\n총 4번의 식사\n외부투어 시 영어가이드\n카약킹\n마사지룸 체험과 뷰테라스 이용\n다도체험\n다크앤브라이트 동굴투어 (카약이나 뱀부보트)\n해피아워 까나페\n선상안전보험 및 서비스 차지',
  '이동차량 서비스\n별도 주문하는 음료 및 주류\n마사지 및 스파 서비스\n항공요금 및 공항픽드랍 서비스\n생일 및 기념일 이벤트',
  '6', '168명',
  '2025년 12월 신규 출항',
  '["수영장", "스파 (마사지)", "Gym (휘트니스)", "미니골프", "레스토랑", "로비/리셉션", "선데크", "루프탑"]'::jsonb,
  1,
  '{"pool": true, "spa": true, "gym": true, "mini_golf": true, "restaurant": true, "lounge": false, "sundeck": true, "rooftop": true, "full_ocean_view": true}'::jsonb
);

-- =====================================================
-- 2) 시니어 발코니 (SENIOR BALCONY)
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
  'DIANA-SB', '다이아나 크루즈', 'Diana Cruise',
  '5성급 비너스 크루즈가 2025년 12월 선보인 6성급 크루즈. 하롱베이의 청정해역 란하베이를 운항. 비교적 신형크루즈이지만 시설 만족도가 다소 떨어짐. 전객실 완전한 오션뷰 발코니 제공. 특별함 없는 편안한 쉼을 원하시는 분들께 적합.',
  '1박2일', NULL,
  '시니어 발코니', '34m²',
  '크루즈 1층에 위치한 기본형 객실. 더블베드 또는 트윈베드(싱글 2개) 선택 가능. 싱글차지 1인 혼자 사용 가능. 기본인원 성인 2인, 최대인원 성인 3인(엑스트라베드) 또는 성인 2인 + 아동 2인(아동 1인은 성인 엑스트라 요금).',
  '더블 또는 트윈', 3, 3, true, false, false,
  false, true, true,
  '오션뷰 발코니, 커넥팅룸, 욕조, 스탠딩샤워',
  NULL,
  '[
    {"day": 1, "title": "1일차", "schedule": [
      {"time": "08:00", "activity": "하노이 호텔 앞 차량 픽업 (전날 밤 9시경 시간 안내)"},
      {"time": "11:00", "activity": "하롱베이 선착장 도착 및 체크인 (예약확인서 불필요, 여권 사진 가능)"},
      {"time": "11:45", "activity": "텐더보트 승선 후 크루즈로 이동 (약 40분)"},
      {"time": "12:30", "activity": "크루즈 승선 - 웰컴드링크 및 안전지침/투어일정 안내"},
      {"time": "13:00", "activity": "점심 뷔페식사 (음료 및 주류 별도)"},
      {"time": "15:00", "activity": "다크앤브라이트 동굴투어 (카약/뱀부보트, 약 100미터 동굴)"},
      {"time": "17:00", "activity": "바다수영 (구명조끼 제공, 에메랄드빛 청정해역)"},
      {"time": "17:30", "activity": "해피아워 (비스킷, 제철과일, 선셋파티, 칵테일 1+1)"},
      {"time": "19:30", "activity": "디너식사 (베지테리언/키즈메뉴 가능, 30인 이상 시 뷔페, 음료/주류 별도)"},
      {"time": "21:00", "activity": "자유시간 (자쿠지, 야경감상, 라운지 등)"},
      {"time": "22:00", "activity": "1일차 공식 일정 종료"}
    ]},
    {"day": 2, "title": "2일차", "schedule": [
      {"time": "05:30", "activity": "하롱의 일출감상 (객실 또는 선데크)"},
      {"time": "06:30", "activity": "태극권 스트레칭 (선데크, 자율참여)"},
      {"time": "07:00", "activity": "이른 조식 (페스츄리, 커피, 차)"},
      {"time": "08:00", "activity": "전통 다도체험 (6층 로프탑, 베트남 전통 다도)"},
      {"time": "09:00", "activity": "객실 체크아웃 (객실카드 반납, 음료 결제)"},
      {"time": "09:20", "activity": "브런치 뷔페 (하선 전 마지막 식사)"},
      {"time": "10:30", "activity": "크루즈 하선"},
      {"time": "11:30", "activity": "복귀차량 승차 (통상 11시~11시30분)"},
      {"time": "14:00", "activity": "하노이 도착 (교통상황 따라 상이)"}
    ]}
  ]'::jsonb,
  '[
    {"condition": "크루즈 승선코드 발급 전", "penalty": "수수료 없는 무료 취소 (승선일자 변경 무료)"},
    {"condition": "승선코드 발급 후 이용일자 31일 전까지", "penalty": "총 금액에서 100만동 위약금 발생 (1인당 아님)"},
    {"condition": "이용일자 21~30일 전", "penalty": "15% 위약금 발생"},
    {"condition": "이용일자 17~20일 전", "penalty": "50% 위약금 발생"},
    {"condition": "이용일자 16일 전부터", "penalty": "취소/환불/날짜변경 불가"},
    {"condition": "천재지변, 태풍, 정부명령, 승선인원 미달, 크루즈사 사정 결항", "penalty": "전액 환불 보장 (추가 보상 없음)"},
    {"condition": "고객 사유 항공편 결항", "penalty": "환불 대상 제외"},
    {"condition": "교통사고/중대한 질병 (영문 진단서 제출)", "penalty": "환자 본인 1인에 한해 심사 후 예외 환불 가능"},
    {"condition": "예약 후 요금 인하", "penalty": "원칙적으로 차액 환불 없음 (프로모션 예외 가능)"},
    {"condition": "환불 처리 기간", "penalty": "통상 취소신청서 작성일 기준 약 2개월 (주말/공휴일/명절 제외)"}
  ]'::jsonb,
  '웰컴드링크\n총 4번의 식사\n외부투어 시 영어가이드\n카약킹\n마사지룸 체험과 뷰테라스 이용\n다도체험\n다크앤브라이트 동굴투어 (카약이나 뱀부보트)\n해피아워 까나페\n선상안전보험 및 서비스 차지',
  '이동차량 서비스\n별도 주문하는 음료 및 주류\n마사지 및 스파 서비스\n항공요금 및 공항픽드랍 서비스\n생일 및 기념일 이벤트',
  '6', '168명',
  '2025년 12월 신규 출항',
  '["수영장", "스파 (마사지)", "Gym (휘트니스)", "미니골프", "레스토랑", "로비/리셉션", "선데크", "루프탑"]'::jsonb,
  2,
  '{"pool": true, "spa": true, "gym": true, "mini_golf": true, "restaurant": true, "lounge": false, "sundeck": true, "rooftop": true, "full_ocean_view": true}'::jsonb
);

-- =====================================================
-- 3) 이그제큐티브 발코니 (EXECUTIVE BALCONY - 추천객실)
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
  'DIANA-EX', '다이아나 크루즈', 'Diana Cruise',
  '5성급 비너스 크루즈가 2025년 12월 선보인 6성급 크루즈. 하롱베이의 청정해역 란하베이를 운항. 비교적 신형크루즈이지만 시설 만족도가 다소 떨어짐. 전객실 완전한 오션뷰 발코니 제공. 특별함 없는 편안한 쉼을 원하시는 분들께 적합.',
  '1박2일', NULL,
  '이그제큐티브 발코니', '36m²',
  '크루즈 2층에 위치한 기본형 객실. 더블베드 또는 트윈베드(싱글 2개) 선택 가능. 완전한 오션뷰 발코니 제공. 싱글차지 1인 혼자 사용 가능. 기본인원 성인 2인, 최대인원 성인 3인(엑스트라베드) 또는 성인 2인 + 아동 2인(아동 1인은 성인 엑스트라 요금).',
  '더블 또는 트윈', 3, 3, true, false, false,
  true, true, true,
  '오션뷰 발코니, 커넥팅룸, 욕조, 스탠딩샤워, 완전한 바다 전망',
  NULL,
  '[
    {"day": 1, "title": "1일차", "schedule": [
      {"time": "08:00", "activity": "하노이 호텔 앞 차량 픽업 (전날 밤 9시경 시간 안내)"},
      {"time": "11:00", "activity": "하롱베이 선착장 도착 및 체크인 (예약확인서 불필요, 여권 사진 가능)"},
      {"time": "11:45", "activity": "텐더보트 승선 후 크루즈로 이동 (약 40분)"},
      {"time": "12:30", "activity": "크루즈 승선 - 웰컴드링크 및 안전지침/투어일정 안내"},
      {"time": "13:00", "activity": "점심 뷔페식사 (음료 및 주류 별도)"},
      {"time": "15:00", "activity": "다크앤브라이트 동굴투어 (카약/뱀부보트, 약 100미터 동굴)"},
      {"time": "17:00", "activity": "바다수영 (구명조끼 제공, 에메랄드빛 청정해역)"},
      {"time": "17:30", "activity": "해피아워 (비스킷, 제철과일, 선셋파티, 칵테일 1+1)"},
      {"time": "19:30", "activity": "디너식사 (베지테리언/키즈메뉴 가능, 30인 이상 시 뷔페, 음료/주류 별도)"},
      {"time": "21:00", "activity": "자유시간 (자쿠지, 야경감상, 라운지 등)"},
      {"time": "22:00", "activity": "1일차 공식 일정 종료"}
    ]},
    {"day": 2, "title": "2일차", "schedule": [
      {"time": "05:30", "activity": "하롱의 일출감상 (객실 또는 선데크)"},
      {"time": "06:30", "activity": "태극권 스트레칭 (선데크, 자율참여)"},
      {"time": "07:00", "activity": "이른 조식 (페스츄리, 커피, 차)"},
      {"time": "08:00", "activity": "전통 다도체험 (6층 로프탑, 베트남 전통 다도)"},
      {"time": "09:00", "activity": "객실 체크아웃 (객실카드 반납, 음료 결제)"},
      {"time": "09:20", "activity": "브런치 뷔페 (하선 전 마지막 식사)"},
      {"time": "10:30", "activity": "크루즈 하선"},
      {"time": "11:30", "activity": "복귀차량 승차 (통상 11시~11시30분)"},
      {"time": "14:00", "activity": "하노이 도착 (교통상황 따라 상이)"}
    ]}
  ]'::jsonb,
  '[
    {"condition": "크루즈 승선코드 발급 전", "penalty": "수수료 없는 무료 취소 (승선일자 변경 무료)"},
    {"condition": "승선코드 발급 후 이용일자 31일 전까지", "penalty": "총 금액에서 100만동 위약금 발생 (1인당 아님)"},
    {"condition": "이용일자 21~30일 전", "penalty": "15% 위약금 발생"},
    {"condition": "이용일자 17~20일 전", "penalty": "50% 위약금 발생"},
    {"condition": "이용일자 16일 전부터", "penalty": "취소/환불/날짜변경 불가"},
    {"condition": "천재지변, 태풍, 정부명령, 승선인원 미달, 크루즈사 사정 결항", "penalty": "전액 환불 보장 (추가 보상 없음)"},
    {"condition": "고객 사유 항공편 결항", "penalty": "환불 대상 제외"},
    {"condition": "교통사고/중대한 질병 (영문 진단서 제출)", "penalty": "환자 본인 1인에 한해 심사 후 예외 환불 가능"},
    {"condition": "예약 후 요금 인하", "penalty": "원칙적으로 차액 환불 없음 (프로모션 예외 가능)"},
    {"condition": "환불 처리 기간", "penalty": "통상 취소신청서 작성일 기준 약 2개월 (주말/공휴일/명절 제외)"}
  ]'::jsonb,
  '웰컴드링크\n총 4번의 식사\n외부투어 시 영어가이드\n카약킹\n마사지룸 체험과 뷰테라스 이용\n다도체험\n다크앤브라이트 동굴투어 (카약이나 뱀부보트)\n해피아워 까나페\n선상안전보험 및 서비스 차지',
  '이동차량 서비스\n별도 주문하는 음료 및 주류\n마사지 및 스파 서비스\n항공요금 및 공항픽드랍 서비스\n생일 및 기념일 이벤트',
  '6', '168명',
  '2025년 12월 신규 출항',
  '["수영장", "스파 (마사지)", "Gym (휘트니스)", "미니골프", "레스토랑", "로비/리셉션", "선데크", "루프탑"]'::jsonb,
  3,
  '{"pool": true, "spa": true, "gym": true, "mini_golf": true, "restaurant": true, "lounge": false, "sundeck": true, "rooftop": true, "full_ocean_view": true, "recommended": true}'::jsonb
);

-- =====================================================
-- 4) 프리미어 발코니 (PREMIER BALCONY - 마사지 무료)
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
  'DIANA-PR', '다이아나 크루즈', 'Diana Cruise',
  '5성급 비너스 크루즈가 2025년 12월 선보인 6성급 크루즈. 하롱베이의 청정해역 란하베이를 운항. 비교적 신형크루즈이지만 시설 만족도가 다소 떨어짐. 전객실 완전한 오션뷰 발코니 제공. 특별함 없는 편안한 쉼을 원하시는 분들께 적합.',
  '1박2일', NULL,
  '프리미어 발코니', '38m²',
  '크루즈 3층에 위치한 프리미엄 객실. 더블베드 또는 트윈베드(싱글 2개) 선택 가능. 스위트급 객실로 고급 대우 제공. 싱글차지 1인 혼자 사용 가능. 기본인원 성인 2인, 최대인원 성인 3인(엑스트라베드) 또는 성인 2인 + 아동 2인(아동 1인은 성인 엑스트라 요금).',
  '더블 또는 트윈', 3, 3, true, false, false,
  false, true, true,
  '오션뷰 발코니, 커넥팅룸, 욕조, 스탠딩샤워, 30분 마사지 무료 (2인)',
  NULL,
  '[
    {"day": 1, "title": "1일차", "schedule": [
      {"time": "08:00", "activity": "하노이 호텔 앞 차량 픽업 (전날 밤 9시경 시간 안내)"},
      {"time": "11:00", "activity": "하롱베이 선착장 도착 및 체크인 (예약확인서 불필요, 여권 사진 가능)"},
      {"time": "11:45", "activity": "텐더보트 승선 후 크루즈로 이동 (약 40분)"},
      {"time": "12:30", "activity": "크루즈 승선 - 웰컴드링크 및 안전지침/투어일정 안내"},
      {"time": "13:00", "activity": "점심 뷔페식사 (음료 및 주류 별도)"},
      {"time": "15:00", "activity": "다크앤브라이트 동굴투어 (카약/뱀부보트, 약 100미터 동굴)"},
      {"time": "17:00", "activity": "바다수영 (구명조끼 제공, 에메랄드빛 청정해역)"},
      {"time": "17:30", "activity": "해피아워 (비스킷, 제철과일, 선셋파티, 칵테일 1+1)"},
      {"time": "19:30", "activity": "디너식사 (베지테리언/키즈메뉴 가능, 30인 이상 시 뷔페, 음료/주류 별도)"},
      {"time": "21:00", "activity": "자유시간 (자쿠지, 야경감상, 라운지 등)"},
      {"time": "22:00", "activity": "1일차 공식 일정 종료"}
    ]},
    {"day": 2, "title": "2일차", "schedule": [
      {"time": "05:30", "activity": "하롱의 일출감상 (객실 또는 선데크)"},
      {"time": "06:30", "activity": "태극권 스트레칭 (선데크, 자율참여)"},
      {"time": "07:00", "activity": "이른 조식 (페스츄리, 커피, 차)"},
      {"time": "08:00", "activity": "전통 다도체험 (6층 로프탑, 베트남 전통 다도)"},
      {"time": "09:00", "activity": "객실 체크아웃 (객실카드 반납, 음료 결제)"},
      {"time": "09:20", "activity": "브런치 뷔페 (하선 전 마지막 식사)"},
      {"time": "10:30", "activity": "크루즈 하선"},
      {"time": "11:30", "activity": "복귀차량 승차 (통상 11시~11시30분)"},
      {"time": "14:00", "activity": "하노이 도착 (교통상황 따라 상이)"}
    ]}
  ]'::jsonb,
  '[
    {"condition": "크루즈 승선코드 발급 전", "penalty": "수수료 없는 무료 취소 (승선일자 변경 무료)"},
    {"condition": "승선코드 발급 후 이용일자 31일 전까지", "penalty": "총 금액에서 100만동 위약금 발생 (1인당 아님)"},
    {"condition": "이용일자 21~30일 전", "penalty": "15% 위약금 발생"},
    {"condition": "이용일자 17~20일 전", "penalty": "50% 위약금 발생"},
    {"condition": "이용일자 16일 전부터", "penalty": "취소/환불/날짜변경 불가"},
    {"condition": "천재지변, 태풍, 정부명령, 승선인원 미달, 크루즈사 사정 결항", "penalty": "전액 환불 보장 (추가 보상 없음)"},
    {"condition": "고객 사유 항공편 결항", "penalty": "환불 대상 제외"},
    {"condition": "교통사고/중대한 질병 (영문 진단서 제출)", "penalty": "환자 본인 1인에 한해 심사 후 예외 환불 가능"},
    {"condition": "예약 후 요금 인하", "penalty": "원칙적으로 차액 환불 없음 (프로모션 예외 가능)"},
    {"condition": "환불 처리 기간", "penalty": "통상 취소신청서 작성일 기준 약 2개월 (주말/공휴일/명절 제외)"}
  ]'::jsonb,
  '웰컴드링크\n총 4번의 식사\n외부투어 시 영어가이드\n카약킹\n마사지룸 체험과 뷰테라스 이용\n다도체험\n다크앤브라이트 동굴투어 (카약이나 뱀부보트)\n해피아워 까나페\n선상안전보험 및 서비스 차지\n30분 마사지 무료 (프리미어 이상)',
  '이동차량 서비스\n별도 주문하는 음료 및 주류\n추가 마사지 및 스파 서비스\n항공요금 및 공항픽드랍 서비스\n생일 및 기념일 이벤트',
  '6', '168명',
  '2025년 12월 신규 출항',
  '["수영장", "스파 (마사지)", "Gym (휘트니스)", "미니골프", "레스토랑", "로비/리셉션", "선데크", "루프탑"]'::jsonb,
  4,
  '{"pool": true, "spa": true, "gym": true, "mini_golf": true, "restaurant": true, "lounge": false, "sundeck": true, "rooftop": true, "full_ocean_view": true, "free_massage": true}'::jsonb
);

-- =====================================================
-- 5) 하롱 스위트 (HA LONG SUITE - VIP, 후면 테라스)
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
  'DIANA-HL', '다이아나 크루즈', 'Diana Cruise',
  '5성급 비너스 크루즈가 2025년 12월 선보인 6성급 크루즈. 하롱베이의 청정해역 란하베이를 운항. 비교적 신형크루즈이지만 시설 만족도가 다소 떨어짐. 전객실 완전한 오션뷰 발코니 제공. 특별함 없는 편안한 쉼을 원하시는 분들께 적합.',
  '1박2일', NULL,
  '하롱 스위트', '55m²',
  '크루즈 2층에 위치한 VIP 스위트 객실. 크루즈 뒷편 단독 테라스 제공. 킹베드 고정타입. VIP 객실 혜택 제공. 싱글차지 1인 혼자 사용 가능. 기본인원 성인 2인, 최대인원 성인 3인(엑스트라베드) 또는 성인 2인 + 아동 2인(아동 1인은 성인 엑스트라 요금).',
  '킹 고정', 3, 3, true, true, false,
  false, true, true,
  '오션뷰 발코니, 후면 전용 테라스, 커넥팅룸, 욕조, 스탠딩샤워, 30분 마사지 무료 (2인)',
  NULL,
  '[
    {"day": 1, "title": "1일차", "schedule": [
      {"time": "08:00", "activity": "하노이 호텔 앞 차량 픽업 (전날 밤 9시경 시간 안내)"},
      {"time": "11:00", "activity": "하롱베이 선착장 도착 및 체크인 (예약확인서 불필요, 여권 사진 가능)"},
      {"time": "11:45", "activity": "텐더보트 승선 후 크루즈로 이동 (약 40분)"},
      {"time": "12:30", "activity": "크루즈 승선 - 웰컴드링크 및 안전지침/투어일정 안내"},
      {"time": "13:00", "activity": "점심 뷔페식사 (음료 및 주류 별도)"},
      {"time": "15:00", "activity": "다크앤브라이트 동굴투어 (카약/뱀부보트, 약 100미터 동굴)"},
      {"time": "17:00", "activity": "바다수영 (구명조끼 제공, 에메랄드빛 청정해역)"},
      {"time": "17:30", "activity": "해피아워 (비스킷, 제철과일, 선셋파티, 칵테일 1+1)"},
      {"time": "19:30", "activity": "디너식사 (베지테리언/키즈메뉴 가능, 30인 이상 시 뷔페, 음료/주류 별도)"},
      {"time": "21:00", "activity": "자유시간 (자쿠지, 야경감상, 라운지 등)"},
      {"time": "22:00", "activity": "1일차 공식 일정 종료"}
    ]},
    {"day": 2, "title": "2일차", "schedule": [
      {"time": "05:30", "activity": "하롱의 일출감상 (객실 또는 선데크)"},
      {"time": "06:30", "activity": "태극권 스트레칭 (선데크, 자율참여)"},
      {"time": "07:00", "activity": "이른 조식 (페스츄리, 커피, 차)"},
      {"time": "08:00", "activity": "전통 다도체험 (6층 로프탑, 베트남 전통 다도)"},
      {"time": "09:00", "activity": "객실 체크아웃 (객실카드 반납, 음료 결제)"},
      {"time": "09:20", "activity": "브런치 뷔페 (하선 전 마지막 식사)"},
      {"time": "10:30", "activity": "크루즈 하선"},
      {"time": "11:30", "activity": "복귀차량 승차 (통상 11시~11시30분)"},
      {"time": "14:00", "activity": "하노이 도착 (교통상황 따라 상이)"}
    ]}
  ]'::jsonb,
  '[
    {"condition": "크루즈 승선코드 발급 전", "penalty": "수수료 없는 무료 취소 (승선일자 변경 무료)"},
    {"condition": "승선코드 발급 후 이용일자 31일 전까지", "penalty": "총 금액에서 100만동 위약금 발생 (1인당 아님)"},
    {"condition": "이용일자 21~30일 전", "penalty": "15% 위약금 발생"},
    {"condition": "이용일자 17~20일 전", "penalty": "50% 위약금 발생"},
    {"condition": "이용일자 16일 전부터", "penalty": "취소/환불/날짜변경 불가"},
    {"condition": "천재지변, 태풍, 정부명령, 승선인원 미달, 크루즈사 사정 결항", "penalty": "전액 환불 보장 (추가 보상 없음)"},
    {"condition": "고객 사유 항공편 결항", "penalty": "환불 대상 제외"},
    {"condition": "교통사고/중대한 질병 (영문 진단서 제출)", "penalty": "환자 본인 1인에 한해 심사 후 예외 환불 가능"},
    {"condition": "예약 후 요금 인하", "penalty": "원칙적으로 차액 환불 없음 (프로모션 예외 가능)"},
    {"condition": "환불 처리 기간", "penalty": "통상 취소신청서 작성일 기준 약 2개월 (주말/공휴일/명절 제외)"}
  ]'::jsonb,
  '웰컴드링크\n총 4번의 식사\n외부투어 시 영어가이드\n카약킹\n마사지룸 체험과 뷰테라스 이용\n다도체험\n다크앤브라이트 동굴투어 (카약이나 뱀부보트)\n해피아워 까나페\n선상안전보험 및 서비스 차지\n30분 마사지 무료 (VIP 스위트)',
  '이동차량 서비스\n별도 주문하는 음료 및 주류\n추가 마사지 및 스파 서비스\n항공요금 및 공항픽드랍 서비스\n생일 및 기념일 이벤트',
  '6', '168명',
  '2025년 12월 신규 출항',
  '["수영장", "스파 (마사지)", "Gym (휘트니스)", "미니골프", "레스토랑", "로비/리셉션", "선데크", "루프탑"]'::jsonb,
  5,
  '{"pool": true, "spa": true, "gym": true, "mini_golf": true, "restaurant": true, "lounge": false, "sundeck": true, "rooftop": true, "full_ocean_view": true, "vip": true, "private_terrace_rear": true, "free_massage": true}'::jsonb
);

-- =====================================================
-- 6) 란하 스위트 (LAN HA SUITE - VIP, 정면 테라스)
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
  'DIANA-LH', '다이아나 크루즈', 'Diana Cruise',
  '5성급 비너스 크루즈가 2025년 12월 선보인 6성급 크루즈. 하롱베이의 청정해역 란하베이를 운항. 비교적 신형크루즈이지만 시설 만족도가 다소 떨어짐. 전객실 완전한 오션뷰 발코니 제공. 특별함 없는 편안한 쉼을 원하시는 분들께 적합.',
  '1박2일', NULL,
  '란하 스위트', '65m²',
  '크루즈 3층에 위치한 최고급 VIP 스위트 객실. 크루즈 정면 단독 테라스 제공. 킹베드 고정타입. 최상위 VIP 객실 혜택 제공. 싱글차지 1인 혼자 사용 가능. 기본인원 성인 2인, 최대인원 성인 3인(엑스트라베드) 또는 성인 2인 + 아동 2인(아동 1인은 성인 엑스트라 요금).',
  '킹 고정', 3, 3, true, true, false,
  false, true, true,
  '오션뷰 발코니, 정면 전용 테라스, 커넥팅룸, 욕조, 스탠딩샤워, 30분 마사지 무료 (2인)',
  NULL,
  '[
    {"day": 1, "title": "1일차", "schedule": [
      {"time": "08:00", "activity": "하노이 호텔 앞 차량 픽업 (전날 밤 9시경 시간 안내)"},
      {"time": "11:00", "activity": "하롱베이 선착장 도착 및 체크인 (예약확인서 불필요, 여권 사진 가능)"},
      {"time": "11:45", "activity": "텐더보트 승선 후 크루즈로 이동 (약 40분)"},
      {"time": "12:30", "activity": "크루즈 승선 - 웰컴드링크 및 안전지침/투어일정 안내"},
      {"time": "13:00", "activity": "점심 뷔페식사 (음료 및 주류 별도)"},
      {"time": "15:00", "activity": "다크앤브라이트 동굴투어 (카약/뱀부보트, 약 100미터 동굴)"},
      {"time": "17:00", "activity": "바다수영 (구명조끼 제공, 에메랄드빛 청정해역)"},
      {"time": "17:30", "activity": "해피아워 (비스킷, 제철과일, 선셋파티, 칵테일 1+1)"},
      {"time": "19:30", "activity": "디너식사 (베지테리언/키즈메뉴 가능, 30인 이상 시 뷔페, 음료/주류 별도)"},
      {"time": "21:00", "activity": "자유시간 (자쿠지, 야경감상, 라운지 등)"},
      {"time": "22:00", "activity": "1일차 공식 일정 종료"}
    ]},
    {"day": 2, "title": "2일차", "schedule": [
      {"time": "05:30", "activity": "하롱의 일출감상 (객실 또는 선데크)"},
      {"time": "06:30", "activity": "태극권 스트레칭 (선데크, 자율참여)"},
      {"time": "07:00", "activity": "이른 조식 (페스츄리, 커피, 차)"},
      {"time": "08:00", "activity": "전통 다도체험 (6층 로프탑, 베트남 전통 다도)"},
      {"time": "09:00", "activity": "객실 체크아웃 (객실카드 반납, 음료 결제)"},
      {"time": "09:20", "activity": "브런치 뷔페 (하선 전 마지막 식사)"},
      {"time": "10:30", "activity": "크루즈 하선"},
      {"time": "11:30", "activity": "복귀차량 승차 (통상 11시~11시30분)"},
      {"time": "14:00", "activity": "하노이 도착 (교통상황 따라 상이)"}
    ]}
  ]'::jsonb,
  '[
    {"condition": "크루즈 승선코드 발급 전", "penalty": "수수료 없는 무료 취소 (승선일자 변경 무료)"},
    {"condition": "승선코드 발급 후 이용일자 31일 전까지", "penalty": "총 금액에서 100만동 위약금 발생 (1인당 아님)"},
    {"condition": "이용일자 21~30일 전", "penalty": "15% 위약금 발생"},
    {"condition": "이용일자 17~20일 전", "penalty": "50% 위약금 발생"},
    {"condition": "이용일자 16일 전부터", "penalty": "취소/환불/날짜변경 불가"},
    {"condition": "천재지변, 태풍, 정부명령, 승선인원 미달, 크루즈사 사정 결항", "penalty": "전액 환불 보장 (추가 보상 없음)"},
    {"condition": "고객 사유 항공편 결항", "penalty": "환불 대상 제외"},
    {"condition": "교통사고/중대한 질병 (영문 진단서 제출)", "penalty": "환자 본인 1인에 한해 심사 후 예외 환불 가능"},
    {"condition": "예약 후 요금 인하", "penalty": "원칙적으로 차액 환불 없음 (프로모션 예외 가능)"},
    {"condition": "환불 처리 기간", "penalty": "통상 취소신청서 작성일 기준 약 2개월 (주말/공휴일/명절 제외)"}
  ]'::jsonb,
  '웰컴드링크\n총 4번의 식사\n외부투어 시 영어가이드\n카약킹\n마사지룸 체험과 뷰테라스 이용\n다도체험\n다크앤브라이트 동굴투어 (카약이나 뱀부보트)\n해피아워 까나페\n선상안전보험 및 서비스 차지\n30분 마사지 무료 (VIP 스위트)',
  '이동차량 서비스\n별도 주문하는 음료 및 주류\n추가 마사지 및 스파 서비스\n항공요금 및 공항픽드랍 서비스\n생일 및 기념일 이벤트',
  '6', '168명',
  '2025년 12월 신규 출항',
  '["수영장", "스파 (마사지)", "Gym (휘트니스)", "미니골프", "레스토랑", "로비/리셉션", "선데크", "루프탑"]'::jsonb,
  6,
  '{"pool": true, "spa": true, "gym": true, "mini_golf": true, "restaurant": true, "lounge": false, "sundeck": true, "rooftop": true, "full_ocean_view": true, "vip": true, "private_terrace_front": true, "free_massage": true}'::jsonb
);

-- =====================================================
-- 검증 쿼리 (실행 후 확인용)
-- =====================================================
-- SELECT cruise_code, cruise_name, room_name, room_area, display_order, is_vip, is_recommended
-- FROM cruise_info
-- WHERE cruise_name = '다이아나 크루즈'
-- ORDER BY display_order;
-- 기대 결과: 6행 (DIANA-JB, DIANA-SB, DIANA-EX, DIANA-PR, DIANA-HL, DIANA-LH)
