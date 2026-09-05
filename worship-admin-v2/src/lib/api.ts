import { canManage, canUseStaffTools } from "@/lib/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export function apiError(message: string, status = 400, code = "invalid_request") {
  return Response.json({ error: { code, message } }, { status });
}

export async function getAdminApiContext() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: apiError("로그인이 필요합니다.", 401, "unauthorized") } as const;

  const { data: profile } = await supabase.from("profiles")
    .select("id,role,status")
    .eq("id", user.id)
    .maybeSingle();
  if (!canManage(profile)) return { error: apiError("운영자 권한이 필요합니다.", 403, "forbidden") } as const;

  return { supabase, user, error: null } as const;
}

export async function getOperationalApiContext() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: apiError("로그인이 필요합니다.", 401, "unauthorized") } as const;
  const { data: profile } = await supabase.from("profiles")
    .select("id,role,status,staff_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!canManage(profile) && !canUseStaffTools(profile)) {
    return { error: apiError("승인된 스탭 권한이 필요합니다.", 403, "forbidden") } as const;
  }
  return { supabase, user, profile: profile!, error: null } as const;
}

export function dataResponse<T>(data: T, options?: { warnings?: string[]; revision?: string | number | null; status?: number }) {
  return Response.json({
    data,
    warnings: options?.warnings ?? [],
    revision: options?.revision ?? null,
  }, { status: options?.status ?? 200 });
}
