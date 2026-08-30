import { requireAuthorizedUser } from "../../../lib/auth";
import StageClient from "./StageClient";
export default async function StagePage({ searchParams }: { searchParams: Promise<{ termId?: string }> }) { const query = await searchParams; await requireAuthorizedUser("/manage/stage", ["admin"]); return <StageClient initialTermId={query.termId ?? ""} />; }
