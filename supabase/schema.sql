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

-- =====================================================================================
-- Community worlds and co-op building
--   * private world: only the owner, plus friends who joined with the invite code or whose
--     request the owner approved (world_members).
--   * public world: listed in Community; any signed-in player can explore it, and can build in
--     it while the owner leaves `public_build` on.
-- Everyone who may build saves through apply_world_patch(), which merges just their changes
-- on the server, so the owner does not have to be online and nobody overwrites anybody.
-- =====================================================================================

alter table public.worlds add column if not exists visibility   text    not null default 'private' check (visibility in ('private', 'public'));
alter table public.worlds add column if not exists public_build boolean not null default true;
alter table public.worlds add column if not exists owner_name   text    not null default 'Player';
alter table public.worlds add column if not exists join_code    text    not null default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
create unique index if not exists worlds_join_code_idx on public.worlds (join_code);
-- Worlds that were already marked public keep that.
update public.worlds set visibility = 'public' where is_public and visibility = 'private';

create table if not exists public.world_members (
  world_id  uuid not null references public.worlds (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  name      text not null default 'Player',
  joined_at timestamptz not null default now(),
  primary key (world_id, user_id)
);
create index if not exists world_members_user_idx on public.world_members (user_id);

create table if not exists public.world_requests (
  world_id   uuid not null references public.worlds (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null default 'Player',
  created_at timestamptz not null default now(),
  primary key (world_id, user_id)
);

alter table public.world_members  enable row level security;
alter table public.world_requests enable row level security;

-- security definer helpers avoid recursive policies between worlds and world_members.
create or replace function public.is_world_owner(w uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.worlds where id = w and owner_id = auth.uid());
$$;

create or replace function public.is_world_member(w uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.world_members where world_id = w and user_id = auth.uid());
$$;

-- Who may add and remove pieces.
create or replace function public.can_build_world(w uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.worlds
    where id = w and auth.uid() is not null and (
      owner_id = auth.uid()
      or exists (select 1 from public.world_members m where m.world_id = w and m.user_id = auth.uid())
      or (visibility = 'public' and public_build)
    )
  );
$$;

drop policy if exists "anyone signed in can read public worlds" on public.worlds;
create policy "anyone signed in can read public worlds"
  on public.worlds for select
  using (visibility = 'public' and auth.uid() is not null);

drop policy if exists "members can read the world" on public.worlds;
create policy "members can read the world"
  on public.worlds for select
  using (public.is_world_member(id));

drop policy if exists "members see their membership" on public.world_members;
create policy "members see their membership"
  on public.world_members for select
  using (user_id = auth.uid() or public.is_world_owner(world_id));

drop policy if exists "owner removes members, members leave" on public.world_members;
create policy "owner removes members, members leave"
  on public.world_members for delete
  using (user_id = auth.uid() or public.is_world_owner(world_id));

drop policy if exists "requester and owner see requests" on public.world_requests;
create policy "requester and owner see requests"
  on public.world_requests for select
  using (user_id = auth.uid() or public.is_world_owner(world_id));

drop policy if exists "requester withdraws, owner dismisses" on public.world_requests;
create policy "requester withdraws, owner dismisses"
  on public.world_requests for delete
  using (user_id = auth.uid() or public.is_world_owner(world_id));

-- Joins a private world with its invite code. Returns the world id.
create or replace function public.join_world_by_code(p_code text, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare w uuid; o uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select id, owner_id into w, o from public.worlds where join_code = upper(trim(p_code));
  if w is null then raise exception 'That code does not match any world.'; end if;
  if o <> auth.uid() then
    insert into public.world_members (world_id, user_id, name) values (w, auth.uid(), left(coalesce(nullif(trim(p_name), ''), 'Player'), 30))
      on conflict (world_id, user_id) do nothing;
    delete from public.world_requests where world_id = w and user_id = auth.uid();
  end if;
  return w;
end;
$$;

-- Asks the owner to let you in. Returns the world's name so the player can see what they asked for.
create or replace function public.request_world_join(p_world uuid, p_name text) returns text
language plpgsql security definer set search_path = public as $$
declare n text; o uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select name, owner_id into n, o from public.worlds where id = p_world;
  if n is null then raise exception 'That world does not exist.'; end if;
  if o = auth.uid() or public.is_world_member(p_world) then return n; end if;
  insert into public.world_requests (world_id, user_id, name) values (p_world, auth.uid(), left(coalesce(nullif(trim(p_name), ''), 'Player'), 30))
    on conflict (world_id, user_id) do nothing;
  return n;
end;
$$;

-- Owner approves or declines a request.
create or replace function public.resolve_world_request(p_world uuid, p_user uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare n text;
begin
  if not public.is_world_owner(p_world) then raise exception 'Only the owner can do that.'; end if;
  select name into n from public.world_requests where world_id = p_world and user_id = p_user;
  if n is null then return; end if;
  if p_approve then
    insert into public.world_members (world_id, user_id, name) values (p_world, p_user, n) on conflict (world_id, user_id) do nothing;
  end if;
  delete from public.world_requests where world_id = p_world and user_id = p_user;
end;
$$;

-- New invite code (the old one stops working; existing members stay).
create or replace function public.regenerate_join_code(p_world uuid) returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not public.is_world_owner(p_world) then raise exception 'Only the owner can do that.'; end if;
  c := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
  update public.worlds set join_code = c where id = p_world;
  return c;
end;
$$;

-- Merges one player's changes into the world: pieces to add/replace (p_pu) or remove (p_pr), and
-- terrain cells to set (p_tu) or clear (p_tr). Safe to call from several players at once.
create or replace function public.apply_world_patch(p_world uuid, p_pu jsonb, p_pr text[], p_tu jsonb, p_tr text[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  removed text[];
begin
  if not public.can_build_world(p_world) then raise exception 'You cannot build in this world.'; end if;
  perform 1 from public.worlds where id = p_world for update;
  p_pu := coalesce(p_pu, '[]'::jsonb);
  p_tu := coalesce(p_tu, '{}'::jsonb);
  removed := coalesce(p_pr, '{}'::text[]) || coalesce((select array_agg(x ->> 'id') from jsonb_array_elements(p_pu) x), '{}'::text[]);
  update public.worlds set
    objects = coalesce((select jsonb_agg(e) from jsonb_array_elements(objects) e where not ((e ->> 'id') = any (removed))), '[]'::jsonb) || p_pu,
    chunks  = jsonb_set(chunks, '{terrain}', (coalesce(chunks -> 'terrain', '{}'::jsonb) - coalesce(p_tr, '{}'::text[])) || p_tu, true),
    updated_at = now()
  where id = p_world;
end;
$$;

grant execute on function public.join_world_by_code(text, text) to authenticated;
grant execute on function public.request_world_join(uuid, text) to authenticated;
grant execute on function public.resolve_world_request(uuid, uuid, boolean) to authenticated;
grant execute on function public.regenerate_join_code(uuid) to authenticated;
grant execute on function public.apply_world_patch(uuid, jsonb, text[], jsonb, text[]) to authenticated;
