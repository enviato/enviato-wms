/**
 * Environment variable validation.
 * Import this in layout or middleware to fail fast on missing config.
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

/** Validated env vars — import these instead of using process.env directly. */
export const env = {
  NEXT_PUBLIC_SUPABASE_URL: requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
} as const;

/**
 * Server-only env vars. Only call from server context (API routes, middleware).
 * Lazy-evaluated to avoid errors in client bundles.
 */
export function getServerEnv() {
  return {
    SUPABASE_SERVICE_ROLE_KEY: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  };
}
