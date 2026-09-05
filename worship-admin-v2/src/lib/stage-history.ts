import type { SupabaseClient } from "@supabase/supabase-js";
import type { StageHistory } from "@/domain/stage";

export async function loadStageHistory(supabase: SupabaseClient, termId: string, sundayDate: string) {
  const { data: plans } = await supabase.from("stage_plans").select("id,sunday_date").eq("term_id", termId).lt("sunday_date", sundayDate).order("sunday_date", { ascending: false });
  if (!plans?.length) return {} as Record<string, StageHistory>;
  const { data: versions } = await supabase.from("stage_versions").select("id,plan_id,version_no,leader_type,leader_term_student_id").in("plan_id", plans.map((plan) => plan.id)).eq("kind", "CONFIRMED");
  const latestByPlan = new Map<string, NonNullable<typeof versions>[number]>();
  for (const version of versions ?? []) if (!latestByPlan.has(version.plan_id) || (latestByPlan.get(version.plan_id)?.version_no ?? 0) < version.version_no) latestByPlan.set(version.plan_id, version);
  const orderedVersions = plans.map((plan) => latestByPlan.get(plan.id)).filter((version): version is NonNullable<typeof versions>[number] => Boolean(version));
  if (!orderedVersions.length) return {} as Record<string, StageHistory>;
  const { data: services } = await supabase.from("stage_services").select("id,version_id").in("version_id", orderedVersions.map((version) => version.id));
  const { data: assignments } = services?.length ? await supabase.from("stage_assignments").select("service_id,term_student_id,person_type,role").in("service_id", services.map((service) => service.id)).eq("person_type", "STUDENT") : { data: [] };
  const versionByService = new Map((services ?? []).map((service) => [service.id, service.version_id]));
  const stageSets = new Map<string, Set<string>>(); const singerSets = new Map<string, Set<string>>();
  for (const version of orderedVersions) {
    stageSets.set(version.id, new Set(version.leader_type === "STUDENT" && version.leader_term_student_id ? [version.leader_term_student_id] : []));
    singerSets.set(version.id, new Set());
  }
  for (const assignment of assignments ?? []) {
    if (!assignment.term_student_id) continue; const versionId = versionByService.get(assignment.service_id); if (!versionId) continue;
    stageSets.get(versionId)?.add(assignment.term_student_id); if (assignment.role === "SINGER") singerSets.get(versionId)?.add(assignment.term_student_id);
  }
  const previousVersion = orderedVersions[0];
  const { data: previousCandidates } = await supabase.from("stage_candidates").select("term_student_id,eligible,person_type").eq("version_id", previousVersion.id).eq("person_type", "STUDENT");
  const previouslyEligible = new Set((previousCandidates ?? []).filter((candidate) => candidate.eligible && candidate.term_student_id).map((candidate) => candidate.term_student_id as string));
  const allIds = new Set<string>(); for (const set of stageSets.values()) for (const id of set) allIds.add(id); for (const id of previouslyEligible) allIds.add(id);
  const history: Record<string, StageHistory> = {};
  for (const id of allIds) {
    const totalCount = [...stageSets.values()].filter((set) => set.has(id)).length;
    const singerCount = [...singerSets.values()].filter((set) => set.has(id)).length;
    history[id] = {
      totalCount, singerCount,
      stagedPreviousTwo: orderedVersions.length >= 2 && orderedVersions.slice(0, 2).every((version) => stageSets.get(version.id)?.has(id)),
      singerPreviousTwo: orderedVersions.length >= 2 && orderedVersions.slice(0, 2).every((version) => singerSets.get(version.id)?.has(id)),
      missedPrevious: previouslyEligible.has(id) && !stageSets.get(previousVersion.id)?.has(id),
    };
  }
  return history;
}
