create table if not exists public.lifeos_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.lifeos_state enable row level security;
