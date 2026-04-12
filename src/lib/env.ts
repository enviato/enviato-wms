/**
 * Server-only environment variable validation.
 *
 * IMPORTANT: Do NOT use this module for NEXT_PUBLIC_ vars in client code.
 * Next.js inlines NEXT_PUBLIC_ vars at build time via static analysis of
 * `process.env.NEXT_PUBLIC_*` — wrapping them in a module breaks that.
 * Use `process.env.NEXT_PUBLIC_SUPABASE_URL!` directly in client files.
 *
 * This module is for server-only secrets (like the service role key) that
 * should throw immediately if missing.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Add it to .env.local (or your hosting provider's env config).`
    );
  }
  return value;
}

/**
 * Server-only env vars. Only call from server context (API routes, middleware).
 * Throws immediately if the value is missing.
 */
export function getServerEnv() {
  return {
    SUPABASE_SERVICE_ROLE_KEY: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  };
}
