import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { canManage } from "@/lib/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  decision: z.enum(["APPROVED", "DISABLED"]),
  staffId: z.uuid().optional(),
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
}).refine((value) => value.decision !== "APPROVED" || Boolean(value.staffId), {
  message: "승인할 때는 스탭 연결이 필요합니다.", path: ["staffId"],
});

export async function PATCH(request: NextRequest, context: RouteContext<"/api/admin/access-requests/[id]">) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "로그인이 필요합니다." } }, { status: 401 });
  if (!canManage(viewer.profile)) return NextResponse.json({ error: { code: "FORBIDDEN", message: "운영자 권한이 필요합니다." } }, { status: 403 });
  const { id } = await context.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "승인 요청 정보가 올바르지 않습니다. 화면을 새로고침한 뒤 다시 시도해주세요." } }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("review_access_request", {
    request_id: id,
    staff_id: parsed.data.staffId ?? null,
    decision: parsed.data.decision,
    expected_updated_at: parsed.data.expectedUpdatedAt,
  });
  if (error) {
    const conflict = error.message.includes("revision_conflict");
    return NextResponse.json({ error: { code: conflict ? "REVISION_CONFLICT" : "REVIEW_FAILED", message: conflict ? "다른 운영자가 먼저 변경했습니다. 새로고침 후 다시 시도해주세요." : error.message } }, { status: conflict ? 409 : 400 });
  }
  const result = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ data: result, warnings: [], revision: result?.updated_at ?? null });
}
