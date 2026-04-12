/**
 * Lightweight logger for production error handling.
 *
 * Currently logs to console. Replace the implementation with Sentry/LogRocket
 * when an error service is set up (AU-6).
 *
 * Usage:
 *   import { logger } from "@/shared/lib/logger";
 *   logger.error("Failed to load packages", error);
 *   logger.warn("Fallback query used", { table: "users" });
 */

type LogContext = Record<string, unknown>;

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Unknown error";
}

export const logger = {
  error(message: string, error?: unknown, context?: LogContext) {
    // TODO: Replace with Sentry.captureException() when integrated
    if (process.env.NODE_ENV === "development") {
      console.error(`[ERROR] ${message}`, error, context);
    } else {
      // In production, still log but could send to external service
      console.error(`[ERROR] ${message}:`, formatError(error));
    }
  },

  warn(message: string, context?: LogContext) {
    if (process.env.NODE_ENV === "development") {
      console.warn(`[WARN] ${message}`, context);
    }
  },

  info(message: string, context?: LogContext) {
    if (process.env.NODE_ENV === "development") {
      console.info(`[INFO] ${message}`, context);
    }
  },
};

/**
 * Helper to extract a user-friendly message from a Supabase error.
 */
export function supabaseErrorMessage(error: { message?: string; code?: string }): string {
  if (error.code === "PGRST116") return "Record not found";
  if (error.code === "23503") return "This record has dependent data — remove it first";
  if (error.code === "23505") return "A record with this value already exists";
  if (error.code === "42501") return "You don't have permission for this action";
  return error.message || "An unexpected error occurred";
}
