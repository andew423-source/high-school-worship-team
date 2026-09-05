-- Phase 1: Google authentication, role routing, and staff approval.
-- Apply through Supabase migrations only. Never execute schema DDL in a request handler.

create extension if not exists pgcrypto;

create type public.app_role as enum ('ADMIN', 'GROUP_STAFF');
create type public.profile_status as enum ('PENDING', 'ACTIVE', 'DISABLED');
create type public.access_request_status as enum ('PENDING', 'APPROVED', 'DISABLED');
create type public.gender_type as enum ('UNSPECIFIED', 'FEMALE', 'MALE');

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  email text,
  gender public.gender_type not null default 'UNSPECIFIED',
  duty text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_email_normalized check (email is null or email = lower(trim(email)))
);

create unique index staff_email_unique on public.staff(email) where email is not null;
create index staff_active_name_idx on public.staff(active, name);

create table public.admin_allowlist (
  email text primary key check (email = lower(trim(email))),
  created_at timestamptz not null default now()
);

insert into public.admin_allowlist(email) values
  ('andew423@gmail.com'),
  ('bundangwoorihighpraise@gmail.com')
on conflict do nothing;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique check (email = lower(trim(email))),
  display_name text,
  role public.app_role not null default 'GROUP_STAFF',
  status public.profile_status not null default 'PENDING',
  staff_id uuid unique references public.staff(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint active_group_staff_has_staff check (
    not (role = 'GROUP_STAFF' and status = 'ACTIVE') or staff_id is not null
  )
);

create index profiles_role_status_idx on public.profiles(role, status);

create table public.access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  status public.access_request_status not null default 'PENDING',
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index access_requests_status_requested_idx
  on public.access_requests(status, requested_at);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz not null default now()
);

create index audit_events_entity_idx on public.audit_events(entity_type, entity_id, created_at desc);
create index audit_events_actor_idx on public.audit_events(actor_user_id, created_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger staff_touch_updated_at before update on public.staff
for each row execute function public.touch_updated_at();
create trigger profiles_touch_updated_at before update on public.profiles
for each row execute function public.touch_updated_at();
create trigger access_requests_touch_updated_at before update on public.access_requests
for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(trim(coalesce(new.email, '')));
  is_admin boolean;
begin
  if normalized_email = '' then
    raise exception 'A verified email is required';
  end if;

  select exists(
    select 1 from public.admin_allowlist a where a.email = normalized_email
  ) into is_admin;

  insert into public.profiles(id, email, display_name, role, status)
  values (
    new.id,
    normalized_email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    case when is_admin then 'ADMIN'::public.app_role else 'GROUP_STAFF'::public.app_role end,
    case when is_admin then 'ACTIVE'::public.profile_status else 'PENDING'::public.profile_status end
  )
  on conflict (id) do update set
    email = excluded.email,
    display_name = coalesce(excluded.display_name, public.profiles.display_name);

  if not is_admin then
    insert into public.access_requests(user_id, status)
    values (new.id, 'PENDING')
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Bring accounts created before this migration into the same role model.
insert into public.profiles(id, email, display_name, role, status)
select
  u.id,
  lower(trim(u.email)),
  coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
  case when a.email is not null then 'ADMIN'::public.app_role else 'GROUP_STAFF'::public.app_role end,
  case when a.email is not null then 'ACTIVE'::public.profile_status else 'PENDING'::public.profile_status end
from auth.users u
left join public.admin_allowlist a on a.email = lower(trim(u.email))
where u.email is not null
on conflict (id) do nothing;

insert into public.access_requests(user_id)
select p.id from public.profiles p
where p.role = 'GROUP_STAFF' and p.status = 'PENDING'
on conflict (user_id) do nothing;

create or replace function public.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'ADMIN' and p.status = 'ACTIVE'
  );
$$;

create or replace function public.is_active_group_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'GROUP_STAFF' and p.status = 'ACTIVE'
  );
$$;

alter table public.staff enable row level security;
alter table public.admin_allowlist enable row level security;
alter table public.profiles enable row level security;
alter table public.access_requests enable row level security;
alter table public.audit_events enable row level security;

-- "Automatically expose new tables" is intentionally disabled in Supabase.
-- Grant only the operations Phase 1 needs; RLS policies below further narrow rows.
grant usage on schema public to authenticated;
grant select on public.staff to authenticated;
grant select on public.profiles to authenticated;
grant select on public.access_requests to authenticated;
grant select on public.admin_allowlist to authenticated;
grant select on public.audit_events to authenticated;

create policy "admins manage staff" on public.staff
for all to authenticated using (public.is_active_admin()) with check (public.is_active_admin());
create policy "staff read their own record" on public.staff
for select to authenticated using (
  exists(select 1 from public.profiles p where p.id = auth.uid() and p.staff_id = staff.id and p.status = 'ACTIVE')
);

create policy "admins manage allowlist" on public.admin_allowlist
for all to authenticated using (public.is_active_admin()) with check (public.is_active_admin());

create policy "users read own profile" on public.profiles
for select to authenticated using (id = auth.uid());
create policy "admins read profiles" on public.profiles
for select to authenticated using (public.is_active_admin());

create policy "users read own request" on public.access_requests
for select to authenticated using (user_id = auth.uid());
create policy "admins read requests" on public.access_requests
for select to authenticated using (public.is_active_admin());

create policy "admins read audit events" on public.audit_events
for select to authenticated using (public.is_active_admin());

create or replace function public.review_access_request(
  request_id uuid,
  staff_id uuid,
  decision text,
  expected_updated_at timestamptz
)
returns table (
  user_id uuid,
  request_status public.access_request_status,
  profile_status public.profile_status,
  linked_staff_id uuid,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_request public.access_requests%rowtype;
  previous_profile public.profiles%rowtype;
  next_request_status public.access_request_status;
  next_profile_status public.profile_status;
begin
  if not public.is_active_admin() then raise exception 'forbidden'; end if;
  if decision not in ('APPROVED', 'DISABLED') then raise exception 'invalid_decision'; end if;

  select * into current_request from public.access_requests r
  where r.id = request_id for update;
  if not found then raise exception 'request_not_found'; end if;
  if current_request.updated_at <> expected_updated_at then raise exception 'revision_conflict'; end if;

  select * into previous_profile from public.profiles p
  where p.id = current_request.user_id for update;

  if decision = 'APPROVED' then
    if staff_id is null or not exists(select 1 from public.staff s where s.id = staff_id and s.active) then
      raise exception 'active_staff_required';
    end if;
    if exists(select 1 from public.profiles p where p.staff_id = review_access_request.staff_id and p.id <> current_request.user_id and p.status = 'ACTIVE') then
      raise exception 'staff_already_linked';
    end if;
    next_request_status := 'APPROVED';
    next_profile_status := 'ACTIVE';
  else
    next_request_status := 'DISABLED';
    next_profile_status := 'DISABLED';
  end if;

  update public.profiles p set
    status = next_profile_status,
    role = 'GROUP_STAFF',
    staff_id = case when decision = 'APPROVED' then review_access_request.staff_id else null end
  where p.id = current_request.user_id;

  update public.access_requests r set
    status = next_request_status,
    reviewed_at = now(),
    reviewed_by = auth.uid()
  where r.id = current_request.id
  returning r.* into current_request;

  insert into public.audit_events(actor_user_id, action, entity_type, entity_id, before_json, after_json)
  values (
    auth.uid(),
    case when decision = 'APPROVED' then 'ACCESS_APPROVED' else 'ACCESS_DISABLED' end,
    'access_request',
    current_request.id,
    jsonb_build_object('profile_status', previous_profile.status, 'staff_id', previous_profile.staff_id),
    jsonb_build_object('request_status', next_request_status, 'profile_status', next_profile_status, 'staff_id', case when decision = 'APPROVED' then staff_id else null end)
  );

  return query
  select current_request.user_id, current_request.status, p.status, p.staff_id, current_request.updated_at
  from public.profiles p where p.id = current_request.user_id;
end;
$$;

revoke all on function public.review_access_request(uuid, uuid, text, timestamptz) from public;
grant execute on function public.review_access_request(uuid, uuid, text, timestamptz) to authenticated;
