-- Phase 4: group-scoped attendance with optimistic concurrency.
-- Apply only after 202609040003_grouping.sql.

create type public.attendance_status as enum ('PRESENT', 'LATE', 'ABSENT');

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  term_student_id uuid not null references public.term_students(id) on delete cascade,
  status public.attendance_status not null,
  note text,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(meeting_id, term_student_id)
);

create index attendance_student_meeting_idx on public.attendance(term_student_id, meeting_id);
create index attendance_meeting_status_idx on public.attendance(meeting_id, status);
create trigger attendance_touch_updated_at before update on public.attendance
for each row execute function public.touch_updated_at();

create or replace function public.can_edit_attendance(p_meeting_id uuid, p_term_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_admin() or exists (
    select 1
    from public.profiles p
    join public.group_staff_members gsm on gsm.staff_id = p.staff_id
    join public.group_student_members gstm
      on gstm.version_id = gsm.version_id and gstm.group_id = gsm.group_id
    join public.grouping_versions gv on gv.id = gsm.version_id
    join public.meetings m on m.id = p_meeting_id and m.term_id = gv.term_id
    where p.id = auth.uid()
      and p.role = 'GROUP_STAFF' and p.status = 'ACTIVE'
      and gstm.term_student_id = p_term_student_id
      and gv.kind = 'CONFIRMED'
      and gv.version_no = (
        select max(v.version_no) from public.grouping_versions v
        where v.term_id = gv.term_id and v.kind = 'CONFIRMED'
      )
  );
$$;

alter table public.attendance enable row level security;
grant select, insert, update, delete on public.attendance to authenticated;

create policy "authorized staff read attendance" on public.attendance
for select to authenticated using (public.can_edit_attendance(meeting_id, term_student_id));
create policy "authorized staff insert attendance" on public.attendance
for insert to authenticated with check (public.can_edit_attendance(meeting_id, term_student_id));
create policy "authorized staff update attendance" on public.attendance
for update to authenticated using (public.can_edit_attendance(meeting_id, term_student_id))
with check (public.can_edit_attendance(meeting_id, term_student_id));
create policy "authorized staff delete attendance" on public.attendance
for delete to authenticated using (public.can_edit_attendance(meeting_id, term_student_id));

create or replace function public.set_attendance(
  p_meeting_id uuid,
  p_term_student_id uuid,
  p_status public.attendance_status,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_meeting public.meetings%rowtype;
  current_row public.attendance%rowtype;
  saved_row public.attendance%rowtype;
begin
  if not public.can_edit_attendance(p_meeting_id, p_term_student_id) then raise exception 'forbidden'; end if;
  select * into target_meeting from public.meetings where id = p_meeting_id;
  if not found then raise exception 'meeting_not_found'; end if;
  if target_meeting.is_cancelled then raise exception 'cancelled_meeting'; end if;
  if not exists(
    select 1 from public.term_students ts
    where ts.id = p_term_student_id and ts.term_id = target_meeting.term_id and ts.active
  ) then raise exception 'student_not_in_term'; end if;

  select * into current_row from public.attendance
  where meeting_id = p_meeting_id and term_student_id = p_term_student_id for update;

  if found and (p_expected_updated_at is null or current_row.updated_at <> p_expected_updated_at) then
    raise exception 'revision_conflict';
  end if;
  if not found and p_expected_updated_at is not null then raise exception 'revision_conflict'; end if;

  if p_status is null then
    delete from public.attendance where meeting_id = p_meeting_id and term_student_id = p_term_student_id;
    insert into public.audit_events(actor_user_id, action, entity_type, entity_id, before_json)
    values (auth.uid(), 'ATTENDANCE_CLEARED', 'attendance', current_row.id,
      case when current_row.id is null then null else jsonb_build_object('status', current_row.status) end);
    return jsonb_build_object('meetingId', p_meeting_id, 'termStudentId', p_term_student_id, 'status', null, 'revision', null);
  end if;

  insert into public.attendance(meeting_id, term_student_id, status, updated_by)
  values (p_meeting_id, p_term_student_id, p_status, auth.uid())
  on conflict (meeting_id, term_student_id) do update set
    status = excluded.status,
    updated_by = auth.uid(),
    updated_at = now()
  returning * into saved_row;

  insert into public.audit_events(actor_user_id, action, entity_type, entity_id, before_json, after_json)
  values (auth.uid(), 'ATTENDANCE_SET', 'attendance', saved_row.id,
    case when current_row.id is null then null else jsonb_build_object('status', current_row.status) end,
    jsonb_build_object('status', saved_row.status, 'meeting_id', p_meeting_id, 'term_student_id', p_term_student_id));

  return jsonb_build_object(
    'id', saved_row.id, 'meetingId', saved_row.meeting_id,
    'termStudentId', saved_row.term_student_id, 'status', saved_row.status,
    'revision', saved_row.updated_at
  );
end;
$$;

revoke all on function public.set_attendance(uuid, uuid, public.attendance_status, timestamptz) from public;
grant execute on function public.set_attendance(uuid, uuid, public.attendance_status, timestamptz) to authenticated;
