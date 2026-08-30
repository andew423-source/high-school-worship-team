import { requireAuthorizedUser } from "../../../lib/auth";
import GroupsClient from "./GroupsClient";
export default async function GroupsPage({ searchParams }: { searchParams: Promise<{ termId?: string }> }) { const query = await searchParams; await requireAuthorizedUser("/manage/groups", ["admin"]); return <GroupsClient initialTermId={query.termId ?? ""} />; }
