"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useState, useEffect, Suspense } from "react";
import { createClient } from "@/lib/supabase";
import {
  Home,
  Package,
  Users,
  BarChart3,
  Plane,
  FileText,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronsLeft,
  ChevronsRight,
  ArrowLeft,
  Building2,
  Shield,
  Network,
  Truck,
  Ship,
  Hash,
  MapPin,
  Tag,
  CircleDot,
  Printer,
  Bell,
  Trash2,
  type LucideIcon,
} from "lucide-react";

/* Permission key → nav items mapping */
const NAV_PERMISSIONS: Record<string, string> = {
  "/admin/packages": "packages:view",
  "/admin/customers": "customers:view",
  "/admin/awbs": "shipments:view",
  "/admin/invoices": "invoices:view",
  "/admin/analytics": "analytics:view",
  "/admin/settings": "settings:view",
};

/* Settings tab definitions */
const SETTINGS_TABS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "general", label: "General", icon: Building2 },
  { id: "users", label: "Users", icon: Users },
  { id: "roles", label: "Roles & Permissions", icon: Shield },
  { id: "agents", label: "Agents", icon: Network },
  { id: "couriers", label: "Shipping Carriers", icon: Truck },
  { id: "airlines", label: "Airlines", icon: Plane },
  { id: "ocean", label: "Ocean Carriers", icon: Ship },
  { id: "packageid", label: "Package ID", icon: Hash },
  { id: "locations", label: "Warehouse Locations", icon: MapPin },
  { id: "tags", label: "Tags", icon: Tag },
  { id: "statuses", label: "Statuses", icon: CircleDot },
  { id: "labels", label: "Label Editor", icon: Printer },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "trash", label: "Retained data", icon: Trash2 },
];

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: (collapsed: boolean) => void;
}

/** Settings tab list — uses useSearchParams so must be wrapped in <Suspense> */
function SettingsTabList({ onCloseMobile }: { onCloseMobile: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeSettingsTab = pathname.startsWith("/admin/settings/")
    ? pathname.replace("/admin/settings/", "").split("/")[0]
    : searchParams.get("tab") || "general";

  return (
    <>
      {SETTINGS_TABS.map((tab) => {
        const Icon = tab.icon;
        const active = activeSettingsTab === tab.id;
        return (
          <Link
            key={tab.id}
            href={`/admin/settings/${tab.id}`}
            onClick={onCloseMobile}
            className={`flex items-center gap-3 px-3 py-2 text-ui rounded transition-colors ${
              active
                ? "bg-primary/10 text-primary font-semibold"
                : "text-slate-600 hover:bg-slate-100 font-medium"
            }`}
          >
            <Icon
              size={18}
              strokeWidth={1.75}
              className={`shrink-0 ${active ? "text-primary" : "text-slate-400"}`}
            />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </>
  );
}

export default function Sidebar({ collapsed, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const isSettingsPage = pathname === "/admin/settings" || pathname.startsWith("/admin/settings/");

  const [mobileOpen, setMobileOpen] = useState(false);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userLoaded, setUserLoaded] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [orgLogo, setOrgLogo] = useState<string | null>(null);
  const [orgIcon, setOrgIcon] = useState<string | null>(null);

  useEffect(() => {
    const loadUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email || "");
        const { data } = await supabase
          .from("users")
          .select("first_name, last_name, role_v2, role_id")
          .eq("id", user.id)
          .single();
        if (data) {
          setUserName(`${data.first_name} ${data.last_name}`);
          setUserLoaded(true);
          setUserRole(data.role_v2);

          // Load org info for sidebar logo
          const { data: orgData, error: orgError } = await supabase
            .from("organizations")
            .select("name, logo_url, logo_icon_url")
            .limit(1)
            .single();
          if (orgError) {
            // logo_icon_url column may not exist yet — retry without it
            const { data: orgFallback } = await supabase
              .from("organizations")
              .select("name, logo_url")
              .limit(1)
              .single();
            if (orgFallback) {
              setOrgName(orgFallback.name || "");
              setOrgLogo(orgFallback.logo_url || null);
            }
          } else if (orgData) {
            setOrgName(orgData.name || "");
            setOrgLogo(orgData.logo_url || null);
            setOrgIcon(orgData.logo_icon_url || null);
          }

          if (
            data.role_v2 === "ORG_ADMIN" ||
            data.role_v2 === "WAREHOUSE_STAFF"
          ) {
            setPermissions(new Set(Object.values(NAV_PERMISSIONS)));
            setPermissionsLoaded(true);
            return;
          }

          if (data.role_id) {
            const { data: rolePerms } = await supabase
              .from("role_permissions")
              .select("permission_key")
              .eq("role_id", data.role_id);
            if (rolePerms) {
              setPermissions(
                new Set(
                  rolePerms.map(
                    (rp: { permission_key: string }) => rp.permission_key
                  )
                )
              );
            }
          }
          setPermissionsLoaded(true);
        }
      }
    };
    loadUser();
  }, [supabase]);

  // Force sidebar expanded when in settings mode
  useEffect(() => {
    if (isSettingsPage && collapsed) {
      onToggleCollapse(false);
    }
  }, [isSettingsPage, collapsed, onToggleCollapse]);

  const isActive = (path: string) => {
    if (path === "/admin") return pathname === "/admin";
    return pathname.startsWith(path);
  };

  const canSee = (href: string): boolean => {
    if (!permissionsLoaded) return false;
    const requiredPerm = NAV_PERMISSIONS[href];
    if (!requiredPerm) return true;
    if (userRole === "ORG_ADMIN" || userRole === "WAREHOUSE_STAFF") return true;
    return permissions.has(requiredPerm);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const closeMobile = () => setMobileOpen(false);

  const mainNavItems = [
    { icon: Home, label: "Dashboard", href: "/admin" },
    { icon: Package, label: "Packages", href: "/admin/packages" },
    { icon: Users, label: "Recipients", href: "/admin/customers" },
    { icon: Plane, label: "Shipments", href: "/admin/awbs" },
    { icon: FileText, label: "Invoices", href: "/admin/invoices" },
    { icon: BarChart3, label: "Analytics", href: "/admin/analytics" },
  ].filter((item) => canSee(item.href));

  const adminNavItems = [
    { icon: Settings, label: "Settings", href: "/admin/settings" },
  ].filter((item) => canSee(item.href));

  const sidebarWidth = isSettingsPage ? "w-64" : collapsed ? "w-16" : "w-64";
  const effectiveCollapsed = isSettingsPage ? false : collapsed;

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-50 p-2 bg-white border border-slate-200 rounded-lg shadow-sm cursor-pointer"
        aria-label="Open navigation"
      >
        <Menu size={20} className="text-slate-600" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/20 z-40 animate-fade-in"
          onClick={closeMobile}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full ${sidebarWidth} bg-white border-r border-slate-200 z-50 flex flex-col transition-all duration-300 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* Logo / Settings Header */}
        <div className={`border-b border-slate-200 ${effectiveCollapsed ? "py-3 flex items-center justify-center" : "p-4 flex items-center justify-between"}`}>
          {isSettingsPage ? (
            /* Settings mode header */
            <div className="flex items-center gap-2 flex-1">
              <button
                onClick={() => router.push("/admin")}
                className="p-1 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                aria-label="Back to dashboard"
              >
                <ArrowLeft size={16} className="text-slate-500" />
              </button>
              <Settings size={16} className="text-slate-400 shrink-0" />
              <span className="text-ui font-semibold text-slate-800 tracking-tight">
                Settings
              </span>
            </div>
          ) : effectiveCollapsed ? (
            /* Collapsed — logo icon only, click to expand */
            <button
              onClick={() => onToggleCollapse(false)}
              className="cursor-pointer hover:opacity-80 transition-opacity"
              aria-label="Expand sidebar"
            >
              {orgIcon ? (
                <img src={orgIcon} alt={orgName || "Logo"} className="h-7 w-7 object-contain" />
              ) : orgLogo ? (
                <img src={orgLogo} alt={orgName || "Logo"} className="h-7 w-7 object-contain" />
              ) : (
                <svg viewBox="0 0 100 100" className="w-7 h-7">
                  <path d="M55 10 L90 10 L90 45 Z" fill="#3c83f6" />
                  <path d="M10 55 L45 90 L10 90 Z" fill="#ef4444" />
                </svg>
              )}
            </button>
          ) : (
            /* Expanded — full logo + collapse chevron */
            <>
              <div className="flex items-center min-w-0">
                {orgLogo ? (
                  <img src={orgLogo} alt={orgName || "Logo"} className="h-8 max-w-[140px] object-contain shrink-0" />
                ) : orgIcon ? (
                  <div className="flex items-center gap-2">
                    <img src={orgIcon} alt={orgName || "Logo"} className="h-7 w-7 object-contain shrink-0" />
                    <span className="text-ui font-semibold text-slate-800 tracking-tight">{orgName || "enviato"}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <svg viewBox="0 0 100 100" className="w-7 h-7 shrink-0">
                      <path d="M55 10 L90 10 L90 45 Z" fill="#3c83f6" />
                      <path d="M10 55 L45 90 L10 90 Z" fill="#ef4444" />
                    </svg>
                    <span className="text-ui font-semibold text-slate-800 tracking-tight">{orgName || "enviato"}</span>
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  onToggleCollapse(true);
                  closeMobile();
                }}
                className="hidden lg:flex p-1 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                aria-label="Collapse sidebar"
              >
                <ChevronsLeft size={16} className="text-slate-400" />
              </button>
            </>
          )}
          {/* Mobile close */}
          <button
            onClick={closeMobile}
            className="lg:hidden p-1 hover:bg-slate-100 rounded transition-colors cursor-pointer"
            aria-label="Close navigation"
          >
            <X size={18} className="text-slate-400" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-1">
          {isSettingsPage ? (
            /* Settings navigation tabs — Suspense-wrapped because SettingsTabList reads useSearchParams */
            <Suspense fallback={
              <div className="space-y-1">
                {SETTINGS_TABS.map((tab) => (
                  <div key={tab.id} className="h-9 bg-slate-100 rounded animate-pulse" />
                ))}
              </div>
            }>
              <SettingsTabList onCloseMobile={closeMobile} />
            </Suspense>
          ) : (
            /* Normal navigation */
            <>
              {mainNavItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={closeMobile}
                    className={`flex items-center gap-3 px-3 py-2 text-ui rounded transition-colors ${
                      active
                        ? "bg-primary/10 text-primary font-semibold"
                        : "text-slate-600 hover:bg-slate-100 font-medium"
                    } ${effectiveCollapsed ? "justify-center px-0" : ""}`}
                    title={effectiveCollapsed ? item.label : undefined}
                  >
                    <Icon
                      size={20}
                      strokeWidth={1.75}
                      className={`shrink-0 ${active ? "text-primary" : "text-slate-400"}`}
                    />
                    {!effectiveCollapsed && <span>{item.label}</span>}
                  </Link>
                );
              })}

              {/* Administration section */}
              {adminNavItems.length > 0 && (
                <>
                  {!effectiveCollapsed && (
                    <div className="pt-4 pb-1 px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Administration
                    </div>
                  )}
                  {effectiveCollapsed && <div className="pt-3" />}
                  {adminNavItems.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={closeMobile}
                        className={`flex items-center gap-3 px-3 py-2 text-ui rounded transition-colors ${
                          active
                            ? "bg-primary/10 text-primary font-semibold"
                            : "text-slate-600 hover:bg-slate-100 font-medium"
                        } ${effectiveCollapsed ? "justify-center px-0" : ""}`}
                        title={effectiveCollapsed ? item.label : undefined}
                      >
                        <Icon
                          size={20}
                          strokeWidth={1.75}
                          className={`shrink-0 ${active ? "text-primary" : "text-slate-400"}`}
                        />
                        {!effectiveCollapsed && <span>{item.label}</span>}
                      </Link>
                    );
                  })}
                </>
              )}
            </>
          )}
        </nav>

        {/* User profile footer */}
        <div className="mt-auto border-t border-slate-200">
          <button
            onClick={() => router.push("/admin/profile")}
            className="w-full p-4 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer text-left"
          >
            <div className={`flex items-center gap-3 ${effectiveCollapsed ? "justify-center" : ""}`}>
              <div className="w-9 h-9 rounded-full bg-slate-200 border border-slate-200 shadow-sm shrink-0" />
              {!effectiveCollapsed && (
                <div className="overflow-hidden">
                  {userLoaded ? (
                    <>
                      <p className="text-ui-sm font-semibold truncate text-slate-800">
                        {userName}
                      </p>
                      <p className="text-meta text-slate-500 truncate" style={{ fontWeight: 400 }}>
                        {userEmail}
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="h-3.5 w-24 bg-slate-200 rounded animate-pulse" />
                      <div className="h-2.5 w-32 bg-slate-100 rounded animate-pulse mt-1" />
                    </>
                  )}
                </div>
              )}
            </div>
          </button>
        </div>
      </aside>
    </>
  );
}
