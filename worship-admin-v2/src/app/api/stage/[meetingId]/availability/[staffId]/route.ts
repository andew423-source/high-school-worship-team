import { z } from "zod";
import { apiError, dataResponse, getOperationalApiContext } from "@/lib/api";

const schema = z.object({ present: z.boolean(), stageRole: z.enum(["SINGER", "SESSION"]), expectedRevision: z.string().datetime({ offset: true }).nullable() });
export async function PATCH(request: Request, { params }: { params: Promise<{ meetingId: string; staffId: string }> }) {
  const context = await getOperationalApiContext(); if (context.error) return context.error;
  const { meetingId, staffId } = await params; const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("스탭 참석 정보를 확인해주세요.");
  const { data: plan } = await context.supabase.from("stage_plans").select("id").eq("meeting_id", meetingId).maybeSingle(); if (!plan) return apiError("등단 주차를 찾을 수 없습니다.", 404);
  const { data, error } = await context.supabase.rpc("set_stage_staff_availability", { p_plan_id: plan.id, p_staff_id: staffId, p_present: parsed.data.present, p_stage_role: parsed.data.stageRole, p_expected_updated_at: parsed.data.expectedRevision });
  if (error) return apiError(error.message.includes("revision_conflict") ? "다른 스탭이 먼저 수정했습니다. 최신 값을 불러옵니다." : "스탭 참석 정보를 저장하지 못했습니다.", error.message.includes("revision_conflict") ? 409 : 400, error.code);
  return dataResponse(data, { revision: data.revision });
}
