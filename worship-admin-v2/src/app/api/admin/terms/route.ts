import { z } from "zod";
import { apiError, dataResponse, getAdminApiContext } from "@/lib/api";
import { saturdayDates } from "@/domain/terms";

const createTermSchema = z.object({
  name: z.string().trim().min(1).max(100),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  status: z.enum(["DRAFT", "ACTIVE"]).default("DRAFT"),
  lateCountsAsPresent: z.boolean().default(false),
}).refine((value) => value.startDate <= value.endDate, { message: "종료일은 시작일보다 빠를 수 없습니다." });

export async function POST(request: Request) {
  const context = await getAdminApiContext();
  if (context.error) return context.error;

  const parsed = createTermSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "학기 정보를 확인해주세요.");
  const dates = saturdayDates(parsed.data.startDate, parsed.data.endDate);
  if (!dates.length) return apiError("선택한 기간에 토요일이 없습니다.");

  const { data, error } = await context.supabase.rpc("create_term_with_meetings", {
    p_name: parsed.data.name,
    p_start_date: parsed.data.startDate,
    p_end_date: parsed.data.endDate,
    p_status: parsed.data.status,
    p_late_counts_as_present: parsed.data.lateCountsAsPresent,
  });
  if (error) return apiError("학기를 만들지 못했습니다. 잠시 후 다시 시도해주세요.", 500, error.code);
  return dataResponse({ term: data, meetingCount: dates.length }, { revision: data?.updated_at ?? null, status: 201 });
}
