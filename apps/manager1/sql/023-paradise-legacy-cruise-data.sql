-- =====================================================
-- 023-paradise-legacy-cruise-data.sql
-- 파라다이스 레거시 크루즈 상세 정보 (4개 객실 타입)
-- =====================================================
-- 실행 전 011-cruise-info-columns.sql 먼저 실행 필요

-- 기존 파라다이스 레거시 크루즈 데이터 삭제 (재실행 가능하도록)
DELETE FROM cruise_info
WHERE cruise_code LIKE 'PARADISE-%'
   OR cruise_name = '파라다이스 레거시 크루즈';

-- 공통 일정/규정/포함사항은 각 객실 행에 동일하게 저장

-- =====================================================
-- 1) 디럭스 발코니 (PARADISE-DELUXE) - 추천객실
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
  'PARADISE-DELUXE', '파라다이스 레거시 크루즈', 'Paradise Legacy Cruise',
  '하롱베이 크루즈의 역사인 파라다이스 그룹이 선보인 6성급 신규 크루즈. 2025년 말 출항. 전객실 완전한 오션뷰 발코니 제공. 디너 랍스터 및 스테이크 무제한 리필. 다채롭고 맛있는 식사 구성으로 유명한 파라다이스 그룹의 쾌적한 신규 크루즈.',
  '1박2일', NULL,
  '디럭스 발코니', '28m²',
  '크루즈 1층에 위치하는 가장 기본 객실타입이며, 커넥팅룸 발코니를 통해 제공됩니다. 2층 이그제큐티브 객실과 디자인, 면적은 완전히 동일하고 20개 객실을 보유하고 있습니다. 더블베드 또는 트윈베드 선택 가능. 싱글차지 1인 혼자 사용 가능. 기본인원 성인 2인, 최대인원 성인 3인(엑스트라베드) 또는 성인 2인 + 아동 1인.',
  '더블 또는 트윈', 3, 3, true, false, false,
  true, true, true,
  '오션뷰 발코니, 커넥팅룸, 욕조, 스탠딩샤워',
  NULL,
  '[
    {"day": 1, "title": "1일차", "schedule": [
      {"time": "08:00", "activity": "하노이에서 차량승차 (전날 밤 9시경 전달드린 시간에 호텔 앞 픽업, 이동 중 휴게소 정차, 고속도로 이용)"},
      {"time": "11:00", "activity": "뚜언쩌우 선착장 도착 (예약확인서 불필요, 여권 사진으로 OK, 크루즈 직원 체크인 안내)"},
      {"time": "12:00", "activity": "크루즈 승선 (선착장에 정박중인 크루즈에 직접 승선)"},
      {"time": "12:10", "activity": "투어 브리핑 (3층 피아노 라운지, 환영공연, 안전지침 설명)"},
      {"time": "13:00", "activity": "점심 뷔페식사 (음료 및 주류 별도, 테이블 담당서버)"},
      {"time": "14:30", "activity": "카약 및 뱀부보트 (전투하게랩 또는 동굴 앞에서 진행)"},
      {"time": "16:00", "activity": "티톱섬 투어 (450계단 전망대 또는 초승달 모양 해변 이용, 약간의 현금 매점)"},
      {"time": "17:15", "activity": "해피아워 (다채로운 비스킷과 제철과일, 선셋파티, 쿠킹클래스, 칵테일 1+1)"},
      {"time": "19:00", "activity": "디너식사 (3층 레스토랑 지정좌석, 베지테리언/키즈메뉴 가능, 음료 및 주류 별도)"},
      {"time": "20:30", "activity": "공연 / 오징어 낚시 (피아노 라운지 라이브공연, 오징어 낚시 등 부대시설 이용)"},
      {"time": "22:00", "activity": "1일차 공식 일정 종료"}
    ]},
    {"day": 2, "title": "2일차", "schedule": [
      {"time": "05:30", "activity": "하롱의 일출감상 (객실 또는 선데크)"},
      {"time": "06:30", "activity": "태극권 스트레칭 (선데크, 자율참여)"},
      {"time": "07:00", "activity": "이른 조식뷔페 (페스츄리, 커피, 차)"},
      {"time": "07:45", "activity": "승솟동굴 투어 (하롱베이에서 가장 큰 석회암 동굴, 약 120계단, 영어가이드 동행)"},
      {"time": "08:50", "activity": "브런치 뷔페 (3층 레스토랑, 마지막 식사)"},
      {"time": "09:40", "activity": "객실 체크아웃 (캐리어 객실 문 앞, 1층 리셉션 객실카드 반납, 음료 결제 신용카드 OK)"},
      {"time": "10:15", "activity": "크루즈 하선 (처음 승선했던 선착장으로 복귀, 차량정보 전달)"},
      {"time": "11:30", "activity": "복귀차량 승차 (통상 11시~11시30분)"},
      {"time": "14:00", "activity": "하노이 도착 (교통상황 따라 상이, 호안끼엠 먼저 하차, 서호지역 가장 마지막 하차)"}
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
  '웰컴드링크\n총 4번의 식사\n외부투어 시 영어가이드\n외부투어 관광지 입장료\n수영장 등 부대시설 이용\n뱀부보트\n해피아워 까나페\n선상안전보험 및 서비스 차지',
  '이동차량 서비스\n별도 주문하는 음료 및 주류\n마사지 및 스파\n카약 (대기지는 포함)\n항공요금 및 공항픽드랍 서비스\n생일 및 기념일 이벤트',
  '6', NULL,
  NULL,
  '["스파 (마사지)", "엘리베이터", "라운지", "레스토랑", "자쿠지", "스카이 BAR", "선데크"]'::jsonb,
  1,
  '{"spa": true, "elevator": true, "lounge": true, "restaurant": true, "jacuzzi": true, "sky_bar": true, "sundeck": true, "full_ocean_view": true, "balcony": true, "recommended": true}'::jsonb
);

-- =====================================================
-- 2) 이그제큐티브 발코니 (PARADISE-EXECUTIVE)
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
  'PARADISE-EXECUTIVE', '파라다이스 레거시 크루즈', 'Paradise Legacy Cruise',
  '하롱베이 크루즈의 역사인 파라다이스 그룹이 선보인 6성급 신규 크루즈. 2025년 말 출항. 전객실 완전한 오션뷰 발코니 제공. 디너 랍스터 및 스테이크 무제한 리필. 다채롭고 맛있는 식사 구성으로 유명한 파라다이스 그룹의 쾌적한 신규 크루즈.',
  '1박2일', NULL,
  '이그제큐티브 발코니', '28m²',
  '크루즈 2층에 위치하는 기본 객실타입이며, 커넥팅룸 발코니를 통해 제공됩니다. 1층 디럭스 발코니 객실과 디자인, 면적은 완전히 동일하고 19개 객실을 보유하고 있습니다. 더블베드 또는 트윈베드 선택 가능. 싱글차지 1인 혼자 사용 가능. 기본인원 성인 2인, 최대인원 성인 3인(엑스트라베드) 또는 성인 2인 + 아동 1인.',
  '더블 또는 트윈', 3, 3, true, false, false,
  false, true, true,
  '오션뷰 발코니, 커넥팅룸, 욕조, 스탠딩샤워',
  '3층에 라운지와 레스토랑이 있어서 층간소음이 다소 있을 수 있습니다.',
  '[
    {"day": 1, "title": "1일차", "schedule": [
      {"time": "08:00", "activity": "하노이에서 차량승차 (전날 밤 9시경 전달드린 시간에 호텔 앞 픽업, 이동 중 휴게소 정차, 고속도로 이용)"},
      {"time": "11:00", "activity": "뚜언쩌우 선착장 도착 (예약확인서 불필요, 여권 사진으로 OK, 크루즈 직원 체크인 안내)"},
      {"time": "12:00", "activity": "크루즈 승선 (선착장에 정박중인 크루즈에 직접 승선)"},
      {"time": "12:10", "activity": "투어 브리핑 (3층 피아노 라운지, 환영공연, 안전지침 설명)"},
      {"time": "13:00", "activity": "점심 뷔페식사 (음료 및 주류 별도, 테이블 담당서버)"},
      {"time": "14:30", "activity": "카약 및 뱀부보트 (전투하게랩 또는 동굴 앞에서 진행)"},
      {"time": "16:00", "activity": "티톱섬 투어 (450계단 전망대 또는 초승달 모양 해변 이용, 약간의 현금 매점)"},
      {"time": "17:15", "activity": "해피아워 (다채로운 비스킷과 제철과일, 선셋파티, 쿠킹클래스, 칵테일 1+1)"},
      {"time": "19:00", "activity": "디너식사 (3층 레스토랑 지정좌석, 베지테리언/키즈메뉴 가능, 음료 및 주류 별도)"},
      {"time": "20:30", "activity": "공연 / 오징어 낚시 (피아노 라운지 라이브공연, 오징어 낚시 등 부대시설 이용)"},
      {"time": "22:00", "activity": "1일차 공식 일정 종료"}
    ]},
    {"day": 2, "title": "2일차", "schedule": [
      {"time": "05:30", "activity": "하롱의 일출감상 (객실 또는 선데크)"},
      {"time": "06:30", "activity": "태극권 스트레칭 (선데크, 자율참여)"},
      {"time": "07:00", "activity": "이른 조식뷔페 (페스츄리, 커피, 차)"},
      {"time": "07:45", "activity": "승솟동굴 투어 (하롱베이에서 가장 큰 석회암 동굴, 약 120계단, 영어가이드 동행)"},
      {"time": "08:50", "activity": "브런치 뷔페 (3층 레스토랑, 마지막 식사)"},
      {"time": "09:40", "activity": "객실 체크아웃 (캐리어 객실 문 앞, 1층 리셉션 객실카드 반납, 음료 결제 신용카드 OK)"},
      {"time": "10:15", "activity": "크루즈 하선 (처음 승선했던 선착장으로 복귀, 차량정보 전달)"},
      {"time": "11:30", "activity": "복귀차량 승차 (통상 11시~11시30분)"},
      {"time": "14:00", "activity": "하노이 도착 (교통상황 따라 상이, 호안끼엠 먼저 하차, 서호지역 가장 마지막 하차)"}
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
  '웰컴드링크\n총 4번의 식사\n외부투어 시 영어가이드\n외부투어 관광지 입장료\n수영장 등 부대시설 이용\n뱀부보트\n해피아워 까나페\n선상안전보험 및 서비스 차지',
  '이동차량 서비스\n별도 주문하는 음료 및 주류\n마사지 및 스파\n카약 (대기지는 포함)\n항공요금 및 공항픽드랍 서비스\n생일 및 기념일 이벤트',
  '6', NULL,
  NULL,
  '["스파 (마사지)", "엘리베이터", "라운지", "레스토랑", "자쿠지", "스카이 BAR", "선데크"]'::jsonb,
  2,
  '{"spa": true, "elevator": true, "lounge": true, "restaurant": true, "jacuzzi": true, "sky_bar": true, "sundeck": true, "full_ocean_view": true, "balcony": true}'::jsonb
);

-- =====================================================
-- 3) 레거시 스위트 (PARADISE-LEGACY) - 추천객실
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
  'PARADISE-LEGACY', '파라다이스 레거시 크루즈', 'Paradise Legacy Cruise',
  '하롱베이 크루즈의 역사인 파라다이스 그룹이 선보인 6성급 신규 크루즈. 2025년 말 출항. 전객실 완전한 오션뷰 발코니 제공. 디너 랍스터 및 스테이크 무제한 리필. 다채롭고 맛있는 식사 구성으로 유명한 파라다이스 그룹의 쾌적한 신규 크루즈.',
  '1박2일', NULL,
  '레거시 스위트', '48m²',
  '크루즈 2층에 위치하는 욕조 제공 객실 타입. 크루즈 뒷편에 위치하며 일반객실보다는 넓은 면적을 제공합니다. 더블베드 또는 트윈베드 선택 가능. 싱글차지 1인 혼자 사용 가능. 기본인원 성인 2인, 최대인원 성인 3인(엑스트라베드) 또는 성인 2인 + 아동 1인.',
  '더블 또는 트윈', 3, 3, true, false, false,
  true, true, true,
  '오션뷰 발코니, 커넥팅룸, 욕조, 스탠딩샤워',
  NULL,
  '[
    {"day": 1, "title": "1일차", "schedule": [
      {"time": "08:00", "activity": "하노이에서 차량승차 (전날 밤 9시경 전달드린 시간에 호텔 앞 픽업, 이동 중 휴게소 정차, 고속도로 이용)"},
      {"time": "11:00", "activity": "뚜언쩌우 선착장 도착 (예약확인서 불필요, 여권 사진으로 OK, 크루즈 직원 체크인 안내)"},
      {"time": "12:00", "activity": "크루즈 승선 (선착장에 정박중인 크루즈에 직접 승선)"},
      {"time": "12:10", "activity": "투어 브리핑 (3층 피아노 라운지, 환영공연, 안전지침 설명)"},
      {"time": "13:00", "activity": "점심 뷔페식사 (음료 및 주류 별도, 테이블 담당서버)"},
      {"time": "14:30", "activity": "카약 및 뱀부보트 (전투하게랩 또는 동굴 앞에서 진행)"},
      {"time": "16:00", "activity": "티톱섬 투어 (450계단 전망대 또는 초승달 모양 해변 이용, 약간의 현금 매점)"},
      {"time": "17:15", "activity": "해피아워 (다채로운 비스킷과 제철과일, 선셋파티, 쿠킹클래스, 칵테일 1+1)"},
      {"time": "19:00", "activity": "디너식사 (3층 레스토랑 지정좌석, 베지테리언/키즈메뉴 가능, 음료 및 주류 별도)"},
      {"time": "20:30", "activity": "공연 / 오징어 낚시 (피아노 라운지 라이브공연, 오징어 낚시 등 부대시설 이용)"},
      {"time": "22:00", "activity": "1일차 공식 일정 종료"}
    ]},
    {"day": 2, "title": "2일차", "schedule": [
      {"time": "05:30", "activity": "하롱의 일출감상 (객실 또는 선데크)"},
      {"time": "06:30", "activity": "태극권 스트레칭 (선데크, 자율참여)"},
      {"time": "07:00", "activity": "이른 조식뷔페 (페스츄리, 커피, 차)"},
      {"time": "07:45", "activity": "승솟동굴 투어 (하롱베이에서 가장 큰 석회암 동굴, 약 120계단, 영어가이드 동행)"},
      {"time": "08:50", "activity": "브런치 뷔페 (3층 레스토랑, 마지막 식사)"},
      {"time": "09:40", "activity": "객실 체크아웃 (캐리어 객실 문 앞, 1층 리셉션 객실카드 반납, 음료 결제 신용카드 OK)"},
      {"time": "10:15", "activity": "크루즈 하선 (처음 승선했던 선착장으로 복귀, 차량정보 전달)"},
      {"time": "11:30", "activity": "복귀차량 승차 (통상 11시~11시30분)"},
      {"time": "14:00", "activity": "하노이 도착 (교통상황 따라 상이, 호안끼엠 먼저 하차, 서호지역 가장 마지막 하차)"}
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
  '웰컴드링크\n총 4번의 식사\n외부투어 시 영어가이드\n외부투어 관광지 입장료\n수영장 등 부대시설 이용\n뱀부보트\n해피아워 까나페\n선상안전보험 및 서비스 차지',
  '이동차량 서비스\n별도 주문하는 음료 및 주류\n마사지 및 스파\n카약 (대기지는 포함)\n항공요금 및 공항픽드랍 서비스\n생일 및 기념일 이벤트',
  '6', NULL,
  NULL,
  '["스파 (마사지)", "엘리베이터", "라운지", "레스토랑", "자쿠지", "스카이 BAR", "선데크"]'::jsonb,
  3,
  '{"spa": true, "elevator": true, "lounge": true, "restaurant": true, "jacuzzi": true, "sky_bar": true, "sundeck": true, "full_ocean_view": true, "balcony": true, "recommended": true}'::jsonb
);

-- =====================================================
-- 4) 갤러리 스위트 (PARADISE-GALLERY)
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
  'PARADISE-GALLERY', '파라다이스 레거시 크루즈', 'Paradise Legacy Cruise',
  '하롱베이 크루즈의 역사인 파라다이스 그룹이 선보인 6성급 신규 크루즈. 2025년 말 출항. 전객실 완전한 오션뷰 발코니 제공. 디너 랍스터 및 스테이크 무제한 리필. 다채롭고 맛있는 식사 구성으로 유명한 파라다이스 그룹의 쾌적한 신규 크루즈.',
  '1박2일', NULL,
  '갤러리 스위트', '140m²',
  '크루즈 2층 앞쪽에 위치하는 욕조 제공 최고급형 객실타입. 크루즈 정면에 단 한 개의 객실만 구성되어 있습니다. 더블베드 고정타입. 싱글차지 1인 혼자 사용 가능. 기본인원 성인 2인, 최대인원 성인 3인(엑스트라베드) 또는 성인 2인 + 아동 1인.',
  '더블 고정', 3, 3, true, true, false,
  false, true, true,
  '오션뷰 발코니, 커넥팅룸, 욕조, 스탠딩샤워, 크루즈 정면 단독 객실',
  NULL,
  '[
    {"day": 1, "title": "1일차", "schedule": [
      {"time": "08:00", "activity": "하노이에서 차량승차 (전날 밤 9시경 전달드린 시간에 호텔 앞 픽업, 이동 중 휴게소 정차, 고속도로 이용)"},
      {"time": "11:00", "activity": "뚜언쩌우 선착장 도착 (예약확인서 불필요, 여권 사진으로 OK, 크루즈 직원 체크인 안내)"},
      {"time": "12:00", "activity": "크루즈 승선 (선착장에 정박중인 크루즈에 직접 승선)"},
      {"time": "12:10", "activity": "투어 브리핑 (3층 피아노 라운지, 환영공연, 안전지침 설명)"},
      {"time": "13:00", "activity": "점심 뷔페식사 (음료 및 주류 별도, 테이블 담당서버)"},
      {"time": "14:30", "activity": "카약 및 뱀부보트 (전투하게랩 또는 동굴 앞에서 진행)"},
      {"time": "16:00", "activity": "티톱섬 투어 (450계단 전망대 또는 초승달 모양 해변 이용, 약간의 현금 매점)"},
      {"time": "17:15", "activity": "해피아워 (다채로운 비스킷과 제철과일, 선셋파티, 쿠킹클래스, 칵테일 1+1)"},
      {"time": "19:00", "activity": "디너식사 (3층 레스토랑 지정좌석, 베지테리언/키즈메뉴 가능, 음료 및 주류 별도)"},
      {"time": "20:30", "activity": "공연 / 오징어 낚시 (피아노 라운지 라이브공연, 오징어 낚시 등 부대시설 이용)"},
      {"time": "22:00", "activity": "1일차 공식 일정 종료"}
    ]},
    {"day": 2, "title": "2일차", "schedule": [
      {"time": "05:30", "activity": "하롱의 일출감상 (객실 또는 선데크)"},
      {"time": "06:30", "activity": "태극권 스트레칭 (선데크, 자율참여)"},
      {"time": "07:00", "activity": "이른 조식뷔페 (페스츄리, 커피, 차)"},
      {"time": "07:45", "activity": "승솟동굴 투어 (하롱베이에서 가장 큰 석회암 동굴, 약 120계단, 영어가이드 동행)"},
      {"time": "08:50", "activity": "브런치 뷔페 (3층 레스토랑, 마지막 식사)"},
      {"time": "09:40", "activity": "객실 체크아웃 (캐리어 객실 문 앞, 1층 리셉션 객실카드 반납, 음료 결제 신용카드 OK)"},
      {"time": "10:15", "activity": "크루즈 하선 (처음 승선했던 선착장으로 복귀, 차량정보 전달)"},
      {"time": "11:30", "activity": "복귀차량 승차 (통상 11시~11시30분)"},
      {"time": "14:00", "activity": "하노이 도착 (교통상황 따라 상이, 호안끼엠 먼저 하차, 서호지역 가장 마지막 하차)"}
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
  '웰컴드링크\n총 4번의 식사\n외부투어 시 영어가이드\n외부투어 관광지 입장료\n수영장 등 부대시설 이용\n뱀부보트\n해피아워 까나페\n선상안전보험 및 서비스 차지',
  '이동차량 서비스\n별도 주문하는 음료 및 주류\n마사지 및 스파\n카약 (대기지는 포함)\n항공요금 및 공항픽드랍 서비스\n생일 및 기념일 이벤트',
  '6', NULL,
  NULL,
  '["스파 (마사지)", "엘리베이터", "라운지", "레스토랑", "자쿠지", "스카이 BAR", "선데크"]'::jsonb,
  4,
  '{"spa": true, "elevator": true, "lounge": true, "restaurant": true, "jacuzzi": true, "sky_bar": true, "sundeck": true, "full_ocean_view": true, "balcony": true, "vip": true}'::jsonb
);

-- =====================================================
-- 검증 쿼리 (실행 후 확인용)
-- =====================================================
-- SELECT cruise_code, cruise_name, room_name, room_area, display_order, is_vip, is_recommended
-- FROM cruise_info
-- WHERE cruise_name = '파라다이스 레거시 크루즈'
-- ORDER BY display_order;
-- 기대 결과: 4행 (PARADISE-DELUXE, PARADISE-EXECUTIVE, PARADISE-LEGACY, PARADISE-GALLERY)
