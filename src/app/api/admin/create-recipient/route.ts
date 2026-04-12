import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createAdminClient } from "@/lib/supabase-admin";
import { createRateLimiter } from "@/shared/lib/rate-limit";
import { checkCsrf } from "@/shared/lib/csrf";

const limiter = createRateLimiter({ windowMs: 60_000, max: 30 });

/**
 * Server-side route to create a recipient (customer) user.
 *
 * Uses the admin / service-role client so that:
 *  1. An auth.users entry is created (satisfies the FK on public.users.id).
 *  2. The public.users row is inserted bypassing RLS.
 *
 * Handles re-creation after deletion: if an auth.users entry exists but
 * the public.users row was deleted, it reuses the auth id.
 */
export async function POST(req: NextRequest) {
  const csrf = checkCsrf(req);
  if (csrf) return csrf;
  const limited = limiter.check(req);
  if (limited) return limited;
  try {
    /* ── 1. Authenticate the caller ── */
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
            // API routes don't need to set cookies
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

    /* ── 2. Check caller is ORG_ADMIN or WAREHOUSE_STAFF ── */
    const { data: profile } = await supabase
      .from("users")
      .select("role_v2, org_id")
      .eq("id", user.id)
      .single();

    if (!profile || !["ORG_ADMIN", "WAREHOUSE_STAFF"].includes(profile.role_v2 || "")) {
      return NextResponse.json(
        { error: "Forbidden — only admins can create recipients" },
        { status: 403 }
      );
    }

    /* ── 3. Parse body ── */
    const body = await req.json();
    const { first_name, last_name, email, phone, agent_id, aliases, is_active } = body as {
      first_name: string;
      last_name: string;
      email: string;
      phone: string | null;
      agent_id: string | null;
      aliases: string[];
      is_active: boolean;
    };

    if (!first_name || !last_name || !email) {
      return NextResponse.json(
        { error: "Missing required fields: first_name, last_name, email" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    /* ── 4. Check if a public.users row already exists for this email ── */
    const { data: existingPublic } = await admin
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingPublic) {
      return NextResponse.json(
        { error: `A recipient with email ${email} already exists` },
        { status: 409 }
      );
    }

    /* ── 5. Try to create auth user ── */
    let authId: string;

    const { data: authUser, error: authError } =
      await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        password: crypto.randomUUID(),
        user_metadata: { first_name, last_name },
      });

    if (authError) {
      const msg = authError.message || "";
      const isEmailTaken =
        msg.includes("already been registered") ||
        msg.includes("already exists") ||
        msg.includes("unique constraint");

      if (!isEmailTaken) {
        return NextResponse.json({ error: msg }, { status: 500 });
      }

      // Auth user exists (orphaned from a previous delete) — find their id
      // Use paginated search with a per_page of 1 to be efficient
      const { data: listData } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });

      const matchedAuth = listData?.users?.find(
        (u) => u.email?.toLowerCase() === email.toLowerCase()
      );

      if (!matchedAuth) {
        return NextResponse.json(
          { error: "Email is registered in auth but could not be located. Please contact support." },
          { status: 500 }
        );
      }

      authId = matchedAuth.id;
    } else {
      authId = authUser.user.id;
    }

    /* ── 6. Insert public.users row ── */
    const { data: newUser, error: insertError } = await admin
      .from("users")
      .insert({
        id: authId,
        first_name,
        last_name,
        email,
        phone: phone || null,
        agent_id: agent_id || null,
        aliases: aliases || [],
        role: "customer",
        is_active: is_active ?? true,
        org_id: profile.org_id,
      })
      .select("id")
      .single();

    if (insertError) {
      // Only clean up auth if we just created it (not if it was pre-existing)
      if (!authError) {
        await admin.auth.admin.deleteUser(authId);
      }
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ id: newUser.id });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    console.error("Create recipient error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
