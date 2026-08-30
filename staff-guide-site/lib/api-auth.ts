import { resolveAuthorizedUser } from "./auth";
import type { UserRole } from "./domain";

export async function requireApiUser(roles?: UserRole[]) {
  const user = await resolveAuthorizedUser();
  if (!user) return { user: null, error: Response.json({ error: "로그인이 필요하거나 승인 대기 중입니다." }, { status: 401 }) };
  if (roles && !roles.includes(user.role)) return { user: null, error: Response.json({ error: "이 작업을 수행할 권한이 없습니다." }, { status: 403 }) };
  return { user, error: null };
}

export function jsonError(message: string, status = 400) { return Response.json({ error: message }, { status }); }
