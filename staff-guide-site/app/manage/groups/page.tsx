import { requireAuthorizedUser } from "../../../lib/auth";
import GroupsClient from "./GroupsClient";
export default async function GroupsPage() { await requireAuthorizedUser("/manage/groups", ["admin"]); return <GroupsClient />; }
