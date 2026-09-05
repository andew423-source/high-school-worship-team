-- Phase 5: Sunday availability, versioned stage plans, and stage layout snapshots.
-- Apply only after 202609040004_attendance.sql.

create type public.staff_stage_role as enum ('SINGER', 'SESSION');
create type public.stage_version_kind as enum ('AUTO_DRAFT', 'MANUAL_DRAFT', 'CONFIRMED');
create type public.stage_person_type as enum ('STUDENT', 'STAFF');
create type public.stage_role as enum ('SINGER', 'CHOIR');
create type public.stage_side as enum ('LEFT', 'RIGHT');
create type public.stage_override_kind as enum ('MOVE_DEPARTMENT', 'FORCE_STAGE');
create type public.stage_override_role as enum ('SINGER', 'CHOIR', 'RANDOM');

alter table public.staff
  add column default_stage_role public.staff_stage_role not null default 'SINGER',
  add column exclude_from_auto_singer boolean not null default false,
  add column is_default_stage_leader boolean not null default false;

update public.staff set default_stage_role = 'SESSION'
where regexp_replace(name, '\s', '', 'g') = '이소정';
update public.staff set exclude_from_auto_singer = true, is_default_stage_leader = true
where regexp_replace(name, '\s', '', 'g') = '황현민';
create unique index staff_one_default_stage_leader_idx on public.staff(is_default_stage_leader)
where is_default_stage_leader;

-- Phase 2의 스탭 가져오기 함수에 새 등단 기본값을 연결한다. 이후 등록되는
-- 이소정/황현민 스탭도 과거 데이터 보정과 같은 기본값을 갖는다.
create or replace function public.import_staff(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  imported_count integer := 0;
  normalized_name text;
  next_default_leader boolean;
begin
  if not public.is_active_admin() then raise exception 'forbidden'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'rows_must_be_array'; end if;

  for item in select value from jsonb_array_elements(p_rows)
  loop
    normalized_name := regexp_replace(trim(item ->> 'name'), '\s', '', 'g');
    next_default_leader := coalesce(
      (item ->> 'isDefaultStageLeader')::boolean,
      normalized_name = '황현민'
    );

    if next_default_leader then
      update public.staff set is_default_stage_leader = false
      where is_default_stage_leader;
    end if;

    insert into public.staff(
      name, email, gender, duty, role_title, singer_capable,
      group_leader_capable, preferred_service, default_stage_role,
      exclude_from_auto_singer, is_default_stage_leader, note, active
    ) values (
      trim(item ->> 'name'),
      nullif(lower(trim(item ->> 'email')), ''),
      (item ->> 'gender')::public.gender_type,
      nullif(trim(item ->> 'roleTitle'), ''),
      nullif(trim(item ->> 'roleTitle'), ''),
      coalesce((item ->> 'singerCapable')::boolean, normalized_name <> '이소정'),
      coalesce((item ->> 'groupLeaderCapable')::boolean, false),
      (item ->> 'preferredService')::public.preferred_service,
      coalesce(
        nullif(item ->> 'defaultStageRole', '')::public.staff_stage_role,
        case when normalized_name = '이소정' then 'SESSION'::public.staff_stage_role else 'SINGER'::public.staff_stage_role end
      ),
      coalesce((item ->> 'excludeFromAutoSinger')::boolean, normalized_name = '황현민'),
      next_default_leader,
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

create policy "active group staff read active team staff" on public.staff
for select to authenticated using (active and public.is_active_group_staff());

create table public.stage_plans (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references public.terms(id) on delete cascade,
  meeting_id uuid not null unique references public.meetings(id) on delete cascade,
  sunday_date date not null,
  created_at timestamptz not null default now(),
  unique(term_id, sunday_date)
);

create table public.stage_staff_availability (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.stage_plans(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  present boolean not null default false,
  stage_role public.staff_stage_role not null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(plan_id, staff_id)
);

create table public.stage_versions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.stage_plans(id) on delete cascade,
  version_no integer not null check (version_no > 0),
  kind public.stage_version_kind not null,
  leader_type public.stage_person_type not null,
  leader_term_student_id uuid references public.term_students(id) on delete restrict,
  leader_staff_id uuid references public.staff(id) on delete restrict,
  config_snapshot jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  ignored_warnings jsonb not null default '[]'::jsonb,
  source_version_id uuid references public.stage_versions(id) on delete set null,
  revision integer not null default 1,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  confirmed_by uuid references public.profiles(id) on delete set null,
  confirmed_at timestamptz,
  unique(plan_id, version_no),
  constraint stage_leader_shape check (
    (leader_type = 'STUDENT' and leader_term_student_id is not null and leader_staff_id is null)
    or (leader_type = 'STAFF' and leader_staff_id is not null and leader_term_student_id is null)
  ),
  constraint stage_confirmation_shape check (
    (kind = 'CONFIRMED' and confirmed_at is not null)
    or (kind <> 'CONFIRMED' and confirmed_at is null)
  )
);

create table public.stage_services (
  id uuid primary key,
  version_id uuid not null references public.stage_versions(id) on delete cascade,
  department public.service_department not null,
  singer_target integer not null check (singer_target >= 0),
  choir_target integer not null check (choir_target >= 0),
  unique(version_id, department)
);

create table public.stage_candidates (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.stage_versions(id) on delete cascade,
  person_type public.stage_person_type not null,
  term_student_id uuid references public.term_students(id) on delete cascade,
  staff_id uuid references public.staff(id) on delete cascade,
  department public.service_department,
  eligible boolean not null,
  reason text not null,
  constraint stage_candidate_person_shape check (
    (person_type = 'STUDENT' and term_student_id is not null and staff_id is null)
    or (person_type = 'STAFF' and staff_id is not null and term_student_id is null)
  )
);

create table public.stage_overrides (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.stage_versions(id) on delete cascade,
  term_student_id uuid not null references public.term_students(id) on delete cascade,
  kind public.stage_override_kind not null,
  department public.service_department not null,
  role public.stage_override_role,
  constraint stage_override_shape check (
    (kind = 'MOVE_DEPARTMENT' and role is null)
    or (kind = 'FORCE_STAGE' and role is not null)
  )
);

create table public.stage_assignments (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.stage_services(id) on delete cascade,
  person_type public.stage_person_type not null,
  term_student_id uuid references public.term_students(id) on delete restrict,
  staff_id uuid references public.staff(id) on delete restrict,
  role public.stage_role not null,
  side public.stage_side not null,
  position_order integer not null check (position_order >= 0),
  reason text not null,
  is_manual boolean not null default false,
  constraint stage_assignment_person_shape check (
    (person_type = 'STUDENT' and term_student_id is not null and staff_id is null)
    or (person_type = 'STAFF' and staff_id is not null and term_student_id is null)
  ),
  unique(service_id, person_type, term_student_id),
  unique(service_id, person_type, staff_id),
  unique(service_id, role, side, position_order)
);

create index stage_plans_term_date_idx on public.stage_plans(term_id, sunday_date);
create index stage_availability_plan_idx on public.stage_staff_availability(plan_id, present, stage_role);
create index stage_versions_plan_kind_idx on public.stage_versions(plan_id, kind, version_no desc);
create index stage_services_version_idx on public.stage_services(version_id, department);
create index stage_candidates_version_idx on public.stage_candidates(version_id, eligible, department);
create index stage_assignments_history_student_idx on public.stage_assignments(term_student_id, role);
create index stage_assignments_history_staff_idx on public.stage_assignments(staff_id, role);

create trigger stage_availability_touch_updated_at before update on public.stage_staff_availability
for each row execute function public.touch_updated_at();

create or replace function public.create_stage_plan_for_meeting()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.stage_plans(term_id, meeting_id, sunday_date)
  values (new.term_id, new.id, new.meeting_date + 1)
  on conflict (meeting_id) do nothing;
  return new;
end;
$$;

create trigger meetings_create_stage_plan after insert on public.meetings
for each row execute function public.create_stage_plan_for_meeting();

insert into public.stage_plans(term_id, meeting_id, sunday_date)
select term_id, id, meeting_date + 1 from public.meetings
on conflict (meeting_id) do nothing;

create or replace function public.can_use_stage_plan(p_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_admin() or exists (
    select 1 from public.stage_plans sp
    join public.terms t on t.id = sp.term_id
    where sp.id = p_plan_id and t.status = 'ACTIVE' and public.is_active_group_staff()
  );
$$;

-- 등단 편집자는 전체 출석 후보를 계산해야 하지만 attendance 테이블 자체는
-- 계속 담당 조에만 공개한다. 이 함수만 해당 주차의 최소 필드를 반환한다.
create or replace function public.get_stage_attendance(p_plan_id uuid)
returns table(term_student_id uuid, status public.attendance_status, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_use_stage_plan(p_plan_id) then raise exception 'forbidden'; end if;
  return query
    select a.term_student_id, a.status, a.updated_at
    from public.attendance a
    join public.stage_plans sp on sp.meeting_id = a.meeting_id
    where sp.id = p_plan_id;
end;
$$;

alter table public.stage_plans enable row level security;
alter table public.stage_staff_availability enable row level security;
alter table public.stage_versions enable row level security;
alter table public.stage_services enable row level security;
alter table public.stage_candidates enable row level security;
alter table public.stage_overrides enable row level security;
alter table public.stage_assignments enable row level security;

grant select on public.stage_plans, public.stage_staff_availability, public.stage_versions,
  public.stage_services, public.stage_candidates, public.stage_overrides, public.stage_assignments to authenticated;
revoke all on function public.get_stage_attendance(uuid) from public;
grant execute on function public.get_stage_attendance(uuid) to authenticated;

create policy "authorized users read stage plans" on public.stage_plans
for select to authenticated using (public.can_use_stage_plan(id));
create policy "authorized users read stage availability" on public.stage_staff_availability
for select to authenticated using (public.can_use_stage_plan(plan_id));
create policy "authorized users read stage versions" on public.stage_versions
for select to authenticated using (public.can_use_stage_plan(plan_id));
create policy "authorized users read stage services" on public.stage_services
for select to authenticated using (exists (
  select 1 from public.stage_versions v where v.id = stage_services.version_id and public.can_use_stage_plan(v.plan_id)
));
create policy "authorized users read stage candidates" on public.stage_candidates
for select to authenticated using (exists (
  select 1 from public.stage_versions v where v.id = stage_candidates.version_id and public.can_use_stage_plan(v.plan_id)
));
create policy "authorized users read stage overrides" on public.stage_overrides
for select to authenticated using (exists (
  select 1 from public.stage_versions v where v.id = stage_overrides.version_id and public.can_use_stage_plan(v.plan_id)
));
create policy "authorized users read stage assignments" on public.stage_assignments
for select to authenticated using (exists (
  select 1 from public.stage_services s join public.stage_versions v on v.id = s.version_id
  where s.id = stage_assignments.service_id and public.can_use_stage_plan(v.plan_id)
));

create or replace function public.set_stage_staff_availability(
  p_plan_id uuid,
  p_staff_id uuid,
  p_present boolean,
  p_stage_role public.staff_stage_role,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_row public.stage_staff_availability%rowtype;
  saved_row public.stage_staff_availability%rowtype;
begin
  if not public.can_use_stage_plan(p_plan_id) then raise exception 'forbidden'; end if;
  if not exists(select 1 from public.staff s where s.id = p_staff_id and s.active) then raise exception 'staff_not_found'; end if;
  select * into current_row from public.stage_staff_availability
  where plan_id = p_plan_id and staff_id = p_staff_id for update;
  if found and (p_expected_updated_at is null or current_row.updated_at <> p_expected_updated_at) then raise exception 'revision_conflict'; end if;
  if not found and p_expected_updated_at is not null then raise exception 'revision_conflict'; end if;

  insert into public.stage_staff_availability(plan_id, staff_id, present, stage_role, updated_by)
  values (p_plan_id, p_staff_id, p_present, p_stage_role, auth.uid())
  on conflict (plan_id, staff_id) do update set
    present = excluded.present, stage_role = excluded.stage_role,
    updated_by = auth.uid(), updated_at = now()
  returning * into saved_row;

  insert into public.audit_events(actor_user_id, action, entity_type, entity_id, before_json, after_json)
  values (auth.uid(), 'STAGE_AVAILABILITY_SET', 'stage_staff_availability', saved_row.id,
    case when current_row.id is null then null else jsonb_build_object('present', current_row.present, 'role', current_row.stage_role) end,
    jsonb_build_object('present', saved_row.present, 'role', saved_row.stage_role));
  return jsonb_build_object('staffId', saved_row.staff_id, 'present', saved_row.present,
    'stageRole', saved_row.stage_role, 'revision', saved_row.updated_at);
end;
$$;

create or replace function public.save_stage_snapshot(
  p_plan_id uuid,
  p_kind public.stage_version_kind,
  p_leader_type public.stage_person_type,
  p_leader_id uuid,
  p_config jsonb,
  p_services jsonb,
  p_candidates jsonb,
  p_overrides jsonb,
  p_assignments jsonb,
  p_warnings jsonb,
  p_source_version_id uuid default null,
  p_expected_revision integer default null
)
returns public.stage_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_version public.stage_versions%rowtype;
  target_plan public.stage_plans%rowtype;
  next_version_no integer;
  source_revision integer;
  item jsonb;
begin
  if not public.can_use_stage_plan(p_plan_id) then raise exception 'forbidden'; end if;
  if p_kind = 'CONFIRMED' then raise exception 'use_confirm_function'; end if;
  select * into target_plan from public.stage_plans where id = p_plan_id for update;
  if not found then raise exception 'plan_not_found'; end if;

  if p_source_version_id is not null then
    select revision into source_revision from public.stage_versions where id = p_source_version_id and plan_id = p_plan_id;
    if source_revision is null then raise exception 'source_not_found'; end if;
    if p_expected_revision is null or source_revision <> p_expected_revision then raise exception 'revision_conflict'; end if;
  end if;

  if p_leader_type = 'STUDENT' then
    if not exists(
      select 1 from public.term_students ts
      join public.meetings m on m.id = target_plan.meeting_id and not m.is_cancelled
      join public.terms t on t.id = m.term_id
      join public.attendance a on a.meeting_id = m.id and a.term_student_id = ts.id
      where ts.id = p_leader_id and ts.term_id = target_plan.term_id and ts.is_student_leader and ts.active
        and (a.status = 'PRESENT' or (t.late_counts_as_present and a.status = 'LATE'))
    )
      then raise exception 'invalid_student_leader'; end if;
  else
    if not exists(select 1 from public.staff s where s.id = p_leader_id and s.active)
      then raise exception 'invalid_staff_leader'; end if;
  end if;

  if jsonb_array_length(coalesce(p_services, '[]'::jsonb)) <> 2
    or (select count(distinct (service_entry ->> 'department')) from jsonb_array_elements(p_services) service_entry) <> 2
    then raise exception 'invalid_services';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_assignments, '[]'::jsonb)) assignment_entry
    where not exists (
      select 1 from jsonb_array_elements(p_services) service
      where service ->> 'id' = assignment_entry ->> 'serviceId'
    )
  ) then raise exception 'invalid_assignment_service'; end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_assignments, '[]'::jsonb)) assignment_entry
    where assignment_entry ->> 'personType' = 'STAFF' and assignment_entry ->> 'role' <> 'SINGER'
  ) then raise exception 'invalid_staff_role'; end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_assignments, '[]'::jsonb)) assignment_entry
    where assignment_entry ->> 'personType' = 'STUDENT'
    group by assignment_entry ->> 'personId' having count(*) > 1
  ) then raise exception 'duplicate_student_assignment'; end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_assignments, '[]'::jsonb)) assignment_entry
    where assignment_entry ->> 'personType' = p_leader_type::text and (assignment_entry ->> 'personId')::uuid = p_leader_id
  ) then raise exception 'leader_assignment_duplicate'; end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_assignments, '[]'::jsonb)) assignment_entry
    where assignment_entry ->> 'personType' = 'STUDENT' and not exists (
      select 1 from public.term_students ts
      join public.meetings m on m.id = target_plan.meeting_id and not m.is_cancelled
      join public.terms t on t.id = m.term_id
      join public.attendance a on a.meeting_id = m.id and a.term_student_id = ts.id
      where ts.id = (assignment_entry ->> 'personId')::uuid and ts.term_id = target_plan.term_id
        and ts.active and ts.team = 'SINGER'
        and (a.status = 'PRESENT' or (t.late_counts_as_present and a.status = 'LATE'))
        and coalesce(
          (select (override_item ->> 'department')::public.service_department
           from jsonb_array_elements(coalesce(p_overrides, '[]'::jsonb)) override_item
           where override_item ->> 'kind' = 'MOVE_DEPARTMENT'
             and override_item ->> 'termStudentId' = assignment_entry ->> 'personId' limit 1),
          ts.service_department
        ) = (
          select (service ->> 'department')::public.service_department
          from jsonb_array_elements(p_services) service
          where service ->> 'id' = assignment_entry ->> 'serviceId' limit 1
        )
    )
  ) then raise exception 'ineligible_student_assignment'; end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_assignments, '[]'::jsonb)) assignment_entry
    where assignment_entry ->> 'personType' = 'STAFF' and not exists (
      select 1 from public.staff s
      join public.stage_staff_availability availability
        on availability.plan_id = p_plan_id and availability.staff_id = s.id
      where s.id = (assignment_entry ->> 'personId')::uuid and s.active and s.singer_capable
        and availability.present and availability.stage_role = 'SINGER'
    )
  ) then raise exception 'ineligible_staff_assignment'; end if;

  select coalesce(max(version_no), 0) + 1 into next_version_no
  from public.stage_versions where plan_id = p_plan_id;
  insert into public.stage_versions(
    plan_id, version_no, kind, leader_type, leader_term_student_id, leader_staff_id,
    config_snapshot, warnings, ignored_warnings, source_version_id, created_by
  ) values (
    p_plan_id, next_version_no, p_kind, p_leader_type,
    case when p_leader_type = 'STUDENT' then p_leader_id else null end,
    case when p_leader_type = 'STAFF' then p_leader_id else null end,
    coalesce(p_config, '{}'::jsonb), coalesce(p_warnings, '[]'::jsonb),
    case when p_kind = 'MANUAL_DRAFT' then coalesce(p_warnings, '[]'::jsonb) else '[]'::jsonb end,
    p_source_version_id, auth.uid()
  ) returning * into created_version;

  for item in select value from jsonb_array_elements(coalesce(p_services, '[]'::jsonb)) loop
    insert into public.stage_services(id, version_id, department, singer_target, choir_target)
    values ((item ->> 'id')::uuid, created_version.id, (item ->> 'department')::public.service_department,
      (item ->> 'singerTarget')::integer, (item ->> 'choirTarget')::integer);
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_candidates, '[]'::jsonb)) loop
    insert into public.stage_candidates(version_id, person_type, term_student_id, staff_id, department, eligible, reason)
    values (created_version.id, (item ->> 'personType')::public.stage_person_type,
      case when item ->> 'personType' = 'STUDENT' then (item ->> 'personId')::uuid else null end,
      case when item ->> 'personType' = 'STAFF' then (item ->> 'personId')::uuid else null end,
      nullif(item ->> 'department', '')::public.service_department,
      (item ->> 'eligible')::boolean, item ->> 'reason');
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_overrides, '[]'::jsonb)) loop
    insert into public.stage_overrides(version_id, term_student_id, kind, department, role)
    values (created_version.id, (item ->> 'termStudentId')::uuid,
      (item ->> 'kind')::public.stage_override_kind,
      (item ->> 'department')::public.service_department,
      nullif(item ->> 'role', '')::public.stage_override_role);
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_assignments, '[]'::jsonb)) loop
    insert into public.stage_assignments(
      service_id, person_type, term_student_id, staff_id, role, side,
      position_order, reason, is_manual
    ) values (
      (item ->> 'serviceId')::uuid, (item ->> 'personType')::public.stage_person_type,
      case when item ->> 'personType' = 'STUDENT' then (item ->> 'personId')::uuid else null end,
      case when item ->> 'personType' = 'STAFF' then (item ->> 'personId')::uuid else null end,
      (item ->> 'role')::public.stage_role, (item ->> 'side')::public.stage_side,
      (item ->> 'positionOrder')::integer, item ->> 'reason',
      coalesce((item ->> 'isManual')::boolean, false)
    );
  end loop;

  insert into public.audit_events(actor_user_id, action, entity_type, entity_id, after_json)
  values (auth.uid(), 'STAGE_SNAPSHOT_CREATED', 'stage_version', created_version.id,
    jsonb_build_object('plan_id', p_plan_id, 'version_no', next_version_no, 'kind', p_kind));
  return created_version;
end;
$$;

create or replace function public.confirm_stage_version(
  p_version_id uuid,
  p_expected_revision integer,
  p_ignored_warnings jsonb default '[]'::jsonb
)
returns public.stage_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_version public.stage_versions%rowtype;
  confirmed_version public.stage_versions%rowtype;
  next_version_no integer;
  old_service public.stage_services%rowtype;
  new_service_id uuid;
begin
  select * into source_version from public.stage_versions where id = p_version_id for update;
  if not found then raise exception 'version_not_found'; end if;
  if not public.can_use_stage_plan(source_version.plan_id) then raise exception 'forbidden'; end if;
  if source_version.kind = 'CONFIRMED' then raise exception 'already_confirmed'; end if;
  if source_version.revision <> p_expected_revision then raise exception 'revision_conflict'; end if;

  perform 1 from public.stage_plans where id = source_version.plan_id for update;
  select coalesce(max(version_no), 0) + 1 into next_version_no
  from public.stage_versions where plan_id = source_version.plan_id;
  insert into public.stage_versions(
    plan_id, version_no, kind, leader_type, leader_term_student_id, leader_staff_id,
    config_snapshot, warnings, ignored_warnings, source_version_id,
    created_by, confirmed_by, confirmed_at
  ) values (
    source_version.plan_id, next_version_no, 'CONFIRMED', source_version.leader_type,
    source_version.leader_term_student_id, source_version.leader_staff_id,
    source_version.config_snapshot, source_version.warnings, coalesce(p_ignored_warnings, '[]'::jsonb),
    source_version.id, auth.uid(), auth.uid(), now()
  ) returning * into confirmed_version;

  insert into public.stage_candidates(version_id, person_type, term_student_id, staff_id, department, eligible, reason)
  select confirmed_version.id, person_type, term_student_id, staff_id, department, eligible, reason
  from public.stage_candidates where version_id = source_version.id;
  insert into public.stage_overrides(version_id, term_student_id, kind, department, role)
  select confirmed_version.id, term_student_id, kind, department, role
  from public.stage_overrides where version_id = source_version.id;

  for old_service in select * from public.stage_services where version_id = source_version.id loop
    new_service_id := gen_random_uuid();
    insert into public.stage_services(id, version_id, department, singer_target, choir_target)
    values (new_service_id, confirmed_version.id, old_service.department, old_service.singer_target, old_service.choir_target);
    insert into public.stage_assignments(
      service_id, person_type, term_student_id, staff_id, role, side,
      position_order, reason, is_manual
    ) select new_service_id, person_type, term_student_id, staff_id, role, side,
      position_order, reason, is_manual
    from public.stage_assignments where service_id = old_service.id;
  end loop;

  insert into public.audit_events(actor_user_id, action, entity_type, entity_id, after_json)
  values (auth.uid(), 'STAGE_CONFIRMED', 'stage_version', confirmed_version.id,
    jsonb_build_object('source_version_id', source_version.id, 'ignored_warnings', p_ignored_warnings));
  return confirmed_version;
end;
$$;

revoke all on function public.set_stage_staff_availability(uuid, uuid, boolean, public.staff_stage_role, timestamptz) from public;
grant execute on function public.set_stage_staff_availability(uuid, uuid, boolean, public.staff_stage_role, timestamptz) to authenticated;
revoke all on function public.save_stage_snapshot(uuid, public.stage_version_kind, public.stage_person_type, uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, uuid, integer) from public;
grant execute on function public.save_stage_snapshot(uuid, public.stage_version_kind, public.stage_person_type, uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, uuid, integer) to authenticated;
revoke all on function public.confirm_stage_version(uuid, integer, jsonb) from public;
grant execute on function public.confirm_stage_version(uuid, integer, jsonb) to authenticated;
