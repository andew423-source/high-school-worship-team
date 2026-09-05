import { z } from "zod";
import { apiError, dataResponse, getAdminApiContext } from "@/lib/api";

const schema = z.object({
  termId: z.uuid(),
  meetingDate: z.iso.date(),
  title: z.string().trim().min(1).max(100).default("찬양팀 임시 모임"),
});

export async function POST(request: Request) {
  const context = await getAdminApiContext();
  if (context.error) return context.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "모임 정보를 확인해주세요.");

  const { data: latest } = await context.supabase.from("meetings")
    .select("sequence")
    .eq("term_id", parsed.data.termId)
    .order("sequence", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await context.supabase.from("meetings").insert({
    term_id: parsed.data.termId,
    sequence: (latest?.sequence ?? 0) + 1,
    meeting_date: parsed.data.meetingDate,
    title: parsed.data.title,
    kind: "EXTRA",
  }).select("*").single();
  if (error) return apiError(error.code === "23505" ? "같은 날짜의 모임이 이미 있습니다." : "임시 모임을 추가하지 못했습니다.", 400, error.code);
  return dataResponse(data, { revision: data.updated_at, status: 201 });
}
