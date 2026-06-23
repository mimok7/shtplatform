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
