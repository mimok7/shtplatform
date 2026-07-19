패키지 예약 통합 상세 인원·투어명 표시 보정 시작.

- 패키지 루트의 인원은 `reservation.re_adult_count`, `re_child_count`, `re_infant_count`에서 전달된다. 0명인 아동·유아 라벨은 표시하지 않는다.
- 통합 모달 제공자는 `reservation_tour`만 조회해 `tour_price_code`를 전달하므로, 모달에서 `tour_pricing -> tour.tour_name` 관계를 조회해 DB의 실제 투어명을 보강한다.
- 기존 날짜 기반 강제 투어명 보정은 DB 값을 덮어쓸 수 있어 제거한다.

구현 및 검증 결과.

- 인원은 양수인 성인·아동·유아 항목만 조합해 렌더링한다. 따라서 `성인 5, 아동 0, 유아 0`은 `성인 5`로 표시된다.
- 모달이 열리면 표시 대상의 `tour_price_code`를 기준으로 `tour_pricing`과 `tour`를 조인 조회하고, 반환된 `tour.tour_name`을 최우선 표시한다.
- `pnpm --filter @sht/manager typecheck`, `pnpm --filter @sht/manager1 typecheck`, `git diff --check`를 통과했다.

패키지 예약 투어 행 보정 시작.

- 상품 구성 표시뿐 아니라 실제 `reservation_tour`에도 패키지당 투어 2건이 저장되도록 현재 예약 일정·가격코드·중복 상태를 확인한 뒤, 누락 행만 추가한다.

패키지 예약 투어 행 보정 결과.

- 대상 예약의 `reservation_tour`에는 7월 16일 빈 행, 7월 17일 가격코드 누락 행, 7월 19일 하노이 오후 투어 행의 총 3건이 있었다.
- 7월 16일 빈 행은 `tour_price_code IS NULL`과 빈 `request_note`까지 일치하는 행 ID로 한정해 삭제했다.
- 7월 17일 행에는 5인·2026년 유효 닌빈 한국어 가이드 투어 가격코드 `ead3fa39-6cd9-43a7-abe7-e7c978375c7d`를 연결했다. `야경투어 추가`는 비고로 유지했다.
- 재조회 결과 7월 17일 닌빈 한국어 가이드 투어와 7월 19일 하노이 오후 투어, 총 2건이 확인됐다.

패키지 투어명 DB 조회 재점검.

- 현재 표시 실패 사례는 `reservation_tour`에 `tour_name`이 없고 `tour_price_code`만 저장되는 구조에서 발생한다.
- 이전 구현의 중첩 관계 조회 결과는 관계 응답 형태에 의존한다. 가격 행의 `tour_id`를 먼저 읽고 `tour.tour_name`을 별도 조회해 응답 형태와 무관하게 실제 DB명을 확보한다.
- 2026-07-17 실제 `reservation_tour` 행을 읽기 전용으로 확인한 결과 `tour_price_code`와 `tour_name`은 비어 있고, 저장된 투어 식별 텍스트는 `request_note`의 `야경투어 추가`뿐이다. 가격 코드·직접 투어 ID가 없는 이 경우에는 해당 원본 메모를 투어명으로 표시해야 `투어 프로그램` 대체 문구가 남지 않는다.

패키지 포함 투어 표시 보정 시작.

- 사용자 확인에 따라 `야경투어 추가`는 투어명이 아니라 추가 요청 메모다. 패키지 상품에 정의된 포함 투어를 기준으로 표시하도록 전환한다.
- 실제 상품 조회 결과 `그랜드 파이어니스 풀패키지`의 `package_items` 투어 항목은 순서 3의 `닌빈투어`, 순서 6의 `하노이 오후투어`다. 투어 카드에는 이 두 항목을 `포함 투어`로 표시하고, `야경투어 추가`는 기존처럼 비고로만 남긴다.
- `pnpm --filter @sht/manager typecheck`, `pnpm --filter @sht/manager1 typecheck`, `git diff --check`를 통과했다.

SHT 단가 오표시 이슈 조사 시작.

- 사용자 제보 케이스는 예약 `28083a11-5adb-4327-ab8f-333625f11e71` 기준이며, 좌석은 `A1,A2`이고 기대 단가는 `850,000동`이다.
- 초기 탐색 결과 `apps/manager/src/app/manager/reservation-edit/sht/page.tsx`, `apps/mobile/app/reservation-edit/sht/page.tsx`, `apps/manager1/app/manager/reservation-edit/sht/page.tsx`에 하드코딩된 `SHT_SEAT_PRICES`가 존재한다.
- 상세 모달 `apps/manager/src/components/UserReservationDetailModal.tsx`는 기본적으로 `unit_price`/`car_total_price` 저장값을 사용해 보인다.
- 저장값 자체를 보정하는 SQL 패치 파일 `sql/111-fix-sht-pricing-trigger-and-data-patch.sql`가 존재하며, `rentcar_price`에서 `car_price_code`로 `unit_price`를 보정하는 방향이다.

적용한 수정.

- 관리자 상세 모달에서 `sht` 서비스도 `rentcar_price` 조회 대상에 포함시켰다.
- `sht` 상세 표시 시 `unit_price`가 없거나 잘못된 경우 `car_price_code -> rentcar_price.price`를 fallback으로 사용하게 했다.
- 세 개의 SHT 편집 화면에서 좌석 문자(`A/B/C`)보다 `car_price_code` 가격을 우선 사용하도록 계산 함수를 보정했다.
- 좌석별 단가 내역과 계산된 총액 UI도 동일한 가격코드 우선 규칙을 사용하도록 맞췄다.

검증 결과.

- `pnpm --dir apps/manager typecheck` 통과.
- `pnpm --dir apps/mobile typecheck` 통과.
- `pnpm --dir apps/manager1 typecheck` 통과.
- `pnpm --dir apps/customer typecheck` 통과.

주의 메모.

- `apps/manager/src/app/manager/reservation-edit/sht/page.tsx`, `apps/mobile/app/reservation-edit/sht/page.tsx`, `apps/manager1/app/manager/reservation-edit/sht/page.tsx`에는 이번 작업 전부터 다른 미커밋 변경이 있었고, 그 변경은 되돌리지 않았다.

추가 수정 메모.

- 확인서/상세 출력용 `ConfirmationGenerateModal` 3곳에서 `rentcar_price`의 `category` 또는 `vehicle_type` 값이 `BC`처럼 복합 좌석군일 때 `B`, `C` 양쪽으로 단가가 매핑되도록 수정했다.
- 이제 좌석명이 `A`이면 A 단가, `B`/`C`이면 각 좌석군 단가가 확인 모달 계산에도 동일하게 반영된다.

추가 수정 메모 (2026. 06. 23)

- 패키지 예약 통합 상세 모달(`PackageReservationDetailModal.tsx`)에서 매니저가 패키지 요금을 수정(할인/추가금 반영)하여 `reservation` 테이블의 `total_amount`가 업데이트되었음에도 불구하고, UI에서는 `reservation_package` 테이블의 `total_price`(순수 인원 단가 합계)가 우선 반영되어 수정요금이 노출되지 않는 버그 발견.
- `normalizePackageRoot` 함수에서 요금을 결정할 때 `pkg?.total_amount`가 `pkg?.total_price`보다 우선하여 적용되도록 `toAmount` 인자 순서를 변경함.
- 적용 파일: `apps/manager/src/components/PackageReservationDetailModal.tsx`, `apps/manager1/components/PackageReservationDetailModal.tsx`
- `apps/manager1/components/UserReservationDetailModal.tsx` 내 패키지 총액 표시 로직이 `service.total_amount`로만 되어 있어 `getReservationTotalAmount(service)`를 우선 체크하는 로직이 누락되어 있던 것을 발견하여 타 앱(매니저, 모바일)과 동일하게 수정 및 동기화 완료함.
- 예약확인서 모달(`ConfirmationGenerateModal.tsx` 3곳)에서 스하 차량 요금의 단가가 0동으로 노출되던 버그를 수정함. 기존 `rentcar_price` 재조회 맵의 매핑 누락 대신, DB에 확정되어 저장된 `seat_pricing_breakdown` JSONB 데이터를 파싱하여 우선 적용하도록 보완함.
- 고객앱 예약확인서 모달(`apps/customer/src/components/ConfirmationGenerateModal.tsx`)에서도 스하 차량 요금의 단가가 0동으로 노출되던 버그를 동일하게 보완 조치함.

추가 작업 메모 (2026. 06. 23)

- 매니저 앱의 관리도구 메뉴에 "패키지 상품 관리" 페이지(/manager/packages)를 연동하는 작업을 시작함.
- 사이드바(ManagerSidebar.tsx) 및 상단 탭(ManagerNav.tsx)에 패키지 상품 관리 접근 경로를 추가하여 관리 편의성을 제고할 예정임.

추가 작업 메모 (2026. 06. 23 - 고객앱 풀패키지 예약 수정)

- 고객앱 그랜드 파이어니스 풀패키지 예약 시 크루즈 드랍 장소 및 하노이 투어 픽업 장소 입력 필드 삭제 요청 반영을 위한 조사.
- 크루즈 드랍 장소 삭제: page.tsx에서 입력 필드 및 복사 버튼을 삭제함. 백엔드(packageReservation.ts)에서는 이미 `details.roomType || details.accommodation || ''` 구조로 드랍 장소에 픽업 장소(accommodation)가 자동 보정되므로 안전하게 동작함.
- 하노이 투어 픽업 장소 삭제: page.tsx에서 투어 서비스 중 하노이 투어에 대해서만 픽업 장소 입력 필드 및 복사 버튼을 렌더링하지 않도록 조건부 분기함. 백엔드(packageReservation.ts)에서는 하노이 투어의 픽업 위치(`pickup_location`)가 강제로 빈 문자열(`""`)로 저장되도록 수정하여 일괄 복사 등으로 들어오는 오염 데이터를 방지함.
- 닌빈 투어 등 타 서비스는 기존 픽업 및 드랍 장소 입력을 유지함.

추가 작업 메모 (2026. 06. 23 - 카카오 채널 안내 보완 및 링크 활성화)

- 모든 예약 완료 알림 창에 카카오 채널 주소 및 안내 멘트 통일화 작업 분석 진행.
- 분석 결과: 대부분의 서비스 예약 완료 알림은 `window.alert(...)` 기반으로 이미 카카오 채널 문구가 하드코딩되어 있으나, `cruise/vehicle/page.tsx`는 단순히 "차량 예약이 저장되었습니다!"로만 표시되어 있어 누락된 부분을 보완할 예정임.
- 추가 개선: 전역 `AlertProvider.tsx`가 `window.alert`를 커스텀 다이얼로그 모달로 대체 렌더링하고 있는데, 단순 pre-wrap 텍스트로 출력하고 있어 채널 URL 링크 클릭이 불가함. 이에 텍스트 내부의 URL을 정규식으로 감지하여 자동으로 `<a>` 링크 태그로 변환 및 렌더링하도록 헬퍼 함수를 추가할 예정임.
- 추가 개선 구현 완료 (2026. 06. 23): `AlertProvider.tsx`에 `renderMessage` 헬퍼 함수를 추가하여 텍스트 내 URL을 감지하고 `<a>` 링크 태그로 래핑하여 렌더링하도록 보완하였습니다. `pnpm --filter @sht/customer typecheck`를 통해 타입 안정성을 검증 완료하였습니다.

추가 작업 메모 (2026. 07. 06 - 그랜드 파이어니스 2027 요금 점검 및 보정)

- 그랜드 파이어니스 크루즈의 2027년도 요금 데이터를 점검하여 월별로 다르게 보이는 현상을 분석함.
- 시즌 1(2월) 요금이 시즌 2(3~12월)에 비해 성인/아동/엑스트라베드가 더 높게 책정된 시즌제 정책이 원인임을 파악함.
- 오션발코니 스위트 객실의 시즌 1 적용 기간의 시작일이 2027-01-01로 오기되어 1월 중 다른 객실 요금이 누락되는 버그 및 성인 단가 오기가 발견됨.
- Supabase 클라이언트를 이용해 오션발코니 스위트의 시즌 1 시작일을 2027-02-01로, 성인 요금을 5,250,000 VND로 보정하는 패치를 적용하고 최종 정상 반영을 확인함.

추가 작업 메모 (2026. 07. 06 - 그랜드 파이어니스 2027 요금 1월 1일 시작일 전면 확대)

- 2027년 그랜드 파이어니스 1박 2일 요금이 1월 1일부터 조회 가능하도록 모든 객실의 요금 시작일을 1월 1일로 정정하라는 피드백을 반영함.
- Supabase 클라이언트를 이용해 그랜드 파이어니스 크루즈의 2027년도 1N2D 시즌 1 요금(10개 객실)의 유효 시작일을 기존 2027-02-01에서 2027-01-01로 일괄 변경 처리함.
- 최종 검증 결과, 모든 객실의 시즌 1 적용 시작일이 2027-01-01로 정상화되어 1월 예약 시 요금 누락 없이 정상 조회되는 것을 확인함.

추가 작업 메모 (2026. 07. 08 - 예약확인서 고객앱 미노출 보완)

- 매니저가 결제 완료 처리를 할 때 reservation_payment와 reservation 테이블 상태는 업데이트되나 quote.payment_status가 'paid'로 자동 업데이트되지 않아 고객 마이페이지 견적 상세에서 [📄 예약확인서] 버튼이 표시되지 않는 현상 발견.
- 고객 마이페이지 견적 상세 페이지에서 quote.payment_status === 'paid' 조건 외에도 confirmation_status 테이블의 상태를 확인하여 상태가 'generated' 또는 'sent' 인 경우에도 예약확인서 버튼이 노출되도록 보완함.
- 적용 파일:
  - `apps/customer/src/app/mypage/quotes/[id]/view/page.tsx`
  - `apps/quote/app/mypage/quotes/[id]/view/page.tsx`

추가 작업 메모 (2026. 07. 08 - 서비스 워커 caches.match await 누락 버그 수정)

- 고객앱의 서비스 워커(`apps/customer/public/sw.js`) 내 `FetchEvent` 처리 중, 네트워크 오류 등으로 `fetch` 실패 시 캐시 백업 데이터를 가져오는 `catch` 블록에서 `caches.match(event.request)`를 `await` 없이 반환하여 Promise 자체가 전달되는 현상 발견.
- 이로 인해 브라우저 콘솔에 `TypeError: Failed to convert value to 'Response'` 에러가 발생하고 네트워크 페치 오류로 인해 예약확인서(`confirmations`) 페이지 로드 및 기타 API 요청이 실패함.
- `caches.match` 호출 앞에 `await` 키워드를 추가하여 올바른 `Response` 객체(혹은 null/undefined)가 반환되도록 조치함.
- 적용 파일:
  - `apps/customer/public/sw.js`

## 홈페이지 상품 데이터 푸시 (2026. 07. 17)

- 예약 플랫폼 DB를 상품 원본으로 유지하고, 홈페이지 DB에는 상품 카탈로그만 단방향으로 복제한다.
- 회원, 예약, 결제 및 service-role 키는 전송 대상에서 제외한다.
- 즉시 전송은 관리자 인증 API로, 자동 전송은 admin Vercel Cron의 주간 호출로 구성한다.
- 홈페이지는 수신 원본을 별도 스테이징 테이블에 저장한다. 기존 v2 큐레이션 데이터의 설명·추천 태그는 덮어쓰지 않는다.
- 플랫폼 관리 화면은 `/admin/homepage-sync`, 수동 전송 API는 `/api/admin/homepage-sync`로 추가한다.
- 자동 전송은 `vercel.json`의 `/api/cron/homepage-sync`에서 매주 일요일 18:00 UTC, 월요일 03:00 KST에 실행한다.
- `pnpm --filter @sht/admin typecheck`, `pnpm --filter @sht/admin build`, 홈페이지 `npm run build`로 정적 검증했다. 실제 전송은 홈페이지 마이그레이션 적용 및 양쪽 환경 변수 설정 후 가능하다.

## 홈페이지 원본 카탈로그 전체 읽기 전용 확장 (2026. 07. 17)

- 플랫폼 DB는 예약·결제·고객 정보를 전송하거나 수정하지 않고, 홈페이지 카탈로그에 필요한 상품 원본만 SELECT로 읽는다.
- 스키마 기준 크루즈 핵심 후보는 `cruise_info`, `cruise_rate_card`, `cruise_rate_card_inclusions`, `cruise_location`, `cruise_promotion`, `cruise_promotion_rate`, `cruise_holiday_surcharge`, `cruise_tour_options`, `cruise_info_by_category`, `cruise_info_view`, `cruise_rooms_view`이다. 뷰는 원본 테이블과 중복 여부 및 실제 데이터 유무를 확인한 뒤 선택한다.
- 호텔은 `hotel_info`, `hotel_price`, 공항은 `airport_name`, `airport_price`, 투어는 `tour`, `tour_pricing`, `tour_schedule`, `tour_inclusions`, `tour_exclusions`, `tour_important_info`, `tour_addon_options`, `tour_payment_pricing`, `tour_cancellation_policy`, `tour_cruise_integration`을 우선 점검한다.
- 홈페이지에는 원본 JSON 스테이징과 가공 v2 데이터만 작성한다. 플랫폼의 상품 원본에는 INSERT·UPDATE·DELETE를 수행하지 않는다.
- 읽기 전용 건수 점검 결과는 크루즈 `cruise_info` 89, `cruise_rate_card` 776, 포함사항 162, 프로모션 요금 52, 휴일 할증 128, 옵션 11건이다. 호텔은 정보 8·요금 164건, 공항은 명칭 4·요금 80건, 투어는 상품 10·요금 66·일정 57·포함 61·제외 39·중요정보 98·옵션 48·결제요금 6·취소정책 26·크루즈연동 2건이다.
- 플랫폼 전송 허용 목록은 크루즈 11개(`cruise_info`, `cruise_rate_card`, `cruise_rate_card_inclusions`, `cruise_location`, `cruise_promotion`, `cruise_promotion_rate`, `cruise_holiday_surcharge`, `cruise_tour_options`, `cruise_info_by_category`, `cruise_info_view`, `cruise_rooms_view`), 호텔 2개, 공항 요금과 공항명 조회, 투어 10개 상세 원본 및 기존 차량 요금이다.
- 홈페이지 DB에 `catalog_product_details_v2`, `catalog_reference_data_v2`를 추가했다. 상품에 연결되는 원본은 상세로, 공통 크루즈 위치·뷰 데이터는 참조로 보존한다. 상태 화면은 테이블별 미변환 원본·미변환 요금을 함께 표시한다.
- 플랫폼의 `homepageSync.ts`는 `.select()`만 사용하며 쓰기 메서드 정적 검색 결과가 없다. 홈페이지 변환 RPC는 `anon`, `authenticated`의 실행 권한을 명시적으로 회수하고 `service_role`만 허용했다.

추가 작업 메모 (2026. 07. 15 - PWA 앱별 아이콘 교체)

- 사용자가 제공한 공용 원본 아이콘을 앱별로 매핑함. `adminpwa.png`는 admin, `managerpwa.png`는 manager, `manager1pwa.png`는 manager1, `mobilepwa.png`는 mobile에 적용함.
- 각 앱의 manifest와 Next metadata가 `/icon-192.png`, `/icon-512.png`를 참조하고 있어 참조 경로는 변경하지 않고 앱별 public 파일만 교체하는 방식으로 결정함.
- 원본이 모두 정사각형 PNG이므로 시각적 내용을 재생성하지 않고 고품질 보간으로 192x192 및 512x512 PNG를 생성함. 기존 PWA 설치 및 서비스 워커 경로와의 호환성을 유지하기 위한 결정임.

추가 작업 메모 (2026. 07. 16 - 씨스타 크루즈 셔틀 리무진 요금 추가)

- `sql/db.csv`와 `sql/031-rentcar-2026-data.sql` 기준으로 `public.rentcar_price` 컬럼을 확인했다.
- 씨스타의 기존 크루즈명은 `씨스타 크루즈`이며, 2026·2027 각각 편도 500,000동과 숙박 일정 왕복(`다른날왕복`) 1,000,000동으로 등록한다.
- 신규 SQL 파일은 `sql/120-seastar-cruise-shuttle-limousine-20260716.sql`이며, `WITH source_rows`, `NOT EXISTS`, 트랜잭션, 명시적 형변환, `RETURNING`, 검증 `SELECT`를 포함한다.
관리자 동기화 메뉴 및 페이지 삭제 작업 시작.

- 삭제 대상은 사용자 동기화, 인증 동기화, 데이터 동기화, sh_cc 동기화, 가격 동기화, 수량 수정이다.
- `apps/admin/components/AdminLayout.tsx`에 6개 메뉴가 등록되어 있다.
- 이번 요청은 메뉴와 페이지 삭제이므로 공통 라이브러리와 API 구현은 보존한다.

적용 및 검증 결과.

- `AdminLayout.tsx`에서 6개 메뉴 항목을 제거했다.
- 6개 라우트의 `page.tsx`를 삭제했다.
- `apps/admin` 소스 검색에서 관련 라우트와 메뉴 문구 잔여 참조가 없음을 확인했다. 수량 관련 공통 라이브러리 로그는 보존했다.
- `pnpm --dir apps/admin build`가 성공했다. 기존 ESLint 경고는 있으나 빌드를 막지 않았다.
- 초기 `typecheck`는 삭제 전 라우트를 참조하는 기존 `.next/types` 생성 파일 때문에 실패했으며, 이후 production build 성공으로 새 라우트 구성이 정상 반영됨을 확인했다.
앱별 계절 테마 시스템 작업 시작.

- 기능과 데이터 흐름은 유지하고 UI 표현만 변경한다.
- 지원 테마는 기본, 봄, 여름, 가을, 겨울, 크리스마스로 시작한다.
- 테마 토큰에는 글꼴, 제목/본문/보조 글씨 크기, 버튼 배경/글자/테두리 색, 버튼 높이/패딩/모서리/굵기, 입력창/카드/표/사이드바 색을 포함한다.
- 지원 앱은 admin, customer, customer1, manager, manager1, mobile, partner, quote, cancel 9개로 확인했다.
- 공통 구현은 `@sht/ui` 패키지에 두고 각 앱 루트 레이아웃에는 앱 식별자만 전달한다.
- Supabase 설정은 앱별 `theme_id`만 저장하며, CSS 토큰 정의는 코드에 둔다.
- 연결된 Supabase 도구에는 SHT 프로젝트가 없으므로 다른 프로젝트에 DDL을 적용하지 않는다. 저장소 SQL과 런타임 기본값을 먼저 구현한다.

앱별 계절 테마 시스템 구현 결과.

- 개인 Codex 스킬 `recommend-sht-app-theme`를 생성하고 `quick_validate.py` 검증을 통과했다.
- 공통 UI 패키지에 6개 테마의 디자인 토큰, 앱별 설정 로더, 전역 테마 CSS를 추가했다.
- 디자인 토큰은 글꼴, 제목/본문/라벨 크기, 버튼 배경/글자/테두리, 높이/패딩/모서리/굵기/자간, 입력창, 카드, 표, 내비게이션을 포함한다.
- 9개 앱의 루트 레이아웃에 `ShtThemeProvider`와 공통 테마 CSS를 연결했다.
- 관리자 콘텐츠 메뉴에 `/admin/themes`를 추가하고 앱 선택, 6개 테마 비교, 실제 토큰 미리보기, 변경 저장 기능을 구현했다.
- `sql/121-app-theme-settings-20260718.sql`에 앱별 테마 테이블, 공개 읽기, 관리자 전용 입력/수정 RLS, 기본 행 9개를 추가했다.
- SHT Supabase 프로젝트 `jkhookaflhibrcafmlxn`은 현재 연결된 Supabase 도구 목록에 없고 `SUPABASE_DB_URL`도 없어서 SQL은 원격 DB에 적용하지 않았다.

검증 결과.

- `python .../quick_validate.py C:\Users\tvxqc\.codex\skills\recommend-sht-app-theme` 통과.
- `pnpm --dir apps/admin typecheck` 통과.
- `pnpm --dir apps/customer1 typecheck` 통과.
- `pnpm --dir apps/manager typecheck` 통과.
- `pnpm --dir apps/manager1 typecheck` 통과.
- `pnpm --dir apps/mobile typecheck` 통과.
- `pnpm --dir apps/partner typecheck` 통과.
- `pnpm --dir apps/quote typecheck` 통과.
- `pnpm --dir apps/cancel typecheck` 통과.
- `pnpm --dir apps/customer typecheck`는 기존 `src/app/mypage/reservations/hotel/page.tsx` 78, 133행의 `hotel_name`, `room_name` 누락 타입 오류로 실패했다. 테마 변경 파일의 오류는 아니다.
- `pnpm --dir apps/admin build` 통과. `/admin/themes` 정적 라우트 생성 확인.
- 기존 관리자 개발 서버는 작업 전부터 실행 중인 인스턴스여서 브라우저에서 새 공통 패키지를 반영하지 못했고 관리자 권한 확인 화면에 머물렀다. 기존 서버와 인증 상태는 변경하지 않았다.
관리자 Next.js 누락 청크 오류 복구 시작.

- 오류는 `.next/server/webpack-runtime.js`가 존재하지 않는 `./7351.js`를 요구하는 생성 산출물 불일치다.
- 직전 작업 중 실행 중인 개발 서버와 `next build`가 동일한 `apps/admin/.next` 경로를 사용했다.
- 소스 수정 없이 포트 3004 관리자 프로세스만 재시작하고 `.next`만 재생성한다.

관리자 Next.js 누락 청크 오류 복구 결과.

- 포트 3004 관리자 프로세스 트리만 종료했다.
- 절대 경로 `C:\SHT-DATA\sht-platform\apps\admin\.next`를 확인한 뒤 생성 산출물만 정리했다.
- `pnpm --filter @sht/admin dev`를 숨김 프로세스로 다시 시작했다.
- 새 서버는 Next.js 15.5.15로 4.2초 만에 준비됐으며 포트 3004를 정상 수신 중이다.
- `/admin/reports`는 832개 모듈로 다시 컴파일되어 HTTP 200을 반환했다.
- `/admin/themes`는 814개 모듈로 다시 컴파일되어 HTTP 200을 반환했다.
- 새 `webpack-runtime.js`에는 `7351` 참조가 없으며 두 라우트의 서버 페이지 파일이 정상 생성됐다.
- 서버 오류 로그에 `Cannot find module` 또는 누락 청크 오류가 다시 발생하지 않았다.

기본 테마 원복 및 저장 전 미리보기 작업 시작.

- 현재 `default`는 이름과 달리 청록색·라임색 디자인 토큰을 항상 문서에 적용하고 있어, 테마를 선택하지 않은 앱도 기존 UI가 변경된다.
- `기본`은 `data-sht-theme`와 인라인 테마 변수를 제거하여 각 앱의 원래 CSS가 그대로 동작하는 무적용 상태로 정의한다.
- 이전 로컬 캐시에 저장된 테마가 자동 적용되지 않도록 캐시 키 버전을 올린다.
- 계절 테마는 앱별로 명시적으로 저장된 경우에만 적용한다.
- 테마 선택은 관리자 화면의 미리보기만 변경하고, 저장 동작 이후에만 실제 앱에 반영하는 기존 데이터 흐름을 명확히 표시한다.
- 제목 토큰은 기존 최대 약 3.8rem에서 최대 1.75rem 이하로 축소한다.

기본 테마 원복 및 저장 전 미리보기 구현 결과.

- `default` 적용 시 문서 루트의 `data-sht-theme` 속성과 모든 인라인 `--sht-*` 변수를 제거하도록 변경했다.
- 로컬 캐시 접두사를 `sht-app-theme:v2:`로 변경하여 이전 구현이 저장한 테마 캐시를 자동으로 사용하지 않게 했다.
- 기본 테마의 이름을 `기본`으로 바꾸고 앱의 원래 UI를 유지한다는 설명을 추가했다.
- 6개 테마의 제목 최대 크기를 1.65~1.75rem으로 축소했고 미리보기 제목도 실제 제목 토큰을 사용하도록 변경했다.
- 테마 선택 시 저장 전 미적용 안내를 표시하며, 모든 앱을 `기본`으로 선택하는 `전체 기본으로 되돌리기` 버튼을 추가했다.
- `pnpm --dir apps/admin typecheck`와 `pnpm --dir apps/mobile typecheck`가 통과했다.
- 실행 중인 관리자 개발 서버에서 `/admin/themes`, `/admin/reports`가 모두 HTTP 200을 반환했고 두 라우트가 오류 없이 다시 컴파일됐다.

테마 저장 속도와 관리자 제목 축소 작업 시작.

- 테마 저장은 단일 `upsert` 전에 `supabase.auth.getUser()`를 호출한다. 이 호출은 원격 인증 확인이므로 저장마다 불필요한 네트워크 왕복을 추가한다.
- 관리자 레이아웃이 이미 로그인과 관리자 권한을 확인하므로, 저장 감사용 사용자 ID는 브라우저 세션의 `getSession()`에서 읽는다.
- 사용자가 지정한 대상은 공통 헤더의 `관리자 패널`과 테마 화면의 `앱별 테마 설정`이다. 계절 테마가 활성화된 경우에도 축소 크기가 유지되도록 공통 테마 제목 선택자에서 명시적 무시 속성을 지원한다.

테마 저장 속도와 관리자 제목 축소 구현 결과.

- `apps/admin/app/admin/themes/page.tsx`의 저장 흐름을 `auth.getUser()`에서 `auth.getSession()`으로 교체했다. 원격 사용자 확인 요청을 없애고 세션에 있는 사용자 ID를 `updated_by`에 저장한다.
- 공통 헤더의 `관리자 패널`과 테마 화면의 `앱별 테마 설정`을 8px로 축소했다. 두 제목은 `data-sht-theme-ignore`를 사용하므로 계절 테마의 전역 `h1` 크기에 의해 다시 커지지 않는다.
- `pnpm --dir apps/admin typecheck`가 통과했고 `/admin/themes`는 HTTP 200을 반환했다.

계절 테마 글씨 크기 통일 작업 시작.

- 계절별 테마에서 색상과 모양은 유지하되, 본문·제목·소제목·라벨·버튼 글씨 크기는 기본 테마 토큰과 동일하게 맞춘다.
- 봄·여름·크리스마스는 버튼 글씨가 기본값보다 1px 컸고, 봄·가을·크리스마스는 제목 최대 크기가 기본값보다 작았다.
- 겨울은 본문·제목·소제목·라벨 크기가 모두 기본값보다 작아 가장 불균형이 컸다.

앱별 글씨 크기 설정 구현 결정.

- 앱별 테마 행에 `typography` JSONB 객체를 추가해 본문, 제목, 소제목, 라벨, 버튼 글씨를 독립적으로 저장한다.
- 값은 관리자 화면에서 제공하는 제한된 크기 목록만 허용하고, 공통 공급자에서도 다시 검증한다. 저장값이 잘못돼도 기존 테마 기본 크기로 안전하게 처리한다.
- 기본 테마와 계절 테마의 기준 크기는 동일하게 유지한다. 관리자가 명시적으로 선택한 값만 해당 앱에 덮어쓴다.

검증 및 실행 제약.

- `pnpm --dir apps/admin typecheck`와 계절 테마 6종의 기준 글씨 크기 대조 검사가 통과했다.
- 현재 개발 환경에는 `psql`, `pg` 라이브러리, Supabase CLI가 없어 원격 스키마 변경은 실행하지 못했다. `sql/122-app-theme-typography-settings-20260718.sql`을 Supabase SQL Editor에서 실행하면 된다.
- SQL을 실행하기 전에는 관리자 화면이 필요한 컬럼을 안내하고 저장하지 않도록 처리했다.

주메뉴·부메뉴 글씨 크기 설정 구현 결정.

- 기존 `typography` JSONB에 `mainMenu`, `subMenu` 키를 추가하므로 별도 데이터베이스 마이그레이션은 필요하지 않다.
- 메뉴 그룹·상단 탐색은 `data-sht-menu="main"`, 그룹 내부 이동 항목은 `data-sht-menu="sub"`으로 구분한다.
- 사용자 지정값이 있을 때만 공통 CSS가 해당 속성에 글씨 크기를 적용한다.

테마 저장 지연 재점검 결정.

- 현재 저장은 선택한 앱 행만 한 번에 upsert하지만, 저장 직전 `auth.getSession()`을 다시 호출하고 있어 인증 잠금 또는 갱신이 있을 때 저장 대기가 길어질 수 있다.
- 감사용 `updated_by`는 저장 성능보다 우선할 정보가 아니므로, 저장 요청에서 제거한다. 기존 행의 값은 upsert에서 유지되고 신규 행은 null로 저장된다.
- 데이터베이스 또는 네트워크가 응답하지 않을 때 저장 중 상태가 계속 보이지 않도록 8초 AbortSignal 제한과 finally 상태 해제를 추가한다.

테마 전용 복원 범위 보정.

- 기존 `전체 변경 전으로 표시`는 모든 앱의 `ThemeSetting` 전체를 초기값으로 교체해 `typography` 설정까지 빈 객체로 저장하는 오류가 있었다.
- 이제 해당 동작은 `themeId`만 `default`로 바꾸고 `typography` 객체는 그대로 보존한다. 이미 저장되지 않은 글씨 크기 변경도 유지한다.
- 원격 조회 시 현재 9개 앱의 `typography`가 모두 `{}`로 확인됐다. 현재 테이블에는 이전 글씨 크기 값 이력이 없어 값의 임의 복원은 하지 않는다.

관리자 삭제 메뉴 재표시 원인.

- 현재 `AdminLayout.tsx`와 관리자 라우트에는 사용자·인증·데이터·sh_cc·가격 동기화 및 수량 수정 메뉴와 경로가 모두 없다.
- 관리자 서비스 워커가 페이지 탐색까지 cache-first로 처리하고 `sht-admin-cache-v1`을 계속 사용해 이전 메뉴를 포함한 페이지가 남을 수 있다.
- 캐시 버전을 `v2`로 올리고 탐색 요청을 network-first로 변경해 최신 메뉴를 우선 표시한다.

백업 시작 위치 및 지연 보정.

- 상단 탭 영역의 백업 시작 버튼을 백업 정보 카드의 `오류 해결 가이드` 옆으로 이동한다.
- 클라이언트 요청은 10초, GitHub Actions workflow dispatch는 5초 안에 응답하지 않으면 중단하고 안내한다.
- 백업 생성 자체는 GitHub Actions에서 비동기로 진행되며, 시작 API는 workflow dispatch가 수락되는 즉시 완료된다.

PostgreSQL 17 백업 클라이언트 보정.

- GitHub Actions 로그에서 데이터베이스 연결은 성공했으나 서버가 PostgreSQL 17.4이고 설치된 `pg_dump`가 16.14라 백업이 중단됐다.
- Ubuntu 기본 패키지 버전에 의존하지 않고 `postgres:17` 컨테이너의 `pg_dump`, `pg_restore`를 사용하도록 변경한다.

백업 Artifact 목록 로딩 분리.

- 기존 복원 화면은 Artifact API와 테이블 OpenAPI 조회를 `Promise.all`로 묶어 테이블 조회가 지연되면 Step 1의 Artifact 목록도 계속 로딩으로 표시됐다.
- Artifact와 테이블에 독립 로딩 상태를 적용했다. Artifact 요청이 완료되면 Step 1은 즉시 표시하며 테이블 실패·지연은 Step 2에만 영향을 준다.

최근 7일 백업 결과 표시.

- 백업 정보 탭은 Artifact 목록만 조회해 테이블 OpenAPI 조회 지연과 분리한다.
- GitHub Artifact의 생성 시각을 `Asia/Seoul` 기준으로 묶어 오늘부터 최근 7일을 모두 표시한다.
- 각 날짜에 파일 유무, 파일 수, 최신 Artifact 이름, 용량과 생성 시각을 표시하며 수동 새로고침을 제공한다.

백업 화면 상단 실행 버튼 및 관리자 메뉴 가독성 작업 시작.

- 기존 `지금 백업 생성` 버튼은 백업 정보 탭 내부에 있고, 설정 미완료 시 `백업 설정 필요`로 바뀌어 사용자가 즉시 실행 버튼을 찾기 어렵다.
- 백업 탭과 복원 탭 모두에서 보이는 상단 `지금 바로 백업` 버튼으로 이동한다. 설정이 없을 때는 요청을 보내지 않고 기존 설정 안내 메시지를 표시한다.
- 관리자 패널 제목은 `text-xl`에서 절반 수준인 `text-sm`으로 줄이고, 좌측 메뉴는 `text-xs`에서 `text-[11px]`로 줄인다. 선택 메뉴는 진한 배경과 강제 흰색 글자로 대비를 보장한다.

백업 화면 상단 실행 버튼 및 관리자 메뉴 가독성 구현 결과.

- 공통 관리자 패널 제목을 `text-sm`으로 줄였고, 좌측 링크와 그룹 메뉴를 `text-[11px]`로 줄였다.
- 선택 메뉴는 `bg-blue-700 !text-white`를 사용하고 테마 무시 속성을 유지해 계절 테마가 선택 글자색을 덮어쓰지 못하게 했다.
- 백업 탭과 복원 탭 모두에서 보이는 상단 `지금 바로 백업` 버튼을 추가했다. 설정이 없는 경우에도 버튼은 보이며 클릭하면 API 요청 없이 설정 안내를 표시한다.
- `pnpm --dir apps/admin typecheck`가 통과했다. 사용자의 요청에 따라 개발 서버는 종료 상태를 유지해 런타임 HTTP 검사는 실행하지 않았다.

전체 변경 전 테마 복원 작업 시작.

- 원격 `app_theme_settings`를 서비스 역할 키로 읽은 결과, `admin`만 `autumn`으로 저장돼 있었다. 나머지 8개 앱은 `default`다.
- `ShtThemeProvider`는 저장된 설정을 새로고침마다 다시 적용하므로, 이 저장값이 사용자가 의도하지 않은 테마 변경의 직접 원인이다.
- 사용자 요청에 따라 9개 앱 모두의 `theme_id`를 `default`로 복원하고, 화면의 전체 원복 버튼을 `전체 변경 전으로 표시`로 명확히 표시한다.

전체 변경 전 테마 복원 결과.

- 서비스 역할 키로 9개 앱의 `app_theme_settings.theme_id`를 모두 `default`로 upsert했다. 반환값과 후속 SELECT에서 기본값이 아닌 앱이 0개임을 확인했다.
- `ShtThemeProvider`의 로컬 캐시 접두사를 `v3`으로 올려 기존 `v2`에 남아 있던 계절 테마 캐시를 무시한다. 앱은 먼저 변경 전 기본 UI로 표시되고, 원격에 명시적으로 저장된 테마만 나중에 적용된다.
- 관리자 테마 화면의 전체 원복 버튼 문구를 `전체 변경 전으로 표시`로 변경했다. 선택 후 저장하면 모든 앱을 기본 상태로 다시 기록한다.
- `pnpm --dir apps/admin typecheck`가 통과했다. 개발 서버는 종료 요청에 따라 재시작하지 않았다.

백업 생성·목록·복원 점검 작업 시작.

- 현재 원격 저장소는 `mimok7/shtplatform`이지만 백업 관련 API의 기본 저장소는 `mimok7/admin`으로 설정돼 있어 정상 Artifact를 조회하지 못한다.
- `.github/workflows`에는 백업을 생성하는 워크플로가 없고 CI만 존재한다. 따라서 복원 화면은 조회할 Artifact가 없는 상태가 된다.
- 복원 API는 GitHub Artifact 내부에서 PostgreSQL custom format의 `.dump` 또는 `.dump.gz` 파일을 찾고 `pg_restore`로 복원한다. 화면의 기존 SQL gzip 예시는 이 형식과 호환되지 않는다.
- 매일과 수동 실행 모두 지원하는 `pg_dump --format=custom` 기반 Artifact를 추가하고, 관리자 화면에서 워크플로를 수동 실행할 수 있게 한다.

백업 생성·목록·복원 구현 결과.

- `.github/workflows/supabase-backup.yml`에 KST 03:00 자동 실행과 수동 실행을 추가했다. 이 워크플로는 custom format `.dump`를 생성하고 `pg_restore --list`로 검증한 후 `.dump.gz`, 매니페스트, 체크섬을 90일 보관 Artifact로 업로드한다.
- Artifact 이름은 `supabase-backup-<run id>`라서 관리자 목록 API의 필터와 일치한다. 복원 API가 찾는 `.dump.gz` 파일 형식과도 일치한다.
- 백업·복원·이전·검증 API의 기본 GitHub 저장소를 실제 원격 저장소인 `mimok7/shtplatform`으로 변경했다. 환경변수로 다른 저장소를 명시한 경우에는 해당 값이 우선한다.
- 관리자 백업 화면에 `지금 백업 생성` 버튼을 추가했다. 서버 API가 GitHub workflow_dispatch를 호출하고, 완료 메시지 후 복원 마법사에서 목록을 새로고침하도록 안내한다.
- 실제 첫 Artifact 생성에는 GitHub 저장소 Secret `SUPABASE_DB_URL`과 배포 서버 환경변수 `GITHUB_BACKUP_TOKEN`의 Actions 쓰기 권한이 필요하다. 비밀값은 저장소에 작성하지 않았다.
- `pnpm --dir apps/admin typecheck`, 백업 워크플로 필수 항목 정적 검사, `/admin/backup` HTTP 200을 확인했다.

수동 백업 실행 설정 오류 점검 시작.

- `POST /api/admin/backup/run`의 500은 API 컴파일 오류가 아니라 `GITHUB_BACKUP_TOKEN` 미설정 응답이다.
- 실행 중인 `GET /api/admin/backup/setup-status` 결과에서 `SUPABASE_DB_URL`과 `GITHUB_BACKUP_TOKEN`이 모두 `false`다. 따라서 GitHub Actions 실행과 이후 복원 API의 DB 접속이 모두 불가능하다.
- 비밀값은 코드나 저장소 파일에 추가하지 않는다. 백업 화면에서 설정 상태를 확인하고 미설정 상태에서는 500 요청 대신 설정 체크리스트로 안내한다.

수동 백업 실행 설정 오류 보정 결과.

- 백업 화면은 `/api/admin/backup/setup-status`에서 `SUPABASE_DB_URL`, `GITHUB_BACKUP_TOKEN` 상태를 읽는다.
- 둘 중 하나라도 없으면 `지금 백업 생성` 버튼을 `백업 설정 필요`로 비활성화하고, 누락된 변수 이름과 설정 체크리스트 링크를 표시한다.
- 현재 로컬 서버의 상태 API는 두 변수 모두 `false`를 반환했다. 따라서 기존 500은 환경 설정 전에는 발생하지 않는다.
- `pnpm --dir apps/admin typecheck`가 통과했고 `/admin/backup`은 HTTP 200을 반환했다.
- 최근 개발 서버 로그의 `subscribe-push` 빈 JSON 오류는 테마 저장과 별개인 푸시 구독 요청에서 발생한 기존 오류이며, 이번 파일 변경과 직접 관련이 없다.

관리자 제목 및 메뉴 가독성 보정 작업 시작.

- 공통 관리자 헤더의 `관리자 패널`과 테마 페이지의 `앱별 테마 설정`이 이전 요청에서 8px로 축소되어 과도하게 작아졌다.
- 두 제목은 공통 관리자 패널에서 사용하는 `테마 관리` 제목 크기인 `text-xl`로 통일한다.
- 메뉴 항목은 `text-sm`에서 `text-xs`로 한 단계 줄이고, 선택 상태는 밝은 배경에 어두운 색을 쓰지 않고 진한 파란 배경과 흰색 글자를 사용한다.

관리자 제목 및 메뉴 가독성 보정 구현 결과.

- 공통 관리자 헤더의 `관리자 패널`과 테마 페이지의 `앱별 테마 설정`을 `text-xl`로 복원해 `테마 관리` 제목과 동일한 크기로 맞췄다.
- 좌측 메뉴 링크와 그룹 메뉴를 `text-xs`로 한 단계 줄였다.
- 선택된 링크와 그룹은 `bg-blue-600 text-white`로 표시하고 `data-sht-theme-ignore`를 추가했다. 공통 테마의 `[aria-current='page']` 색상 규칙도 이 속성이 있는 메뉴에는 적용되지 않는다.
- `pnpm --dir apps/admin typecheck`가 통과했고 `/admin/themes`는 HTTP 200을 반환했다.

모바일 일정 패키지·KST 날짜 보정 시작.

- 운영 데이터의 `그랜드 파이어니스 풀패키지` 예약은 하나의 패키지 예약 ID 아래에 7월 16일 공항, 7월 17일 투어, 7월 18일 크루즈, 7월 19일 투어·공항 서비스가 저장돼 있다.
- 기존 모바일 일정은 패키지 포함 서비스 중 가장 이른 날짜 하나만 `packageDate`로 사용하므로 7월 19일에는 패키지 카드가 표시되지 않는다.
- 기존 크루즈 차량 날짜 필터는 시간대가 없는 날짜를 선택일과 그 전날 범위에 함께 포함한다. 이 예외가 19일 화면에 18일 예약이 표시되는 직접 원인이다.
- 패키지 예약은 포함 서비스가 존재하는 KST 날짜마다 한 장씩 표시한다.
- 일정의 날짜 비교는 모든 서비스에 `toKstDateKey`를 적용한 뒤 선택한 KST 날짜와 엄격하게 비교한다. 오늘 버튼과 초기 선택일도 기기 시간대가 아니라 KST 오늘을 사용한다.

모바일 일정 패키지·KST 날짜 보정 결과.

- 패키지 포함 크루즈, 크루즈 차량, 공항, 호텔, 투어, 렌트카, 스하 차량의 시작·귀환 날짜를 KST 날짜 키로 모아 중복을 제거했다. 패키지 카드는 해당 날짜마다 생성된다.
- 신규 크루즈 차량에만 적용하던 선택일 전날 허용 로직을 제거했다. 모든 서비스는 KST로 변환한 일정 날짜와 선택 날짜가 정확히 같을 때만 일간 화면에 표시된다.
- 일정 초기 날짜, 오늘 버튼, 지난 일정 판단을 KST 현재 날짜 기준으로 변경했다. 시간대가 포함된 DB 시각은 기존 공통 함수에서 `Asia/Seoul` 시간으로 표시된다.
- 실제 7월 19일 화면에서 `그랜드 파이어니스 풀패키지`와 패키지 섹션 1건이 표시되고 렌더링된 일정 날짜 6개가 모두 7월 19일임을 확인했다.
- 7월 18일 화면에서도 패키지 섹션 1건이 표시되고 렌더링된 일정 날짜 8개가 모두 7월 18일임을 확인했다.
- 브라우저 콘솔 오류는 없었고 `pnpm --dir apps/mobile typecheck`가 통과했다.

모바일 앱 KST 표시·오늘 기준 통일 결과.

- 기존 `dateKst.ts`에 KST 오늘 날짜 키와 KST 하루의 UTC 조회 범위를 제공하는 공통 함수를 추가했다.
- 취소 요청 신청 시각, 알림의 절대 날짜, 구 예약·패키지 예약 수정의 날짜 표시에 `Asia/Seoul` 기준을 적용했다.
- 취소 위약금 기준일과 환불 결제일, 알림의 지난 일정 필터를 KST 날짜 키로 계산한다.
- 좌석 배치, 크루즈 차량 날짜 점검, 패키지·크루즈 견적, 티켓 수정의 기본 오늘 날짜를 UTC 날짜 문자열이 아닌 KST 오늘로 변경했다.
- 오늘 작성한 견적 조회 범위는 기기 현지 자정이 아니라 KST 00:00부터 다음 날 00:00까지의 UTC 범위를 사용한다.
- `getKstDayUtcRange('2026-07-19')`가 `2026-07-18T15:00:00.000Z`부터 `2026-07-19T15:00:00.000Z`까지 반환하고, `2026-07-18T16:00:00Z`가 KST 7월 19일로 변환됨을 확인했다.
- `pnpm --dir apps/mobile typecheck`가 통과했다. 변경 파일 ESLint는 오류 0건으로 통과했고 기존 경고만 남아 있다.

모바일 패키지 일정 서비스명·상세 모달 동기화 시작.

- 매니저1은 패키지 루트 예약 ID를 `reservation_cruise`, `reservation_airport`, `reservation_hotel`, `reservation_tour`, `reservation_rentcar`, `reservation_car_sht`의 `reservation_id`로 직접 조회한다.
- 현재 모바일 일정과 예약 목록은 패키지 루트의 `re_type`이 `package`라는 이유로 해당 ID를 각 서비스별 조회 ID에서 제외한다. 실제 포함 서비스 행은 패키지 루트 예약 ID 아래 저장되어 있어 상세 모달에 전달되지 않는다.
- 모바일 일정의 패키지 카드는 날짜만 여러 건 생성하고 그 날짜에 포함된 서비스명 목록은 보관하지 않는다.
- 패키지 루트 ID는 서비스 종류와 무관하게 모든 포함 서비스 테이블 조회에 사용한다. 패키지 상세·상품 마스터도 함께 전달해 매니저1의 요금 구성과 예약 정보를 표시한다.
- 모달의 데이터 항목은 매니저1과 맞추고, 모바일에서는 폭을 제한한 하단 시트와 한 열 정보 행, 44px 닫기 버튼을 사용한다.
- 일정 상세 조회에서 DB에 없는 `reservation.notes`를 선택해 전체 조회가 실패하던 문제를 확인했다. 실제 스키마의 `manager_note`로 수정해 패키지 포함 서비스가 모달에 전달되도록 했다.
- 실제 석초롱 패키지로 7월 17일 `닌빈 한국어 가이드 투어`, 7월 18일 `그랜드 파이어니스`, 7월 19일 `공항 샌딩, 하노이 오후 투어`가 날짜별로 표시됨을 확인했다.
- 390px 화면에서 패키지 1건, 포함 서비스 5건, 총액 55,250,000동, 두 투어와 `야경투어 추가` 비고가 표시됨을 확인했다. `/reservations`에서도 동일 패키지 상세가 포함 서비스 5건으로 열렸다.
- `pnpm --dir apps/mobile typecheck`가 통과했다. 변경 파일 ESLint는 오류 0건으로 통과했고 기존 경고 14건만 남아 있다.
