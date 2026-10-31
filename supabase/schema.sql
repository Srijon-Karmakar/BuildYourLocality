-- Run this once in the Supabase SQL editor (Dashboard > SQL Editor).
-- One world per user for now (unique owner_id). Chunk data is stored as a
-- gzip+base64 string and objects as JSON; move chunks to Supabase Storage if
-- worlds outgrow a row (see project-details.md section 8).

create table if not exists public.worlds (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null unique references auth.users (id) on delete cascade,
  name        text not null default 'My World',
  chunks      jsonb not null default '{}'::jsonb,   -- { "cx,cy,cz": "<gzip+base64>" }
  objects     jsonb not null default '[]'::jsonb,   -- PlacedObject[]
  is_public   boolean not null default false,        -- lets other players visit (roam mode)
  updated_at  timestamptz not null default now()
);

alter table public.worlds enable row level security;

create policy "owner can read own world"
  on public.worlds for select
  using (auth.uid() = owner_id);

create policy "anyone signed in can read public worlds"
  on public.worlds for select
  using (is_public and auth.uid() is not null);

create policy "owner can insert own world"
  on public.worlds for insert
  with check (auth.uid() = owner_id);

create policy "owner can update own world"
  on public.worlds for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "owner can delete own world"
  on public.worlds for delete
  using (auth.uid() = owner_id);
