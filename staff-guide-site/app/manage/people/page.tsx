import { requireAuthorizedUser } from "../../../lib/auth";
import PeopleClient from "./PeopleClient";
export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ termId?: string }> }) { const query = await searchParams; await requireAuthorizedUser("/manage/people"); return <PeopleClient initialTermId={query.termId ?? ""} />; }
