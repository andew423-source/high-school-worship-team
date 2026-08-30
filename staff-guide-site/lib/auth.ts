import { redirect } from "next/navigation";
import { getChatGPTUser } from "../app/chatgpt-auth";
import { createId, first, now, run } from "../db/runtime";
import type { UserRole } from "./domain";

export type AuthorizedUser = { id: string; platformUserId: string; email: string; displayName: string; role: UserRole; staffId: string | null };

export async function resolveAuthorizedUser(): Promise<AuthorizedUser | null> {
  const platformUser = await getChatGPTUser();
  const identity = platformUser ?? (process.env.NODE_ENV !== "production" ? { userId: "local-preview", email: "preview@local", displayName: "미리보기 관리자", fullName: "미리보기 관리자" } : null);
  if (!identity) return null;
  const existing = await first<{ id: string; platform_user_id: string; email: string; display_name: string; role: UserRole; status: string; staff_id: string | null }>(
    "SELECT id, platform_user_id, email, display_name, role, status, staff_id FROM app_users WHERE platform_user_id = ?", [identity.userId]);
  if (existing?.status === "active") return { id: existing.id, platformUserId: existing.platform_user_id, email: existing.email, displayName: existing.display_name, role: existing.role, staffId: existing.staff_id };
  if (existing) return null;
  const adminCount = await first<{ count: number }>("SELECT COUNT(*) AS count FROM app_users WHERE role = 'admin' AND status = 'active'");
  const configuredAdmins = (process.env.ADMIN_EMAILS ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  const isBootstrapAdmin = configuredAdmins.includes(identity.email.toLowerCase()) || ((adminCount?.count ?? 0) === 0 && configuredAdmins.length === 0);
  const id = createId("user"); const timestamp = now();
  await run("INSERT INTO app_users (id, platform_user_id, email, display_name, role, status, staff_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)",
    [id, identity.userId, identity.email.toLowerCase(), identity.displayName, isBootstrapAdmin ? "admin" : "staff", isBootstrapAdmin ? "active" : "pending", timestamp, timestamp]);
  return isBootstrapAdmin ? { id, platformUserId: identity.userId, email: identity.email, displayName: identity.displayName, role: "admin", staffId: null } : null;
}

export async function requireAuthorizedUser(returnTo: string, roles?: UserRole[]) {
  const platformUser = await getChatGPTUser();
  if (!platformUser && process.env.NODE_ENV === "production") redirect(`/signin-with-chatgpt?return_to=${encodeURIComponent(returnTo)}`);
  const user = await resolveAuthorizedUser();
  if (!user) redirect("/access-pending");
  if (roles && !roles.includes(user.role)) redirect("/manage");
  return user;
}
