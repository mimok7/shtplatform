# 관리자 앱 `예약설정` 기획서 (사전 점검본)

작성일: 2026-05-16  
대상: `apps/admin`  
위치: 사이드바 `예약/운영` 그룹

## 1) 요청 배경

관리자 앱의 `예약/운영` 그룹에 `예약설정` 메뉴를 추가하고,  
앱별로 푸시 알림 가능 대상을 선택/설정할 수 있도록 구현한다.

이번 문서는 구현 전 점검 결과와 실행 계획을 정리한 사전 기획서다.

## 2) 현재 코드/DB 점검 요약

### 2-1. 사이드바 구조

- 파일: `apps/admin/components/AdminLayout.tsx`
- 그룹: `group-reservation` (`예약/운영`)
- 현재 메뉴:
  - `알림 제어` (`/admin/notification-control`)
  - `총금액 계산`
  - `스하좌석`

→ `예약설정` 메뉴 추가는 같은 그룹에 확장하면 된다.

### 2-2. 푸시 구독 저장 구조

- 테이블: `push_subscriptions`
- 스키마 파일: `sql/080-push-subscriptions-schema.sql`
- 핵심 컬럼:
  - `user_id`
  - `app_name` (앱 식별)
  - `is_active`

### 2-3. 앱별 필터 발송 가능 여부

- API: `apps/admin/app/api/send-notification/route.ts`
- 이미 `appNames` 배열 파라미터를 받아 `push_subscriptions.app_name IN (...)` 필터 지원

즉, **백엔드는 이미 앱별 대상 발송이 가능**하며, 관리자 UI에서 해당 선택 기능만 연결하면 된다.

### 2-4. 현재 실제 구독 앱명(코드 기준)

`subscribe-push` 기본값 기준:

- `customer`
- `manager`
- `manager1`
- `partner`
- `mobile`
- `quote`

## 3) “가능한 알림” 정리 (현재 시스템 기준)

### A. 예약 실시간 알림 (운영 알림)

- 소스: `reservation` 테이블 `INSERT` 실시간 감지
- 현재 구현 앱:
  - `manager` (`apps/manager/src/hooks/useReservationListener.ts`)
  - `manager1` (`apps/manager1/hooks/useReservationListener.ts`)
- 글로벌 런타임 ON/OFF 키:
  - `notification_runtime_settings.setting_key = 'reservation_realtime_enabled'`

### B. 결제/체크인 계열 자동 알림

- 소스 테이블: `payment_notifications`
- 타입(실사용):
  - `checkin_reminder`
  - `payment_due`
  - `payment_overdue`
- 관련 함수:
  - `generate_checkin_notifications`
  - `generate_payment_due_notifications`
  - `generate_overdue_notifications`
  - `generate_all_notifications`

### C. 고객 대상 수동 알림(관리자 발송)

- 화면: `SendNotificationModal`
- DB 기록:
  - `notifications`
  - `customer_notifications`
  - `customer_requests`
- 푸시 발송:
  - 현재 `userId` 지정 발송
  - API 레벨에서 `appNames` 추가 필터 사용 가능

## 4) 구현 목표 정의

`예약설정` 페이지에서 다음을 제공:

1. 앱별 푸시 허용 ON/OFF  
2. (2단계) 알림 유형별 허용 ON/OFF  
3. 저장된 설정을 푸시 발송 시 강제 적용

## 5) 구현 데이터 모델

신규 SQL: `sql/081-notification-app-settings.sql`

테이블은 확장성을 위해 3개로 분리했다.

- `notification_apps`: 앱 목록과 앱 단위 푸시 ON/OFF
- `notification_event_types`: 알림 유형/기본 제목/내용/URL/우선순위
- `notification_app_event_settings`: 앱별 알림 유형 허용/차단 매핑

추가 RPC:

- `admin_get_push_subscription_app_counts`: 관리자 화면에서 앱별 전체/활성 구독 수 조회

초기 seed 앱:

- `customer`
- `manager`
- `manager1`
- `partner`
- `mobile`
- `quote`

초기 seed 알림 유형:

- `reservation_realtime`
- `checkin_reminder`
- `payment_due`
- `payment_overdue`
- `manual_customer`

## 6) 화면 기획 (`/admin/reservation-settings`)

### 섹션 1. 앱별 푸시 토글

- 앱 목록 + 현재 활성 구독 수 표시
- 토글: 앱 단위 전체 허용/차단

### 섹션 2. 앱별 알림 유형 매핑

- 앱별/알림유형별 토글 매트릭스:
  - 예약 실시간
  - 체크인 리마인더
  - 결제기한
  - 결제연체
  - 수동 고객알림

### 섹션 3. 알림 내용/유형 추가

- 신규 알림 키, 표시 이름, 설명, 기본 제목, 기본 내용, 기본 URL, 우선순위 입력
- 추가 즉시 모든 앱에 기본 허용 row 생성

### 섹션 4. 저장/검증

- 토글 즉시 저장
- 누락된 매핑 row 보정 버튼 제공

## 7) 구현 순서 (권장)

1. 사이드바 메뉴 추가 (`AdminLayout.tsx`)
2. 페이지 생성 (`apps/admin/app/admin/reservation-settings/page.tsx`)
3. SQL 마이그레이션 추가 (`sql/081-notification-app-settings.sql` 권장)
4. 관리자 페이지에서 설정 CRUD 연결
5. `send-notification` API에 설정 강제 필터 적용
6. 고객 수동 알림 모달에서 `manual_customer` + `customer` 앱 지정
7. QA (앱별 구독/발송/차단 시나리오)

## 8) 리스크 및 체크포인트

- 기존 구독 데이터의 `app_name` null/오타 케이스 정리 필요
- 앱 설정은 “저장”만으로 끝나지 않고 “발송 API 적용”이 핵심
- 예약 실시간 알림은 현재 `manager`, `manager1` 중심이므로, 다른 앱 확장은 별도 요구사항 확인 필요
- `sql/081-notification-app-settings.sql` 실행 전에는 관리자 페이지가 준비 안내를 표시한다.
- 발송 API는 정책 테이블이 없을 때 기존 발송 흐름을 최대한 유지하고, 테이블이 있으면 정책을 강제 적용한다.
- `manager`, `manager1`의 예약 실시간 리스너는 `reservation_realtime` 앱별 정책을 함께 확인한다.

## 9) 이번 점검 결론

- 요청하신 “앱별로 푸시 가능 대상을 선택” 기능은 **현행 구조에서 구현 가능**하다.
- 구현 완료 범위:
  - `예약/운영 > 예약설정` 메뉴 추가
  - `/admin/reservation-settings` 페이지 생성
  - 앱별 푸시 허용/차단 UI
  - 앱별 알림 유형 허용/차단 UI
  - 추후 알림 유형/내용 추가 UI
  - 발송 API 정책 적용
