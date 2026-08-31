-- 홈페이지 크루즈 추천 태그를 관리자 정의 값으로 확장한다.
begin;

do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.homepage_cruise_tags'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%tag in (%';
  if constraint_name is not null then
    execute format('alter table public.homepage_cruise_tags drop constraint %I', constraint_name);
  end if;
end $$;

commit;