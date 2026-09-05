import { z } from "zod";
import { apiError, dataResponse, getAdminApiContext } from "@/lib/api";

const schema = z.object({
  type: z.enum(["TOGETHER", "APART", "TOP_SEED", "GENDER_MIN", "GRADE_MIN", "TEAM_MIN"]),
  memberIds: z.array(z.uuid()).default([]), value: z.string().trim().nullable().optional(), minCount: z.number().int().positive().nullable().optional(),
}).superRefine((value, context) => {
  if (["TOGETHER", "APART"].includes(value.type) && value.memberIds.length < 2) context.addIssue({ code: "custom", message: "학생을 2명 이상 선택해주세요." });
  if (value.type === "TOP_SEED" && value.memberIds.length < 1) context.addIssue({ code: "custom", message: "톱시드 학생을 선택해주세요." });
  if (value.type.endsWith("_MIN") && (!value.value || !value.minCount)) context.addIssue({ code: "custom", message: "적용 대상과 최소 인원을 입력해주세요." });
  if (value.type === "GENDER_MIN" && !["FEMALE", "MALE"].includes(value.value ?? "")) context.addIssue({ code: "custom", message: "성별 조건을 확인해주세요." });
  if (value.type === "GRADE_MIN" && !["1", "2", "3"].includes(value.value ?? "")) context.addIssue({ code: "custom", message: "학년 조건을 확인해주세요." });
  if (value.type === "TEAM_MIN" && !["SINGER", "SESSION"].includes(value.value ?? "")) context.addIssue({ code: "custom", message: "팀 조건을 확인해주세요." });
});

export async function POST(request: Request, { params }: { params: Promise<{ termId: string }> }) {
  const context = await getAdminApiContext(); if (context.error) return context.error;
  const { termId } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "조건을 확인해주세요.");
  if (parsed.data.memberIds.length) {
    const { data: members } = await context.supabase.from("term_students").select("id").eq("term_id", termId).in("id", parsed.data.memberIds);
    if ((members ?? []).length !== new Set(parsed.data.memberIds).size) return apiError("현재 학기에 속한 학생만 조건에 추가할 수 있습니다.", 409, "invalid_rule_member");
  }
  const { data: rule, error } = await context.supabase.from("grouping_rules").insert({
    term_id: termId, type: parsed.data.type, value: parsed.data.type.endsWith("_MIN") ? parsed.data.value : null,
    min_count: parsed.data.type.endsWith("_MIN") ? parsed.data.minCount : null, created_by: context.user.id,
  }).select("*").single();
  if (error) {
    const schemaMissing = error.code === "PGRST205" || error.code === "42P01";
    return apiError(
      schemaMissing
        ? "조 편성 데이터베이스 설정이 아직 적용되지 않았습니다. grouping 마이그레이션을 먼저 실행해주세요."
        : "조건을 저장하지 못했습니다.",
      schemaMissing ? 503 : 500,
      error.code,
    );
  }
  if (parsed.data.memberIds.length) {
    const { error: memberError } = await context.supabase.from("grouping_rule_members").insert(parsed.data.memberIds.map((termStudentId) => ({ rule_id: rule.id, term_student_id: termStudentId })));
    if (memberError) {
      await context.supabase.from("grouping_rules").delete().eq("id", rule.id);
      return apiError("선택한 학생 조건을 저장하지 못했습니다.", 500, memberError.code);
    }
  }
  return dataResponse({ ...rule, memberIds: parsed.data.memberIds }, { status: 201 });
}
