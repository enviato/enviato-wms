"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import SearchableSelect from "@/components/SearchableSelect";
import {
  Plus,
  Trash2,
  Save,
  Loader2,
  X,
  Check,
  Shield,
  Lock,
  Package,
  Plane,
  UserRound,
  Receipt,
  Users,
  Building2,
  Settings,
  type LucideIcon,
} from "lucide-react";

type CustomRole = {
  id: string;
  org_id: string;
  name: string;
  description: string;
  base_role: string;
  is_system: boolean;
  created_at: string;
};

type PermissionKey = {
  id: string;
  category: string;
  description: string;
  is_hard_constraint: boolean;
};

type User = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  role: string;
  role_v2: string | null;
  courier_group_id: string | null;
  agent_id: string | null;
  role_id: string | null;
  is_active: boolean;
};

const ROLE_V2_OPTIONS = [
  { value: "ORG_ADMIN", label: "Org Admin", color: "bg-purple-50 text-purple-700", dot: "bg-purple-500" },
  { value: "WAREHOUSE_STAFF", label: "Warehouse Staff", color: "bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  { value: "AGENT_ADMIN", label: "Agent Admin", color: "bg-blue-50 text-blue-700", dot: "bg-blue-500" },
  { value: "AGENT_STAFF", label: "Agent Staff", color: "bg-slate-100 text-slate-600", dot: "bg-slate-400" },
];

const PERMISSION_CATEGORIES: { key: string; label: string; Icon: LucideIcon; bg: string; fg: string }[] = [
  { key: "packages", label: "Packages", Icon: Package, bg: "bg-amber-50", fg: "text-amber-600" },
  { key: "shipments", label: "Shipments", Icon: Plane, bg: "bg-sky-50", fg: "text-sky-600" },
  { key: "recipients", label: "Recipients", Icon: UserRound, bg: "bg-violet-50", fg: "text-violet-600" },
  { key: "invoices", label: "Invoices", Icon: Receipt, bg: "bg-emerald-50", fg: "text-emerald-600" },
  { key: "users", label: "Users", Icon: Users, bg: "bg-blue-50", fg: "text-blue-600" },
  { key: "agents", label: "Agents", Icon: Building2, bg: "bg-rose-50", fg: "text-rose-600" },
  { key: "settings", label: "Settings", Icon: Settings, bg: "bg-slate-100", fg: "text-slate-500" },
];

export default function RoleSettings() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [savingRole, setSavingRole] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // Roles state
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [selectedRole, setSelectedRole] = useState<CustomRole | null>(null);
  const [selectedRolePerms, setSelectedRolePerms] = useState<string[]>([]);
  const [editingRolePerms, setEditingRolePerms] = useState<Record<string, boolean>>({});

  // Create role modal state
  const [createRoleOpen, setCreateRoleOpen] = useState(false);
  const [createRoleForm, setCreateRoleForm] = useState({ name: "", description: "", base_role: "AGENT_STAFF" });

  // Permission keys and users (needed for permissions matrix and user count)
  const [permissionKeys, setPermissionKeys] = useState<PermissionKey[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(""), 3000);
  };

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(""), 4000);
  };

  // Load all required data
  useEffect(() => {
    const load = async () => {
      try {
        // Load permission keys
        const { data: permKeysData } = await supabase
          .from("permission_keys")
          .select("*")
          .order("category, id");
        if (permKeysData) setPermissionKeys(permKeysData);

        // Load users (for counting users per role)
        const { data: usersData } = await supabase.from("users").select("*");
        if (usersData) setUsers(usersData);

        // Load custom roles
        const { data: rolesData } = await supabase
          .from("roles")
          .select("*")
          .order("is_system", { ascending: false })
          .order("name");
        if (rolesData) setCustomRoles(rolesData);
      } catch (error) {
        console.error("Error loading role data:", error);
        showError("Failed to load role data");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [supabase]);

  // Load permissions for selected role
  const loadRolePermissions = async (role: CustomRole) => {
    setSelectedRole(role);
    try {
      const { data } = await supabase
        .from("role_permissions")
        .select("permission_key")
        .eq("role_id", role.id);
      const permKeys = (data || []).map((r) => r.permission_key);
      setSelectedRolePerms(permKeys);
      const permMap: Record<string, boolean> = {};
      permissionKeys.forEach((pk) => {
        permMap[pk.id] = permKeys.includes(pk.id);
      });
      setEditingRolePerms(permMap);
    } catch (error) {
      console.error("Error loading role permissions:", error);
      showError("Failed to load role permissions");
    }
  };

  // Create role
  const handleCreateRole = async () => {
    const org = customRoles[0]?.org_id;
    if (!org || !createRoleForm.name.trim()) {
      showError("Invalid input");
      return;
    }
    setSavingRole(true);
    try {
      const { data: newRole, error } = await supabase
        .from("roles")
        .insert({
          org_id: org,
          name: createRoleForm.name.trim(),
          description: createRoleForm.description.trim(),
          base_role: createRoleForm.base_role,
          is_system: false,
        })
        .select()
        .single();
      if (error) {
        showError(error.message.includes("duplicate") ? "A role with this name already exists" : error.message);
        return;
      }
      if (newRole) {
        setCreateRoleOpen(false);
        setCreateRoleForm({ name: "", description: "", base_role: "AGENT_STAFF" });
        const { data: rolesData } = await supabase
          .from("roles")
          .select("*")
          .order("is_system", { ascending: false })
          .order("name");
        if (rolesData) setCustomRoles(rolesData);
        await loadRolePermissions(newRole);
        showSuccess("Role created — now configure permissions");
      }
    } catch (error) {
      console.error("Error creating role:", error);
      showError("Failed to create role");
    } finally {
      setSavingRole(false);
    }
  };

  // Save role permissions
  const handleSaveRolePermissions = async () => {
    if (!selectedRole) return;
    setSavingRole(true);
    try {
      // Delete all existing
      await supabase.from("role_permissions").delete().eq("role_id", selectedRole.id);
      // Insert checked ones
      const grantedKeys = Object.entries(editingRolePerms)
        .filter(([, v]) => v)
        .map(([k]) => k);
      if (grantedKeys.length > 0) {
        await supabase.from("role_permissions").insert(
          grantedKeys.map((pk) => ({ role_id: selectedRole.id, permission_key: pk }))
        );
      }
      setSelectedRolePerms(grantedKeys);
      showSuccess("Role permissions saved");
    } catch (error) {
      console.error("Error saving role permissions:", error);
      showError("Failed to save permissions");
    } finally {
      setSavingRole(false);
    }
  };

  // Delete role
  const handleDeleteRole = async (role: CustomRole) => {
    if (role.is_system) {
      showError("System roles cannot be deleted");
      return;
    }
    const assignedCount = users.filter((u) => u.role_id === role.id).length;
    if (assignedCount > 0) {
      showError(`Cannot delete: ${assignedCount} user(s) assigned to this role`);
      return;
    }
    try {
      await supabase.from("roles").delete().eq("id", role.id);
      setCustomRoles(customRoles.filter((r) => r.id !== role.id));
      if (selectedRole?.id === role.id) {
        setSelectedRole(null);
        setSelectedRolePerms([]);
        setEditingRolePerms({});
      }
      showSuccess("Role deleted");
    } catch (error) {
      console.error("Error deleting role:", error);
      showError("Failed to delete role");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-txt-tertiary" />
      </div>
    );
  }

  return (
    <>
      {/* Toast messages */}
      {successMessage && (
        <div className="mb-4 px-4 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-ui">
          {successMessage}
        </div>
      )}
      {errorMessage && (
        <div className="mb-4 px-4 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-ui">
          {errorMessage}
        </div>
      )}

      <div className="flex gap-4">
        {/* Left: Role list */}
        <div className="w-72 flex-shrink-0">
          <div className="bg-white border border-border rounded-lg shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="text-ui font-semibold text-txt-primary">Roles</h2>
              </div>
              <button
                onClick={() => setCreateRoleOpen(true)}
                className="btn-primary flex items-center gap-2 text-meta py-1.5 px-2.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Create role
              </button>
            </div>
            <div className="divide-y divide-border">
              {customRoles.map((role) => {
                const badge = ROLE_V2_OPTIONS.find((o) => o.value === role.base_role);
                const assignedCount = users.filter((u) => u.role_id === role.id).length;
                return (
                  <div
                    key={role.id}
                    onClick={() => loadRolePermissions(role)}
                    className={`px-4 py-3 cursor-pointer transition-colors hover:bg-surface-hover ${
                      selectedRole?.id === role.id ? "bg-primary/5 border-l-2 border-l-primary" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-ui font-medium text-txt-primary flex-1">{role.name}</span>
                      {role.is_system && <span title="System role"><Shield className="w-3 h-3 text-txt-placeholder" /></span>}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-meta font-medium ${badge?.color || "bg-gray-100 text-gray-600"}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${badge?.dot || "bg-gray-400"}`} />
                        {badge?.label || role.base_role}
                      </span>
                      <span className="text-meta text-txt-placeholder">
                        {assignedCount} user{assignedCount !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Permission matrix */}
        <div className="flex-1">
          {selectedRole ? (
            <div className="bg-white border border-border rounded-lg shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <div>
                  <h2 className="text-ui font-semibold text-txt-primary">{selectedRole.name}</h2>
                  {selectedRole.description && (
                    <p className="text-muted text-txt-tertiary mt-0.5">{selectedRole.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!selectedRole.is_system && (
                    <button
                      onClick={() => handleDeleteRole(selectedRole)}
                      className="p-1.5 text-txt-tertiary hover:text-red-500 hover:bg-red-50 rounded transition-colors cursor-pointer"
                      title="Delete role"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={handleSaveRolePermissions}
                    disabled={savingRole}
                    className="btn-primary flex items-center gap-2 text-meta py-1.5 px-3"
                  >
                    {savingRole ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    Save
                  </button>
                </div>
              </div>

              {selectedRole.is_system && (
                <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5">
                  <p className="text-ui text-amber-700 font-medium">
                    System role — changes here will affect all users assigned to this role.
                  </p>
                </div>
              )}

              <div className="px-4 py-4 space-y-4">
                {PERMISSION_CATEGORIES.map((cat) => {
                  const catPerms = permissionKeys.filter((pk) => pk.category === cat.key);
                  if (catPerms.length === 0) return null;
                  return (
                    <div key={cat.key} className="border border-border rounded-md overflow-hidden">
                      <div className="bg-surface-secondary px-3 py-2.5 flex items-center gap-2.5">
                        <div className={`w-6 h-6 rounded-md ${cat.bg} flex items-center justify-center flex-shrink-0`}>
                          <cat.Icon className={`w-3.5 h-3.5 ${cat.fg}`} />
                        </div>
                        <span className="text-ui font-medium text-txt-secondary tracking-tight">
                          {cat.label}
                        </span>
                      </div>
                      <div className="px-3 py-2 space-y-1.5">
                        {catPerms.map((pk) => {
                          const isChecked = editingRolePerms[pk.id] || false;
                          return (
                            <label
                              key={pk.id}
                              className="flex items-center gap-2.5 py-1 px-1 rounded transition-colors cursor-pointer hover:bg-surface-hover"
                              onClick={(e) => {
                                e.preventDefault();
                                setEditingRolePerms({
                                  ...editingRolePerms,
                                  [pk.id]: !isChecked,
                                });
                              }}
                            >
                              <div
                                className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                                  isChecked
                                    ? "bg-primary border-primary"
                                    : "border-border-dark bg-white"
                                }`}
                              >
                                {isChecked && <Check className="w-3 h-3 text-white" />}
                              </div>
                              <span
                                className={`text-ui-sm flex-1 ${
                                  isChecked
                                    ? "text-txt-primary font-medium"
                                    : "text-txt-tertiary"
                                }`}
                              >
                                {pk.id.split(":")[1]?.replace(/_/g, " ") || pk.id}
                              </span>
                              {pk.is_hard_constraint && (
                                <span title="Hard constraint">
                                  <Lock className="w-3 h-3 text-txt-placeholder" />
                                </span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="bg-white border border-border rounded-md flex items-center justify-center py-20">
              <div className="text-center">
                <Shield className="w-10 h-10 text-txt-placeholder mx-auto mb-3" />
                <p className="text-ui-sm text-txt-tertiary">
                  Select a role to view and edit permissions
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Create Role Modal ── */}
      {createRoleOpen && (
        <div className="modal-overlay z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="modal-panel max-w-md w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-ui font-semibold text-txt-primary">
                Create custom role
              </h3>
              <button
                onClick={() => setCreateRoleOpen(false)}
                className="p-1 text-txt-tertiary hover:text-txt-primary transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">
                  Role name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Agent Staff — Shipments Only"
                  value={createRoleForm.name}
                  onChange={(e) =>
                    setCreateRoleForm({ ...createRoleForm, name: e.target.value })
                  }
                  className="form-input"
                />
              </div>
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">
                  Description
                </label>
                <input
                  type="text"
                  placeholder="Brief description of this role"
                  value={createRoleForm.description}
                  onChange={(e) =>
                    setCreateRoleForm({
                      ...createRoleForm,
                      description: e.target.value,
                    })
                  }
                  className="form-input"
                />
              </div>
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">
                  Base access level
                </label>
                <SearchableSelect
                  value={createRoleForm.base_role}
                  onChange={(v) =>
                    setCreateRoleForm({ ...createRoleForm, base_role: v })
                  }
                  searchable={false}
                  options={ROLE_V2_OPTIONS.map((r) => ({
                    value: r.value,
                    label: r.label,
                  }))}
                />
                <p className="text-meta text-txt-placeholder mt-1">
                  Base level determines database-level access scope. Permissions
                  further refine what this role can do.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setCreateRoleOpen(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateRole}
                disabled={savingRole || !createRoleForm.name.trim()}
                className="btn-primary flex items-center gap-2"
              >
                {savingRole ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                Create role
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
