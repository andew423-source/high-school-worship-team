import { requireAuthorizedUser } from "../../../lib/auth";
import AttendanceClient from "./AttendanceClient";
export default async function AttendancePage() { await requireAuthorizedUser("/manage/attendance", ["admin", "group_staff"]); return <AttendanceClient />; }
