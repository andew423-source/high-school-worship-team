import { apiError, dataResponse, getAdminApiContext } from "@/lib/api";

export async function DELETE(_request: Request, { params }: { params: Promise<{ termId: string; ruleId: string }> }) {
  const context = await getAdminApiContext(); if (context.error) return context.error;
  const { termId, ruleId } = await params;
  const { error } = await context.supabase.from("grouping_rules").delete().eq("id", ruleId).eq("term_id", termId);
  if (error) return apiError("조건을 삭제하지 못했습니다.", 500, error.code);
  return dataResponse({ id: ruleId });
}
