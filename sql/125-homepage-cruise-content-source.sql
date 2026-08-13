begin;

create table if not exists public.homepage_cruise_content (
  cruise_name text primary key,
  name_ko text not null,
  name_en text,
  description text,
  category text,
  star_rating numeric(2, 1) check (star_rating is null or star_rating between 0 and 5),
  hero_image text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.homepage_cruise_itineraries (
  id uuid primary key default gen_random_uuid(),
  cruise_name text not null,
  schedule_type text not null check (schedule_type in ('DAY', '1N2D', '2N3D')),
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cruise_name, schedule_type)
);

create table if not exists public.homepage_cruise_tags (
  id uuid not null default gen_random_uuid() unique,
  cruise_name text not null,
  tag text not null check (tag in ('family', 'couple', 'balcony', 'quiet', 'activity', 'value', 'luxury')),
  evidence text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (cruise_name, tag)
);

alter table public.homepage_cruise_tags
  add column if not exists id uuid not null default gen_random_uuid();

create unique index if not exists homepage_cruise_tags_id_idx
  on public.homepage_cruise_tags (id);

create table if not exists public.homepage_cruise_cabin_overrides (
  cruise_name text not null,
  room_name text not null,
  values jsonb not null default '{}'::jsonb check (jsonb_typeof(values) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (cruise_name, room_name)
);

create table if not exists public.homepage_cruise_images (
  id uuid primary key default gen_random_uuid(),
  collection text not null check (collection in ('cabin_gallery', 'cafe_import')),
  cruise_name text not null,
  room_name text,
  source_url text,
  source_image_url text,
  image_name text,
  image_url text not null,
  storage_bucket text,
  storage_path text,
  sort_order integer not null default 0 check (sort_order >= 0),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (collection, image_url)
);

create index if not exists homepage_cruise_images_lookup_idx
  on public.homepage_cruise_images (cruise_name, room_name, collection, sort_order);

create table if not exists public.homepage_catalog_product_overrides (
  service_type text not null check (service_type in ('cruise', 'hotel', 'tour', 'vehicle', 'airport')),
  source_key text not null,
  values jsonb not null default '{}'::jsonb check (jsonb_typeof(values) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (service_type, source_key)
);

create table if not exists public.homepage_catalog_price_overrides (
  source_table text not null,
  source_id text not null,
  values jsonb not null default '{}'::jsonb check (jsonb_typeof(values) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source_table, source_id)
);

alter table public.homepage_cruise_content enable row level security;
alter table public.homepage_cruise_itineraries enable row level security;
alter table public.homepage_cruise_tags enable row level security;
alter table public.homepage_cruise_cabin_overrides enable row level security;
alter table public.homepage_cruise_images enable row level security;
alter table public.homepage_catalog_product_overrides enable row level security;
alter table public.homepage_catalog_price_overrides enable row level security;

revoke all on public.homepage_cruise_content from anon, authenticated;
revoke all on public.homepage_cruise_itineraries from anon, authenticated;
revoke all on public.homepage_cruise_tags from anon, authenticated;
revoke all on public.homepage_cruise_cabin_overrides from anon, authenticated;
revoke all on public.homepage_cruise_images from anon, authenticated;
revoke all on public.homepage_catalog_product_overrides from anon, authenticated;
revoke all on public.homepage_catalog_price_overrides from anon, authenticated;

commit;
