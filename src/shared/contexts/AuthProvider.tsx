"use client";

import {
  createContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase";
import type { User, Organization, UserRole } from "@/shared/types/database";
import type { AuthUser, AuthState, PermissionSet } from "@/shared/types/auth";

// ─── Context Types ───────────────────────────────────────────────

interface AuthContextValue extends AuthState {
  /** Reload user + org data (e.g., after profile edit) */
  refresh: () => Promise<void>;
  /** Sign out and redirect to login */
  signOut: () => Promise<void>;
  /** Permission set with role and permission checking */
  permissionSet: PermissionSet;
}

const DEFAULT_PERMISSION_SET: PermissionSet = {
  role: null,
  isAdmin: false,
  permissions: new Set(),
  hasPermission: () => false,
};

const AuthContext = createContext<AuthContextValue>({
  authUser: null,
  user: null,
  org: null,
  loading: true,
  isAuthenticated: false,
  refresh: async () => {},
  signOut: async () => {},
  permissionSet: DEFAULT_PERMISSION_SET,
});

export { AuthContext };

// ─── Provider Component ──────────────────────────────────────────

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [org, setOrg] = useState<Organization | null>(null);
  const [permissionSet, setPermissionSet] = useState<PermissionSet>(DEFAULT_PERMISSION_SET);
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  const loadAuthData = useCallback(async () => {
    try {
      // 1. Get auth user
      const {
        data: { user: supaUser },
      } = await supabase.auth.getUser();

      if (!supaUser) {
        setAuthUser(null);
        setUser(null);
        setOrg(null);
        setPermissionSet(DEFAULT_PERMISSION_SET);
        setLoading(false);
        return;
      }

      setAuthUser({ id: supaUser.id, email: supaUser.email || "" });

      // 2. Fetch user profile + org in parallel
      const [userResult, orgResult] = await Promise.all([
        supabase
          .from("users")
          .select("id, first_name, last_name, email, phone, role_v2, role_id, courier_group_id, agent_id, is_active, email_notifications")
          .eq("id", supaUser.id)
          .single(),
        // Fetch org — try with logo_icon_url first, fallback without
        supabase
          .from("organizations")
          .select("id, name, slug, logo_url, logo_icon_url, plan_tier, settings, address_line1, address_line2, city, state, zip, country, phone, email")
          .limit(1)
          .single(),
      ]);

      const userData = userResult.data as User | null;
      let orgData = orgResult.data as Organization | null;

      // Fallback if logo_icon_url column doesn't exist yet
      if (orgResult.error && !orgData) {
        const { data: orgFallback } = await supabase
          .from("organizations")
          .select("id, name, slug, logo_url, plan_tier, settings, address_line1, address_line2, city, state, zip, country, phone, email")
          .limit(1)
          .single();
        orgData = orgFallback
          ? { ...orgFallback, logo_icon_url: null } as Organization
          : null;
      }

      setUser(userData);
      setOrg(orgData);

      // 3. Build permission set
      if (userData) {
        const role = userData.role_v2 as UserRole | null;
        const isAdmin = role === "ORG_ADMIN" || role === "WAREHOUSE_STAFF";

        if (isAdmin) {
          // Admin roles get all permissions
          const allPerms = new Set([
            "packages:view",
            "customers:view",
            "shipments:view",
            "invoices:view",
            "analytics:view",
            "settings:view",
          ]);
          setPermissionSet({
            role,
            isAdmin: true,
            permissions: allPerms,
            hasPermission: () => true,
          });
        } else if (userData.role_id) {
          // Custom role — fetch permissions from role_permissions
          const { data: rolePerms } = await supabase
            .from("role_permissions")
            .select("permission_key")
            .eq("role_id", userData.role_id);

          const permKeys = new Set(
            (rolePerms || []).map((rp: { permission_key: string }) => rp.permission_key)
          );

          setPermissionSet({
            role,
            isAdmin: false,
            permissions: permKeys,
            hasPermission: (key: string) => permKeys.has(key),
          });
        } else {
          // No role assignment
          setPermissionSet({
            role,
            isAdmin: false,
            permissions: new Set(),
            hasPermission: () => false,
          });
        }
      }
    } catch (error) {
      console.error("AuthProvider: Failed to load auth data", error);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  // Load on mount
  useEffect(() => {
    loadAuthData();
  }, [loadAuthData]);

  // Listen for auth state changes (sign in, sign out, token refresh)
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setAuthUser(null);
        setUser(null);
        setOrg(null);
        setPermissionSet(DEFAULT_PERMISSION_SET);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setAuthUser(null);
    setUser(null);
    setOrg(null);
    setPermissionSet(DEFAULT_PERMISSION_SET);
    window.location.href = "/login";
  }, [supabase]);

  const value: AuthContextValue = {
    authUser,
    user,
    org,
    loading,
    isAuthenticated: !!authUser,
    refresh: loadAuthData,
    signOut,
    permissionSet,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
