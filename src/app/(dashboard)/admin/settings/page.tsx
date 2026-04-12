"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Redirect /admin/settings to /admin/settings/general.
 * Also handles legacy ?tab=xxx URLs for backward compat.
 */
export default function SettingsRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const tab = searchParams.get("tab") || "general";
    router.replace(`/admin/settings/${tab}`);
  }, [router, searchParams]);

  return null;
}
