-- =====================================================
-- 022-halora-nova-cruise-data.sql
-- 할로라 노바 크루즈 상세 정보 (4개 객실 타입)
-- =====================================================
-- 실행 전 011-cruise-info-columns.sql 먼저 실행 필요

-- 기존 할로라 노바 크루즈 데이터 삭제 (재실행 가능하도록)
DELETE FROM cruise_info
WHERE cruise_code LIKE 'HALORA-%'
   OR cruise_name = '할로라 노바 크루즈';

-- 공통 일정/규정/포함사항은 각 객실 행에 동일하게 저장

-- =====================================================
-- 1) 디럭스 발코니 오션뷰 (HALORA-DELUXE)
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
  'HALORA-DELUXE', '할로라 노바 크루즈', 'Halora Nova Cruise',
  '란하베이에 새롭게 출항한 쾌적한 환경의 5성급 크루즈. 기존 유명 크루즈 주요 스탭들이 대거 투입되었으며 크루즈 앞쪽의 사계절 자쿠지풀 구성. 가성비 좋은 크루즈를 찾는 분들께 추천.',
  '1박2일', NULL,
  '디럭스 발코니 오션뷰', '35m²',
  '크루즈 1층에 위치하는 가장 기본 객실타입. 완전한 오션뷰의 단독 발코니 제공. 더블베드 또는 트윈베드 선택 가능. 욕실 내 욕조 제공. 싱글차지 1인 혼자 사용 가능. 기본인원 성인 2인, 최대인원 성인 3인(엑스트라베드) 또는 성인 2인 + 아동 2인.',
  '더블 또는 트윈', 3, 4, true, false, false,
  false, true, true,
  '오션뷰 발코니, 욕조, 스탠딩샤워',
  NULL,
  '[
    {"day": 1, "title": "1일차", "schedule": [
      {"time": "08:00", "activity": "픽업차량 승차 (전날 밤 안내드린 승차시간에 호텔 앞에서 승차)"},
      {"time": "10:40", "activity": "선착장 도착 / 하차 (직원 명단 확인 및 체크인, 대기실에서 약 1~1.5시간 대기)"},
      {"time": "12:00", "activity": "텐더보트 승선 (직원들의 안내에 따라 승선)"},
      {"time": "12:45", "activity": "크루즈 본선 승선 (란하베이로 이동, 로비/레스토랑에서 투어 안내)"},
      {"time": "13:00", "activity": "점심 뷔페식사 (승선인원이 적은 경우 코스식, 음료 및 주류 별도)"},
      {"time": "15:00", "activity": "AO EC 해역 투어 (바다수영 또는 카약킹, 안전요원 상주)"},
      {"time": "17:00", "activity": "해피아워 (선데크, 간단한 간식 무료제공, 쿠킹클래스)"},
      {"time": "19:00", "activity": "디너 코스식사 (베지테리언/키즈메뉴 별도 요청 가능, 음료 및 주류 별도)"},
      {"time": "20:30", "activity": "자유시간 / 오징어 낚시 (마사지, 수영장 이용, 1층 로비에서 오징어 낚시 체험)"},
      {"time": "22:00", "activity": "1일차 공식 일정 종료"}
    ]},
    {"day": 2, "title": "2일차", "schedule": [
      {"time": "06:15", "activity": "태극권 체험 (선데크에서 하롱의 아침을 맞이하며 태극권 체험)"},
      {"time": "06:45", "activity": "아침 조식 (간단한 빵과 과일, 디저트, 시리얼, 쌀국수 메뉴 제공)"},
      {"time": "07:30", "activity": "다크앤브라이트 동굴 (카약 2인 무료, 뱀부보트 무료, 야생 원숭이 투어코스)"},
      {"time": "09:00", "activity": "객실 체크아웃 (짐은 객실 문 앞, 1층 리셉션에 객실카드 반납, 음료 결제)"},
      {"time": "09:30", "activity": "브런치 뷔페식사 (하선 전 마지막 식사)"},
      {"time": "10:45", "activity": "하선 / 텐더보트 승선 (직원 안내에 따라 승선, 캐리어는 직원이 이동)"},
      {"time": "11:15", "activity": "선착장 대기실 도착 (차량 승차 대기, 통상 11시 30분경 승차)"},
      {"time": "14:00", "activity": "하노이 도착 (도로상황에 따라 도착시간 차이 있을 수 있음)"}
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
  '총 4번의 식사 (점심뷔페, 디너코스, 조식, 브런치뷔페)\n카약킹\n뱀부보트\n다크앤브라이트 동굴투어\n해피아워 간식\n바다수영\n선상안전보험 및 서비스 차지',
  '이동차량 서비스\n별도 주문하는 음료 및 주류\n마사지 및 스파 서비스',
  '5', '130명',
  NULL,
  '["수영장", "자쿠지", "키즈룸", "사우나", "노래방", "엘리베이터", "포커볼", "라운지", "스크린골프", "마사지", "GYM", "메디컬센터", "시네마", "BAR", "프라이빗 레스토랑", "미니골프", "공용샤워실", "포켓볼", "온천(탕)", "레스토랑"]'::jsonb,
  1,
  '{"pool": true, "jacuzzi": true, "kids_room": true, "sauna": true, "karaoke": true, "elevator": true, "lounge": true, "screen_golf": true, "spa": true, "gym": true, "medical_center": true, "cinema": true, "bar": true, "mini_golf": true, "restaurant": true, "full_ocean_view": true, "balcony": true}'::jsonb
);

-- =====================================================
-- 2) 프리미엄 발코니 오션뷰 (HALORA-PREMIUM)
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
  'HALORA-PREMIUM', '할로라 노바 크루즈', 'Halora Nova Cruise',
  '란하베이에 새롭게 출항한 쾌적한 환경의 5성급 크루즈. 기존 유명 크루즈 주요 스탭들이 대거 투입되었으며 크루즈 앞쪽의 사계절 자쿠지풀 구성. 가성비 좋은 크루즈를 찾는 분들께 추천.',
  '1박2일', NULL,
  '프리미엄 발코니 오션뷰', '35m²',
  '크루즈 2층, 3층에 위치하는 객실타입으로 층은 랜덤배정. 완전한 오션뷰의 단독 발코니 제공. 더블베드 또는 트윈베드 선택 가능. 트리플 객실타입 가능. 욕실 내 욕조 제공. 싱글차지 1인 혼자 사용 가능. 기본인원 성인 2인, 최대인원 성인 3인(엑스트라베드) 또는 성인 2인 + 아동 2인.',
  '더블 또는 트윈', 3, 4, true, false, false,
  false, true, true,
  '오션뷰 발코니, 욕조, 스탠딩샤워',
  NULL,
  '[
    {"day": 1, "title": "1일차", "schedule": [
      {"time": "08:00", "activity": "픽업차량 승차 (전날 밤 안내드린 승차시간에 호텔 앞에서 승차)"},
      {"time": "10:40", "activity": "선착장 도착 / 하차 (직원 명단 확인 및 체크인, 대기실에서 약 1~1.5시간 대기)"},
      {"time": "12:00", "activity": "텐더보트 승선 (직원들의 안내에 따라 승선)"},
      {"time": "12:45", "activity": "크루즈 본선 승선 (란하베이로 이동, 로비/레스토랑에서 투어 안내)"},
      {"time": "13:00", "activity": "점심 뷔페식사 (승선인원이 적은 경우 코스식, 음료 및 주류 별도)"},
      {"time": "15:00", "activity": "AO EC 해역 투어 (바다수영 또는 카약킹, 안전요원 상주)"},
      {"time": "17:00", "activity": "해피아워 (선데크, 간단한 간식 무료제공, 쿠킹클래스)"},
      {"time": "19:00", "activity": "디너 코스식사 (베지테리언/키즈메뉴 별도 요청 가능, 음료 및 주류 별도)"},
      {"time": "20:30", "activity": "자유시간 / 오징어 낚시 (마사지, 수영장 이용, 1층 로비에서 오징어 낚시 체험)"},
      {"time": "22:00", "activity": "1일차 공식 일정 종료"}
    ]},
    {"day": 2, "title": "2일차", "schedule": [
      {"time": "06:15", "activity": "태극권 체험 (선데크에서 하롱의 아침을 맞이하며 태극권 체험)"},
      {"time": "06:45", "activity": "아침 조식 (간단한 빵과 과일, 디저트, 시리얼, 쌀국수 메뉴 제공)"},
      {"time": "07:30", "activity": "다크앤브라이트 동굴 (카약 2인 무료, 뱀부보트 무료, 야생 원숭이 투어코스)"},
      {"time": "09:00", "activity": "객실 체크아웃 (짐은 객실 문 앞, 1층 리셉션에 객실카드 반납, 음료 결제)"},
      {"time": "09:30", "activity": "브런치 뷔페식사 (하선 전 마지막 식사)"},
      {"time": "10:45", "activity": "하선 / 텐더보트 승선 (직원 안내에 따라 승선, 캐리어는 직원이 이동)"},
      {"time": "11:15", "activity": "선착장 대기실 도착 (차량 승차 대기, 통상 11시 30분경 승차)"},
      {"time": "14:00", "activity": "하노이 도착 (도로상황에 따라 도착시간 차이 있을 수 있음)"}
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
  '총 4번의 식사 (점심뷔페, 디너코스, 조식, 브런치뷔페)\n카약킹\n뱀부보트\n다크앤브라이트 동굴투어\n해피아워 간식\n바다수영\n선상안전보험 및 서비스 차지',
  '이동차량 서비스\n별도 주문하는 음료 및 주류\n마사지 및 스파 서비스',
  '5', '130명',
  NULL,
  '["수영장", "자쿠지", "키즈룸", "사우나", "노래방", "엘리베이터", "포커볼", "라운지", "스크린골프", "마사지", "GYM", "메디컬센터", "시네마", "BAR", "프라이빗 레스토랑", "미니골프", "공용샤워실", "포켓볼", "온천(탕)", "레스토랑"]'::jsonb,
  2,
  '{"pool": true, "jacuzzi": true, "kids_room": true, "sauna": true, "karaoke": true, "elevator": true, "lounge": true, "screen_golf": true, "spa": true, "gym": true, "medical_center": true, "cinema": true, "bar": true, "mini_golf": true, "restaurant": true, "full_ocean_view": true, "balcony": true}'::jsonb
);

-- =====================================================
-- 3) 할로라 스위트 (HALORA-SUITE)
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
  'HALORA-SUITE', '할로라 노바 크루즈', 'Halora Nova Cruise',
  '란하베이에 새롭게 출항한 쾌적한 환경의 5성급 크루즈. 기존 유명 크루즈 주요 스탭들이 대거 투입되었으며 크루즈 앞쪽의 사계절 자쿠지풀 구성. 가성비 좋은 크루즈를 찾는 분들께 추천.',
  '1박2일', NULL,
  '할로라 스위트', '40m²',
  '크루즈 3층, 4층에 위치하는 객실타입으로 층은 랜덤배정. 완전한 오션뷰의 단독 발코니 제공. 더블베드 고정타입. 욕실 내 욕조 제공. 선베드 제공. 싱글차지 1인 혼자 사용 가능. 기본인원 성인 2인, 최대인원 성인 3인(엑스트라베드) 또는 성인 2인 + 아동 2인.',
  '더블 고정', 3, 4, true, false, false,
  false, true, true,
  '오션뷰 발코니, 욕조, 스탠딩샤워, 선베드',
  NULL,
  '[
    {"day": 1, "title": "1일차", "schedule": [
      {"time": "08:00", "activity": "픽업차량 승차 (전날 밤 안내드린 승차시간에 호텔 앞에서 승차)"},
      {"time": "10:40", "activity": "선착장 도착 / 하차 (직원 명단 확인 및 체크인, 대기실에서 약 1~1.5시간 대기)"},
      {"time": "12:00", "activity": "텐더보트 승선 (직원들의 안내에 따라 승선)"},
      {"time": "12:45", "activity": "크루즈 본선 승선 (란하베이로 이동, 로비/레스토랑에서 투어 안내)"},
      {"time": "13:00", "activity": "점심 뷔페식사 (승선인원이 적은 경우 코스식, 음료 및 주류 별도)"},
      {"time": "15:00", "activity": "AO EC 해역 투어 (바다수영 또는 카약킹, 안전요원 상주)"},
      {"time": "17:00", "activity": "해피아워 (선데크, 간단한 간식 무료제공, 쿠킹클래스)"},
      {"time": "19:00", "activity": "디너 코스식사 (베지테리언/키즈메뉴 별도 요청 가능, 음료 및 주류 별도)"},
      {"time": "20:30", "activity": "자유시간 / 오징어 낚시 (마사지, 수영장 이용, 1층 로비에서 오징어 낚시 체험)"},
      {"time": "22:00", "activity": "1일차 공식 일정 종료"}
    ]},
    {"day": 2, "title": "2일차", "schedule": [
      {"time": "06:15", "activity": "태극권 체험 (선데크에서 하롱의 아침을 맞이하며 태극권 체험)"},
      {"time": "06:45", "activity": "아침 조식 (간단한 빵과 과일, 디저트, 시리얼, 쌀국수 메뉴 제공)"},
      {"time": "07:30", "activity": "다크앤브라이트 동굴 (카약 2인 무료, 뱀부보트 무료, 야생 원숭이 투어코스)"},
      {"time": "09:00", "activity": "객실 체크아웃 (짐은 객실 문 앞, 1층 리셉션에 객실카드 반납, 음료 결제)"},
      {"time": "09:30", "activity": "브런치 뷔페식사 (하선 전 마지막 식사)"},
      {"time": "10:45", "activity": "하선 / 텐더보트 승선 (직원 안내에 따라 승선, 캐리어는 직원이 이동)"},
      {"time": "11:15", "activity": "선착장 대기실 도착 (차량 승차 대기, 통상 11시 30분경 승차)"},
      {"time": "14:00", "activity": "하노이 도착 (도로상황에 따라 도착시간 차이 있을 수 있음)"}
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
  '총 4번의 식사 (점심뷔페, 디너코스, 조식, 브런치뷔페)\n카약킹\n뱀부보트\n다크앤브라이트 동굴투어\n해피아워 간식\n바다수영\n선상안전보험 및 서비스 차지',
  '이동차량 서비스\n별도 주문하는 음료 및 주류\n마사지 및 스파 서비스',
  '5', '130명',
  NULL,
  '["수영장", "자쿠지", "키즈룸", "사우나", "노래방", "엘리베이터", "포커볼", "라운지", "스크린골프", "마사지", "GYM", "메디컬센터", "시네마", "BAR", "프라이빗 레스토랑", "미니골프", "공용샤워실", "포켓볼", "온천(탕)", "레스토랑"]'::jsonb,
  3,
  '{"pool": true, "jacuzzi": true, "kids_room": true, "sauna": true, "karaoke": true, "elevator": true, "lounge": true, "screen_golf": true, "spa": true, "gym": true, "medical_center": true, "cinema": true, "bar": true, "mini_golf": true, "restaurant": true, "full_ocean_view": true, "balcony": true, "sunbed": true}'::jsonb
);

-- =====================================================
-- 4) 그랜드 스위트 (HALORA-GRAND)
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
  'HALORA-GRAND', '할로라 노바 크루즈', 'Halora Nova Cruise',
  '란하베이에 새롭게 출항한 쾌적한 환경의 5성급 크루즈. 기존 유명 크루즈 주요 스탭들이 대거 투입되었으며 크루즈 앞쪽의 사계절 자쿠지풀 구성. 가성비 좋은 크루즈를 찾는 분들께 추천.',
  '1박2일', NULL,
  '그랜드 스위트', '65m²',
  '크루즈 3층에 위치하는 최대 면적 객실타입. 완전한 오션뷰의 단독 발코니 제공. 더블베드 고정타입. 욕실 내 욕조 제공. 선베드 제공. 싱글차지 1인 혼자 사용 가능. 기본인원 성인 2인, 최대인원 성인 3인(엑스트라베드) 또는 성인 2인 + 아동 2인.',
  '더블 고정', 3, 4, true, false, false,
  false, true, true,
  '오션뷰 발코니, 욕조, 스탠딩샤워, 선베드',
  NULL,
  '[
    {"day": 1, "title": "1일차", "schedule": [
      {"time": "08:00", "activity": "픽업차량 승차 (전날 밤 안내드린 승차시간에 호텔 앞에서 승차)"},
      {"time": "10:40", "activity": "선착장 도착 / 하차 (직원 명단 확인 및 체크인, 대기실에서 약 1~1.5시간 대기)"},
      {"time": "12:00", "activity": "텐더보트 승선 (직원들의 안내에 따라 승선)"},
      {"time": "12:45", "activity": "크루즈 본선 승선 (란하베이로 이동, 로비/레스토랑에서 투어 안내)"},
      {"time": "13:00", "activity": "점심 뷔페식사 (승선인원이 적은 경우 코스식, 음료 및 주류 별도)"},
      {"time": "15:00", "activity": "AO EC 해역 투어 (바다수영 또는 카약킹, 안전요원 상주)"},
      {"time": "17:00", "activity": "해피아워 (선데크, 간단한 간식 무료제공, 쿠킹클래스)"},
      {"time": "19:00", "activity": "디너 코스식사 (베지테리언/키즈메뉴 별도 요청 가능, 음료 및 주류 별도)"},
      {"time": "20:30", "activity": "자유시간 / 오징어 낚시 (마사지, 수영장 이용, 1층 로비에서 오징어 낚시 체험)"},
      {"time": "22:00", "activity": "1일차 공식 일정 종료"}
    ]},
    {"day": 2, "title": "2일차", "schedule": [
      {"time": "06:15", "activity": "태극권 체험 (선데크에서 하롱의 아침을 맞이하며 태극권 체험)"},
      {"time": "06:45", "activity": "아침 조식 (간단한 빵과 과일, 디저트, 시리얼, 쌀국수 메뉴 제공)"},
      {"time": "07:30", "activity": "다크앤브라이트 동굴 (카약 2인 무료, 뱀부보트 무료, 야생 원숭이 투어코스)"},
      {"time": "09:00", "activity": "객실 체크아웃 (짐은 객실 문 앞, 1층 리셉션에 객실카드 반납, 음료 결제)"},
      {"time": "09:30", "activity": "브런치 뷔페식사 (하선 전 마지막 식사)"},
      {"time": "10:45", "activity": "하선 / 텐더보트 승선 (직원 안내에 따라 승선, 캐리어는 직원이 이동)"},
      {"time": "11:15", "activity": "선착장 대기실 도착 (차량 승차 대기, 통상 11시 30분경 승차)"},
      {"time": "14:00", "activity": "하노이 도착 (도로상황에 따라 도착시간 차이 있을 수 있음)"}
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
  '총 4번의 식사 (점심뷔페, 디너코스, 조식, 브런치뷔페)\n카약킹\n뱀부보트\n다크앤브라이트 동굴투어\n해피아워 간식\n바다수영\n선상안전보험 및 서비스 차지',
  '이동차량 서비스\n별도 주문하는 음료 및 주류\n마사지 및 스파 서비스',
  '5', '130명',
  NULL,
  '["수영장", "자쿠지", "키즈룸", "사우나", "노래방", "엘리베이터", "포커볼", "라운지", "스크린골프", "마사지", "GYM", "메디컬센터", "시네마", "BAR", "프라이빗 레스토랑", "미니골프", "공용샤워실", "포켓볼", "온천(탕)", "레스토랑"]'::jsonb,
  4,
  '{"pool": true, "jacuzzi": true, "kids_room": true, "sauna": true, "karaoke": true, "elevator": true, "lounge": true, "screen_golf": true, "spa": true, "gym": true, "medical_center": true, "cinema": true, "bar": true, "mini_golf": true, "restaurant": true, "full_ocean_view": true, "balcony": true, "sunbed": true}'::jsonb
);

-- =====================================================
-- 검증 쿼리 (실행 후 확인용)
-- =====================================================
-- SELECT cruise_code, cruise_name, room_name, room_area, display_order, is_vip, is_recommended
-- FROM cruise_info
-- WHERE cruise_name = '할로라 노바 크루즈'
-- ORDER BY display_order;
-- 기대 결과: 4행 (HALORA-DELUXE, HALORA-PREMIUM, HALORA-SUITE, HALORA-GRAND)
