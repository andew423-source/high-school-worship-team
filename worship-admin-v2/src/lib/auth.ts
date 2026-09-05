import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "@/lib/env";
import { canManage, canUseStaffTools, type AppRole, type ProfileStatus } from "@/lib/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ViewerProfile = {
  id: string; email: string; display_name: string | null; role: AppRole;
  status: ProfileStatus; staff_id: string | null;
};
export type Viewer = { user: User; profile: ViewerProfile | null };

export async function getViewer(): Promise<Viewer | null> {
  if (!isSupabaseConfigured) return null;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles")
    .select("id,email,display_name,role,status,staff_id").eq("id", user.id).maybeSingle();
  return { user, profile: profile as ViewerProfile | null };
}

export async function requireViewer() {
  const viewer = await getViewer();
  if (!viewer) redirect("/");
  return viewer;
}
export async function requireAdmin() {
  const viewer = await requireViewer();
  if (!canManage(viewer.profile)) redirect("/auth/resolve");
  return viewer as Viewer & { profile: ViewerProfile };
}
export async function requireGroupStaff() {
  const viewer = await requireViewer();
  if (!canUseStaffTools(viewer.profile)) redirect("/auth/resolve");
  return viewer as Viewer & { profile: ViewerProfile };
}
