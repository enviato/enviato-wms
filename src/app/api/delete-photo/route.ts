import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createAdminClient } from "@/lib/supabase-admin";

const BUCKET = "package-photos";

/**
 * Delete a photo from Supabase Storage.
 *
 * Expects JSON body: { public_id: string }
 * public_id is the storage path used in Supabase Storage.
 */
export async function POST(req: NextRequest) {
  try {
    /* ── 1. Authenticate ── */
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return req.cookies.getAll();
          },
          setAll(
            cookiesToSet: {
              name: string;
              value: string;
              options: CookieOptions;
            }[]
          ) {
            // no-op for API routes
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    /* ── 2. Role check ── */
    const { data: profile } = await supabase
      .from("users")
      .select("role_v2")
      .eq("id", user.id)
      .single();

    if (!profile || !["ORG_ADMIN", "WAREHOUSE_STAFF"].includes(profile.role_v2)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    /* ── 3. Parse body ── */
    const { public_id } = (await req.json()) as { public_id: string };

    if (!public_id) {
      return NextResponse.json(
        { error: "Missing public_id" },
        { status: 400 }
      );
    }

    // Validate path — prevent directory traversal attacks
    if (public_id.includes("..") || public_id.includes("/")) {
      return NextResponse.json(
        { error: "Invalid storage path" },
        { status: 400 }
      );
    }

    /* ── 4. Delete from storage ── */
    const admin = createAdminClient();

    // Delete from Supabase Storage
    if (public_id) {
      const { error: deleteError } = await admin.storage
        .from(BUCKET)
        .remove([public_id]);

      if (deleteError) {
        console.warn("Storage delete warning:", deleteError.message);
        // Don't fail the request — the DB record will still be cleaned up by the caller
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Delete failed";
    console.error("Photo delete error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
