-- Reiimei: Supabase setup
-- Paste this whole file into Supabase > SQL Editor > New query, then click Run.
-- It is safe to run more than once.

create table if not exists public.folders (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null default '',
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  server_updated_at timestamptz not null default now()
);

create table if not exists public.notes (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null default '',
  folder_id uuid,
  tags text[] not null default '{}',
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  server_updated_at timestamptz not null default now()
);

create index if not exists notes_user_server_updated on public.notes (user_id, server_updated_at);
create index if not exists folders_user_server_updated on public.folders (user_id, server_updated_at);

-- The server stamps every change so devices can ask "what changed since X?"
create or replace function public.reiimei_touch()
returns trigger language plpgsql as $$
begin
  new.server_updated_at := now();
  return new;
end $$;

drop trigger if exists notes_touch on public.notes;
create trigger notes_touch before insert or update on public.notes
  for each row execute function public.reiimei_touch();

drop trigger if exists folders_touch on public.folders;
create trigger folders_touch before insert or update on public.folders
  for each row execute function public.reiimei_touch();

-- Row level security: each signed-in user can only see and change their own rows.
alter table public.notes enable row level security;
alter table public.folders enable row level security;

drop policy if exists "own notes" on public.notes;
create policy "own notes" on public.notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own folders" on public.folders;
create policy "own folders" on public.folders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
