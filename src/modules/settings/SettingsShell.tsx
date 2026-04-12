"use client";

/**
 * SettingsShell — Shared wrapper for settings sub-modules.
 * Provides the standard settings card container and toast notifications.
 *
 * Usage:
 *   import SettingsShell from "@/modules/settings/SettingsShell";
 *
 *   export default function MySettingsTab() {
 *     return (
 *       <SettingsShell>
 *         <div>Tab content here</div>
 *       </SettingsShell>
 *     );
 *   }
 *
 * This component is used by extracted sub-modules. The monolithic settings
 * page does NOT use this — it has its own container. As tabs are extracted,
 * they switch to using SettingsShell.
 */

import type { ReactNode } from "react";

interface SettingsShellProps {
  children: ReactNode;
}

export default function SettingsShell({ children }: SettingsShellProps) {
  return <div className="space-y-4">{children}</div>;
}
