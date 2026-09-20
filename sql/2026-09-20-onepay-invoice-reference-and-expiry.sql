-- OnePay 송장 참조번호와 생성·만료 정보를 결제 테이블에 보관합니다.

set lock_timeout = '5s';

alter table public.reservation_payment
  add column if not exists onepay_invoice_reference text,
  add column if not exists onepay_invoice_created_at timestamptz,
  add column if not exists onepay_invoice_expires_at timestamptz,
  add column if not exists onepay_invoice_expiry_hours integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'reservation_payment_onepay_invoice_expiry_hours_check'
      and conrelid = 'public.reservation_payment'::regclass
  ) then
    alter table public.reservation_payment
      add constraint reservation_payment_onepay_invoice_expiry_hours_check
      check (onepay_invoice_expiry_hours is null or onepay_invoice_expiry_hours between 1 and 8760);
  end if;
end
$$;

update public.reservation_payment
set onepay_invoice_reference = nullif(btrim(raw_response ->> 'invoice_reference'), '')
where onepay_invoice_reference is null
  and nullif(btrim(raw_response ->> 'invoice_reference'), '') is not null;

create index if not exists idx_reservation_payment_onepay_invoice_reference
  on public.reservation_payment (onepay_invoice_reference)
  where onepay_invoice_reference is not null;

comment on column public.reservation_payment.onepay_invoice_reference is 'OnePay Invoice 포털의 송장 참조번호';
comment on column public.reservation_payment.onepay_invoice_created_at is 'OnePay 송장 생성 요청 시각';
comment on column public.reservation_payment.onepay_invoice_expires_at is 'OnePay 송장 만료 예정 시각';
comment on column public.reservation_payment.onepay_invoice_expiry_hours is '송장 생성 시 적용한 만료시간(시간)';
