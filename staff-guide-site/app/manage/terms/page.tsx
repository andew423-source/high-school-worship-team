import { requireAuthorizedUser } from "../../../lib/auth";
import TermsClient from "./TermsClient";
export default async function TermsPage() { await requireAuthorizedUser("/manage/terms", ["admin"]); return <TermsClient />; }
