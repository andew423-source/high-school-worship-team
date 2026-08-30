import { requireAuthorizedUser } from "../../lib/auth";
import { first } from "../../db/runtime";
import TermHomeClient from "./terms/TermHomeClient";

export const dynamic = "force-dynamic";

export default async function ManageHome({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const [user, query] = await Promise.all([requireAuthorizedUser("/manage"), searchParams]);
  const initialEdit = user.role === "admin" && query.edit ? await first<{ id: string; name: string; start_date: string; end_date: string; eligible_statuses: string }>("SELECT id,name,start_date,end_date,eligible_statuses FROM terms WHERE id=?", [query.edit]) : null;
  return <TermHomeClient canManage={user.role === "admin"} initialEdit={initialEdit} />;
}
