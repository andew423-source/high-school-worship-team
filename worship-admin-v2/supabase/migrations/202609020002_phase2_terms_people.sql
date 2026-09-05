-- Phase 2: terms, meetings, student rosters, staff details, and import history.
-- Apply only after 202609020001_phase1_auth.sql.

create type public.term_status as enum ('DRAFT', 'ACTIVE', 'ARCHIVED');
create type public.service_department as enum ('FIRST', 'SECOND');
create type public.team_type as enum ('SINGER', 'SESSION');
create type public.preferred_service as enum ('FIRST', 'SECOND', 'BOTH');
create type public.meeting_kind as enum ('REGULAR', 'EXTRA');
create type public.import_kind as enum ('STUDENTS', 'STAFF');
create type public.import_status as enum ('COMPLETED', 'FAILED');

create table public.terms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  start_date date not null,
  end_date date not null,
  status public.term_status not null default 'DRAFT',
  late_counts_as_present boolean not null default false,
  timezone text not null default 'Asia/Seoul',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint terms_date_order check (start_date <= end_date),
  constraint terms_timezone_check check (timezone = 'Asia/Seoul')
);

create unique index terms_single_active_idx on public.terms ((status)) where status = 'ACTIVE';
create index terms_dates_idx on public.terms(start_date desc, end_date desc);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  internal_code text,
  name text not null check (length(trim(name)) > 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint students_internal_code_trimmed check (internal_code is null or internal_code = trim(internal_code))
);

create unique index students_internal_code_unique
  on public.students(internal_code) where internal_code is not null;
create index students_name_idx on public.students(name);

create table public.term_students (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references public.terms(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  grade smallint not null check (grade between 1 and 3),
  gender public.gender_type not null,
  service_department public.service_department not null,
  team public.team_type not null,
  is_student_leader boolean not null default false,
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(term_id, student_id)
);

create index term_students_term_active_idx on public.term_students(term_id, active);
create index term_students_term_department_idx on public.term_students(term_id, service_department, team);

alter table public.staff
  add column role_title text,
  add column singer_capable boolean not null default true,
  add column group_leader_capable boolean not null default false,
  add column preferred_service public.preferred_service not null default 'BOTH',
  add column note text;

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references public.terms(id) on delete cascade,
  sequence integer not null check (sequence > 0),
  meeting_date date not null,
  title text not null default '찬양팀 모임' check (length(trim(title)) > 0),
  kind public.meeting_kind not null default 'REGULAR',
  is_cancelled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(term_id, meeting_date),
  unique(term_id, sequence)
);

create index meetings_term_date_idx on public.meetings(term_id, meeting_date);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  term_id uuid references public.terms(id) on delete set null,
  kind public.import_kind not null,
  file_name text not null check (length(trim(file_name)) > 0),
  object_path text not null unique,
  status public.import_status not null,
  row_count integer not null default 0 check (row_count >= 0),
  mapping jsonb not null default '{}'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index import_batches_term_created_idx on public.import_batches(term_id, created_at desc);

create trigger terms_touch_updated_at before update on public.terms
for each row execute function public.touch_updated_at();
create trigger students_touch_updated_at before update on public.students
for each row execute function public.touch_updated_at();
create trigger term_students_touch_updated_at before update on public.term_students
for each row execute function public.touch_updated_at();
create trigger meetings_touch_updated_at before update on public.meetings
for each row execute function public.touch_updated_at();

alter table public.terms enable row level security;
alter table public.students enable row level security;
alter table public.term_students enable row level security;
alter table public.meetings enable row level security;
alter table public.import_batches enable row level security;

grant select, insert, update, delete on public.terms to authenticated;
grant select, insert, update, delete on public.students to authenticated;
grant select, insert, update, delete on public.term_students to authenticated;
grant select, insert, update, delete on public.meetings to authenticated;
grant select, insert on public.import_batches to authenticated;
grant insert, update on public.staff to authenticated;

create policy "admins manage terms" on public.terms
for all to authenticated using (public.is_active_admin()) with check (public.is_active_admin());
create policy "active group staff read active term" on public.terms
for select to authenticated using (status = 'ACTIVE' and public.is_active_group_staff());

create policy "admins manage students" on public.students
for all to authenticated using (public.is_active_admin()) with check (public.is_active_admin());
create policy "active group staff read active students" on public.students
for select to authenticated using (
  public.is_active_group_staff() and exists (
    select 1 from public.term_students ts
    join public.terms t on t.id = ts.term_id
    where ts.student_id = students.id and ts.active and t.status = 'ACTIVE'
  )
);

create policy "admins manage term students" on public.term_students
for all to authenticated using (public.is_active_admin()) with check (public.is_active_admin());
create policy "active group staff read active roster" on public.term_students
for select to authenticated using (
  public.is_active_group_staff() and exists (
    select 1 from public.terms t where t.id = term_students.term_id and t.status = 'ACTIVE'
  )
);

create policy "admins manage meetings" on public.meetings
for all to authenticated using (public.is_active_admin()) with check (public.is_active_admin());
create policy "active group staff read active meetings" on public.meetings
for select to authenticated using (
  public.is_active_group_staff() and exists (
    select 1 from public.terms t where t.id = meetings.term_id and t.status = 'ACTIVE'
  )
);

create policy "admins manage import batches" on public.import_batches
for all to authenticated using (public.is_active_admin()) with check (public.is_active_admin());

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'imports',
  'imports',
  false,
  10485760,
  array[
    'text/csv',
    'application/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "admins manage import files" on storage.objects
for all to authenticated
using (bucket_id = 'imports' and public.is_active_admin())
with check (bucket_id = 'imports' and public.is_active_admin());

create or replace function public.create_term_with_meetings(
  p_name text,
  p_start_date date,
  p_end_date date,
  p_status public.term_status,
  p_late_counts_as_present boolean
)
returns public.terms
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_term public.terms%rowtype;
begin
  if not public.is_active_admin() then raise exception 'forbidden'; end if;
  if p_start_date > p_end_date then raise exception 'invalid_date_range'; end if;

  if p_status = 'ACTIVE' then
    update public.terms set status = 'ARCHIVED' where status = 'ACTIVE';
  end if;

  insert into public.terms(name, start_date, end_date, status, late_counts_as_present, created_by)
  values (trim(p_name), p_start_date, p_end_date, p_status, p_late_counts_as_present, auth.uid())
  returning * into created_term;

  insert into public.meetings(term_id, sequence, meeting_date, title, kind)
  select
    created_term.id,
    row_number() over (order by meeting_day)::integer,
    meeting_day::date,
    '찬양팀 모임',
    'REGULAR'::public.meeting_kind
  from generate_series(p_start_date::timestamp, p_end_date::timestamp, interval '1 day') meeting_day
  where extract(isodow from meeting_day) = 6;

  insert into public.audit_events(actor_user_id, action, entity_type, entity_id, after_json)
  values (
    auth.uid(),
    'TERM_CREATED',
    'term',
    created_term.id,
    jsonb_build_object(
      'name', created_term.name,
      'start_date', created_term.start_date,
      'end_date', created_term.end_date,
      'status', created_term.status
    )
  );

  return created_term;
end;
$$;

revoke all on function public.create_term_with_meetings(text, date, date, public.term_status, boolean) from public;
grant execute on function public.create_term_with_meetings(text, date, date, public.term_status, boolean) to authenticated;

create or replace function public.set_term_status(p_term_id uuid, p_status public.term_status)
returns public.terms
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_term public.terms%rowtype;
  changed_term public.terms%rowtype;
begin
  if not public.is_active_admin() then raise exception 'forbidden'; end if;
  select * into previous_term from public.terms where id = p_term_id for update;
  if not found then raise exception 'term_not_found'; end if;

  if p_status = 'ACTIVE' then
    update public.terms set status = 'ARCHIVED' where status = 'ACTIVE' and id <> p_term_id;
  end if;
  update public.terms set status = p_status where id = p_term_id returning * into changed_term;

  insert into public.audit_events(actor_user_id, action, entity_type, entity_id, before_json, after_json)
  values (
    auth.uid(), 'TERM_STATUS_CHANGED', 'term', p_term_id,
    jsonb_build_object('status', previous_term.status),
    jsonb_build_object('status', changed_term.status)
  );
  return changed_term;
end;
$$;

revoke all on function public.set_term_status(uuid, public.term_status) from public;
grant execute on function public.set_term_status(uuid, public.term_status) to authenticated;

create or replace function public.import_term_students(p_term_id uuid, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  target_student_id uuid;
  imported_count integer := 0;
  normalized_code text;
begin
  if not public.is_active_admin() then raise exception 'forbidden'; end if;
  if not exists(select 1 from public.terms t where t.id = p_term_id) then raise exception 'term_not_found'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'rows_must_be_array'; end if;

  for item in select value from jsonb_array_elements(p_rows)
  loop
    normalized_code := nullif(trim(item ->> 'internalCode'), '');
    target_student_id := null;

    if normalized_code is not null then
      select s.id into target_student_id from public.students s
      where s.internal_code = normalized_code;
    end if;

    if target_student_id is null then
      insert into public.students(internal_code, name, note)
      values (normalized_code, trim(item ->> 'name'), nullif(trim(item ->> 'note'), ''))
      returning id into target_student_id;
    else
      update public.students set
        name = trim(item ->> 'name'),
        note = coalesce(nullif(trim(item ->> 'note'), ''), note)
      where id = target_student_id;
    end if;

    insert into public.term_students(
      term_id, student_id, grade, gender, service_department, team,
      is_student_leader, active, note
    ) values (
      p_term_id,
      target_student_id,
      (item ->> 'grade')::smallint,
      (item ->> 'gender')::public.gender_type,
      (item ->> 'serviceDepartment')::public.service_department,
      (item ->> 'team')::public.team_type,
      coalesce((item ->> 'isStudentLeader')::boolean, false),
      coalesce((item ->> 'active')::boolean, true),
      nullif(trim(item ->> 'termNote'), '')
    );

    imported_count := imported_count + 1;
  end loop;

  insert into public.audit_events(actor_user_id, action, entity_type, entity_id, after_json)
  values (auth.uid(), 'STUDENTS_IMPORTED', 'term', p_term_id, jsonb_build_object('row_count', imported_count));

  return imported_count;
end;
$$;

revoke all on function public.import_term_students(uuid, jsonb) from public;
grant execute on function public.import_term_students(uuid, jsonb) to authenticated;

create or replace function public.import_staff(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  imported_count integer := 0;
begin
  if not public.is_active_admin() then raise exception 'forbidden'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'rows_must_be_array'; end if;

  for item in select value from jsonb_array_elements(p_rows)
  loop
    insert into public.staff(
      name, email, gender, duty, role_title, singer_capable,
      group_leader_capable, preferred_service, note, active
    ) values (
      trim(item ->> 'name'),
      nullif(lower(trim(item ->> 'email')), ''),
      (item ->> 'gender')::public.gender_type,
      nullif(trim(item ->> 'roleTitle'), ''),
      nullif(trim(item ->> 'roleTitle'), ''),
      coalesce((item ->> 'singerCapable')::boolean, true),
      coalesce((item ->> 'groupLeaderCapable')::boolean, false),
      (item ->> 'preferredService')::public.preferred_service,
      nullif(trim(item ->> 'note'), ''),
      coalesce((item ->> 'active')::boolean, true)
    );
    imported_count := imported_count + 1;
  end loop;

  insert into public.audit_events(actor_user_id, action, entity_type, after_json)
  values (auth.uid(), 'STAFF_IMPORTED', 'staff', jsonb_build_object('row_count', imported_count));

  return imported_count;
end;
$$;

revoke all on function public.import_staff(jsonb) from public;
grant execute on function public.import_staff(jsonb) to authenticated;
