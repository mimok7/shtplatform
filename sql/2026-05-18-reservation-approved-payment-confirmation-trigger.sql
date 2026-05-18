-- 예약 상태 변경 시 결제/예약확인서 상태 자동 동기화
-- 목적:
-- 1) reservation.re_status 가 pending/approved/confirmed/completed/cancelled 로 변경되면
--    reservation_payment.payment_status 를 정책에 맞게 자동 반영
--    - pending -> pending
--    - approved/confirmed/completed -> completed
--    - cancelled -> cancelled
-- 2) 결제 레코드가 없으면 즉시 생성(대기 예약도 pending 생성)
-- 3) 결제완료 시 확인서 대기 상태(confirmation_status = waiting) 자동 보장

CREATE OR REPLACE FUNCTION public.fn_sync_payment_and_confirmation_on_reservation_approved()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_target_payment_status text;
BEGIN
  -- UPDATE인데 상태가 바뀌지 않았으면 스킵
  IF TG_OP = 'UPDATE' AND OLD.re_status IS NOT DISTINCT FROM NEW.re_status THEN
    RETURN NEW;
  END IF;

  -- 예약 상태 -> 결제 상태 매핑
  v_target_payment_status := CASE
    WHEN NEW.re_status = 'pending' THEN 'pending'
    WHEN NEW.re_status IN ('approved', 'confirmed', 'completed') THEN 'completed'
    WHEN NEW.re_status = 'cancelled' THEN 'cancelled'
    ELSE NULL
  END;

  IF v_target_payment_status IS NULL THEN
    RETURN NEW;
  END IF;

  -- 1) 기존 결제 레코드가 있으면 목표 상태로 동기화
  UPDATE public.reservation_payment
  SET payment_status = v_target_payment_status,
      updated_at = now()
  WHERE reservation_id = NEW.re_id
    AND COALESCE(payment_status, 'pending') IS DISTINCT FROM v_target_payment_status;

  -- 2) 결제 레코드가 없으면 목표 상태로 생성
  IF NOT EXISTS (
    SELECT 1
    FROM public.reservation_payment rp
    WHERE rp.reservation_id = NEW.re_id
  ) THEN
    INSERT INTO public.reservation_payment (
      reservation_id,
      quote_id,
      user_id,
      amount,
      payment_method,
      payment_status,
      memo,
      created_at,
      updated_at
    ) VALUES (
      NEW.re_id,
      NEW.re_quote_id,
      NEW.re_user_id,
      COALESCE(NEW.total_amount, 0),
      'BANK',
      v_target_payment_status,
      'AUTO: reservation status sync -> payment status',
      now(),
      now()
    );
  END IF;

  -- 3) 결제 완료 계열 상태인 경우 confirmation_status 대기 상태 보장
  -- sent 상태는 보존하고, 그 외에는 waiting 으로 맞춘다.
  IF v_target_payment_status = 'completed'
     AND to_regclass('public.confirmation_status') IS NOT NULL THEN
    INSERT INTO public.confirmation_status (
      reservation_id,
      quote_id,
      status,
      created_at,
      updated_at
    ) VALUES (
      NEW.re_id,
      NEW.re_quote_id,
      'waiting',
      now(),
      now()
    )
    ON CONFLICT (reservation_id)
    DO UPDATE
      SET quote_id = COALESCE(EXCLUDED.quote_id, confirmation_status.quote_id),
          status = CASE
            WHEN confirmation_status.status = 'sent' THEN confirmation_status.status
            ELSE 'waiting'
          END,
          updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_payment_confirmation_on_reservation_approved ON public.reservation;

CREATE TRIGGER trg_sync_payment_confirmation_on_reservation_approved
AFTER INSERT OR UPDATE OF re_status ON public.reservation
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_payment_and_confirmation_on_reservation_approved();

-- 검증 쿼리
-- 1) 트리거 확인
-- SELECT tgname FROM pg_trigger WHERE tgname = 'trg_sync_payment_confirmation_on_reservation_approved';
--
-- 2) 승인 테스트
-- UPDATE public.reservation SET re_status = 'approved' WHERE re_id = 'YOUR_RESERVATION_ID';
--
-- 3) 결제상태 확인
-- SELECT reservation_id, payment_status, updated_at
-- FROM public.reservation_payment
-- WHERE reservation_id = 'YOUR_RESERVATION_ID';
--
-- 4) 확인서 대기 상태 확인
-- SELECT reservation_id, status, updated_at
-- FROM public.confirmation_status
-- WHERE reservation_id = 'YOUR_RESERVATION_ID';
