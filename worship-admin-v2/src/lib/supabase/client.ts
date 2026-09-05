"use client";
import { createBrowserClient } from "@supabase/ssr";
import { getPublicSupabaseEnv } from "@/lib/env";

export function createSupabaseBrowserClient() {
  const { supabaseUrl, supabaseKey } = getPublicSupabaseEnv();
  return createBrowserClient(supabaseUrl, supabaseKey);
}
