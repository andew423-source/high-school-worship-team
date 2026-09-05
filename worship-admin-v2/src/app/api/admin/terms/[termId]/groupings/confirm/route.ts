import { z } from "zod";
import { apiError, dataResponse, getAdminApiContext } from "@/lib/api";

const schema = z.object({ versionId: z.uuid(), expectedRevision: z.number().int().positive(), force: z.boolean().default(false) });
export async function POST(request: Request, { params }: { params: Promise<{ termId: string }> }) {
  const context = await getAdminApiContext(); if (context.error) return context.error;
  const { termId } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return apiError("확정 요청을 확인해주세요.");
  const { data: source } = await context.supabase.from("grouping_versions").select("id,term_id,warnings").eq("id", parsed.data.versionId).eq("term_id", termId).maybeSingle();
  if (!source) return apiError("편성안을 찾을 수 없습니다.", 404, "not_found");
  const warnings = Array.isArray(source.warnings) ? source.warnings as string[] : [];
  if (warnings.length && !parsed.data.force) return Response.json({ error: { code: "confirmation_required", message: "경고가 있는 편성안입니다." }, warnings, revision: parsed.data.expectedRevision }, { status: 409 });
  const { data, error } = await context.supabase.rpc("confirm_grouping_version", { p_version_id: parsed.data.versionId, p_expected_revision: parsed.data.expectedRevision, p_ignored_warnings: parsed.data.force ? warnings : [] });
  if (error) return apiError(error.message.includes("revision_conflict") ? "편성안이 변경되었습니다. 새로고침 후 다시 시도해주세요." : "편성안을 확정하지 못했습니다.", error.message.includes("revision_conflict") ? 409 : 500, error.code);
  return dataResponse(data, { warnings, revision: data.revision, status: 201 });
}
