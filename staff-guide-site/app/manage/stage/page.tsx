import { requireAuthorizedUser } from "../../../lib/auth";
import StageClient from "./StageClient";
export default async function StagePage({ searchParams }: { searchParams: Promise<{ termId?: string; meetingId?: string }> }) { const query = await searchParams; await requireAuthorizedUser("/manage/stage", ["admin", "group_staff"]); return <StageClient initialTermId={query.termId ?? ""} initialMeetingId={query.meetingId ?? ""} />; }
