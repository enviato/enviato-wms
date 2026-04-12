"use client";

import { useContext } from "react";
import { AuthContext } from "@/shared/contexts/AuthProvider";

/**
 * Access auth state: current user, org, loading, permissions.
 *
 * Usage:
 *   const { user, org, loading, isAuthenticated, signOut, refresh } = useAuth();
 *
 * Replaces the pattern of calling supabase.auth.getUser() + fetching user profile
 * + fetching org data independently on every page.
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
