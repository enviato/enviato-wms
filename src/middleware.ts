import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options: CookieOptions;
          }[]
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Handle magic link auth code exchange on ANY route
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    await supabase.auth.exchangeCodeForSession(code);
    // After exchanging, redirect to admin dashboard (clean URL)
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    url.searchParams.delete("code");
    // We need to build a redirect response with the updated cookies
    const redirectResponse = NextResponse.redirect(url);
    // Copy cookies from supabaseResponse to redirectResponse
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value);
    });
    return redirectResponse;
  }

  // Refresh session — this is required for Server Components
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // If not logged in and trying to access dashboard, redirect to login
  if (!user && pathname.startsWith("/admin")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // If logged in and on login page, redirect to dashboard
  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    return NextResponse.redirect(url);
  }

  // ── Server-side role enforcement for admin routes (MT-3) ──
  // Only ORG_ADMIN and WAREHOUSE_STAFF (and custom-role users with
  // relevant permissions) may access /admin pages. Customer-role users
  // are redirected to a future /portal route (or /login for now).
  //
  // PERF (migration 015): role_v2 and role_id are injected into the
  // JWT's app_metadata by the `custom_access_token_hook` Postgres
  // function. We read them straight off the already-verified JWT
  // to avoid a per-request round-trip to public.users. If the claim
  // is absent (hook disabled, or user signed in before hook was
  // enabled and their token hasn't refreshed yet), we fall back to
  // the DB query so the middleware stays correct.
  if (user && pathname.startsWith("/admin")) {
    const appMeta = user.app_metadata as
      | { role_v2?: string | null; role_id?: string | null }
      | undefined;
    let role: string | null | undefined = appMeta?.role_v2;
    let roleId: string | null | undefined = appMeta?.role_id;

    // Fallback: JWT didn't carry the claim (hook not enabled yet,
    // or stale token). One DB hit here, but only on the transition
    // window — normal steady-state path above skips this.
    if (role === undefined) {
      const { data: profile } = await supabase
        .from("users")
        .select("role_v2, role_id")
        .eq("id", user.id)
        .single();
      role = profile?.role_v2 ?? null;
      roleId = profile?.role_id ?? null;
    }

    const hasAdminRole = role === "ORG_ADMIN" || role === "WAREHOUSE_STAFF";
    const hasCustomRole = !!roleId; // custom roles are permission-gated client-side

    if (!hasAdminRole && !hasCustomRole) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("reason", "unauthorized");
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
