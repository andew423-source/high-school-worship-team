-- Phase 3: immutable grouping snapshots, constraints, and staff ownership.
-- Apply only after 202609020002_phase2_terms_people.sql.

create type public.group_rule_type as enum (
  'TOGETHER', 'APART', 'TOP_SEED', 'GENDER_MIN', 'GRADE_MIN', 'TEAM_MIN'
);
create type public.grouping_version_kind as enum ('AUTO_DRAFT', 'MANUAL_DRAFT', 'CONFIRMED');

create table public.grouping_rules (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references public.terms(id) on delete cascade,
  type public.group_rule_type not null,
  value text,
  min_count integer check (min_count is null or min_count > 0),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint grouping_rule_shape check (
    (type in ('TOGETHER', 'APART', 'TOP_SEED') and value is null and min_count is null)
    or (type in ('GENDER_MIN', 'GRADE_MIN', 'TEAM_MIN') and value is not null and min_count is not null)
  )
);

create table public.grouping_rule_members (
  rule_id uuid not null references public.grouping_rules(id) on delete cascade,
  term_student_id uuid not null references public.term_students(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (rule_id, term_student_id)
);

create table public.grouping_versions (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references public.terms(id) on delete cascade,
  version_no integer not null check (version_no > 0),
  kind public.grouping_version_kind not null,
  seed integer,
  settings_snapshot jsonb not null default '{}'::jsonb,
  rules_snapshot jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  ignored_warnings jsonb not null default '[]'::jsonb,
  source_version_id uuid references public.grouping_versions(id) on delete set null,
  revision integer not null default 1,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  confirmed_by uuid references public.profiles(id) on delete set null,
  confirmed_at timestamptz,
  unique(term_id, version_no),
  constraint grouping_confirmation_shape check (
    (kind = 'CONFIRMED' and confirmed_at is not null)
    or (kind <> 'CONFIRMED' and confirmed_at is null)
  )
);

create table public.groups (
  id uuid primary key,
  version_id uuid not null references public.grouping_versions(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  sort_order integer not null check (sort_order >= 0),
  student_min integer not null check (student_min >= 0),
  student_max integer not null check (student_max >= student_min),
  staff_min integer not null check (staff_min >= 0),
  staff_max integer not null check (staff_max >= staff_min),
  unique(version_id, name),
  unique(version_id, sort_order)
);

create table public.group_student_members (
  version_id uuid not null references public.grouping_versions(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  term_student_id uuid not null references public.term_students(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (version_id, term_student_id),
  unique(group_id, term_student_id)
);

create table public.group_staff_members (
  version_id uuid not null references public.grouping_versions(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (version_id, staff_id),
  unique(group_id, staff_id)
);

create index grouping_rules_term_idx on public.grouping_rules(term_id, created_at);
create index grouping_versions_term_kind_idx on public.grouping_versions(term_id, kind, version_no desc);
create index groups_version_idx on public.groups(version_id, sort_order);
create index group_student_group_idx on public.group_student_members(group_id);
create index group_staff_group_idx on public.group_staff_members(group_id);
create index group_staff_staff_idx on public.group_staff_members(staff_id, version_id);

alter table public.grouping_rules enable row level security;
alter table public.grouping_rule_members enable row level security;
alter table public.grouping_versions enable row level security;
alter table public.groups enable row level security;
alter table public.group_student_members enable row level security;
alter table public.group_staff_members enable row level security;

grant select, insert, update, delete on public.grouping_rules to authenticated;
grant select, insert, update, delete on public.grouping_rule_members to authenticated;
grant select on public.grouping_versions, public.groups, public.group_student_members, public.group_staff_members to authenticated;

create or replace function public.latest_confirmed_grouping_version(p_term_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select v.id from public.grouping_versions v
  where v.term_id = p_term_id and v.kind = 'CONFIRMED'
  order by v.version_no desc limit 1;
$$;

create policy "admins manage grouping rules" on public.grouping_rules
for all to authenticated using (public.is_active_admin()) with check (public.is_active_admin());
create policy "admins manage grouping rule members" on public.grouping_rule_members
for all to authenticated using (public.is_active_admin()) with check (public.is_active_admin());
create policy "admins read grouping versions" on public.grouping_versions
for select to authenticated using (public.is_active_admin());
create policy "admins read groups" on public.groups
for select to authenticated using (public.is_active_admin());
create policy "admins read group students" on public.group_student_members
for select to authenticated using (public.is_active_admin());
create policy "admins read group staff" on public.group_staff_members
for select to authenticated using (public.is_active_admin());

create policy "group staff read latest confirmed version" on public.grouping_versions
for select to authenticated using (
  public.is_active_group_staff() and id = public.latest_confirmed_grouping_version(term_id)
);
create policy "group staff read latest confirmed groups" on public.groups
for select to authenticated using (exists (
  select 1 from public.grouping_versions v
  where v.id = groups.version_id and v.id = public.latest_confirmed_grouping_version(v.term_id)
    and public.is_active_group_staff()
));
create policy "group staff read latest confirmed student groups" on public.group_student_members
for select to authenticated using (exists (
  select 1 from public.grouping_versions v
  where v.id = group_student_members.version_id and v.id = public.latest_confirmed_grouping_version(v.term_id)
    and public.is_active_group_staff()
));
create policy "group staff read latest confirmed staff groups" on public.group_staff_members
for select to authenticated using (exists (
  select 1 from public.grouping_versions v
  where v.id = group_staff_members.version_id and v.id = public.latest_confirmed_grouping_version(v.term_id)
    and public.is_active_group_staff()
));

create or replace function public.save_grouping_snapshot(
  p_term_id uuid,
  p_kind public.grouping_version_kind,
  p_seed integer,
  p_settings jsonb,
  p_rules jsonb,
  p_groups jsonb,
  p_student_assignments jsonb,
  p_staff_assignments jsonb,
  p_warnings jsonb,
  p_source_version_id uuid default null,
  p_expected_revision integer default null
)
returns public.grouping_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_version public.grouping_versions%rowtype;
  next_version_no integer;
  item jsonb;
  source_revision integer;
begin
  if not public.is_active_admin() then raise exception 'forbidden'; end if;
  if p_kind = 'CONFIRMED' then raise exception 'use_confirm_function'; end if;
  if not exists(select 1 from public.terms t where t.id = p_term_id) then raise exception 'term_not_found'; end if;

  if p_source_version_id is not null then
    select revision into source_revision from public.grouping_versions where id = p_source_version_id and term_id = p_term_id;
    if source_revision is null then raise exception 'source_not_found'; end if;
    if p_expected_revision is null or source_revision <> p_expected_revision then raise exception 'revision_conflict'; end if;
  end if;

  perform 1 from public.terms where id = p_term_id for update;
  select coalesce(max(version_no), 0) + 1 into next_version_no
  from public.grouping_versions where term_id = p_term_id;

  insert into public.grouping_versions(
    term_id, version_no, kind, seed, settings_snapshot, rules_snapshot,
    warnings, ignored_warnings, source_version_id, created_by
  ) values (
    p_term_id, next_version_no, p_kind, p_seed, coalesce(p_settings, '{}'::jsonb),
    coalesce(p_rules, '[]'::jsonb), coalesce(p_warnings, '[]'::jsonb),
    case when p_kind = 'MANUAL_DRAFT' then coalesce(p_warnings, '[]'::jsonb) else '[]'::jsonb end,
    p_source_version_id, auth.uid()
  ) returning * into created_version;

  for item in select value from jsonb_array_elements(coalesce(p_groups, '[]'::jsonb)) loop
    insert into public.groups(id, version_id, name, sort_order, student_min, student_max, staff_min, staff_max)
    values (
      (item ->> 'id')::uuid, created_version.id, trim(item ->> 'name'),
      (item ->> 'sortOrder')::integer, (item ->> 'studentMin')::integer,
      (item ->> 'studentMax')::integer, (item ->> 'staffMin')::integer,
      (item ->> 'staffMax')::integer
    );
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_student_assignments, '[]'::jsonb)) loop
    insert into public.group_student_members(version_id, group_id, term_student_id, assigned_by)
    values (created_version.id, (item ->> 'groupId')::uuid, (item ->> 'termStudentId')::uuid, auth.uid());
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_staff_assignments, '[]'::jsonb)) loop
    insert into public.group_staff_members(version_id, group_id, staff_id, assigned_by)
    values (created_version.id, (item ->> 'groupId')::uuid, (item ->> 'staffId')::uuid, auth.uid());
  end loop;

  insert into public.audit_events(actor_user_id, action, entity_type, entity_id, after_json)
  values (auth.uid(), 'GROUPING_SNAPSHOT_CREATED', 'grouping_version', created_version.id,
    jsonb_build_object('term_id', p_term_id, 'version_no', next_version_no, 'kind', p_kind));
  return created_version;
end;
$$;

create or replace function public.confirm_grouping_version(
  p_version_id uuid,
  p_expected_revision integer,
  p_ignored_warnings jsonb default '[]'::jsonb
)
returns public.grouping_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_version public.grouping_versions%rowtype;
  confirmed_version public.grouping_versions%rowtype;
  next_version_no integer;
  old_group public.groups%rowtype;
  new_group_id uuid;
begin
  if not public.is_active_admin() then raise exception 'forbidden'; end if;
  select * into source_version from public.grouping_versions where id = p_version_id for update;
  if not found then raise exception 'version_not_found'; end if;
  if source_version.kind = 'CONFIRMED' then raise exception 'already_confirmed'; end if;
  if source_version.revision <> p_expected_revision then raise exception 'revision_conflict'; end if;

  perform 1 from public.terms where id = source_version.term_id for update;
  select coalesce(max(version_no), 0) + 1 into next_version_no
  from public.grouping_versions where term_id = source_version.term_id;
  insert into public.grouping_versions(
    term_id, version_no, kind, seed, settings_snapshot, rules_snapshot, warnings,
    ignored_warnings, source_version_id, created_by, confirmed_by, confirmed_at
  ) values (
    source_version.term_id, next_version_no, 'CONFIRMED', source_version.seed,
    source_version.settings_snapshot, source_version.rules_snapshot, source_version.warnings,
    coalesce(p_ignored_warnings, '[]'::jsonb), source_version.id, auth.uid(), auth.uid(), now()
  ) returning * into confirmed_version;

  for old_group in select * from public.groups where version_id = source_version.id order by sort_order loop
    new_group_id := gen_random_uuid();
    insert into public.groups(id, version_id, name, sort_order, student_min, student_max, staff_min, staff_max)
    values (new_group_id, confirmed_version.id, old_group.name, old_group.sort_order,
      old_group.student_min, old_group.student_max, old_group.staff_min, old_group.staff_max);
    insert into public.group_student_members(version_id, group_id, term_student_id, assigned_by)
    select confirmed_version.id, new_group_id, m.term_student_id, auth.uid()
    from public.group_student_members m where m.group_id = old_group.id;
    insert into public.group_staff_members(version_id, group_id, staff_id, assigned_by)
    select confirmed_version.id, new_group_id, m.staff_id, auth.uid()
    from public.group_staff_members m where m.group_id = old_group.id;
  end loop;

  insert into public.audit_events(actor_user_id, action, entity_type, entity_id, after_json)
  values (auth.uid(), 'GROUPING_CONFIRMED', 'grouping_version', confirmed_version.id,
    jsonb_build_object('source_version_id', source_version.id, 'ignored_warnings', p_ignored_warnings));
  return confirmed_version;
end;
$$;

revoke all on function public.save_grouping_snapshot(uuid, public.grouping_version_kind, integer, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, uuid, integer) from public;
grant execute on function public.save_grouping_snapshot(uuid, public.grouping_version_kind, integer, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, uuid, integer) to authenticated;
revoke all on function public.confirm_grouping_version(uuid, integer, jsonb) from public;
grant execute on function public.confirm_grouping_version(uuid, integer, jsonb) to authenticated;
