import { requireAuthorizedUser } from "../../../lib/auth";
import AttendanceClient from "./AttendanceClient";
export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ termId?: string; meetingId?: string }> }) { const query = await searchParams; await requireAuthorizedUser("/manage/attendance", ["admin", "group_staff"]); return <AttendanceClient initialTermId={query.termId ?? ""} initialMeetingId={query.meetingId ?? ""} />; }
