import { z } from "zod";
import { apiError, dataResponse, getAdminApiContext } from "@/lib/api";

const schema = z.object({ isCancelled: z.boolean() });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAdminApiContext();
  if (context.error) return context.error;
  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!z.uuid().safeParse(id).success || !parsed.success) return apiError("모임 변경 요청이 올바르지 않습니다.");

  const { data, error } = await context.supabase.from("meetings")
    .update({ is_cancelled: parsed.data.isCancelled })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return apiError("모임 상태를 바꾸지 못했습니다.", 500, error.code);
  return dataResponse(data, { revision: data.updated_at });
}
