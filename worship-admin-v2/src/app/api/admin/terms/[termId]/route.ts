import { z } from "zod";
import { apiError, dataResponse, getAdminApiContext } from "@/lib/api";

const updateSchema = z.object({ status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]) });

export async function PATCH(request: Request, { params }: { params: Promise<{ termId: string }> }) {
  const context = await getAdminApiContext();
  if (context.error) return context.error;
  const { termId } = await params;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!z.uuid().safeParse(termId).success || !parsed.success) return apiError("학기 상태 요청이 올바르지 않습니다.");

  const { data, error } = await context.supabase.rpc("set_term_status", { p_term_id: termId, p_status: parsed.data.status });
  if (error) return apiError("학기 상태를 바꾸지 못했습니다.", 500, error.code);
  return dataResponse(data, { revision: data?.updated_at ?? null });
}
