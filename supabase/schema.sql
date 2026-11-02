-- Run this in the Supabase SQL editor (Dashboard > SQL Editor). It is safe to run again.
-- Each player can keep several worlds: 2 for free, plus one more for every extra slot they
-- unlock (bought with tokens earned from rewarded ads, see src/lib/rewards.ts). Chunk data is stored as a
-- gzip+base64 string and objects as JSON; move chunks to Supabase Storage if worlds outgrow a
-- row (see project-details.md section 8).

create table if not exists public.worlds (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  name        text not null default 'My World',
  chunks      jsonb not null default '{}'::jsonb,   -- { "terrain": { "x,z": { h, cover } } }
  objects     jsonb not null default '[]'::jsonb,   -- Piece[]
  is_public   boolean not null default false,        -- lets other players visit (roam mode)
  updated_at  timestamptz not null default now()
);

-- Upgrading from the single-world version: one row per owner is no longer required.
alter table public.worlds drop constraint if exists worlds_owner_id_key;
create index if not exists worlds_owner_idx on public.worlds (owner_id, updated_at desc);

alter table public.worlds enable row level security;

drop policy if exists "owner can read own world" on public.worlds;
create policy "owner can read own world"
  on public.worlds for select
  using (auth.uid() = owner_id);

drop policy if exists "anyone signed in can read public worlds" on public.worlds;
create policy "anyone signed in can read public worlds"
  on public.worlds for select
  using (is_public and auth.uid() is not null);

drop policy if exists "owner can insert own world" on public.worlds;
create policy "owner can insert own world"
  on public.worlds for insert
  with check (auth.uid() = owner_id);

drop policy if exists "owner can update own world" on public.worlds;
create policy "owner can update own world"
  on public.worlds for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "owner can delete own world" on public.worlds;
create policy "owner can delete own world"
  on public.worlds for delete
  using (auth.uid() = owner_id);

-- Extra world slots a player has unlocked on top of the 2 free ones.
create table if not exists public.player_limits (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  extra_worlds integer not null default 0 check (extra_worlds between 0 and 100)
);

alter table public.player_limits enable row level security;

drop policy if exists "owner can read own limits" on public.player_limits;
create policy "owner can read own limits"
  on public.player_limits for select
  using (auth.uid() = user_id);

-- NOTE: players write their own row, so unlocks are trusted to the client. To make them
-- tamper-proof, drop these two policies and write extra_worlds from a server-side
-- (service role) function that your ad network calls after a verified reward callback.
drop policy if exists "owner can insert own limits" on public.player_limits;
create policy "owner can insert own limits"
  on public.player_limits for insert
  with check (auth.uid() = user_id);

drop policy if exists "owner can update own limits" on public.player_limits;
create policy "owner can update own limits"
  on public.player_limits for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Refuses a new world once the player is at their limit (2 + unlocked slots).
create or replace function public.enforce_world_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  allowed integer;
  owned   integer;
begin
  -- An upsert of an existing world also fires this trigger; saving a world is not creating one.
  if exists (select 1 from public.worlds where id = new.id) then
    return new;
  end if;
  select 2 + coalesce((select extra_worlds from public.player_limits where user_id = new.owner_id), 0) into allowed;
  select count(*) into owned from public.worlds where owner_id = new.owner_id;
  if owned >= allowed then
    raise exception 'World limit reached (% worlds). Unlock another slot first.', allowed using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists worlds_limit on public.worlds;
create trigger worlds_limit before insert on public.worlds
  for each row execute function public.enforce_world_limit();

-- Tokens earned from rewarded ads, and the one-off unlocks bought with them (see src/lib/rewards.ts).
alter table public.player_limits add column if not exists tokens integer not null default 0 check (tokens >= 0);
alter table public.player_limits add column if not exists unlocks text[] not null default '{}';
