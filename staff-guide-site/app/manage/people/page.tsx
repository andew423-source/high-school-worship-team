import { requireAuthorizedUser } from "../../../lib/auth";
import PeopleClient from "./PeopleClient";
export default async function PeoplePage() { await requireAuthorizedUser("/manage/people"); return <PeopleClient />; }
