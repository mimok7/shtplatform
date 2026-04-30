-- =====================================================
-- 019-ambassador-signature-cruise-data.sql
-- 엠바사더 시그니쳐 크루즈 상세 정보 (4개 객실 타입)
-- =====================================================
-- 실행 전 011-cruise-info-columns.sql 먼저 실행 필요

-- 기존 엠바사더 시그니쳐 크루즈 데이터 삭제 (재실행 가능하도록)
DELETE FROM cruise_info
WHERE cruise_code LIKE 'AMSIG-%'
   OR cruise_name = '엠바사더 시그니쳐 크루즈';

-- 공통 일정/규정/포함사항은 각 객실 행에 동일하게 저장

-- =====================================================
-- 1) 발코니룸 (BALCONY)
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
  'AMSIG-BR', '엠바사더 시그니쳐 크루즈', 'Ambassador Signature Cruise',
  '2023년 엠바사더 크루즈가 선보인 신규출항 크루즈 라인. 맑고 깨끗한 청정해역 란하베이를 운항하며, 워터슬라이드를 통한 바다수영과 깟바섬 비엣하이빌리지 투어 등 다이내믹한 투어프로그램을 운영. 전객실 완전한 오션뷰 발코니를 제공하는 크루즈. 엠바사더 데이크루즈로 한국 관광객에게 유명한 크루즈 브랜드.',
  '1박2일', NULL,
  '발코니룸', '28m²',
  '크루즈 1층/2층에 위치한 기본형 객실. 더블베드 또는 트윈베드(싱글 2개) 선택 가능. 커넥팅룸 이용 가능. 싱글차지 1인 혼자 사용 가능. 기본인원 성인 2인, 최대인원 성인 3인(엑스트라베드) 또는 성인 2인 + 아동 2인(아동 1인은 성인 엑스트라 요금).',
  '더블 또는 트윈', 3, 3, true, false, false,
  true, true, true,
  '오션뷰 발코니, 커넥팅룸, 욕조, 스탠딩샤워',
  '크루즈 1층에 위치하는 가장 기본형 객실. 2층에 위치한 프리미엄 객실과 객실면적, 디자인, 구성은 완전하게 동일.',
  '[
    {"day": 1, "title": "1일차", "schedule": [
      {"time": "08:00", "activity": "하노이 호텔 앞 차량 픽업 (전날 밤 9시경 시간 안내)"},
      {"time": "11:00", "activity": "하롱베이 선착장 도착 및 체크인 (예약확인서 불필요, 여권 사진 가능)"},
      {"time": "11:45", "activity": "텐더보트 승선 후 크루즈로 이동 (약 40분)"},
      {"time": "12:30", "activity": "라운지 착석 - 웰컴드링크 및 안전지침/투어일정 안내"},
      {"time": "12:45", "activity": "점심 뷔페식사 (음료 및 주류 별도)"},
      {"time": "15:00", "activity": "비엣하이빌리지 투어 (전기차 또는 자전거 이동, 깟바섬 국립공원 내 원시마을 관람)"},
      {"time": "16:30", "activity": "워터슬라이드 및 바다수영 (구명조끼 구비, 안전요원 상주)"},
      {"time": "17:30", "activity": "해피아워 (비스킷/과일/선셋파티, 쿠킹클래스, 칵테일 1+1)"},
      {"time": "19:00", "activity": "디너식사 (베지테리언/키즈메뉴 가능, 생일/기념 이벤트 가능, 음료/주류 별도)"},
      {"time": "21:00", "activity": "라이브 공연 (피아노 라운지, 화요일 공연 휴무), 오징어낚시, 스파 등 자유시간"},
      {"time": "22:00", "activity": "1일차 공식 일정 종료"}
    ]},
    {"day": 2, "title": "2일차", "schedule": [
      {"time": "05:30", "activity": "일출 감상 (객실 또는 선데크)"},
      {"time": "06:00", "activity": "태극권 스트레칭 (선데크, 자율참여)"},
      {"time": "06:30", "activity": "이른 조식뷔페 (페스츄리, 커피, 차)"},
      {"time": "07:00", "activity": "다크앤브라이트 동굴 투어 (카약/뱀부보트, 방수팩 준비)"},
      {"time": "08:30", "activity": "브런치 식사"},
      {"time": "09:30", "activity": "객실 체크아웃 및 최종 결제 (신용카드 가능)"},
      {"time": "10:15", "activity": "크루즈 하선"},
      {"time": "11:30", "activity": "복귀 차량 승차"},
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
  '웰컴드링크\n총 4번의 식사\n외부투어 시 영어가이드\n비엣하이빌리지 (전기차 또는 자전거 이동)\n탄더스파 체험\n해피아워 까나페\n선상 안전보험 및 서비스 차지\n(다크앤브라이트 동굴 카약킹은 포함 패키지 해당)',
  '이동차량 서비스\n별도 주문 음료 및 주류\n마사지 및 스파 서비스\n다크앤브라이트 동굴 (카약/뱀부보트)\n항공요금 및 공항 픽드랍 서비스\n생일 및 기념일 이벤트',
  NULL, '120명',
  '2023년 신규 출항',
  '["로비/리셉션", "레스토랑", "피아노 라운지", "스파 (마사지)", "워터슬라이드", "선데크"]'::jsonb,
  1,
  '{"water_slide": true, "restaurant": true, "lounge": true, "spa": true, "live_performance": true, "full_ocean_view": true, "viet_hai_village": true}'::jsonb
);

-- =====================================================
-- 2) 이그제큐티브 (EXECUTIVE)
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
  'AMSIG-EX', '엠바사더 시그니쳐 크루즈', 'Ambassador Signature Cruise',
  '2023년 엠바사더 크루즈가 선보인 신규출항 크루즈 라인. 맑고 깨끗한 청정해역 란하베이를 운항하며, 워터슬라이드를 통한 바다수영과 깟바섬 비엣하이빌리지 투어 등 다이내믹한 투어프로그램을 운영. 전객실 완전한 오션뷰 발코니를 제공하는 크루즈. 엠바사더 데이크루즈로 한국 관광객에게 유명한 크루즈 브랜드.',
  '1박2일', NULL,
  '이그제큐티브', '28m²',
  '크루즈 1층/2층에 위치한 이그제큐티브 객실. 더블베드 또는 트윈베드(싱글 2개) 선택 가능. 커넥팅룸 이용 가능. 싱글차지 1인 혼자 사용 가능. 기본인원 성인 2인, 최대인원 성인 3인(엑스트라베드) 또는 성인 2인 + 아동 2인(아동 1인은 성인 엑스트라 요금).',
  '더블 또는 트윈', 3, 3, true, false, false,
  false, true, true,
  '오션뷰 발코니, 커넥팅룸, 욕조, 스탠딩샤워',
  NULL,
  '[
    {"day": 1, "title": "1일차", "schedule": [
      {"time": "08:00", "activity": "하노이 호텔 앞 차량 픽업 (전날 밤 9시경 시간 안내)"},
      {"time": "11:00", "activity": "하롱베이 선착장 도착 및 체크인 (예약확인서 불필요, 여권 사진 가능)"},
      {"time": "11:45", "activity": "텐더보트 승선 후 크루즈로 이동 (약 40분)"},
      {"time": "12:30", "activity": "라운지 착석 - 웰컴드링크 및 안전지침/투어일정 안내"},
      {"time": "12:45", "activity": "점심 뷔페식사 (음료 및 주류 별도)"},
      {"time": "15:00", "activity": "비엣하이빌리지 투어 (전기차 또는 자전거 이동, 깟바섬 국립공원 내 원시마을 관람)"},
      {"time": "16:30", "activity": "워터슬라이드 및 바다수영 (구명조끼 구비, 안전요원 상주)"},
      {"time": "17:30", "activity": "해피아워 (비스킷/과일/선셋파티, 쿠킹클래스, 칵테일 1+1)"},
      {"time": "19:00", "activity": "디너식사 (베지테리언/키즈메뉴 가능, 생일/기념 이벤트 가능, 음료/주류 별도)"},
      {"time": "21:00", "activity": "라이브 공연 (피아노 라운지, 화요일 공연 휴무), 오징어낚시, 스파 등 자유시간"},
      {"time": "22:00", "activity": "1일차 공식 일정 종료"}
    ]},
    {"day": 2, "title": "2일차", "schedule": [
      {"time": "05:30", "activity": "일출 감상 (객실 또는 선데크)"},
      {"time": "06:00", "activity": "태극권 스트레칭 (선데크, 자율참여)"},
      {"time": "06:30", "activity": "이른 조식뷔페 (페스츄리, 커피, 차)"},
      {"time": "07:00", "activity": "다크앤브라이트 동굴 투어 (카약/뱀부보트, 방수팩 준비)"},
      {"time": "08:30", "activity": "브런치 식사"},
      {"time": "09:30", "activity": "객실 체크아웃 및 최종 결제 (신용카드 가능)"},
      {"time": "10:15", "activity": "크루즈 하선"},
      {"time": "11:30", "activity": "복귀 차량 승차"},
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
  '웰컴드링크\n총 4번의 식사\n외부투어 시 영어가이드\n비엣하이빌리지 (전기차 또는 자전거 이동)\n탄더스파 체험\n해피아워 까나페\n선상 안전보험 및 서비스 차지\n(다크앤브라이트 동굴 카약킹은 포함 패키지 해당)',
  '이동차량 서비스\n별도 주문 음료 및 주류\n마사지 및 스파 서비스\n다크앤브라이트 동굴 (카약/뱀부보트)\n항공요금 및 공항 픽드랍 서비스\n생일 및 기념일 이벤트',
  NULL, '120명',
  '2023년 신규 출항',
  '["로비/리셉션", "레스토랑", "피아노 라운지", "스파 (마사지)", "워터슬라이드", "선데크"]'::jsonb,
  2,
  '{"water_slide": true, "restaurant": true, "lounge": true, "spa": true, "live_performance": true, "full_ocean_view": true, "viet_hai_village": true}'::jsonb
);

-- =====================================================
-- 3) 발코니 스위트 (BALCONY SUITE)
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
  'AMSIG-BS', '엠바사더 시그니쳐 크루즈', 'Ambassador Signature Cruise',
  '2023년 엠바사더 크루즈가 선보인 신규출항 크루즈 라인. 맑고 깨끗한 청정해역 란하베이를 운항하며, 워터슬라이드를 통한 바다수영과 깟바섬 비엣하이빌리지 투어 등 다이내믹한 투어프로그램을 운영. 전객실 완전한 오션뷰 발코니를 제공하는 크루즈. 엠바사더 데이크루즈로 한국 관광객에게 유명한 크루즈 브랜드.',
  '1박2일', NULL,
  '발코니 스위트', '35m²',
  '크루즈 뒤편의 테라스를 보유하는 스위트 객실. 더블베드 또는 트윈베드(싱글 2개) 선택 가능. 싱글차지 1인 혼자 사용 가능. 기본인원 성인 2인, 최대인원 성인 3인(엑스트라베드) 또는 성인 2인 + 아동 2인(아동 1인은 성인 엑스트라 요금).',
  '더블 또는 트윈', 3, 3, true, false, false,
  false, true, true,
  '오션뷰 발코니, 커넥팅룸, 욕조, 스탠딩샤워, 테라스',
  '하롱베이 파노라마 뷰를 감상할 수 있는 상위 객실.',
  '[
    {"day": 1, "title": "1일차", "schedule": [
      {"time": "08:00", "activity": "하노이 호텔 앞 차량 픽업 (전날 밤 9시경 시간 안내)"},
      {"time": "11:00", "activity": "하롱베이 선착장 도착 및 체크인 (예약확인서 불필요, 여권 사진 가능)"},
      {"time": "11:45", "activity": "텐더보트 승선 후 크루즈로 이동 (약 40분)"},
      {"time": "12:30", "activity": "라운지 착석 - 웰컴드링크 및 안전지침/투어일정 안내"},
      {"time": "12:45", "activity": "점심 뷔페식사 (음료 및 주류 별도)"},
      {"time": "15:00", "activity": "비엣하이빌리지 투어 (전기차 또는 자전거 이동, 깟바섬 국립공원 내 원시마을 관람)"},
      {"time": "16:30", "activity": "워터슬라이드 및 바다수영 (구명조끼 구비, 안전요원 상주)"},
      {"time": "17:30", "activity": "해피아워 (비스킷/과일/선셋파티, 쿠킹클래스, 칵테일 1+1)"},
      {"time": "19:00", "activity": "디너식사 (베지테리언/키즈메뉴 가능, 생일/기념 이벤트 가능, 음료/주류 별도)"},
      {"time": "21:00", "activity": "라이브 공연 (피아노 라운지, 화요일 공연 휴무), 오징어낚시, 스파 등 자유시간"},
      {"time": "22:00", "activity": "1일차 공식 일정 종료"}
    ]},
    {"day": 2, "title": "2일차", "schedule": [
      {"time": "05:30", "activity": "일출 감상 (객실 또는 선데크)"},
      {"time": "06:00", "activity": "태극권 스트레칭 (선데크, 자율참여)"},
      {"time": "06:30", "activity": "이른 조식뷔페 (페스츄리, 커피, 차)"},
      {"time": "07:00", "activity": "다크앤브라이트 동굴 투어 (카약/뱀부보트, 방수팩 준비)"},
      {"time": "08:30", "activity": "브런치 식사"},
      {"time": "09:30", "activity": "객실 체크아웃 및 최종 결제 (신용카드 가능)"},
      {"time": "10:15", "activity": "크루즈 하선"},
      {"time": "11:30", "activity": "복귀 차량 승차"},
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
  '웰컴드링크\n총 4번의 식사\n외부투어 시 영어가이드\n비엣하이빌리지 (전기차 또는 자전거 이동)\n탄더스파 체험\n해피아워 까나페\n선상 안전보험 및 서비스 차지\n(다크앤브라이트 동굴 카약킹은 포함 패키지 해당)',
  '이동차량 서비스\n별도 주문 음료 및 주류\n마사지 및 스파 서비스\n다크앤브라이트 동굴 (카약/뱀부보트)\n항공요금 및 공항 픽드랍 서비스\n생일 및 기념일 이벤트',
  NULL, '120명',
  '2023년 신규 출항',
  '["로비/리셉션", "레스토랑", "피아노 라운지", "스파 (마사지)", "워터슬라이드", "선데크"]'::jsonb,
  3,
  '{"water_slide": true, "restaurant": true, "lounge": true, "spa": true, "live_performance": true, "full_ocean_view": true, "viet_hai_village": true}'::jsonb
);

-- =====================================================
-- 4) 캡틴뷰 스위트 (CAPTAIN VIEW SUITE)
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
  'AMSIG-CV', '엠바사더 시그니쳐 크루즈', 'Ambassador Signature Cruise',
  '2023년 엠바사더 크루즈가 선보인 신규출항 크루즈 라인. 맑고 깨끗한 청정해역 란하베이를 운항하며, 워터슬라이드를 통한 바다수영과 깟바섬 비엣하이빌리지 투어 등 다이내믹한 투어프로그램을 운영. 전객실 완전한 오션뷰 발코니를 제공하는 크루즈. 엠바사더 데이크루즈로 한국 관광객에게 유명한 크루즈 브랜드.',
  '1박2일', NULL,
  '캡틴뷰 스위트', '35m²',
  '크루즈 정면 테라스를 보유하는 최상위 스위트 객실. 더블베드 또는 트윈베드(싱글 2개) 선택 가능. 싱글차지 1인 혼자 사용 가능. 기본인원 성인 2인, 최대인원 성인 3인(엑스트라베드) 또는 성인 2인 + 아동 2인(아동 1인은 성인 엑스트라 요금).',
  '더블 또는 트윈', 3, 3, true, true, false,
  false, true, true,
  '오션뷰 발코니, 커넥팅룸, 욕조, 스탠딩샤워, 프론트 테라스',
  NULL,
  '[
    {"day": 1, "title": "1일차", "schedule": [
      {"time": "08:00", "activity": "하노이 호텔 앞 차량 픽업 (전날 밤 9시경 시간 안내)"},
      {"time": "11:00", "activity": "하롱베이 선착장 도착 및 체크인 (예약확인서 불필요, 여권 사진 가능)"},
      {"time": "11:45", "activity": "텐더보트 승선 후 크루즈로 이동 (약 40분)"},
      {"time": "12:30", "activity": "라운지 착석 - 웰컴드링크 및 안전지침/투어일정 안내"},
      {"time": "12:45", "activity": "점심 뷔페식사 (음료 및 주류 별도)"},
      {"time": "15:00", "activity": "비엣하이빌리지 투어 (전기차 또는 자전거 이동, 깟바섬 국립공원 내 원시마을 관람)"},
      {"time": "16:30", "activity": "워터슬라이드 및 바다수영 (구명조끼 구비, 안전요원 상주)"},
      {"time": "17:30", "activity": "해피아워 (비스킷/과일/선셋파티, 쿠킹클래스, 칵테일 1+1)"},
      {"time": "19:00", "activity": "디너식사 (베지테리언/키즈메뉴 가능, 생일/기념 이벤트 가능, 음료/주류 별도)"},
      {"time": "21:00", "activity": "라이브 공연 (피아노 라운지, 화요일 공연 휴무), 오징어낚시, 스파 등 자유시간"},
      {"time": "22:00", "activity": "1일차 공식 일정 종료"}
    ]},
    {"day": 2, "title": "2일차", "schedule": [
      {"time": "05:30", "activity": "일출 감상 (객실 또는 선데크)"},
      {"time": "06:00", "activity": "태극권 스트레칭 (선데크, 자율참여)"},
      {"time": "06:30", "activity": "이른 조식뷔페 (페스츄리, 커피, 차)"},
      {"time": "07:00", "activity": "다크앤브라이트 동굴 투어 (카약/뱀부보트, 방수팩 준비)"},
      {"time": "08:30", "activity": "브런치 식사"},
      {"time": "09:30", "activity": "객실 체크아웃 및 최종 결제 (신용카드 가능)"},
      {"time": "10:15", "activity": "크루즈 하선"},
      {"time": "11:30", "activity": "복귀 차량 승차"},
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
  '웰컴드링크\n총 4번의 식사\n외부투어 시 영어가이드\n비엣하이빌리지 (전기차 또는 자전거 이동)\n탄더스파 체험\n해피아워 까나페\n선상 안전보험 및 서비스 차지\n(다크앤브라이트 동굴 카약킹은 포함 패키지 해당)',
  '이동차량 서비스\n별도 주문 음료 및 주류\n마사지 및 스파 서비스\n다크앤브라이트 동굴 (카약/뱀부보트)\n항공요금 및 공항 픽드랍 서비스\n생일 및 기념일 이벤트',
  NULL, '120명',
  '2023년 신규 출항',
  '["로비/리셉션", "레스토랑", "피아노 라운지", "스파 (마사지)", "워터슬라이드", "선데크"]'::jsonb,
  4,
  '{"water_slide": true, "restaurant": true, "lounge": true, "spa": true, "live_performance": true, "full_ocean_view": true, "viet_hai_village": true}'::jsonb
);

-- =====================================================
-- 검증 쿼리 (실행 후 확인용)
-- =====================================================
-- SELECT cruise_code, cruise_name, room_name, room_area, display_order
-- FROM cruise_info
-- WHERE cruise_name = '엠바사더 시그니쳐 크루즈'
-- ORDER BY display_order;
-- 기대 결과: 4행 (AMSIG-BR, AMSIG-EX, AMSIG-BS, AMSIG-CV)
