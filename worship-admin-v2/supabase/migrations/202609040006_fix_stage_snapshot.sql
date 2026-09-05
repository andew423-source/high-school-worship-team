-- Fix an ambiguous PL/pgSQL identifier in save_stage_snapshot.
-- This keeps existing stage data and only recompiles the function with
-- column references preferred inside its JSON validation queries.

do $migration$
declare
  function_definition text;
  function_signature constant text :=
    'public.save_stage_snapshot(uuid,public.stage_version_kind,public.stage_person_type,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,uuid,integer)';
begin
  select pg_get_functiondef(function_signature::regprocedure)
    into function_definition;

  if function_definition is null then
    raise exception 'save_stage_snapshot_not_found';
  end if;

  if position('#variable_conflict use_column' in function_definition) = 0 then
    function_definition := replace(
      function_definition,
      'AS $function$',
      E'AS $function$\n#variable_conflict use_column'
    );
  end if;

  execute function_definition;
end;
$migration$;
