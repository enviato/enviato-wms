/**
 * Client-side helper to call the admin delete API route.
 * The API route verifies the caller is ORG_ADMIN and uses
 * the service role key to bypass RLS for the delete.
 */
export async function adminDelete(
  table: string,
  ids: string[]
): Promise<{ deleted: string[]; failed: { id: string; message: string }[] }> {
  const res = await fetch("/api/admin/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ table, ids }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Delete failed (${res.status})`);
  }

  return res.json();
}
