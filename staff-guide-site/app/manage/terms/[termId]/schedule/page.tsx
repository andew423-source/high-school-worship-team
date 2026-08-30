import { requireAuthorizedUser } from "../../../../../lib/auth";
import TermsClient from "../../TermsClient";
export default async function SchedulePage({ params }: { params: Promise<{ termId: string }> }) { const { termId } = await params; await requireAuthorizedUser(`/manage/terms/${termId}/schedule`, ["admin"]); return <TermsClient initialTermId={termId} />; }
