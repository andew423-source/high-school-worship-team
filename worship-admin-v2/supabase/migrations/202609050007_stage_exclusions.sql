-- Preserve all previous versions; add an explicit student exclusion.
alter type public.stage_override_kind add value if not exists 'EXCLUDE_STAGE';
alter table public.stage_overrides drop constraint stage_override_shape;
alter table public.stage_overrides add constraint stage_override_shape check (
  (kind::text in ('MOVE_DEPARTMENT', 'EXCLUDE_STAGE') and role is null)
  or (kind::text = 'FORCE_STAGE' and role is not null)
);

-- Patch the existing function so installation-specific fixes are preserved.
do $migration$
declare
  definition text;
  marker constant text := '  if p_kind = ''CONFIRMED'' then raise exception ''use_confirm_function''; end if;';
  guard constant text := $guard$
  if coalesce((p_config ->> 'staffOnly')::boolean, false) and (
    p_leader_type <> 'STAFF' or exists (
      select 1 from jsonb_array_elements(coalesce(p_assignments, '[]'::jsonb)) staff_only_item
      where staff_only_item ->> 'personType' = 'STUDENT'
    )
  ) then raise exception 'staff_only_students_not_allowed'; end if;
  -- EXCLUDE_STAGE must be enforced even for direct RPC calls.
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_overrides, '[]'::jsonb)) excluded
    where excluded ->> 'kind' = 'EXCLUDE_STAGE'
      and (
        (p_leader_type = 'STUDENT' and excluded ->> 'termStudentId' = p_leader_id::text)
        or exists (
          select 1 from jsonb_array_elements(coalesce(p_assignments, '[]'::jsonb)) assigned
          where assigned ->> 'personType' = 'STUDENT'
            and assigned ->> 'personId' = excluded ->> 'termStudentId'
        )
        or exists (
          select 1 from jsonb_array_elements(coalesce(p_overrides, '[]'::jsonb)) forced
          where forced ->> 'kind' = 'FORCE_STAGE'
            and forced ->> 'termStudentId' = excluded ->> 'termStudentId'
        )
      )
  ) then raise exception 'excluded_student_on_stage'; end if;
$guard$;
begin
  select pg_get_functiondef('public.save_stage_snapshot(uuid,public.stage_version_kind,public.stage_person_type,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,uuid,integer)'::regprocedure)
    into definition;
  if position(marker in definition) = 0 then raise exception 'stage_snapshot_patch_marker_missing'; end if;
  if position('excluded_student_on_stage' in definition) = 0 then
    execute replace(definition, marker, marker || guard);
  end if;
end;
$migration$;
