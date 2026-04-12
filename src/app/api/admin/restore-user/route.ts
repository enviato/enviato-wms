import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * Restore a soft-deleted user: unban their auth account so they can log in again.
 * The `deleted_at` / `deleted_by` columns are cleared by the client before calling this.
 */
export async function POST(req: NextRequest) {
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
      .select("role_v2")
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
