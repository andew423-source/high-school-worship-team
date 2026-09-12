-- Approved staff can cover any group in the latest confirmed grouping.
-- Existing attendance RLS policies and set_attendance both call this function.
-- Preserve admin access, term boundaries, and confirmed-group membership.
begin;

create or replace function public.can_edit_attendance(p_meeting_id uuid, p_term_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_admin() or (
    public.is_active_group_staff() and exists (
      select 1
      from public.meetings m
      join public.term_students ts on ts.term_id = m.term_id
      join public.grouping_versions gv on gv.term_id = m.term_id
      join public.group_student_members gsm
        on gsm.version_id = gv.id and gsm.term_student_id = ts.id
      where m.id = p_meeting_id
        and ts.id = p_term_student_id
        and gv.kind = 'CONFIRMED'
        and gv.id = public.latest_confirmed_grouping_version(m.term_id)
    )
  );
$$;

commit;
