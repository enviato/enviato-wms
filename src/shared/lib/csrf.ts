import { NextRequest, NextResponse } from "next/server";

/**
 * Origin-based CSRF protection for API routes.
 *
 * Verifies the request's Origin (or Referer) header matches
 * the app's own hostname. Blocks cross-origin POST/PUT/DELETE
 * requests that could be triggered by malicious sites.
 *
 * Usage:
 *   const csrfError = checkCsrf(req);
 *   if (csrfError) return csrfError;
 */
export function checkCsrf(req: NextRequest): NextResponse | null {
  // Only enforce on state-changing methods
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    return null;
  }

  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const host = req.headers.get("host") || req.nextUrl.host;

  // Origin header is the most reliable (set by browsers on cross-origin requests)
  if (origin) {
    try {
      const originHost = new URL(origin).host;
      if (originHost === host) return null;
    } catch {
      // Invalid origin URL — reject
    }
    return NextResponse.json(
      { error: "Forbidden — cross-origin request blocked" },
      { status: 403 }
    );
  }

  // Fall back to Referer if Origin is absent (some browsers omit Origin on same-origin)
  if (referer) {
    try {
      const refererHost = new URL(referer).host;
      if (refererHost === host) return null;
    } catch {
      // Invalid referer — reject
    }
    return NextResponse.json(
      { error: "Forbidden — cross-origin request blocked" },
      { status: 403 }
    );
  }

  // No Origin or Referer — allow for now (direct API tools, curl, etc.)
  // In strict mode, you could reject these too.
  return null;
}
