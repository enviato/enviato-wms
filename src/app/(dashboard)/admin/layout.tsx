// Force all /admin routes to render dynamically (server-side).
// These pages require authentication and use client-side hooks like
// useSearchParams, so they must never be statically prerendered.
export const dynamic = "force-dynamic";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
