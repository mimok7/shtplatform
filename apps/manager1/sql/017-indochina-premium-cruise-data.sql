-- =====================================================
-- 017-indochina-premium-cruise-data.sql
-- 인도차이나 프리미엄 크루즈 상세 정보 (4개 객실 타입)
-- =====================================================
-- 실행 전 011-cruise-info-columns.sql 먼저 실행 필요

-- 기존 인도차이나 프리미엄 크루즈 데이터 삭제 (재실행 가능하도록)
DELETE FROM cruise_info
WHERE cruise_code LIKE 'INDOP-%'
   OR cruise_name = '인도차이나 프리미엄 크루즈';

-- 공통 일정/규정/포함사항은 각 객실 행에 동일하게 저장

-- =====================================================
-- 1) 주니어 스위트 (JUNIOR SUITE)
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
  'INDOP-JS', '인도차이나 프리미엄 크루즈', 'Indochina Premium Cruise',
  '인도차이나 세일즈 컬렉션의 2023년 신규 출항 5성급 크루즈. 인도차이나 전통 인테리어 감성과 쾌적한 신상 시설, 대형 자쿠지풀, 디너 랍스터 제공, 상급 뷔페 퀄리티로 만족도가 높은 1박2일 상품.',
  '1박2일', '프리미엄',
  '주니어 스위트', '34㎡',
  '크루즈 1층/2층에 위치한 기본형 객실. 더블베드 또는 트윈베드(싱글 2개) 선택 가능. 1층/2층 랜덤 배정이며 빠른 예약일수록 2층 배정 확률이 높음. 싱글차지 1인 혼자 사용 가능. 기본인원 성인 2인, 최대인원 성인 3인(엑스트라베드) 또는 성인 2인 + 아동 2인(아동 1인은 성인 엑스트라 요금).',
  '더블 또는 트윈', 3, 3, true, false, false,
  true, true, true,
  '발코니, 커넥팅룸, 욕조, 스탠딩샤워',
  '층수 랜덤 배정 (1층/2층)',
  '[
    {"day": 1, "title": "1일차", "schedule": [
      {"time": "08:00", "activity": "하노이 호텔 앞 차량 픽업 (전날 밤 9시경 시간 안내)"},
      {"time": "11:00", "activity": "하롱베이 선착장 도착 및 체크인 (예약확인서 불필요, 여권 사진 가능)"},
      {"time": "11:45", "activity": "텐더보트 승선 후 크루즈로 이동 (약 10분)"},
      {"time": "12:00", "activity": "라운지 웰컴드링크 및 안전지침/일정 안내"},
      {"time": "13:00", "activity": "점심 뷔페식사 (5성급 탑클래스 메뉴, 음료/주류 별도)"},
      {"time": "14:00", "activity": "승솟동굴 투어 (운동화 권장, 매점 이용 현금 권장)"},
      {"time": "16:00", "activity": "루온동굴 투어 (카약/뱀부보트, 야생원숭이 관람, 방수팩 준비)"},
      {"time": "17:30", "activity": "해피아워 (까나페/과일/선셋파티, 쿠킹클래스, 칵테일 1+1)"},
      {"time": "19:15", "activity": "디너식사 (베지테리언/키즈메뉴 가능, 생일/기념 이벤트 가능, 음료/주류 별도)"},
      {"time": "20:30", "activity": "자유시간 (자쿠지, 야경, 오징어낚시 등)"},
      {"time": "22:00", "activity": "1일차 공식 일정 종료"}
    ]},
    {"day": 2, "title": "2일차", "schedule": [
      {"time": "05:30", "activity": "일출 감상 (객실/선데크)"},
      {"time": "06:00", "activity": "이른 조식 (페스츄리, 커피, 차)"},
      {"time": "06:30", "activity": "태극권 스트레칭 (자율참여)"},
      {"time": "07:30", "activity": "티톱섬 투어 (이른 시간 한적한 관람)"},
      {"time": "09:00", "activity": "객실 체크아웃 및 최종 결제 (신용카드 가능)"},
      {"time": "09:30", "activity": "브런치 뷔페"},
      {"time": "10:30", "activity": "크루즈 하선"},
      {"time": "11:30", "activity": "복귀 차량 승차"},
      {"time": "14:00", "activity": "하노이 도착 (교통상황 따라 변동)"}
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
  '웰컴드링크\n총 4번의 식사\n외부투어 시 영어가이드\n외부투어 관광지 입장료\n루온동굴 카약 및 뱀부보트\n해피아워 까나페\n선상 안전보험 및 서비스 차지\n(루온동굴 카약킹은 포함 패키지에서 포함 해당)',
  '이동차량 서비스\n별도 주문 음료 및 주류\n마사지 및 스파 서비스\n항공요금 및 공항 픽드랍 서비스\n생일 및 기념일 이벤트',
  '5성급', '미공개',
  '2023년 신규 출항 / 인도차이나 세일즈 컬렉션',
  '["레스토랑", "로비/리셉션", "라운지", "대형 자쿠지풀", "엘리베이터", "선데크"]'::jsonb,
  1,
  '{"jacuzzi_pool": true, "elevator": true, "restaurant": true, "lounge": true, "sundeck": true, "indochina_interior": true}'::jsonb
);

-- =====================================================
-- 2) 스위트룸 (SUITE)
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
  'INDOP-ST', '인도차이나 프리미엄 크루즈', 'Indochina Premium Cruise',
  '인도차이나 세일즈 컬렉션의 2023년 신규 출항 5성급 크루즈. 인도차이나 전통 인테리어 감성과 쾌적한 신상 시설, 대형 자쿠지풀, 디너 랍스터 제공, 상급 뷔페 퀄리티로 만족도가 높은 1박2일 상품.',
  '1박2일', '프리미엄',
  '스위트룸', '46㎡',
  '주니어 스위트 대비 넓은 면적과 욕실 욕조 제공. 침대 앞 대형 창과 발코니로 하롱베이 뷰 감상에 유리. 더블베드 또는 트윈베드(싱글 2개) 선택 가능. 싱글차지 1인 혼자 사용 가능. 기본인원 성인 2인, 최대인원 성인 3인(엑스트라베드) 또는 성인 2인 + 아동 2인(아동 1인은 성인 엑스트라 요금).',
  '더블 또는 트윈', 3, 3, true, false, false,
  true, true, true,
  '대형 창, 발코니, 욕조, 스탠딩샤워, 커넥팅룸',
  NULL,
  '[
    {"day": 1, "title": "1일차", "schedule": [
      {"time": "08:00", "activity": "하노이 호텔 앞 차량 픽업 (전날 밤 9시경 시간 안내)"},
      {"time": "11:00", "activity": "하롱베이 선착장 도착 및 체크인"},
      {"time": "11:45", "activity": "텐더보트 이동 후 승선"},
      {"time": "12:00", "activity": "웰컴드링크 및 브리핑"},
      {"time": "13:00", "activity": "점심 뷔페"},
      {"time": "14:00", "activity": "승솟동굴 투어"},
      {"time": "16:00", "activity": "루온동굴 투어"},
      {"time": "17:30", "activity": "해피아워 & 쿠킹클래스"},
      {"time": "19:15", "activity": "디너식사"},
      {"time": "20:30", "activity": "자유시간"},
      {"time": "22:00", "activity": "1일차 종료"}
    ]},
    {"day": 2, "title": "2일차", "schedule": [
      {"time": "05:30", "activity": "일출 감상"},
      {"time": "06:00", "activity": "이른 조식"},
      {"time": "06:30", "activity": "태극권"},
      {"time": "07:30", "activity": "티톱섬 투어"},
      {"time": "09:00", "activity": "체크아웃 및 결제"},
      {"time": "09:30", "activity": "브런치"},
      {"time": "10:30", "activity": "하선"},
      {"time": "11:30", "activity": "복귀 차량 승차"},
      {"time": "14:00", "activity": "하노이 도착"}
    ]}
  ]'::jsonb,
  '[
    {"condition": "크루즈 승선코드 발급 전", "penalty": "수수료 없는 무료 취소 (승선일자 변경 무료)"},
    {"condition": "승선코드 발급 후 이용일자 31일 전까지", "penalty": "총 금액에서 100만동 위약금 발생 (1인당 아님)"},
    {"condition": "이용일자 21~30일 전", "penalty": "15% 위약금 발생"},
    {"condition": "이용일자 17~20일 전", "penalty": "50% 위약금 발생"},
    {"condition": "이용일자 16일 전부터", "penalty": "취소/환불/날짜변경 불가"},
    {"condition": "천재지변, 태풍, 정부명령, 승선인원 미달, 크루즈사 사정 결항", "penalty": "전액 환불 보장"}
  ]'::jsonb,
  '웰컴드링크\n총 4번의 식사\n외부투어 시 영어가이드\n외부투어 관광지 입장료\n루온동굴 카약 및 뱀부보트\n해피아워 까나페\n선상 안전보험 및 서비스 차지\n(루온동굴 카약킹은 포함 패키지에서 포함 해당)',
  '이동차량 서비스\n별도 주문 음료 및 주류\n마사지 및 스파 서비스\n항공요금 및 공항 픽드랍 서비스\n생일 및 기념일 이벤트',
  '5성급', '미공개',
  '2023년 신규 출항 / 인도차이나 세일즈 컬렉션',
  '["레스토랑", "로비/리셉션", "라운지", "대형 자쿠지풀", "엘리베이터", "선데크"]'::jsonb,
  2,
  '{"jacuzzi_pool": true, "elevator": true, "restaurant": true, "lounge": true, "sundeck": true, "indochina_interior": true}'::jsonb
);

-- =====================================================
-- 3) 이그제큐티브룸 (EXECUTIVE)
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
  'INDOP-EX', '인도차이나 프리미엄 크루즈', 'Indochina Premium Cruise',
  '인도차이나 세일즈 컬렉션의 2023년 신규 출항 5성급 크루즈. 인도차이나 전통 인테리어 감성과 쾌적한 신상 시설, 대형 자쿠지풀, 디너 랍스터 제공, 상급 뷔페 퀄리티로 만족도가 높은 1박2일 상품.',
  '1박2일', '프리미엄',
  '이그제큐티브룸', '56㎡',
  '스위트룸보다 더 넓은 상위 객실. 더블베드 또는 트윈베드(싱글 2개) 선택 가능. 발코니, 욕조, 스탠딩샤워 제공. 싱글차지 1인 혼자 사용 가능. 기본인원 성인 2인, 최대인원 성인 3인(엑스트라베드) 또는 성인 2인 + 아동 2인(아동 1인은 성인 엑스트라 요금).',
  '더블 또는 트윈', 3, 3, true, false, false,
  true, true, true,
  '넓은 객실, 발코니, 욕조, 스탠딩샤워, 커넥팅룸',
  NULL,
  '[
    {"day": 1, "title": "1일차", "schedule": [
      {"time": "08:00", "activity": "하노이 호텔 앞 차량 픽업"},
      {"time": "11:00", "activity": "선착장 도착 및 체크인"},
      {"time": "11:45", "activity": "텐더보트 이동"},
      {"time": "12:00", "activity": "라운지 브리핑"},
      {"time": "13:00", "activity": "점심 뷔페"},
      {"time": "14:00", "activity": "승솟동굴 투어"},
      {"time": "16:00", "activity": "루온동굴 투어"},
      {"time": "17:30", "activity": "해피아워"},
      {"time": "19:15", "activity": "디너식사"},
      {"time": "20:30", "activity": "자유시간"},
      {"time": "22:00", "activity": "1일차 종료"}
    ]},
    {"day": 2, "title": "2일차", "schedule": [
      {"time": "05:30", "activity": "일출 감상"},
      {"time": "06:00", "activity": "이른 조식"},
      {"time": "06:30", "activity": "태극권"},
      {"time": "07:30", "activity": "티톱섬 투어"},
      {"time": "09:00", "activity": "체크아웃"},
      {"time": "09:30", "activity": "브런치"},
      {"time": "10:30", "activity": "하선"},
      {"time": "11:30", "activity": "복귀 차량 승차"},
      {"time": "14:00", "activity": "하노이 도착"}
    ]}
  ]'::jsonb,
  '[
    {"condition": "크루즈 승선코드 발급 전", "penalty": "수수료 없는 무료 취소 (승선일자 변경 무료)"},
    {"condition": "승선코드 발급 후 이용일자 31일 전까지", "penalty": "총 금액에서 100만동 위약금 발생 (1인당 아님)"},
    {"condition": "이용일자 21~30일 전", "penalty": "15% 위약금 발생"},
    {"condition": "이용일자 17~20일 전", "penalty": "50% 위약금 발생"},
    {"condition": "이용일자 16일 전부터", "penalty": "취소/환불/날짜변경 불가"},
    {"condition": "천재지변, 태풍, 정부명령, 승선인원 미달, 크루즈사 사정 결항", "penalty": "전액 환불 보장"}
  ]'::jsonb,
  '웰컴드링크\n총 4번의 식사\n외부투어 시 영어가이드\n외부투어 관광지 입장료\n루온동굴 카약 및 뱀부보트\n해피아워 까나페\n선상 안전보험 및 서비스 차지\n(루온동굴 카약킹은 포함 패키지에서 포함 해당)',
  '이동차량 서비스\n별도 주문 음료 및 주류\n마사지 및 스파 서비스\n항공요금 및 공항 픽드랍 서비스\n생일 및 기념일 이벤트',
  '5성급', '미공개',
  '2023년 신규 출항 / 인도차이나 세일즈 컬렉션',
  '["레스토랑", "로비/리셉션", "라운지", "대형 자쿠지풀", "엘리베이터", "선데크"]'::jsonb,
  3,
  '{"jacuzzi_pool": true, "elevator": true, "restaurant": true, "lounge": true, "sundeck": true, "indochina_interior": true}'::jsonb
);

-- =====================================================
-- 4) 프레지던트 스위트 (PRESIDENT SUITE)
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
  'INDOP-PS', '인도차이나 프리미엄 크루즈', 'Indochina Premium Cruise',
  '인도차이나 세일즈 컬렉션의 2023년 신규 출항 5성급 크루즈. 인도차이나 전통 인테리어 감성과 쾌적한 신상 시설, 대형 자쿠지풀, 디너 랍스터 제공, 상급 뷔페 퀄리티로 만족도가 높은 1박2일 상품.',
  '1박2일', '프리미엄',
  '프레지던트 스위트', '115㎡',
  '거실/침실 분리 구조의 최상위 객실. 화장실 1개, 욕실 1개 구성. 더블베드 고정 타입. 객실 인원규정은 싱글차지 가능, 기본 성인 2인, 최대 성인 3인(엑스트라베드) 또는 성인 2인 + 아동 2인(아동 1인은 성인 엑스트라 요금).',
  '더블 고정', 3, 3, true, true, false,
  false, true, true,
  '최상위 스위트, 분리형 거실/침실, 발코니, 욕조, 스탠딩샤워',
  NULL,
  '[
    {"day": 1, "title": "1일차", "schedule": [
      {"time": "08:00", "activity": "하노이 호텔 앞 차량 픽업"},
      {"time": "11:00", "activity": "선착장 도착 및 체크인"},
      {"time": "11:45", "activity": "텐더보트 이동"},
      {"time": "12:00", "activity": "라운지 브리핑"},
      {"time": "13:00", "activity": "점심 뷔페"},
      {"time": "14:00", "activity": "승솟동굴 투어"},
      {"time": "16:00", "activity": "루온동굴 투어"},
      {"time": "17:30", "activity": "해피아워"},
      {"time": "19:15", "activity": "디너식사"},
      {"time": "20:30", "activity": "자유시간"},
      {"time": "22:00", "activity": "1일차 종료"}
    ]},
    {"day": 2, "title": "2일차", "schedule": [
      {"time": "05:30", "activity": "일출 감상"},
      {"time": "06:00", "activity": "이른 조식"},
      {"time": "06:30", "activity": "태극권"},
      {"time": "07:30", "activity": "티톱섬 투어"},
      {"time": "09:00", "activity": "체크아웃"},
      {"time": "09:30", "activity": "브런치"},
      {"time": "10:30", "activity": "하선"},
      {"time": "11:30", "activity": "복귀 차량 승차"},
      {"time": "14:00", "activity": "하노이 도착"}
    ]}
  ]'::jsonb,
  '[
    {"condition": "크루즈 승선코드 발급 전", "penalty": "수수료 없는 무료 취소 (승선일자 변경 무료)"},
    {"condition": "승선코드 발급 후 이용일자 31일 전까지", "penalty": "총 금액에서 100만동 위약금 발생 (1인당 아님)"},
    {"condition": "이용일자 21~30일 전", "penalty": "15% 위약금 발생"},
    {"condition": "이용일자 17~20일 전", "penalty": "50% 위약금 발생"},
    {"condition": "이용일자 16일 전부터", "penalty": "취소/환불/날짜변경 불가"},
    {"condition": "천재지변, 태풍, 정부명령, 승선인원 미달, 크루즈사 사정 결항", "penalty": "전액 환불 보장"}
  ]'::jsonb,
  '웰컴드링크\n총 4번의 식사\n외부투어 시 영어가이드\n외부투어 관광지 입장료\n루온동굴 카약 및 뱀부보트\n해피아워 까나페\n선상 안전보험 및 서비스 차지\n(루온동굴 카약킹은 포함 패키지에서 포함 해당)',
  '이동차량 서비스\n별도 주문 음료 및 주류\n마사지 및 스파 서비스\n항공요금 및 공항 픽드랍 서비스\n생일 및 기념일 이벤트',
  '5성급', '미공개',
  '2023년 신규 출항 / 인도차이나 세일즈 컬렉션',
  '["레스토랑", "로비/리셉션", "라운지", "대형 자쿠지풀", "엘리베이터", "선데크"]'::jsonb,
  4,
  '{"jacuzzi_pool": true, "elevator": true, "restaurant": true, "lounge": true, "sundeck": true, "indochina_interior": true}'::jsonb
);

-- =====================================================
-- 검증 쿼리 (실행 후 확인용)
-- =====================================================
-- SELECT cruise_code, cruise_name, room_name, room_area, display_order
-- FROM cruise_info
-- WHERE cruise_name = '인도차이나 프리미엄 크루즈'
-- ORDER BY display_order;
-- 기대 결과: 4행 (INDOP-JS, INDOP-ST, INDOP-EX, INDOP-PS)
