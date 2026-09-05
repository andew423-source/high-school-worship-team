import { z } from "zod";
import { staffImportSchema } from "@/domain/imports";
import { apiError, dataResponse, getAdminApiContext } from "@/lib/api";

const schema = z.object({ staff: staffImportSchema });

export async function POST(request: Request) {
  const context = await getAdminApiContext();
  if (context.error) return context.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "스탭 정보를 확인해주세요.");

  const { data, error } = await context.supabase.rpc("import_staff", { p_rows: [parsed.data.staff] });
  if (error) return apiError(error.code === "23505" ? "같은 이메일의 스탭이 이미 있습니다." : "스탭을 등록하지 못했습니다.", 400, error.code);
  return dataResponse({ importedCount: data }, { status: 201 });
}
