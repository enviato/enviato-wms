"use client";

import { useEffect, useState, useRef } from "react";
import SearchableSelect from "@/components/SearchableSelect";
import { createClient } from "@/lib/supabase";
import {
  Building2,
  Users,
  Plus,
  Trash2,
  Save,
  Loader2,
  X,
  Check,
  ChevronRight,
  ChevronDown,
  Network,
  Search,
  Link2,
  Unlink,
} from "lucide-react";

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
  country: string | null;
  zip_code: string | null;
};

type AgentEdge = {
  id: string;
  parent_agent_id: string;
  child_agent_id: string;
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

const COUNTRIES: { code: string; name: string; stateLabel?: string }[] = [
  { code: "US", name: "United States", stateLabel: "State" },
  { code: "CA", name: "Canada", stateLabel: "Province" },
  { code: "AU", name: "Australia", stateLabel: "State/Territory" },
  { code: "BR", name: "Brazil", stateLabel: "State" },
  { code: "IN", name: "India", stateLabel: "State" },
  { code: "MX", name: "Mexico", stateLabel: "State" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "GB", name: "United Kingdom" },
  { code: "IT", name: "Italy" },
  { code: "ES", name: "Spain" },
  { code: "NL", name: "Netherlands" },
  { code: "JP", name: "Japan", stateLabel: "Prefecture" },
  { code: "CN", name: "China", stateLabel: "Province" },
  { code: "KR", name: "South Korea" },
  { code: "SG", name: "Singapore" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "ZA", name: "South Africa", stateLabel: "Province" },
  { code: "NG", name: "Nigeria", stateLabel: "State" },
  { code: "GH", name: "Ghana" },
  { code: "KE", name: "Kenya" },
  { code: "JM", name: "Jamaica" },
  { code: "TT", name: "Trinidad and Tobago" },
  { code: "BB", name: "Barbados" },
  { code: "GY", name: "Guyana" },
  { code: "BS", name: "Bahamas" },
  { code: "HT", name: "Haiti" },
  { code: "DO", name: "Dominican Republic" },
  { code: "CO", name: "Colombia", stateLabel: "Department" },
  { code: "CL", name: "Chile" },
  { code: "AR", name: "Argentina", stateLabel: "Province" },
  { code: "PE", name: "Peru" },
  { code: "EC", name: "Ecuador" },
  { code: "PA", name: "Panama" },
  { code: "CR", name: "Costa Rica" },
];

const ROLE_V2_OPTIONS = [
  { value: "ORG_ADMIN", label: "Org Admin", color: "bg-purple-50 text-purple-700", dot: "bg-purple-500" },
  { value: "WAREHOUSE_STAFF", label: "Warehouse Staff", color: "bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  { value: "AGENT_ADMIN", label: "Agent Admin", color: "bg-blue-50 text-blue-700", dot: "bg-blue-500" },
  { value: "AGENT_STAFF", label: "Agent Staff", color: "bg-slate-100 text-slate-600", dot: "bg-slate-400" },
];

export default function AgentSettings() {
  const supabase = createClient();
  const addChildRef = useRef<HTMLDivElement>(null);

  // State
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentEdges, setAgentEdges] = useState<AgentEdge[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Agent form state
  const [agentFormOpen, setAgentFormOpen] = useState(false);
  const [agentForm, setAgentForm] = useState<Record<string, string>>({
    name: "",
    parentAgentId: "",
    company_name: "",
    first_name: "",
    last_name: "",
    email: "",
    website: "",
    phone: "",
    address_line1: "",
    address_line2: "",
    city: "",
    state: "",
    country: "US",
    zip_code: "",
  });

  // Agent selection & editing state
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [editingAgentName, setEditingAgentName] = useState("");
  const [editingAgentInfo, setEditingAgentInfo] = useState<Record<string, string>>({});
  const [savingAgentInfo, setSavingAgentInfo] = useState(false);

  // Tree state
  const [collapsedAgents, setCollapsedAgents] = useState<Set<string>>(new Set());
  const [agentSearch, setAgentSearch] = useState("");
  const [addChildOpen, setAddChildOpen] = useState(false);

  // Toast state
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(""), 3000);
  };

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(""), 4000);
  };

  // Load initial data
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [agentsRes, edgesRes, usersRes] = await Promise.all([
        supabase.from("agents").select("*").eq("status", "active").is("deleted_at", null).order("name"),
        supabase.from("agent_edges").select("*"),
        supabase.from("users").select("*").neq("role", "customer"),
      ]);

      if (agentsRes.error) {
        console.error("Error loading agents:", agentsRes.error);
        showError("Failed to load agents: " + agentsRes.error.message);
      } else if (agentsRes.data) {
        setAgents(agentsRes.data);
      }

      if (edgesRes.error) {
        console.warn("agent_edges query failed (table may not exist yet):", edgesRes.error.message);
        setAgentEdges([]);
      } else if (edgesRes.data) {
        setAgentEdges(edgesRes.data);
      }

      if (usersRes.error) {
        console.error("Error loading users:", usersRes.error);
      } else if (usersRes.data) {
        setUsers(usersRes.data);
      }
    } catch (error) {
      console.error("Error loading agent data:", error);
      showError("Failed to load agents");
    } finally {
      setLoading(false);
    }
  };

  // Sync editingAgentInfo when selectedAgentId changes
  useEffect(() => {
    if (selectedAgentId) {
      const agent = agents.find((a) => a.id === selectedAgentId);
      if (agent) {
        setEditingAgentInfo({
          agent_code: agent.agent_code || "",
          company_name: agent.company_name || "",
          first_name: agent.first_name || "",
          last_name: agent.last_name || "",
          email: agent.email || "",
          website: agent.website || "",
          phone: agent.phone || "",
          address_line1: agent.address_line1 || "",
          address_line2: agent.address_line2 || "",
          city: agent.city || "",
          state: agent.state || "",
          country: agent.country || "US",
          zip_code: agent.zip_code || "",
        });
      }
    }
  }, [selectedAgentId, agents]);

  // Outside-click detection for popovers
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (addChildRef.current && !addChildRef.current.contains(e.target as Node)) {
        setAddChildOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [addChildOpen]);

  // Tree helpers
  const getAgentTree = () => {
    const childMap: Record<string, string[]> = {};
    agentEdges.forEach((e) => {
      if (!childMap[e.parent_agent_id]) childMap[e.parent_agent_id] = [];
      childMap[e.parent_agent_id].push(e.child_agent_id);
    });
    const childIds = new Set(agentEdges.map((e) => e.child_agent_id));
    const roots = agents.filter((a) => !childIds.has(a.id));
    return { roots, childMap };
  };

  const getAgentCounts = (agentId: string) => {
    const userCount = users.filter((u) => u.agent_id === agentId).length;
    return { userCount };
  };

  const getChildAgents = (agentId: string): Agent[] => {
    const childIds = agentEdges.filter((e) => e.parent_agent_id === agentId).map((e) => e.child_agent_id);
    return agents.filter((a) => childIds.includes(a.id));
  };

  const getParentAgent = (agentId: string): Agent | null => {
    const edge = agentEdges.find((e) => e.child_agent_id === agentId);
    if (!edge) return null;
    return agents.find((a) => a.id === edge.parent_agent_id) || null;
  };

  const toggleCollapsed = (agentId: string) => {
    setCollapsedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) next.delete(agentId);
      else next.add(agentId);
      return next;
    });
  };

  const getAvailableChildAgents = (parentId: string): Agent[] => {
    const existingChildIds = agentEdges.filter((e) => e.parent_agent_id === parentId).map((e) => e.child_agent_id);
    return agents.filter((a) => {
      if (a.id === parentId) return false;
      if (existingChildIds.includes(a.id)) return false;
      if (agentEdges.some((e) => e.child_agent_id === a.id)) return false; // already has parent
      return true;
    });
  };

  const renderAgentOptions = () => {
    const { roots, childMap } = getAgentTree();
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

  const getRoleBadge = (roleV2: string | null) => {
    const r = ROLE_V2_OPTIONS.find((o) => o.value === roleV2);
    if (!r) return { label: roleV2 || "Unknown", color: "bg-gray-100 text-gray-600", dot: "bg-gray-400" };
    return r;
  };

  // CRUD handlers
  const handleAddAgent = async () => {
    if (!agentForm.name.trim()) return;
    try {
      const { data: newAgent, error } = await supabase
        .from("agents")
        .insert({
          name: agentForm.name.trim(),
          company_name: agentForm.company_name || null,
          first_name: agentForm.first_name || null,
          last_name: agentForm.last_name || null,
          email: agentForm.email || null,
          website: agentForm.website || null,
          phone: agentForm.phone || null,
          address_line1: agentForm.address_line1 || null,
          address_line2: agentForm.address_line2 || null,
          city: agentForm.city || null,
          state: agentForm.state || null,
          country: agentForm.country || "US",
          zip_code: agentForm.zip_code || null,
        })
        .select()
        .single();

      if (!error && newAgent && agentForm.parentAgentId) {
        const { error: edgeErr } = await supabase.from("agent_edges").insert({
          parent_agent_id: agentForm.parentAgentId,
          child_agent_id: newAgent.id,
          org_id: newAgent.org_id || null,
        });
        if (edgeErr) {
          console.error("Error creating agent edge:", edgeErr);
          showError("Agent created but failed to link parent: " + edgeErr.message);
        } else {
          const { data: edgesData } = await supabase.from("agent_edges").select("*");
          if (edgesData) setAgentEdges(edgesData);
        }
      }

      if (!error) {
        setAgentForm({
          name: "",
          parentAgentId: "",
          company_name: "",
          first_name: "",
          last_name: "",
          email: "",
          website: "",
          phone: "",
          address_line1: "",
          address_line2: "",
          city: "",
          state: "",
          country: "US",
          zip_code: "",
        });
        setAgentFormOpen(false);
        await loadData();
        showSuccess("Agent created");
      }
    } catch (error) {
      console.error("Error creating agent:", error);
      showError("Failed to create agent");
    }
  };

  const handleRenameAgent = async (agentId: string) => {
    if (!editingAgentName.trim()) return;
    try {
      await supabase.from("agents").update({ name: editingAgentName.trim() }).eq("id", agentId);
      setAgents(agents.map((a) => (a.id === agentId ? { ...a, name: editingAgentName.trim() } : a)));
      setEditingAgentId(null);
      showSuccess("Agent renamed");
    } catch (error) {
      console.error("Error renaming agent:", error);
      showError("Failed to rename agent");
    }
  };

  const handleDeleteAgent = async (agentId: string) => {
    const { count: userCount } = await supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("agent_id", agentId);
    const { count: pkgCount } = await supabase
      .from("packages")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("agent_id", agentId);

    if ((userCount || 0) > 0 || (pkgCount || 0) > 0) {
      showError(`Cannot delete: ${userCount} users and ${pkgCount} packages assigned`);
      return;
    }

    try {
      await supabase.from("agent_edges").delete().or(`parent_agent_id.eq.${agentId},child_agent_id.eq.${agentId}`);
      await supabase.from("agents").delete().eq("id", agentId);
      setAgents(agents.filter((a) => a.id !== agentId));
      setAgentEdges(agentEdges.filter((e) => e.parent_agent_id !== agentId && e.child_agent_id !== agentId));
      setSelectedAgentId(null);
      showSuccess("Agent deleted");
    } catch (error) {
      console.error("Error deleting agent:", error);
      showError("Failed to delete agent");
    }
  };

  const handleSaveAgentInfo = async () => {
    if (!selectedAgentId || !editingAgentInfo) return;
    setSavingAgentInfo(true);
    try {
      const { error } = await supabase
        .from("agents")
        .update({
          agent_code: editingAgentInfo.agent_code || null,
          company_name: editingAgentInfo.company_name || null,
          first_name: editingAgentInfo.first_name || null,
          last_name: editingAgentInfo.last_name || null,
          email: editingAgentInfo.email || null,
          website: editingAgentInfo.website || null,
          phone: editingAgentInfo.phone || null,
          address_line1: editingAgentInfo.address_line1 || null,
          address_line2: editingAgentInfo.address_line2 || null,
          city: editingAgentInfo.city || null,
          state: editingAgentInfo.state || null,
          country: editingAgentInfo.country || "US",
          zip_code: editingAgentInfo.zip_code || null,
        })
        .eq("id", selectedAgentId);

      if (error) {
        showError("Failed to save agent info");
      } else {
        const { data: agentsData } = await supabase.from("agents").select("*").eq("status", "active").is("deleted_at", null).order("name");
        if (agentsData) setAgents(agentsData);
        showSuccess("Agent info saved");
      }
    } catch (err) {
      console.error("Error saving agent info:", err);
      showError("Failed to save agent info");
    } finally {
      setSavingAgentInfo(false);
    }
  };

  const handleLinkSubAgent = async (parentId: string, childId: string) => {
    try {
      // Cycle detection via closure table (skip if table doesn't respond)
      const { data: cycleCheck, error: cycleErr } = await supabase
        .from("agent_closure")
        .select("ancestor_id")
        .eq("ancestor_id", childId)
        .eq("descendant_id", parentId)
        .limit(1);
      if (!cycleErr && cycleCheck && cycleCheck.length > 0) {
        showError("Cannot link: would create a circular hierarchy");
        return;
      }
      const existingParent = agentEdges.find((e) => e.child_agent_id === childId);
      if (existingParent) {
        showError("This agent already has a parent. Unlink it first.");
        return;
      }
      const parentAgent = agents.find((a) => a.id === parentId);
      const { error: insertErr } = await supabase.from("agent_edges").insert({
        parent_agent_id: parentId,
        child_agent_id: childId,
        org_id: parentAgent?.org_id || null,
      });
      if (insertErr) {
        console.error("Error inserting agent_edge:", insertErr);
        showError(insertErr.message || "Failed to link sub-agent");
        return;
      }
      const { data: edgesData } = await supabase.from("agent_edges").select("*");
      if (edgesData) setAgentEdges(edgesData);
      setAddChildOpen(false);
      showSuccess("Sub-agent linked");
    } catch (error) {
      console.error("Error linking sub-agent:", error);
      showError("Failed to link sub-agent");
    }
  };

  const handleUnlinkSubAgent = async (parentId: string, childId: string) => {
    try {
      // Call the SECURITY DEFINER RPC function directly — bypasses RLS and trigger issues
      const { error: rpcErr } = await supabase.rpc("unlink_agent", {
        p_parent_id: parentId,
        p_child_id: childId,
      });
      if (rpcErr) {
        console.error("Error unlinking sub-agent:", rpcErr);
        showError(rpcErr.message || "Failed to unlink sub-agent");
        return;
      }
      const { data: edgesData } = await supabase.from("agent_edges").select("*");
      if (edgesData) setAgentEdges(edgesData);
      showSuccess("Sub-agent unlinked");
    } catch (error) {
      console.error("Error unlinking sub-agent:", error);
      showError("Failed to unlink sub-agent");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex gap-4" style={{ minHeight: 0 }}>
      {/* Toast messages */}
      {successMessage && (
        <div className="fixed bottom-4 right-4 bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg text-ui-sm z-50 animate-fade-in">
          {successMessage}
        </div>
      )}
      {errorMessage && (
        <div className="fixed bottom-4 right-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-ui-sm z-50 animate-fade-in">
          {errorMessage}
        </div>
      )}

      {/* ── Left: Agent list ── */}
      <div className="w-72 flex-shrink-0">
        <div className="bg-white border border-border rounded-lg shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-ui font-semibold text-txt-primary">Agents</h2>
            </div>
            <button
              onClick={() => setAgentFormOpen(true)}
              className="p-1.5 text-primary hover:bg-primary/10 rounded transition-colors cursor-pointer"
              title="Add agent"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Search */}
          <div className="px-3 py-2 border-b border-border">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-txt-placeholder absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search agents..."
                value={agentSearch}
                onChange={(e) => setAgentSearch(e.target.value)}
                className="form-input py-1.5 text-ui-sm"
                style={{ paddingLeft: 32 }}
              />
            </div>
          </div>

          {/* Agent tree */}
          <div className="max-h-[500px] overflow-y-auto">
            {agents.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Network className="w-8 h-8 text-txt-placeholder mx-auto mb-2" />
                <p className="text-muted text-txt-tertiary">No agents yet</p>
              </div>
            ) : (
              (() => {
                const { roots, childMap } = getAgentTree();
                const searchQ = agentSearch.toLowerCase();

                const renderTreeItem = (agent: Agent, depth: number): React.ReactNode => {
                  const childIds = childMap[agent.id] || [];
                  const childAgents = childIds
                    .map((cid) => agents.find((a) => a.id === cid))
                    .filter(Boolean) as Agent[];
                  const hasChildren = childAgents.length > 0;
                  const isCollapsed = collapsedAgents.has(agent.id);
                  const isSelected = selectedAgentId === agent.id;
                  const counts = getAgentCounts(agent.id);

                  if (searchQ && !agent.name.toLowerCase().includes(searchQ)) {
                    const hasMatchingChild = childAgents.some((c) => c.name.toLowerCase().includes(searchQ));
                    if (!hasMatchingChild) return null;
                  }

                  return (
                    <div key={agent.id}>
                      <div
                        onClick={() => setSelectedAgentId(agent.id)}
                        className={`flex items-center gap-1.5 py-2 px-3 cursor-pointer transition-colors ${
                          isSelected ? "bg-primary/8 border-l-2 border-l-primary" : "hover:bg-surface-hover border-l-2 border-l-transparent"
                        }`}
                        style={{ paddingLeft: 12 + depth * 16 }}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (hasChildren) toggleCollapsed(agent.id);
                          }}
                          className="w-4 h-4 flex items-center justify-center flex-shrink-0"
                        >
                          {hasChildren ? (
                            isCollapsed ? (
                              <ChevronRight className="w-3.5 h-3.5 text-txt-placeholder" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-txt-placeholder" />
                            )
                          ) : (
                            <span className="w-1 h-1 rounded-full bg-border-dark" />
                          )}
                        </button>
                        <Building2 className="w-3.5 h-3.5 text-txt-tertiary flex-shrink-0" />
                        <span className={`text-ui-sm flex-1 truncate ${isSelected ? "font-semibold text-txt-primary" : "text-txt-secondary"}`}>
                          {agent.name}
                        </span>
                        <span className="text-meta text-txt-placeholder font-medium tabular-nums">{counts.userCount}</span>
                      </div>
                      {hasChildren && !isCollapsed && childAgents.map((child) => renderTreeItem(child, depth + 1))}
                    </div>
                  );
                };

                return <div className="py-1">{roots.map((root) => renderTreeItem(root, 0))}</div>;
              })()
            )}
          </div>
        </div>
      </div>

      {/* ── Right: Agent detail panel ── */}
      <div className="flex-1 min-w-0">
        {(() => {
          const agent = agents.find((a) => a.id === selectedAgentId);
          if (!agent) {
            return (
              <div className="bg-white border border-border rounded-lg shadow-sm flex items-center justify-center py-24">
                <div className="text-center">
                  <Building2 className="w-10 h-10 text-txt-placeholder mx-auto mb-3" />
                  <p className="text-ui-sm text-txt-tertiary">Select an agent to view details</p>
                  <p className="text-meta text-txt-placeholder mt-1">Or create a new agent to get started</p>
                </div>
              </div>
            );
          }

          const agentUsers = users.filter((u) => u.agent_id === agent.id);
          const childAgentsList = getChildAgents(agent.id);
          const parentAgent = getParentAgent(agent.id);
          const availableChildren = getAvailableChildAgents(agent.id);

          return (
            <div className="bg-white border border-border rounded-lg shadow-sm overflow-hidden">
              {/* Header */}
              <div className="px-5 py-4 border-b border-border">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      {editingAgentId === agent.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editingAgentName}
                            onChange={(e) => setEditingAgentName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleRenameAgent(agent.id);
                              if (e.key === "Escape") setEditingAgentId(null);
                            }}
                            className="form-input py-1 text-ui font-semibold"
                            autoFocus
                          />
                          <button
                            onClick={() => handleRenameAgent(agent.id)}
                            className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-colors cursor-pointer"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button onClick={() => setEditingAgentId(null)} className="p-1 text-txt-tertiary hover:bg-surface-hover rounded transition-colors cursor-pointer">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <h2 className="text-ui font-semibold text-txt-primary">{agent.name}</h2>
                      )}
                      {parentAgent && (
                        <p className="text-meta text-txt-placeholder mt-0.5">
                          Child of{" "}
                          <button onClick={() => setSelectedAgentId(parentAgent.id)} className="text-primary hover:underline cursor-pointer">
                            {parentAgent.name}
                          </button>
                        </p>
                      )}
                      {!parentAgent && <p className="text-meta text-txt-placeholder mt-0.5">Root agent</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditingAgentId(agent.id);
                        setEditingAgentName(agent.name);
                      }}
                      className="p-1.5 text-txt-tertiary hover:text-txt-primary hover:bg-surface-hover rounded transition-colors cursor-pointer"
                      title="Rename"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDeleteAgent(agent.id)}
                      className="p-1.5 text-txt-tertiary hover:text-red-500 hover:bg-red-50 rounded transition-colors cursor-pointer"
                      title="Delete agent"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Summary stats */}
                <div className="flex items-center gap-4 mt-4">
                  <div className="flex items-center gap-1.5 text-ui-sm text-txt-secondary">
                    <Users className="w-3.5 h-3.5" />
                    <span className="font-semibold">{agentUsers.length}</span>
                    <span className="text-txt-placeholder">user{agentUsers.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-ui-sm text-txt-secondary">
                    <Network className="w-3.5 h-3.5" />
                    <span className="font-semibold">{childAgentsList.length}</span>
                    <span className="text-txt-placeholder">child agent{childAgentsList.length !== 1 ? "s" : ""}</span>
                  </div>
                  {parentAgent && (
                    <div className="flex items-center gap-1.5 text-ui-sm text-txt-secondary">
                      <Link2 className="w-3.5 h-3.5" />
                      <span className="text-txt-placeholder">linked to</span>
                      <span className="font-semibold">{parentAgent.name}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Content sections */}
              <div className="divide-y divide-border">
                {/* ── Business Information Section ── */}
                <div className="px-5 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-meta text-txt-tertiary tracking-tight">Business information</h3>
                    <button
                      onClick={handleSaveAgentInfo}
                      disabled={savingAgentInfo}
                      className="inline-flex items-center gap-1 text-meta text-primary hover:text-primary-dark transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {savingAgentInfo ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                      Save info
                    </button>
                  </div>
                  <div className="space-y-3">
                    <div className="grid grid-cols-[1fr_90px] gap-3">
                      <div>
                        <label className="text-meta text-txt-tertiary block mb-1">Company name</label>
                        <input
                          type="text"
                          value={editingAgentInfo.company_name || ""}
                          onChange={(e) => setEditingAgentInfo({ ...editingAgentInfo, company_name: e.target.value })}
                          className="form-input text-ui-sm"
                          placeholder="Company name"
                        />
                      </div>
                      <div>
                        <label className="text-meta text-txt-tertiary block mb-1">Agent code</label>
                        <input
                          type="text"
                          maxLength={10}
                          value={editingAgentInfo.agent_code || ""}
                          onChange={(e) => setEditingAgentInfo({ ...editingAgentInfo, agent_code: e.target.value.toUpperCase() })}
                          className="form-input text-ui-sm font-mono tracking-wide text-center"
                          placeholder="CODE"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-meta text-txt-tertiary block mb-1">First name</label>
                        <input
                          type="text"
                          value={editingAgentInfo.first_name || ""}
                          onChange={(e) => setEditingAgentInfo({ ...editingAgentInfo, first_name: e.target.value })}
                          className="form-input text-ui-sm"
                          placeholder="First name"
                        />
                      </div>
                      <div>
                        <label className="text-meta text-txt-tertiary block mb-1">Last name</label>
                        <input
                          type="text"
                          value={editingAgentInfo.last_name || ""}
                          onChange={(e) => setEditingAgentInfo({ ...editingAgentInfo, last_name: e.target.value })}
                          className="form-input text-ui-sm"
                          placeholder="Last name"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-meta text-txt-tertiary block mb-1">Email</label>
                        <input
                          type="email"
                          value={editingAgentInfo.email || ""}
                          onChange={(e) => setEditingAgentInfo({ ...editingAgentInfo, email: e.target.value })}
                          className="form-input text-ui-sm"
                          placeholder="email@company.com"
                        />
                      </div>
                      <div>
                        <label className="text-meta text-txt-tertiary block mb-1">Phone</label>
                        <input
                          type="tel"
                          value={editingAgentInfo.phone || ""}
                          onChange={(e) => setEditingAgentInfo({ ...editingAgentInfo, phone: e.target.value })}
                          className="form-input text-ui-sm"
                          placeholder="+1 (555) 000-0000"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-meta text-txt-tertiary block mb-1">Website</label>
                      <input
                        type="url"
                        value={editingAgentInfo.website || ""}
                        onChange={(e) => setEditingAgentInfo({ ...editingAgentInfo, website: e.target.value })}
                        className="form-input text-ui-sm"
                        placeholder="https://www.example.com"
                      />
                    </div>
                    <div>
                      <label className="text-meta text-txt-tertiary block mb-1">Address line 1</label>
                      <input
                        type="text"
                        value={editingAgentInfo.address_line1 || ""}
                        onChange={(e) => setEditingAgentInfo({ ...editingAgentInfo, address_line1: e.target.value })}
                        className="form-input text-ui-sm"
                        placeholder="Street address"
                      />
                    </div>
                    <div>
                      <label className="text-meta text-txt-tertiary block mb-1">Address line 2</label>
                      <input
                        type="text"
                        value={editingAgentInfo.address_line2 || ""}
                        onChange={(e) => setEditingAgentInfo({ ...editingAgentInfo, address_line2: e.target.value })}
                        className="form-input text-ui-sm"
                        placeholder="Suite, unit, building (optional)"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-meta text-txt-tertiary block mb-1">City</label>
                        <input
                          type="text"
                          value={editingAgentInfo.city || ""}
                          onChange={(e) => setEditingAgentInfo({ ...editingAgentInfo, city: e.target.value })}
                          className="form-input text-ui-sm"
                          placeholder="City"
                        />
                      </div>
                      <div>
                        <label className="text-meta text-txt-tertiary block mb-1">Zip / Postal code</label>
                        <input
                          type="text"
                          value={editingAgentInfo.zip_code || ""}
                          onChange={(e) => setEditingAgentInfo({ ...editingAgentInfo, zip_code: e.target.value })}
                          className="form-input text-ui-sm"
                          placeholder="Zip code"
                        />
                      </div>
                    </div>
                    <div className={`grid gap-3 ${COUNTRIES.find((c) => c.code === (editingAgentInfo.country || "US"))?.stateLabel ? "grid-cols-2" : "grid-cols-1"}`}>
                      <div>
                        <label className="text-meta text-txt-tertiary block mb-1">Country</label>
                        <SearchableSelect
                          value={editingAgentInfo.country || "US"}
                          onChange={(v) => setEditingAgentInfo({ ...editingAgentInfo, country: v, state: "" })}
                          searchPlaceholder="Search countries…"
                          options={COUNTRIES.map((c) => ({ value: c.code, label: c.name }))}
                        />
                      </div>
                      {COUNTRIES.find((c) => c.code === (editingAgentInfo.country || "US"))?.stateLabel && (
                        <div>
                          <label className="text-meta text-txt-tertiary block mb-1">
                            {COUNTRIES.find((c) => c.code === (editingAgentInfo.country || "US"))?.stateLabel}
                          </label>
                          <input
                            type="text"
                            value={editingAgentInfo.state || ""}
                            onChange={(e) => setEditingAgentInfo({ ...editingAgentInfo, state: e.target.value })}
                            className="form-input text-ui-sm"
                            placeholder={COUNTRIES.find((c) => c.code === (editingAgentInfo.country || "US"))?.stateLabel || "State"}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── Child Agents Section ── */}
                <div className="px-5 py-4" ref={addChildRef}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-meta text-txt-tertiary tracking-tight">Child agents</h3>
                    {availableChildren.length > 0 && (
                      <button
                        onClick={() => setAddChildOpen(!addChildOpen)}
                        className="inline-flex items-center gap-1 text-meta text-primary hover:text-primary-dark transition-colors cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        Link agent
                      </button>
                    )}
                  </div>

                  {/* Add child picker */}
                  {addChildOpen && availableChildren.length > 0 && (
                    <div className="mb-3 p-3 bg-surface-secondary border border-border rounded-md">
                      <p className="text-meta text-txt-secondary mb-2">Select an agent to link as a child:</p>
                      <div className="flex flex-wrap gap-2">
                        {availableChildren.map((a) => (
                          <button
                            key={a.id}
                            onClick={() => {
                              handleLinkSubAgent(agent.id, a.id);
                              setAddChildOpen(false);
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-ui font-medium text-txt-secondary bg-white border border-border rounded-md hover:border-primary hover:text-primary transition-colors cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                            {a.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Current children as chips */}
                  {childAgentsList.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {childAgentsList.map((child) => (
                        <div key={child.id} className="inline-flex items-center gap-2 pl-3 pr-1.5 py-1.5 bg-surface-secondary border border-border rounded-lg group/chip">
                          <button onClick={() => setSelectedAgentId(child.id)} className="flex items-center gap-1.5 cursor-pointer hover:text-primary transition-colors">
                            <Building2 className="w-3.5 h-3.5 text-txt-tertiary" />
                            <span className="text-ui font-medium text-txt-primary">{child.name}</span>
                            <span className="text-meta text-txt-placeholder">({getAgentCounts(child.id).userCount})</span>
                          </button>
                          <button
                            onClick={() => handleUnlinkSubAgent(agent.id, child.id)}
                            className="p-0.5 text-txt-placeholder hover:text-red-500 hover:bg-red-50 rounded transition-colors cursor-pointer opacity-0 group-hover/chip:opacity-100"
                            title="Unlink"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-ui-sm text-txt-placeholder">No child agents linked. Use "Link agent" to add sub-agents.</p>
                  )}
                </div>

                {/* ── Users Section ── */}
                <div className="px-5 py-4">
                  <h3 className="text-meta text-txt-tertiary tracking-tight mb-3">Assigned users</h3>
                  {agentUsers.length > 0 ? (
                    <div className="space-y-1">
                      {agentUsers.map((u) => {
                        const badge = getRoleBadge(u.role_v2);
                        return (
                          <div key={u.id} className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-surface-hover cursor-pointer transition-colors">
                            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <span className="text-meta font-bold text-primary">
                                {u.first_name[0]}
                                {u.last_name[0]}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-ui-sm text-txt-primary truncate">
                                {u.first_name} {u.last_name}
                              </p>
                              <p className="text-meta text-txt-placeholder truncate">{u.email}</p>
                            </div>
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-meta ${badge.color}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                              {badge.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-ui-sm text-txt-placeholder">No users assigned to this agent. Invite or assign users from the Users tab.</p>
                  )}
                </div>

                {/* ── Parent Agent Section ── */}
                {parentAgent && (
                  <div className="px-5 py-4">
                    <h3 className="text-meta text-txt-tertiary tracking-tight mb-3">Parent agent</h3>
                    <div className="flex items-center justify-between p-3 bg-surface-secondary border border-border rounded-lg">
                      <button
                        onClick={() => setSelectedAgentId(parentAgent.id)}
                        className="flex items-center gap-2 cursor-pointer hover:text-primary transition-colors"
                      >
                        <Building2 className="w-4 h-4 text-txt-tertiary" />
                        <span className="text-ui font-medium text-txt-primary">{parentAgent.name}</span>
                      </button>
                      <button
                        onClick={() => handleUnlinkSubAgent(parentAgent.id, agent.id)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-meta text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                      >
                        <Unlink className="w-3 h-3" />
                        Unlink
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      {/* ── Create Agent Modal ── */}
      {agentFormOpen && (
        <div className="modal-overlay z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="modal-panel max-w-lg w-full max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-ui font-semibold text-txt-primary">Add agent</h3>
              <button onClick={() => setAgentFormOpen(false)} className="p-1 text-txt-tertiary hover:text-txt-primary transition-colors duration-150 cursor-pointer">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Agent name *</label>
                <input
                  type="text"
                  placeholder="e.g. NWGY Miami"
                  value={agentForm.name}
                  onChange={(e) => setAgentForm({ ...agentForm, name: e.target.value })}
                  className="form-input"
                />
              </div>
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Parent agent (optional)</label>
                <SearchableSelect
                  value={agentForm.parentAgentId}
                  onChange={(v) => setAgentForm({ ...agentForm, parentAgentId: v })}
                  placeholder="None (root agent)"
                  searchPlaceholder="Search agents…"
                  options={[{ value: "", label: "None (root agent)" }, ...renderAgentOptions().map((a) => ({ value: a.id, label: `${"\u00A0\u00A0".repeat(a.depth)}${a.name}` }))]}
                />
              </div>
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Company name</label>
                <input type="text" placeholder="Company name" value={agentForm.company_name} onChange={(e) => setAgentForm({ ...agentForm, company_name: e.target.value })} className="form-input" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">First name</label>
                  <input type="text" placeholder="First name" value={agentForm.first_name} onChange={(e) => setAgentForm({ ...agentForm, first_name: e.target.value })} className="form-input" />
                </div>
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Last name</label>
                  <input type="text" placeholder="Last name" value={agentForm.last_name} onChange={(e) => setAgentForm({ ...agentForm, last_name: e.target.value })} className="form-input" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Email</label>
                  <input type="email" placeholder="email@company.com" value={agentForm.email} onChange={(e) => setAgentForm({ ...agentForm, email: e.target.value })} className="form-input" />
                </div>
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Phone</label>
                  <input type="tel" placeholder="+1 (555) 000-0000" value={agentForm.phone} onChange={(e) => setAgentForm({ ...agentForm, phone: e.target.value })} className="form-input" />
                </div>
              </div>
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Website</label>
                <input type="url" placeholder="https://www.example.com" value={agentForm.website} onChange={(e) => setAgentForm({ ...agentForm, website: e.target.value })} className="form-input" />
              </div>
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Address line 1</label>
                <input type="text" placeholder="Street address" value={agentForm.address_line1} onChange={(e) => setAgentForm({ ...agentForm, address_line1: e.target.value })} className="form-input" />
              </div>
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Address line 2</label>
                <input type="text" placeholder="Suite, unit (optional)" value={agentForm.address_line2} onChange={(e) => setAgentForm({ ...agentForm, address_line2: e.target.value })} className="form-input" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">City</label>
                  <input type="text" placeholder="City" value={agentForm.city} onChange={(e) => setAgentForm({ ...agentForm, city: e.target.value })} className="form-input" />
                </div>
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Zip / Postal code</label>
                  <input type="text" placeholder="Zip code" value={agentForm.zip_code} onChange={(e) => setAgentForm({ ...agentForm, zip_code: e.target.value })} className="form-input" />
                </div>
              </div>
              <div className={`grid gap-3 ${COUNTRIES.find((c) => c.code === (agentForm.country || "US"))?.stateLabel ? "grid-cols-2" : "grid-cols-1"}`}>
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Country</label>
                  <SearchableSelect
                    value={agentForm.country || "US"}
                    onChange={(v) => setAgentForm({ ...agentForm, country: v, state: "" })}
                    searchPlaceholder="Search countries…"
                    options={COUNTRIES.map((c) => ({ value: c.code, label: c.name }))}
                  />
                </div>
                {COUNTRIES.find((c) => c.code === (agentForm.country || "US"))?.stateLabel && (
                  <div>
                    <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">{COUNTRIES.find((c) => c.code === (agentForm.country || "US"))?.stateLabel}</label>
                    <input
                      type="text"
                      placeholder={COUNTRIES.find((c) => c.code === (agentForm.country || "US"))?.stateLabel || "State"}
                      value={agentForm.state}
                      onChange={(e) => setAgentForm({ ...agentForm, state: e.target.value })}
                      className="form-input"
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setAgentFormOpen(false)} className="btn-secondary">
                Cancel
              </button>
              <button onClick={handleAddAgent} className="btn-primary flex items-center gap-2">
                <Check className="w-4 h-4" />
                Create agent
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
