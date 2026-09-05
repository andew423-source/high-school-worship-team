import { apiError, dataResponse, getOperationalApiContext } from "@/lib/api";
import { loadStageHistory } from "@/lib/stage-history";

export async function GET(_request: Request, { params }: { params: Promise<{ meetingId: string }> }) {
  const context = await getOperationalApiContext(); if (context.error) return context.error;
  const { meetingId } = await params;
  const { data: plan, error: planError } = await context.supabase.from("stage_plans").select("id,term_id,meeting_id,sunday_date,meetings(sequence,meeting_date,title,is_cancelled),terms(name,late_counts_as_present)").eq("meeting_id", meetingId).maybeSingle();
  if (planError && ["PGRST205", "42P01"].includes(planError.code)) {
    return apiError("등단 데이터베이스 설정이 아직 적용되지 않았습니다. stage 마이그레이션을 먼저 실행해주세요.", 503, planError.code);
  }
  if (!plan) return apiError("등단 주차를 찾을 수 없습니다. 마이그레이션 적용 여부를 확인해주세요.", 404, "not_found");
  const [{ data: roster }, { data: staff }, { data: attendance }, { data: availability }, { data: version }, history] = await Promise.all([
    context.supabase.from("term_students").select("id,gender,service_department,team,is_student_leader,active,students(name)").eq("term_id", plan.term_id).eq("active", true),
    context.supabase.from("staff").select("id,name,gender,singer_capable,preferred_service,default_stage_role,exclude_from_auto_singer,is_default_stage_leader,active").eq("active", true).order("name"),
    context.supabase.rpc("get_stage_attendance", { p_plan_id: plan.id }),
    context.supabase.from("stage_staff_availability").select("staff_id,present,stage_role,updated_at").eq("plan_id", plan.id),
    context.supabase.from("stage_versions").select("*").eq("plan_id", plan.id).order("version_no", { ascending: false }).limit(1).maybeSingle(),
    loadStageHistory(context.supabase, plan.term_id, plan.sunday_date),
  ]);
  let services: unknown[] = []; let assignments: unknown[] = []; let candidates: unknown[] = []; let overrides: unknown[] = [];
  if (version) {
    const [serviceResult, candidateResult, overrideResult] = await Promise.all([
      context.supabase.from("stage_services").select("id,department,singer_target,choir_target").eq("version_id", version.id).order("department"),
      context.supabase.from("stage_candidates").select("person_type,term_student_id,staff_id,department,eligible,reason").eq("version_id", version.id),
      context.supabase.from("stage_overrides").select("term_student_id,kind,department,role").eq("version_id", version.id),
    ]);
    services = serviceResult.data ?? []; candidates = candidateResult.data ?? []; overrides = overrideResult.data ?? [];
    const ids = (services as Array<{ id: string }>).map((service) => service.id);
    if (ids.length) assignments = (await context.supabase.from("stage_assignments").select("service_id,person_type,term_student_id,staff_id,role,side,position_order,reason,is_manual").in("service_id", ids)).data ?? [];
  }
  const students = (roster ?? []).flatMap((item) => { const student = Array.isArray(item.students) ? item.students[0] : item.students; return student ? [{ id: item.id, name: student.name, gender: item.gender, department: item.service_department, team: item.team, isStudentLeader: item.is_student_leader }] : []; });
  return dataResponse({ plan, students, staff: staff ?? [], attendance: attendance ?? [], availability: availability ?? [], version, services, assignments, candidates, overrides, history }, { warnings: version?.warnings ?? [], revision: version?.revision ?? null });
}
