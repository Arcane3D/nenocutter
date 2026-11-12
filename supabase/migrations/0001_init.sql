-- Nenocutter cloud library. Run this in the Supabase SQL editor.
-- Guest mode does not need this file; the app keeps working without it.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  updated_at timestamptz not null default now()
);

create table if not exists public.designs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  tags text[] not null default '{}',
  favorite boolean not null default false,
  trashed_at timestamptz,
  thumbnail_path text,
  document jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shares (
  id uuid primary key default gen_random_uuid(),
  design_id uuid not null references public.designs (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  mode text not null default 'view' check (mode in ('view', 'copy')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.designs enable row level security;
alter table public.shares enable row level security;

drop policy if exists "profiles read own" on public.profiles;
drop policy if exists "profiles insert own" on public.profiles;
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles read own" on public.profiles for select using (auth.uid() = id);
create policy "profiles insert own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles update own" on public.profiles for update using (auth.uid() = id);

drop policy if exists "designs owner all" on public.designs;
create policy "designs owner all" on public.designs
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "shares read" on public.shares;
drop policy if exists "shares owner insert" on public.shares;
drop policy if exists "shares owner delete" on public.shares;
create policy "shares read" on public.shares for select using (true);
create policy "shares owner insert" on public.shares for insert with check (auth.uid() = owner_id);
create policy "shares owner delete" on public.shares for delete using (auth.uid() = owner_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.get_shared_design(share_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'mode', s.mode,
    'title', d.title,
    'document', d.document
  )
  from public.shares s
  join public.designs d on d.id = s.design_id
  where s.id = share_id
    and d.trashed_at is null;
$$;

revoke all on function public.get_shared_design(uuid) from public;
grant execute on function public.get_shared_design(uuid) to anon, authenticated;
