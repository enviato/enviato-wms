import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createAdminClient } from "@/lib/supabase-admin";
import { createRateLimiter } from "@/shared/lib/rate-limit";
import { checkCsrf } from "@/shared/lib/csrf";

const limiter = createRateLimiter({ windowMs: 60_000, max: 20 });

/**
 * Restore a soft-deleted user: clear deleted_at/deleted_by and unban their auth account.
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

    // Verify target user belongs to caller's org
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

    // Clear soft-delete flags server-side (don't rely on client)
    const { error: restoreError } = await admin
      .from("users")
      .update({ deleted_at: null, deleted_by: null })
      .eq("id", userId);

    if (restoreError) {
      console.error("Failed to restore user row:", restoreError);
      return NextResponse.json({ error: restoreError.message }, { status: 500 });
    }

    // Unban the auth user so they can log in again
    const { error } = await admin.auth.admin.updateUserById(userId, {
      ban_duration: "none",
    });

    if (error) {
      console.error("Failed to unban auth user:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("Restore user error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
