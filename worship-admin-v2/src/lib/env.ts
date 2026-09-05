const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

export function getPublicSupabaseEnv() {
  if (!supabaseUrl || !supabaseKey) throw new Error("Supabase 환경 변수가 설정되지 않았습니다.");
  return { supabaseUrl, supabaseKey };
}
