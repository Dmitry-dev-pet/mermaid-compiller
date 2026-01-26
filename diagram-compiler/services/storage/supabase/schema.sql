-- Supabase schema for cloud storage (projects + share links)
-- MVP: single blob per project, optimistic concurrency via version

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  title text,
  blob bytea not null,
  version bigint not null default 0,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists projects_owner_id_idx on public.projects (owner_id);
create index if not exists projects_updated_at_idx on public.projects (updated_at desc);

alter table public.projects enable row level security;

create policy "projects owner read"
  on public.projects for select
  using (auth.uid() = owner_id);

create policy "projects owner insert"
  on public.projects for insert
  with check (auth.uid() = owner_id);

create policy "projects owner update"
  on public.projects for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "projects owner delete"
  on public.projects for delete
  using (auth.uid() = owner_id);

create table if not exists public.share_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  permission text not null check (permission in ('viewer', 'editor')),
  token_hash text not null unique,
  wrapped_project_key text,
  expires_at timestamptz,
  disabled boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid
);

create index if not exists share_links_project_id_idx on public.share_links (project_id);

alter table public.share_links enable row level security;

create policy "share_links owner read"
  on public.share_links for select
  using (
    auth.uid() = created_by or
    auth.uid() = (select owner_id from public.projects where id = share_links.project_id)
  );

create policy "share_links owner insert"
  on public.share_links for insert
  with check (
    auth.uid() = created_by and
    auth.uid() = (select owner_id from public.projects where id = share_links.project_id)
  );

create policy "share_links owner delete"
  on public.share_links for delete
  using (
    auth.uid() = created_by or
    auth.uid() = (select owner_id from public.projects where id = share_links.project_id)
  );
