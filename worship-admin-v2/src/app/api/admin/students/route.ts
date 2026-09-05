import { z } from "zod";
import { studentImportSchema } from "@/domain/imports";
import { apiError, dataResponse, getAdminApiContext } from "@/lib/api";

const schema = z.object({ termId: z.uuid(), student: studentImportSchema });

export async function POST(request: Request) {
  const context = await getAdminApiContext();
  if (context.error) return context.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "학생 정보를 확인해주세요.");

  const { data, error } = await context.supabase.rpc("import_term_students", {
    p_term_id: parsed.data.termId,
    p_rows: [parsed.data.student],
  });
  if (error) return apiError(error.code === "23505" ? "같은 내부 ID 또는 이미 등록된 학생입니다." : "학생을 등록하지 못했습니다.", 400, error.code);
  return dataResponse({ importedCount: data }, { status: 201 });
}
