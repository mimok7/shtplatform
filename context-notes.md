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

추가 작업 메모 (2026. 07. 15 - PWA 앱별 아이콘 교체)

- 사용자가 제공한 공용 원본 아이콘을 앱별로 매핑함. `adminpwa.png`는 admin, `managerpwa.png`는 manager, `manager1pwa.png`는 manager1, `mobilepwa.png`는 mobile에 적용함.
- 각 앱의 manifest와 Next metadata가 `/icon-192.png`, `/icon-512.png`를 참조하고 있어 참조 경로는 변경하지 않고 앱별 public 파일만 교체하는 방식으로 결정함.
- 원본이 모두 정사각형 PNG이므로 시각적 내용을 재생성하지 않고 고품질 보간으로 192x192 및 512x512 PNG를 생성함. 기존 PWA 설치 및 서비스 워커 경로와의 호환성을 유지하기 위한 결정임.

추가 작업 메모 (2026. 07. 16 - 씨스타 크루즈 셔틀 리무진 요금 추가)

- `sql/db.csv`와 `sql/031-rentcar-2026-data.sql` 기준으로 `public.rentcar_price` 컬럼을 확인했다.
- 씨스타의 기존 크루즈명은 `씨스타 크루즈`이며, 2026·2027 각각 편도 500,000동과 숙박 일정 왕복(`다른날왕복`) 1,000,000동으로 등록한다.
- 신규 SQL 파일은 `sql/120-seastar-cruise-shuttle-limousine-20260716.sql`이며, `WITH source_rows`, `NOT EXISTS`, 트랜잭션, 명시적 형변환, `RETURNING`, 검증 `SELECT`를 포함한다.

