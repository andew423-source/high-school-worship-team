-- Run in Supabase SQL Editor as postgres. Every test write is rolled back.
begin;
do $test$
declare
  admin_id uuid;
  source public.stage_versions%rowtype;
  created public.stage_versions%rowtype;
  confirmed public.stage_versions%rowtype;
  leader_id uuid;
  student_id uuid;
  services jsonb;
  candidates jsonb;
  assignments jsonb;
  exclusions jsonb;
begin
  select id into admin_id from public.profiles where role = 'ADMIN' and status = 'ACTIVE' limit 1;
  if admin_id is null then raise exception 'test_requires_existing_admin'; end if;
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  select * into source from public.stage_versions order by created_at desc limit 1;
  select id into leader_id from public.staff where active and is_default_stage_leader limit 1;
  select ts.id into student_id from public.term_students ts join public.stage_plans p on p.term_id=ts.term_id where p.id=source.plan_id and ts.active limit 1;
  if source.id is null or leader_id is null or student_id is null then raise exception 'test_requires_existing_roster'; end if;
  select jsonb_agg(jsonb_build_object('id', gen_random_uuid(), 'department', department, 'singerTarget', singer_target, 'choirTarget', choir_target)) into services from public.stage_services where version_id=source.id;
  select jsonb_agg(jsonb_build_object('personType', person_type, 'personId', coalesce(term_student_id,staff_id), 'department', department, 'eligible', eligible, 'reason', reason)) into candidates from public.stage_candidates where version_id=source.id;
  select coalesce(jsonb_agg(jsonb_build_object('serviceId', svc->>'id', 'personType', 'STAFF', 'personId', s.id, 'role', 'SINGER', 'side', 'LEFT', 'positionOrder', (select count(*) from public.staff prior where prior.id < s.id), 'reason', 'rollback smoke test', 'isManual', false)), '[]'::jsonb)
    into assignments from public.staff s join public.stage_staff_availability a on a.staff_id=s.id and a.plan_id=source.plan_id
    cross join jsonb_array_elements(services) svc
    where s.active and s.singer_capable and a.present and a.stage_role='SINGER' and s.id<>leader_id;
  exclusions := jsonb_build_array(jsonb_build_object('termStudentId',student_id,'kind','EXCLUDE_STAGE','department','FIRST','role',null));
  created := public.save_stage_snapshot(source.plan_id,'AUTO_DRAFT','STAFF',leader_id,'{"staffOnly":true}'::jsonb,services,candidates,exclusions,assignments,'[]',null,null);
  if not exists(select 1 from public.stage_overrides where version_id=created.id and kind::text='EXCLUDE_STAGE') then raise exception 'exclusion_not_saved'; end if;
  confirmed := public.confirm_stage_version(created.id,created.revision,'[]');
  if confirmed.kind <> 'CONFIRMED' then raise exception 'confirmation_failed'; end if;
  select jsonb_agg(svc || jsonb_build_object('id',gen_random_uuid())) into services from jsonb_array_elements(services) svc;
  -- A previously confirmed snapshot can be cloned without altering that snapshot.
  created := public.save_stage_snapshot(source.plan_id,'MANUAL_DRAFT','STAFF',leader_id,'{"staffOnly":true}'::jsonb,services,candidates,exclusions,'[]','[]',confirmed.id,confirmed.revision);
  if not exists(select 1 from public.stage_versions where id=confirmed.id and kind='CONFIRMED') then raise exception 'old_confirmation_lost'; end if;
  confirmed := public.confirm_stage_version(created.id,created.revision,'[]');
  begin
    perform public.save_stage_snapshot(source.plan_id,'AUTO_DRAFT','STAFF',leader_id,'{}',services,candidates,exclusions,jsonb_build_array(jsonb_build_object('personType','STUDENT','personId',student_id)),'[]',null,null);
    raise exception 'exclusion_guard_did_not_block';
  exception when others then
    if sqlerrm <> 'excluded_student_on_stage' then raise; end if;
  end;
  begin
    perform public.save_stage_snapshot(source.plan_id,'AUTO_DRAFT','STUDENT',student_id,'{"staffOnly":true}',services,candidates,'[]','[]','[]',null,null);
    raise exception 'staff_only_guard_did_not_block';
  exception when others then
    if sqlerrm <> 'staff_only_students_not_allowed' then raise; end if;
  end;
end;
$test$;
rollback;
