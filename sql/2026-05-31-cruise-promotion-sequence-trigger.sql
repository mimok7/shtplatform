-- cruise_promotion_usage.promotion_sequence 도입
-- 목적: 프로모션 순번을 DB에 영구 저장하고, 활성 상태(reserved/confirmed) 내에서 빈 순번을 재사용

BEGIN;

ALTER TABLE public.cruise_promotion_usage
  ADD COLUMN IF NOT EXISTS promotion_sequence INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cruise_promotion_usage_promotion_sequence_positive'
      AND conrelid = 'public.cruise_promotion_usage'::regclass
  ) THEN
    ALTER TABLE public.cruise_promotion_usage
      ADD CONSTRAINT cruise_promotion_usage_promotion_sequence_positive
      CHECK (promotion_sequence IS NULL OR promotion_sequence > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cruise_promotion_usage_promotion_sequence
  ON public.cruise_promotion_usage (promotion_id, promotion_sequence);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cruise_promotion_usage_active_sequence_unique
  ON public.cruise_promotion_usage (promotion_id, promotion_sequence)
  WHERE status IN ('reserved', 'confirmed')
    AND promotion_sequence IS NOT NULL;

CREATE OR REPLACE FUNCTION public.assign_cruise_promotion_sequence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sequence INTEGER;
BEGIN
  -- 활성 상태가 아니면 순번을 강제하지 않음
  IF NEW.status NOT IN ('reserved', 'confirmed') THEN
    RETURN NEW;
  END IF;

  IF NEW.promotion_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- 이미 유효한 순번이 있으면 유지
  IF COALESCE(NEW.promotion_sequence, 0) > 0 THEN
    RETURN NEW;
  END IF;

  -- 현재 활성 사용분에서 가장 작은 빈 번호를 할당
  WITH used_seq AS (
    SELECT u.promotion_sequence
    FROM public.cruise_promotion_usage u
    WHERE u.promotion_id = NEW.promotion_id
      AND u.status IN ('reserved', 'confirmed')
      AND u.promotion_sequence IS NOT NULL
      AND u.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ),
  candidate AS (
    SELECT gs AS seq
    FROM generate_series(
      1,
      COALESCE((SELECT MAX(promotion_sequence) FROM used_seq), 0) + 1
    ) AS gs
    LEFT JOIN used_seq us ON us.promotion_sequence = gs
    WHERE us.promotion_sequence IS NULL
    ORDER BY gs
    LIMIT 1
  )
  SELECT seq INTO v_sequence FROM candidate;

  NEW.promotion_sequence := COALESCE(v_sequence, 1);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_cruise_promotion_sequence ON public.cruise_promotion_usage;

CREATE TRIGGER trg_assign_cruise_promotion_sequence
BEFORE INSERT OR UPDATE OF promotion_id, status, promotion_sequence
ON public.cruise_promotion_usage
FOR EACH ROW
EXECUTE FUNCTION public.assign_cruise_promotion_sequence();

-- 기존 활성 데이터 백필: used_at/created_at/id 순으로 고정 순번 부여
WITH ordered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY promotion_id
      ORDER BY used_at ASC, created_at ASC, id ASC
    ) AS seq
  FROM public.cruise_promotion_usage
  WHERE status IN ('reserved', 'confirmed')
)
UPDATE public.cruise_promotion_usage u
SET promotion_sequence = o.seq,
    updated_at = NOW()
FROM ordered o
WHERE u.id = o.id
  AND COALESCE(u.promotion_sequence, 0) <> o.seq;

COMMIT;
