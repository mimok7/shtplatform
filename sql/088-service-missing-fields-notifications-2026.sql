-- ============================================================
-- 088: 서비스별 사용일 3일전 미입력/업데이팅 알림 유형 정리
-- 기준:
--   - 공항: 픽업, 샌딩
--   - 렌트카: 픽업, 드롭
--   - 스하차량: 픽업, 드롭
-- 나머지 기존 키 삭제:
--   airport_missing_info_d3, rentcar_missing_info_d3, sht_sending_missing_info_d3
-- 생성일: 2026-05-21
-- 적용: Supabase Dashboard -> SQL Editor
-- ============================================================

BEGIN;

-- 1) 백업 (롤백 대비)
CREATE TABLE IF NOT EXISTS public._backup_notification_event_types_088_20260521 AS
SELECT *
FROM public.notification_event_types
WHERE event_key IN (
  'airport_pickup_missing_info_d3',
  'airport_sending_missing_info_d3',
  'rentcar_pickup_missing_info_d3',
  'rentcar_drop_missing_info_d3',
  'sht_pickup_missing_info_d3',
  'sht_drop_missing_info_d3',
  'airport_missing_info_d3',
  'rentcar_missing_info_d3',
  'sht_sending_missing_info_d3'
);

CREATE TABLE IF NOT EXISTS public._backup_notification_app_event_settings_088_20260521 AS
SELECT *
FROM public.notification_app_event_settings
WHERE event_key IN (
  'airport_pickup_missing_info_d3',
  'airport_sending_missing_info_d3',
  'rentcar_pickup_missing_info_d3',
  'rentcar_drop_missing_info_d3',
  'sht_pickup_missing_info_d3',
  'sht_drop_missing_info_d3',
  'airport_missing_info_d3',
  'rentcar_missing_info_d3',
  'sht_sending_missing_info_d3'
);

-- 2) 이벤트 유형 추가/갱신
INSERT INTO public.notification_event_types (
  event_key,
  event_label,
  description,
  default_title,
  default_body,
  default_url,
  default_priority,
  is_active,
  sort_order,
  updated_at
)
VALUES
  (
    'airport_pickup_missing_info_d3',
    '공항 픽업 3일전 정보미입력',
    '공항 픽업 사용일 3일 전, 위치 정보가 비었거나 Updating인 예약 알림',
    '공항 픽업 정보 확인 필요',
    '공항 픽업 정보 중 미입력/Updating 항목이 있습니다.',
    'https://manager.staycruise.kr/manager/reservations',
    'high',
    TRUE,
    210,
    NOW()
  ),
  (
    'airport_sending_missing_info_d3',
    '공항 샌딩 3일전 정보미입력',
    '공항 샌딩 사용일 3일 전, 위치 정보가 비었거나 Updating인 예약 알림',
    '공항 샌딩 정보 확인 필요',
    '공항 샌딩 정보 중 미입력/Updating 항목이 있습니다.',
    'https://manager.staycruise.kr/manager/reservations',
    'high',
    TRUE,
    220,
    NOW()
  ),
  (
    'rentcar_pickup_missing_info_d3',
    '렌트카 픽업 3일전 정보미입력',
    '렌트카 픽업 사용일 3일 전, 위치 정보가 비었거나 Updating인 예약 알림',
    '렌트카 픽업 정보 확인 필요',
    '렌트카 픽업 정보 중 미입력/Updating 항목이 있습니다.',
    'https://manager.staycruise.kr/manager/reservations',
    'high',
    TRUE,
    230,
    NOW()
  ),
  (
    'rentcar_drop_missing_info_d3',
    '렌트카 드롭 3일전 정보미입력',
    '렌트카 드롭 사용일 3일 전, 위치 정보가 비었거나 Updating인 예약 알림',
    '렌트카 드롭 정보 확인 필요',
    '렌트카 드롭 정보 중 미입력/Updating 항목이 있습니다.',
    'https://manager.staycruise.kr/manager/reservations',
    'high',
    TRUE,
    240,
    NOW()
  ),
  (
    'sht_pickup_missing_info_d3',
    '스하차량 픽업 3일전 정보미입력',
    '스하차량 픽업 사용일 3일 전, 픽업/드롭 위치가 비었거나 Updating인 예약 알림',
    '스하차량 픽업 정보 확인 필요',
    '스하차량 픽업 정보 중 미입력/Updating 항목이 있습니다.',
    'https://manager.staycruise.kr/manager/sht-car',
    'high',
    TRUE,
    250,
    NOW()
  ),
  (
    'sht_drop_missing_info_d3',
    '스하차량 드롭 3일전 정보미입력',
    '스하차량 드롭 사용일 3일 전, 픽업/드롭 위치가 비었거나 Updating인 예약 알림',
    '스하차량 드롭 정보 확인 필요',
    '스하차량 드롭 정보 중 미입력/Updating 항목이 있습니다.',
    'https://manager.staycruise.kr/manager/sht-car',
    'high',
    TRUE,
    260,
    NOW()
  )
ON CONFLICT (event_key) DO UPDATE
SET
  event_label = EXCLUDED.event_label,
  description = EXCLUDED.description,
  default_title = EXCLUDED.default_title,
  default_body = EXCLUDED.default_body,
  default_url = EXCLUDED.default_url,
  default_priority = EXCLUDED.default_priority,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

-- 3) 더 이상 사용하지 않는 기존 키 삭제
DELETE FROM public.notification_app_event_settings
WHERE event_key IN (
  'airport_missing_info_d3',
  'rentcar_missing_info_d3',
  'sht_sending_missing_info_d3'
);

DELETE FROM public.notification_event_types
WHERE event_key IN (
  'airport_missing_info_d3',
  'rentcar_missing_info_d3',
  'sht_sending_missing_info_d3'
);

-- 4) 앱별 이벤트 설정 기본값 채우기 (기본: enabled=true)
INSERT INTO public.notification_app_event_settings (
  app_name,
  event_key,
  enabled,
  updated_at,
  created_at
)
SELECT
  a.app_name,
  e.event_key,
  TRUE,
  NOW(),
  NOW()
FROM public.notification_apps a
CROSS JOIN (
  SELECT unnest(ARRAY[
    'airport_pickup_missing_info_d3',
    'airport_sending_missing_info_d3',
    'rentcar_pickup_missing_info_d3',
    'rentcar_drop_missing_info_d3',
    'sht_pickup_missing_info_d3',
    'sht_drop_missing_info_d3'
  ]) AS event_key
) e
ON CONFLICT (app_name, event_key) DO NOTHING;

-- 5) dedupe 조회 성능 인덱스
CREATE INDEX IF NOT EXISTS idx_notification_dispatch_log_event_dedupe
  ON public.notification_dispatch_log(event_key, dedupe_key, created_at DESC);

COMMIT;

-- ============================================================
-- 검증 쿼리
-- ============================================================
-- SELECT event_key, event_label, is_active
-- FROM public.notification_event_types
-- WHERE event_key LIKE '%_missing_info_d3'
-- ORDER BY sort_order;
--
-- SELECT event_key, COUNT(*) AS app_count, COUNT(*) FILTER (WHERE enabled) AS enabled_count
-- FROM public.notification_app_event_settings
-- WHERE event_key LIKE '%_missing_info_d3'
-- GROUP BY event_key
-- ORDER BY event_key;
