import { requireAuthorizedUser } from "../../../lib/auth";
import StageClient from "./StageClient";
export default async function StagePage() { await requireAuthorizedUser("/manage/stage", ["admin"]); return <StageClient />; }
