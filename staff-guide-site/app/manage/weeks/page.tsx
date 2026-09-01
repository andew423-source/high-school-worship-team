import { requireAuthorizedUser } from "../../../lib/auth";
import StaffWeekHome from "./StaffWeekHome";

export const dynamic = "force-dynamic";

export default async function WeeksPage() {
  await requireAuthorizedUser("/manage/weeks");
  return <StaffWeekHome />;
}
