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
  Eye,
  Mail,
  Power,
  AlertTriangle,
  UserCog,
  Search,
} from "lucide-react";

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

type CustomRole = {
  id: string;
  org_id: string;
  name: string;
  description: string;
  base_role: string;
  is_system: boolean;
  created_at: string;
};

type Agent = {
  id: string;
  org_id: string;
  name: string;
  status: string;
  created_at: string;
  agent_code: string | null;
  company_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  website: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  country: string;
  zip_code: string | null;
};

type AgentEdge = {
  parent_agent_id: string;
  child_agent_id: string;
  org_id: string;
};

const ROLE_V2_OPTIONS = [
  { value: "ORG_ADMIN", label: "Org Admin", color: "bg-purple-50 text-purple-700", dot: "bg-purple-500" },
  { value: "WAREHOUSE_STAFF", label: "Warehouse Staff", color: "bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  { value: "AGENT_ADMIN", label: "Agent Admin", color: "bg-blue-50 text-blue-700", dot: "bg-blue-500" },
  { value: "AGENT_STAFF", label: "Agent Staff", color: "bg-slate-100 text-slate-600", dot: "bg-slate-400" },
];

export default function UserSettings() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // User data
  const [users, setUsers] = useState<User[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentEdges, setAgentEdges] = useState<AgentEdge[]>([]);
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);

  // Search and selection state
  const [userSearch, setUserSearch] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [showBatchUserAction, setShowBatchUserAction] = useState(false);
  const [batchUserActionLoading, setBatchUserActionLoading] = useState(false);

  // Invite form state
  const [inviteFormOpen, setInviteFormOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    role: "AGENT_STAFF",
    roleId: "",
    agentId: "",
  });
  const [inviteError, setInviteError] = useState("");
  const [inviting, setInviting] = useState(false);

  // User editor state
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    role_v2: "",
    agent_id: "",
    role_id: "",
  });
  const [savingUser, setSavingUser] = useState(false);
  const [resendingInvite, setResendingInvite] = useState(false);

  // Delete confirmation
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(""), 3000);
  };

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(""), 4000);
  };

  // Load all data
  useEffect(() => {
    const load = async () => {
      try {
        const { data: usersData } = await supabase.from("users").select("*").neq("role", "customer").is("deleted_at", null);
        if (usersData) setUsers(usersData);

        const { data: agentsData } = await supabase.from("agents").select("*").eq("status", "active").is("deleted_at", null).order("name");
        if (agentsData) setAgents(agentsData);

        const { data: edgesData } = await supabase.from("agent_edges").select("*");
        if (edgesData) setAgentEdges(edgesData);

        const { data: rolesData } = await supabase.from("roles").select("*").order("is_system", { ascending: false }).order("name");
        if (rolesData) setCustomRoles(rolesData);
      } catch (error) {
        console.error("Error loading user settings data:", error);
        showError("Failed to load users");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Helper to get role badge
  const getRoleBadge = (roleV2: string | null) => {
    const r = ROLE_V2_OPTIONS.find((o) => o.value === roleV2);
    if (!r) return { label: roleV2 || "Unknown", color: "bg-gray-100 text-gray-600", dot: "bg-gray-400" };
    return r;
  };

  // Filter users based on search
  const filteredUsers = users.filter((u) => {
    if (!userSearch) return true;
    const q = userSearch.toLowerCase();
    return (
      u.first_name.toLowerCase().includes(q) ||
      u.last_name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.role_v2 || "").toLowerCase().includes(q)
    );
  });

  // Render agent options with hierarchy
  const renderAgentOptions = () => {
    const childMap: Record<string, string[]> = {};
    agentEdges.forEach((e) => {
      if (!childMap[e.parent_agent_id]) childMap[e.parent_agent_id] = [];
      childMap[e.parent_agent_id].push(e.child_agent_id);
    });
    const childIds = new Set(agentEdges.map((e) => e.child_agent_id));
    const roots = agents.filter((a) => !childIds.has(a.id));

    const options: { id: string; name: string; depth: number }[] = [];
    const walk = (agent: Agent, depth: number) => {
      options.push({ id: agent.id, name: agent.name, depth });
      (childMap[agent.id] || []).forEach((cid) => {
        const child = agents.find((a) => a.id === cid);
        if (child) walk(child, depth + 1);
      });
    };
    roots.forEach((r) => walk(r, 0));
    return options;
  };

  // Invite user handler
  const handleInviteUser = async () => {
    setInviteError("");

    if (!inviteForm.firstName.trim() || !inviteForm.lastName.trim() || !inviteForm.email.trim()) {
      setInviteError("First name, last name, and email are required.");
      return;
    }

    setInviting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (!accessToken) {
        setInviteError("You must be logged in to invite users.");
        return;
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/invite-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          email: inviteForm.email.trim(),
          firstName: inviteForm.firstName.trim(),
          lastName: inviteForm.lastName.trim(),
          role: inviteForm.role,
          roleId: inviteForm.roleId || null,
          agentId: inviteForm.agentId || null,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        setInviteError(result.error || "Failed to invite user. Please try again.");
        return;
      }

      setInviteForm({ firstName: "", lastName: "", email: "", role: "AGENT_STAFF", roleId: "", agentId: "" });
      setInviteFormOpen(false);
      const { data } = await supabase.from("users").select("*").neq("role", "customer").is("deleted_at", null);
      if (data) setUsers(data);
      showSuccess("Invite email sent");
    } catch (error) {
      console.error("Error inviting user:", error);
      setInviteError("An unexpected error occurred. Please try again.");
    } finally {
      setInviting(false);
    }
  };

  // Resend invite
  const handleResendInvite = async (userId: string) => {
    setResendingInvite(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        showError("You must be logged in to resend invites.");
        return;
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/resend-invite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ userId }),
      });

      const result = await res.json();
      if (res.ok) {
        showSuccess(result.message || "Invite resent");
      } else {
        showError(result.error || "Failed to resend invite");
      }
    } catch (error) {
      console.error("Error resending invite:", error);
      showError("Failed to resend invite");
    } finally {
      setResendingInvite(false);
    }
  };

  // Toggle user active status
  const handleToggleActive = async (user: User) => {
    try {
      const newStatus = !user.is_active;
      const { error } = await supabase.from("users").update({ is_active: newStatus }).eq("id", user.id);

      if (!error) {
        setUsers(users.map((u) => (u.id === user.id ? { ...u, is_active: newStatus } : u)));
        if (editingUser?.id === user.id) {
          setEditingUser({ ...editingUser, is_active: newStatus });
        }
        showSuccess(newStatus ? "User activated" : "User deactivated");
      } else {
        showError("Failed to update user status");
      }
    } catch (error) {
      console.error("Error toggling user status:", error);
      showError("Failed to update user status");
    }
  };

  // Delete user (soft-delete: archives user, bans auth login, preserves data)
  const handleDeleteUser = async (user: User) => {
    setDeletingUser(true);
    try {
      const res = await fetch("/api/admin/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: "users", ids: [user.id] }),
      });

      const result = await res.json();
      if (res.ok && result.deleted?.length > 0) {
        setUsers(users.filter((u) => u.id !== user.id));
        closeUserEditor();
        setConfirmDeleteUser(null);
        showSuccess("User archived to retained data");
      } else {
        showError(result.failed?.[0]?.message || result.error || "Failed to delete user");
      }
    } catch (error) {
      console.error("Error deleting user:", error);
      showError("Failed to delete user");
    } finally {
      setDeletingUser(false);
    }
  };

  // Open user editor
  const openUserEditor = async (user: User) => {
    setEditingUser(user);
    setEditForm({
      first_name: user.first_name || "",
      last_name: user.last_name || "",
      email: user.email || "",
      phone: user.phone || "",
      role_v2: user.role_v2 || "AGENT_STAFF",
      agent_id: user.agent_id || "",
      role_id: user.role_id || "",
    });
  };

  // Close user editor
  const closeUserEditor = () => {
    setEditingUser(null);
    setEditForm({
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      role_v2: "",
      agent_id: "",
      role_id: "",
    });
  };

  // Save user changes
  const handleSaveUser = async () => {
    if (!editingUser) return;
    setSavingUser(true);
    try {
      const legacyRoleMap: Record<string, string> = {
        ORG_ADMIN: "org_admin",
        WAREHOUSE_STAFF: "warehouse_staff",
        AGENT_ADMIN: "courier_admin",
        AGENT_STAFF: "courier_staff",
      };

      const selectedCustomRole = editForm.role_id ? customRoles.find((r) => r.id === editForm.role_id) : null;
      const effectiveRoleV2 = selectedCustomRole ? selectedCustomRole.base_role : editForm.role_v2;

      await supabase
        .from("users")
        .update({
          first_name: editForm.first_name,
          last_name: editForm.last_name,
          phone: editForm.phone || null,
          role_v2: effectiveRoleV2,
          role: legacyRoleMap[effectiveRoleV2] || editingUser.role,
          agent_id: editForm.agent_id || null,
          role_id: editForm.role_id || null,
        })
        .eq("id", editingUser.id);

      const { data } = await supabase.from("users").select("*").neq("role", "customer").is("deleted_at", null);
      if (data) setUsers(data);

      closeUserEditor();
      showSuccess("User updated");
    } catch (error) {
      console.error("Error saving user:", error);
      showError("Failed to save user");
    } finally {
      setSavingUser(false);
    }
  };

  // Toggle user selection
  const handleToggleUserSelection = (userId: string) => {
    const newSelection = new Set(selectedUserIds);
    if (newSelection.has(userId)) {
      newSelection.delete(userId);
    } else {
      newSelection.add(userId);
    }
    setSelectedUserIds(newSelection);
    setShowBatchUserAction(newSelection.size > 0);
  };

  // Select all users
  const handleSelectAllUsers = () => {
    if (selectedUserIds.size === filteredUsers.length && filteredUsers.length > 0) {
      setSelectedUserIds(new Set());
      setShowBatchUserAction(false);
    } else {
      setSelectedUserIds(new Set(filteredUsers.map((u) => u.id)));
      setShowBatchUserAction(true);
    }
  };

  // Batch action handler
  const handleBatchUserAction = async (action: "activate" | "deactivate" | "delete") => {
    if (selectedUserIds.size === 0) return;

    if (action === "delete") {
      const confirmed = window.confirm(`Delete ${selectedUserIds.size} user(s)? They will be archived to retained data.`);
      if (!confirmed) return;
    }

    setBatchUserActionLoading(true);
    try {
      const userIdArray = Array.from(selectedUserIds);

      if (action === "delete") {
        const res = await fetch("/api/admin/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ table: "users", ids: userIdArray }),
        });
        const result = await res.json();
        if (res.ok && result.deleted?.length > 0) {
          const deletedSet = new Set(result.deleted);
          setUsers(users.filter((u) => !deletedSet.has(u.id)));
          showSuccess(`${result.deleted.length} user(s) archived to retained data`);
        } else {
          showError(result.failed?.[0]?.message || result.error || "Failed to delete users");
        }
      } else {
        const isActive = action === "activate";
        const { error } = await supabase.from("users").update({ is_active: isActive }).in("id", userIdArray);
        if (!error) {
          setUsers(users.map((u) => (selectedUserIds.has(u.id) ? { ...u, is_active: isActive } : u)));
          showSuccess(`${selectedUserIds.size} user(s) ${isActive ? "activated" : "deactivated"}`);
        } else {
          showError(`Failed to ${action} users: ` + error.message);
        }
      }

      setSelectedUserIds(new Set());
      setShowBatchUserAction(false);
    } catch (error) {
      console.error("Error in batch user action:", error);
      showError("Failed to complete batch action");
    } finally {
      setBatchUserActionLoading(false);
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

      <div className="bg-white border border-border rounded-lg shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
          <div>
            <h2 className="text-title font-semibold text-txt-primary">App users</h2>
            <p className="text-ui-sm text-txt-tertiary mt-0.5">Manage team members and their roles</p>
          </div>
          <button onClick={() => setInviteFormOpen(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Invite user
          </button>
        </div>

        <div className="px-5 py-4 border-b border-border">
          <div className="relative max-w-[260px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#aeb0b2]" />
            <input
              type="text"
              placeholder="Search users..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="form-input py-1.5 text-ui-sm"
              style={{ paddingLeft: 32 }}
            />
          </div>
        </div>

        {showBatchUserAction && (
          <div className="px-5 py-3 border-b border-border bg-blue-50 flex items-center gap-3">
            <span className="text-ui text-txt-primary">{selectedUserIds.size} selected</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleBatchUserAction("activate")}
                disabled={batchUserActionLoading}
                className="btn-secondary text-ui py-1.5 px-3 flex items-center gap-2"
              >
                {batchUserActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Activate
              </button>
              <button
                onClick={() => handleBatchUserAction("deactivate")}
                disabled={batchUserActionLoading}
                className="btn-secondary text-ui py-1.5 px-3 flex items-center gap-2"
              >
                {batchUserActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}
                Deactivate
              </button>
              <button
                onClick={() => handleBatchUserAction("delete")}
                disabled={batchUserActionLoading}
                className="btn-secondary text-ui py-1.5 px-3 text-red-600 hover:bg-red-50 flex items-center gap-2"
              >
                {batchUserActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Delete
              </button>
            </div>
            <button
              onClick={() => {
                setSelectedUserIds(new Set());
                setShowBatchUserAction(false);
              }}
              className="ml-auto text-txt-tertiary hover:text-txt-primary transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="sheet-table-wrap" style={{ border: "none", borderRadius: 0 }}>
          <div className="overflow-auto">
            <table className="sheet-table" style={{ "--table-size": "100%" } as React.CSSProperties}>
              <thead className="sheet-thead">
                <tr>
                  <th className="sheet-th" style={{ width: 40, minWidth: 40 }}>
                    <input
                      type="checkbox"
                      checked={filteredUsers.length > 0 && selectedUserIds.size === filteredUsers.length}
                      onChange={handleSelectAllUsers}
                      className="w-4 h-4 cursor-pointer"
                      title="Select all users"
                    />
                  </th>
                  <th className="sheet-th" style={{ width: 220, minWidth: 160 }}>
                    <span>Name</span>
                    <span className="sheet-th-sep" />
                  </th>
                  <th className="sheet-th" style={{ width: 260, minWidth: 180 }}>
                    <span>Email</span>
                    <span className="sheet-th-sep" />
                  </th>
                  <th className="sheet-th" style={{ width: 160, minWidth: 120 }}>
                    <span>Role</span>
                    <span className="sheet-th-sep" />
                  </th>
                  <th className="sheet-th" style={{ width: 180, minWidth: 120 }}>
                    <span>Agent</span>
                    <span className="sheet-th-sep" />
                  </th>
                  <th className="sheet-th" style={{ width: 90, minWidth: 70 }}>
                    <span>Status</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="sheet-cell text-center py-16">
                      <div className="empty-state">
                        <p className="empty-state-title">{userSearch ? "No matching users" : "No users yet"}</p>
                        <p className="empty-state-desc">{userSearch ? "Try a different search term" : 'Click "Invite user" to add one'}</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => {
                    const badge = getRoleBadge(user.role_v2);
                    const agentName = user.agent_id ? agents.find((a) => a.id === user.agent_id)?.name : null;
                    return (
                      <tr key={user.id} className={`sheet-row hover:bg-surface-hover transition-colors ${selectedUserIds.has(user.id) ? "bg-blue-50" : ""}`}>
                        <td className="sheet-cell">
                          <input
                            type="checkbox"
                            checked={selectedUserIds.has(user.id)}
                            onChange={() => handleToggleUserSelection(user.id)}
                            className="w-4 h-4 cursor-pointer"
                          />
                        </td>
                        <td className="sheet-cell">
                          <div className="flex items-center justify-between gap-1 min-w-0">
                            <span className="font-medium truncate text-ui text-[#3b3b3e]">
                              {user.first_name} {user.last_name}
                            </span>
                            <button onClick={() => openUserEditor(user)} className="row-open-btn">
                              <Eye className="w-3.5 h-3.5" />
                              Open
                            </button>
                          </div>
                        </td>
                        <td className="sheet-cell text-[#3b3b3e]">{user.email}</td>
                        <td className="sheet-cell">
                          <span className={`status-badge ${badge.color}`}>
                            <span className={`status-dot ${badge.dot}`} />
                            {badge.label}
                          </span>
                        </td>
                        <td className="sheet-cell text-[#787774]">{agentName || "—"}</td>
                        <td className="sheet-cell">
                          <span
                            className={`inline-flex items-center gap-1.5 text-ui ${user.is_active ? "text-emerald-600" : "text-red-500"}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${user.is_active ? "bg-emerald-500" : "bg-red-400"}`} />
                            {user.is_active ? "Active" : "Disabled"}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Invite User Modal ── */}
      {inviteFormOpen && (
        <div className="modal-overlay z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="modal-panel max-w-lg w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[16px] font-semibold text-txt-primary">Invite new user</h3>
              <button
                onClick={() => {
                  setInviteFormOpen(false);
                  setInviteError("");
                }}
                className="p-1 text-txt-tertiary hover:text-txt-primary transition-colors duration-150 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {inviteError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-ui px-3 py-2.5 rounded-md">
                {inviteError}
              </div>
            )}

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">First name</label>
                  <input
                    type="text"
                    placeholder="First name"
                    value={inviteForm.firstName}
                    onChange={(e) => setInviteForm({ ...inviteForm, firstName: e.target.value })}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Last name</label>
                  <input
                    type="text"
                    placeholder="Last name"
                    value={inviteForm.lastName}
                    onChange={(e) => setInviteForm({ ...inviteForm, lastName: e.target.value })}
                    className="form-input"
                  />
                </div>
              </div>
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Email</label>
                <input
                  type="email"
                  placeholder="user@company.com"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                  className="form-input"
                />
              </div>
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Role</label>
                <SearchableSelect
                  value={inviteForm.roleId}
                  onChange={(rid) => {
                    const role = customRoles.find((r) => r.id === rid);
                    setInviteForm({ ...inviteForm, roleId: rid, role: role?.base_role || inviteForm.role });
                  }}
                  placeholder="Select a role…"
                  searchPlaceholder="Search roles…"
                  options={customRoles.map((r) => ({ value: r.id, label: `${r.name}${!r.is_system ? " (custom)" : ""}` }))}
                />
              </div>
              {(inviteForm.role === "AGENT_ADMIN" || inviteForm.role === "AGENT_STAFF") && (
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Assign to agent</label>
                  <SearchableSelect
                    value={inviteForm.agentId}
                    onChange={(v) => setInviteForm({ ...inviteForm, agentId: v })}
                    placeholder="Select agent…"
                    searchPlaceholder="Search agents…"
                    options={renderAgentOptions().map((a) => ({ value: a.id, label: `${"\u00A0\u00A0".repeat(a.depth)}${a.name}` }))}
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => {
                  setInviteFormOpen(false);
                  setInviteError("");
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button onClick={handleInviteUser} disabled={inviting} className="btn-primary flex items-center gap-2">
                {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {inviting ? "Sending..." : "Send invite"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── User Editor Slide-over ── */}
      {editingUser && (
        <div className="modal-overlay z-50 flex justify-end animate-fade-in">
          <div className="bg-white w-full max-w-xl h-full overflow-y-auto shadow-xl" style={{ animation: "slide-in-right 0.2s ease" }}>
            <div className="sticky top-0 bg-white border-b border-border px-5 py-4 flex items-center justify-between z-10">
              <div className="flex items-center gap-3">
                <UserCog className="w-5 h-5 text-txt-secondary" />
                <div>
                  <h3 className="text-[16px] font-semibold text-txt-primary">
                    {editingUser.first_name} {editingUser.last_name}
                  </h3>
                  <p className="text-ui-sm text-txt-tertiary">{editingUser.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleResendInvite(editingUser.id)}
                  disabled={resendingInvite}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-ui text-txt-secondary bg-surface-secondary border border-border rounded-md hover:bg-surface-hover hover:text-txt-primary transition-colors cursor-pointer disabled:opacity-50"
                  title="Resend invite email"
                >
                  {resendingInvite ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                  {resendingInvite ? "Sending..." : "Resend invite"}
                </button>
                <button onClick={closeUserEditor} className="p-1.5 text-txt-tertiary hover:text-txt-primary transition-colors cursor-pointer">
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="px-5 py-5 space-y-6">
              {/* User Information */}
              <div>
                <h4 className="text-meta text-txt-tertiary tracking-tight mb-3">User information</h4>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">First name</label>
                      <input
                        type="text"
                        value={editForm.first_name}
                        onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })}
                        className="form-input"
                        placeholder="First name"
                      />
                    </div>
                    <div>
                      <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Last name</label>
                      <input
                        type="text"
                        value={editForm.last_name}
                        onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })}
                        className="form-input"
                        placeholder="Last name"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Email</label>
                    <input type="email" value={editForm.email} disabled className="form-input opacity-60 cursor-not-allowed" />
                    <p className="text-meta text-txt-placeholder mt-1">Email cannot be changed — it is tied to the auth account.</p>
                  </div>
                  <div>
                    <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Phone</label>
                    <input
                      type="tel"
                      value={editForm.phone}
                      onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                      className="form-input"
                      placeholder="+1 (555) 000-0000"
                    />
                  </div>
                </div>
              </div>

              {/* Role */}
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Role</label>
                <SearchableSelect
                  options={customRoles.map((r) => ({ value: r.id, label: `${r.name}${!r.is_system ? " (custom)" : ""}` }))}
                  value={editForm.role_id}
                  onChange={(roleId) => {
                    const role = customRoles.find((r) => r.id === roleId);
                    setEditForm({ ...editForm, role_id: roleId, role_v2: role?.base_role || editForm.role_v2 });
                  }}
                  placeholder="Select role…"
                  searchPlaceholder="Search roles…"
                />
              </div>

              {/* Agent selector (for AGENT_ADMIN / AGENT_STAFF) */}
              {(editForm.role_v2 === "AGENT_ADMIN" || editForm.role_v2 === "AGENT_STAFF") && (
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Assigned agent</label>
                  <SearchableSelect
                    options={[
                      { value: "", label: "No agent" },
                      ...renderAgentOptions().map((a) => ({ value: a.id, label: `${"\u00A0\u00A0".repeat(a.depth)}${a.name}` })),
                    ]}
                    value={editForm.agent_id}
                    onChange={(v) => setEditForm({ ...editForm, agent_id: v })}
                    placeholder="Select agent…"
                    searchPlaceholder="Search agents…"
                  />
                </div>
              )}

              {/* Danger zone: Deactivate / Delete */}
              <div className="border-t border-border pt-6">
                <h4 className="text-meta text-txt-tertiary tracking-tight mb-3">Account actions</h4>
                <div className="space-y-2">
                  {/* Deactivate/Activate toggle */}
                  <button
                    onClick={() => handleToggleActive(editingUser)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md border text-left transition-colors cursor-pointer ${
                      editingUser.is_active ? "border-amber-200 bg-amber-50 hover:bg-amber-100" : "border-emerald-200 bg-emerald-50 hover:bg-emerald-100"
                    }`}
                  >
                    <Power className={`w-4 h-4 flex-shrink-0 ${editingUser.is_active ? "text-amber-600" : "text-emerald-600"}`} />
                    <div>
                      <p className={`text-ui ${editingUser.is_active ? "text-amber-800" : "text-emerald-800"}`}>
                        {editingUser.is_active ? "Deactivate user" : "Activate user"}
                      </p>
                      <p className={`text-meta ${editingUser.is_active ? "text-amber-600" : "text-emerald-600"}`}>
                        {editingUser.is_active
                          ? "User will lose access but their data is preserved."
                          : "Restore this user's access to the platform."}
                      </p>
                    </div>
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => setConfirmDeleteUser(editingUser)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md border border-red-200 bg-red-50 hover:bg-red-100 text-left transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <div>
                      <p className="text-ui text-red-700">Delete user</p>
                      <p className="text-meta text-red-500">Archives the user to retained data. Their login will be disabled.</p>
                    </div>
                  </button>
                </div>
              </div>
            </div>

            {/* Save bar */}
            <div className="sticky bottom-0 bg-white border-t border-border px-5 py-4 flex justify-end gap-3">
              <button onClick={closeUserEditor} className="btn-secondary">
                Cancel
              </button>
              <button onClick={handleSaveUser} disabled={savingUser} className="btn-primary flex items-center gap-2">
                {savingUser ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Delete User Modal ── */}
      {confirmDeleteUser && (
        <div className="modal-overlay z-[60] flex items-center justify-center p-4 animate-fade-in">
          <div className="modal-panel max-w-sm w-full space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-[16px] font-semibold text-txt-primary">Delete user</h3>
                <p className="text-ui-sm text-txt-tertiary">User will be archived to retained data.</p>
              </div>
            </div>
            <p className="text-ui-sm text-txt-secondary">
              Are you sure you want to delete <span className="font-semibold">{confirmDeleteUser.first_name} {confirmDeleteUser.last_name}</span> (
              {confirmDeleteUser.email})? Their login will be disabled and they will be moved to retained data. You can restore them later.
            </p>
            <div className="flex justify-end gap-3 pt-1">
              <button onClick={() => setConfirmDeleteUser(null)} disabled={deletingUser} className="btn-secondary">
                Cancel
              </button>
              <button onClick={() => handleDeleteUser(confirmDeleteUser)} disabled={deletingUser} className="btn-danger flex items-center gap-2">
                {deletingUser ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {deletingUser ? "Deleting..." : "Delete user"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
