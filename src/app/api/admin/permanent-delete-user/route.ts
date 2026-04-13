import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createAdminClient } from "@/lib/supabase-admin";
import { createRateLimiter } from "@/shared/lib/rate-limit";
import { checkCsrf } from "@/shared/lib/csrf";
import { logger } from "@/shared/lib/logger";

const limiter = createRateLimiter({ windowMs: 60_000, max: 10 });

/**
 * Permanently delete a user: removes the user row AND their auth account.
 * This should only be called for users already in the trash (deleted_at != null).
 * FK constraints with ON DELETE SET NULL will automatically clear package references.
 */
export async function POST(req: NextRequest) {
  const csrf = checkCsrf(req);
  if (csrf) return csrf;
  const limited = limiter.check(req);
  if (limited) return limited;

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return req.cookies.getAll();
          },
          setAll() {},
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("users")
      .select("role_v2, org_id")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role_v2 !== "ORG_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { userId } = await req.json();
    if (!userId) {
      return NextResponse.json(
        { error: "Missing userId" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // Verify target user belongs to caller's org before permanent deletion
    const { data: targetUser } = await admin
      .from("users")
      .select("org_id, deleted_at")
      .eq("id", userId)
      .single();

    if (!targetUser || targetUser.org_id !== profile.org_id) {
      return NextResponse.json(
        { error: "Forbidden — user does not belong to your organization" },
        { status: 403 }
      );
    }

    if (!targetUser.deleted_at) {
      return NextResponse.json(
        { error: "User must be soft-deleted (in trash) before permanent deletion" },
        { status: 400 }
      );
    }

    // 1. Hard-delete the user row (FK ON DELETE SET NULL clears package references)
    const { error: deleteError } = await admin
      .from("users")
      .delete()
      .eq("id", userId);

    if (deleteError) {
      logger.error("Failed to delete user row", deleteError);
      return NextResponse.json(
        { error: deleteError.message },
        { status: 500 }
      );
    }

    // 2. Delete the auth account
    try {
      await admin.auth.admin.deleteUser(userId);
    } catch (authErr) {
      logger.warn("Failed to delete auth user (may already be removed)", { error: authErr });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    logger.error("Permanent delete user error", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
