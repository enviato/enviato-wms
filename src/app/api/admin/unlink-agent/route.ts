import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * Unlinks a child agent from its parent by calling the unlink_agent RPC.
 * Uses SECURITY DEFINER function to bypass all RLS/PostgREST restrictions.
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate caller
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

    // 2. Check caller is org_admin or warehouse_staff
    const { data: profile } = await supabase
      .from("users")
      .select("role_v2")
      .eq("id", user.id)
      .single();

    if (
      !profile ||
      !["ORG_ADMIN", "WAREHOUSE_STAFF"].includes(profile.role_v2 || "")
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 3. Parse request
    const { parent_agent_id, child_agent_id } = await req.json();
    if (!parent_agent_id || !child_agent_id) {
      return NextResponse.json(
        { error: "Missing parent_agent_id or child_agent_id" },
        { status: 400 }
      );
    }

    // 4. Call RPC function (SECURITY DEFINER, bypasses RLS entirely)
    const admin = createAdminClient();
    const { error } = await admin.rpc("unlink_agent", {
      p_parent_id: parent_agent_id,
      p_child_id: child_agent_id,
    });

    if (error) {
      console.error("Unlink agent RPC error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("Unlink agent error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
