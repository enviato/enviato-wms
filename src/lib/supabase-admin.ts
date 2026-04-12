import { createClient } from "@supabase/supabase-js";
import { env, getServerEnv } from "./env";

/**
 * Server-only Supabase admin client using the service role key.
 * Bypasses RLS — use only in trusted, auth-gated API routes.
 */
export function createAdminClient() {
  const { SUPABASE_SERVICE_ROLE_KEY } = getServerEnv();

  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
