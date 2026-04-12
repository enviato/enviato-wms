"use client";

import Sidebar from "@/components/Sidebar";
import { useState } from "react";
import { usePathname } from "next/navigation";
import QueryProvider from "@/shared/contexts/QueryProvider";
import AuthProvider from "@/shared/contexts/AuthProvider";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const pathname = usePathname();
  const isSettingsPage = pathname === "/admin/settings" || pathname.startsWith("/admin/settings/");

  // When in settings, sidebar is always expanded (w-64)
  const effectiveCollapsed = isSettingsPage ? false : sidebarCollapsed;

  return (
    <QueryProvider>
      <AuthProvider>
        <div className="flex h-screen w-full">
          <Sidebar collapsed={sidebarCollapsed} onToggleCollapse={setSidebarCollapsed} />
          <main className={`flex-1 flex flex-col min-w-0 bg-background-light transition-[margin] duration-300 ${effectiveCollapsed ? "lg:ml-16" : "lg:ml-64"}`}>
            {children}
          </main>
        </div>
      </AuthProvider>
    </QueryProvider>
  );
}
