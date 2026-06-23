BEGIN;

WITH ticket_rows AS (
  SELECT
    rt.reservation_id,
    COALESCE(NULLIF(rt.ticket_type, ''), 'ticket') AS ticket_type,
    COALESCE(NULLIF(rt.ticket_name, ''), NULLIF(rt.program_selection, ''), '티켓') AS ticket_name,
    COALESCE(rt.usage_date, r.reservation_date, CURRENT_DATE) AS usage_date,
    COALESCE(rt.request_note, '') AS request_note,
    COALESCE(rt.shuttle_required, false) AS shuttle_required,
    GREATEST(COALESCE(rt.adult_count, 0), 0) AS adult_count,
    GREATEST(COALESCE(rt.child_count, 0), 0) AS child_count,
    GREATEST(COALESCE(rt.shuttle_count, 0), 0) AS shuttle_count,
    COALESCE(rt.price_channel, 'card') AS price_channel,
    COALESCE(rt.unit_price, 0) AS stored_unit_price,
    COALESCE(rt.total_price, 0) AS stored_total_price,
    COALESCE(r.manual_additional_fee, 0) AS additional_fee,
    NULLIF(r.manual_additional_fee_detail, '') AS additional_fee_detail
  FROM public.reservation_ticket rt
  JOIN public.reservation r
    ON r.re_id = rt.reservation_id
  WHERE r.re_type = 'ticket'
),
ticket_rows_with_price AS (
  SELECT
    tr.*,
    adult.ticket_price_code AS adult_code,
    adult.ticket_name AS adult_name,
    CASE
      WHEN tr.price_channel = 'official' THEN COALESCE(adult.official_price_vnd, 0)
      WHEN tr.price_channel = 'krw' THEN COALESCE(adult.stay_krw_price_krw, 0)
      ELSE COALESCE(adult.stay_card_price_vnd, 0)
    END AS adult_unit_price,
    child.ticket_price_code AS child_code,
    child.ticket_name AS child_name,
    CASE
      WHEN tr.price_channel = 'official' THEN COALESCE(child.official_price_vnd, 0)
      WHEN tr.price_channel = 'krw' THEN COALESCE(child.stay_krw_price_krw, 0)
      ELSE COALESCE(child.stay_card_price_vnd, 0)
    END AS child_unit_price,
    shuttle.ticket_price_code AS shuttle_code,
    shuttle.ticket_name AS shuttle_name,
    CASE
      WHEN tr.price_channel = 'official' THEN COALESCE(shuttle.official_price_vnd, 0)
      WHEN tr.price_channel = 'krw' THEN COALESCE(shuttle.stay_krw_price_krw, 0)
      ELSE COALESCE(shuttle.stay_card_price_vnd, 0)
    END AS shuttle_unit_price
  FROM ticket_rows tr
  LEFT JOIN LATERAL (
    SELECT tp.*
    FROM public.ticket_price tp
    WHERE tp.is_active = true
      AND tp.ticket_type = tr.ticket_type
      AND tp.price_item = 'adult'
      AND tp.valid_from <= tr.usage_date
      AND (tp.valid_to IS NULL OR tp.valid_to >= tr.usage_date)
    ORDER BY tp.valid_from DESC, tp.sort_order ASC, tp.updated_at DESC
    LIMIT 1
  ) adult ON true
  LEFT JOIN LATERAL (
    SELECT tp.*
    FROM public.ticket_price tp
    WHERE tp.is_active = true
      AND tp.ticket_type = tr.ticket_type
      AND tp.price_item = 'child_under_1_2m'
      AND tp.valid_from <= tr.usage_date
      AND (tp.valid_to IS NULL OR tp.valid_to >= tr.usage_date)
    ORDER BY tp.valid_from DESC, tp.sort_order ASC, tp.updated_at DESC
    LIMIT 1
  ) child ON true
  LEFT JOIN LATERAL (
    SELECT tp.*
    FROM public.ticket_price tp
    WHERE tp.is_active = true
      AND tp.ticket_type = tr.ticket_type
      AND tp.price_item = 'shuttle'
      AND tp.valid_from <= tr.usage_date
      AND (tp.valid_to IS NULL OR tp.valid_to >= tr.usage_date)
    ORDER BY tp.valid_from DESC, tp.sort_order ASC, tp.updated_at DESC
    LIMIT 1
  ) shuttle ON true
),
ticket_lines AS (
  SELECT
    reservation_id,
    10 AS line_order,
    '티켓(성인)'::text AS label,
    COALESCE(NULLIF(adult_code, ''), NULLIF(ticket_name, ''), 'adult') AS code,
    COALESCE(NULLIF(adult_name, ''), ticket_name) AS line_ticket_name,
    COALESCE(NULLIF(ticket_name, ''), NULLIF(adult_name, ''), '티켓') AS display_ticket_name,
    adult_count AS quantity,
    COALESCE(NULLIF(adult_unit_price, 0), CASE WHEN adult_count > 0 THEN stored_unit_price ELSE 0 END) AS unit_price,
    adult_count * COALESCE(NULLIF(adult_unit_price, 0), CASE WHEN adult_count > 0 THEN stored_unit_price ELSE 0 END) AS amount,
    usage_date,
    ticket_type,
    price_channel,
    shuttle_required,
    request_note,
    additional_fee,
    additional_fee_detail
  FROM ticket_rows_with_price
  WHERE adult_count > 0

  UNION ALL

  SELECT
    reservation_id,
    20 AS line_order,
    '티켓(아동)'::text AS label,
    COALESCE(NULLIF(child_code, ''), 'child_under_1_2m') AS code,
    COALESCE(NULLIF(child_name, ''), ticket_name) AS line_ticket_name,
    COALESCE(NULLIF(ticket_name, ''), NULLIF(child_name, ''), '티켓') AS display_ticket_name,
    child_count AS quantity,
    COALESCE(child_unit_price, 0) AS unit_price,
    child_count * COALESCE(child_unit_price, 0) AS amount,
    usage_date,
    ticket_type,
    price_channel,
    shuttle_required,
    request_note,
    additional_fee,
    additional_fee_detail
  FROM ticket_rows_with_price
  WHERE child_count > 0

  UNION ALL

  SELECT
    reservation_id,
    30 AS line_order,
    '티켓(셔틀)'::text AS label,
    COALESCE(NULLIF(shuttle_code, ''), 'shuttle') AS code,
    COALESCE(NULLIF(shuttle_name, ''), ticket_name) AS line_ticket_name,
    COALESCE(NULLIF(ticket_name, ''), NULLIF(shuttle_name, ''), '티켓') AS display_ticket_name,
    shuttle_count AS quantity,
    COALESCE(shuttle_unit_price, 0) AS unit_price,
    shuttle_count * COALESCE(shuttle_unit_price, 0) AS amount,
    usage_date,
    ticket_type,
    price_channel,
    shuttle_required,
    request_note,
    additional_fee,
    additional_fee_detail
  FROM ticket_rows_with_price
  WHERE shuttle_required = true
    AND shuttle_count > 0
),
ticket_aggregates AS (
  SELECT
    reservation_id,
    MAX(ticket_type) AS ticket_type,
    MAX(price_channel) AS price_channel,
    BOOL_OR(shuttle_required) AS shuttle_required,
    MAX(usage_date) AS usage_date,
    MAX(request_note) AS request_note,
    MAX(additional_fee) AS additional_fee,
    MAX(additional_fee_detail) AS additional_fee_detail,
    SUM(amount) AS base_total,
    jsonb_agg(
      jsonb_build_object(
        'label', label,
        'code', code,
        'unit_price', unit_price,
        'quantity', quantity,
        'total', amount,
        'metadata', jsonb_build_object(
          'ticket_name', line_ticket_name,
          'usage_date', usage_date,
          'ticket_type', ticket_type,
          'price_channel', price_channel,
          'shuttle_required', shuttle_required
        )
      )
      ORDER BY line_order
    ) AS line_items
  FROM ticket_lines
  GROUP BY reservation_id
),
ticket_updates AS (
  SELECT
    ta.reservation_id,
    ta.base_total,
    GREATEST(-ta.base_total, COALESCE(ta.additional_fee, 0)) AS bounded_additional_fee,
    GREATEST(0, ta.base_total + GREATEST(-ta.base_total, COALESCE(ta.additional_fee, 0))) AS total_amount,
    jsonb_build_object(
      'schema', 'reservation_pricing_v1',
      'service_type', 'ticket',
      'line_items', COALESCE(ta.line_items, '[]'::jsonb),
      'base_total', ta.base_total,
      'discount_rate', 0,
      'discount_rate_amount', 0,
      'discount_manual_amount', 0,
      'discount_amount', 0,
      'discounted_subtotal', ta.base_total,
      'additional_fee', GREATEST(-ta.base_total, COALESCE(ta.additional_fee, 0)),
      'additional_fee_detail', ta.additional_fee_detail,
      'grand_total', GREATEST(0, ta.base_total + GREATEST(-ta.base_total, COALESCE(ta.additional_fee, 0))),
      'metadata', jsonb_build_object(
        'ticket_type', ta.ticket_type,
        'price_channel', ta.price_channel,
        'request_note', NULLIF(ta.request_note, ''),
        'usage_date', ta.usage_date,
        'shuttle_required', ta.shuttle_required
      ),
      'calculated_at', NOW()
    ) AS price_breakdown
  FROM ticket_aggregates ta
)
UPDATE public.reservation r
SET
  total_amount = tu.total_amount,
  price_breakdown = tu.price_breakdown,
  re_update_at = NOW()
FROM ticket_updates tu
WHERE r.re_id = tu.reservation_id
  AND (
    COALESCE(r.total_amount, 0) IS DISTINCT FROM tu.total_amount
    OR COALESCE(r.price_breakdown, '{}'::jsonb) IS DISTINCT FROM tu.price_breakdown
  );

COMMIT;

-- Verification
-- SELECT
--   r.re_id,
--   r.total_amount,
--   r.price_breakdown ->> 'service_type' AS service_type,
--   r.price_breakdown -> 'line_items' AS line_items
-- FROM public.reservation r
-- WHERE r.re_type = 'ticket'
-- ORDER BY r.re_update_at DESC NULLS LAST, r.re_created_at DESC NULLS LAST
-- LIMIT 50;
