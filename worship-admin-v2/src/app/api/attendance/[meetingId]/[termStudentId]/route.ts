import { z } from "zod";
import { apiError, dataResponse, getOperationalApiContext } from "@/lib/api";

const schema = z.object({ status: z.enum(["PRESENT", "LATE", "ABSENT"]).nullable(), expectedRevision: z.string().datetime({ offset: true }).nullable() });
export async function PATCH(request: Request, { params }: { params: Promise<{ meetingId: string; termStudentId: string }> }) {
  const context = await getOperationalApiContext(); if (context.error) return context.error;
  const { meetingId, termStudentId } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !z.uuid().safeParse(meetingId).success || !z.uuid().safeParse(termStudentId).success) return apiError("출결 변경 요청을 확인해주세요.");
  const { data, error } = await context.supabase.rpc("set_attendance", { p_meeting_id: meetingId, p_term_student_id: termStudentId, p_status: parsed.data.status, p_expected_updated_at: parsed.data.expectedRevision });
  if (error) {
    if (error.message.includes("forbidden")) return apiError("이 학생의 출결을 수정할 권한이 없습니다. 승인 상태와 확정된 조 편성을 확인해주세요.", 403, "forbidden");
    const conflict = error.message.includes("revision_conflict");
    const cancelled = error.message.includes("cancelled_meeting");
    return apiError(conflict ? "다른 스탭이 먼저 출결을 수정했습니다. 최신 값을 다시 불러옵니다." : cancelled ? "휴강일에는 출결을 입력할 수 없습니다." : "출결을 저장하지 못했습니다.", conflict ? 409 : 400, error.code);
  }
  return dataResponse(data, { revision: data.revision });
}
