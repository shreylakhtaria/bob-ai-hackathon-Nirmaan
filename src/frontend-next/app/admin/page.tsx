"use client";

import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  ContentSwitcher,
  InlineNotification,
  Modal,
  Select,
  SelectItem,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  TextInput,
  Tile,
} from "@carbon/react";
import {
  Events,
  Identification,
  Locked,
  Renew,
  Restart,
  Security,
  TrashCan,
  UserAdmin,
  UserFollow,
  UserMultiple,
  Warning,
  WarningAlt,
  CheckmarkOutline,
  Hourglass,
} from "@carbon/icons-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { API } from "@/lib/api";
import type { AdminUser, AdminAuditEntry, AdminStats, AccessRequest } from "@/types/auth";
import Link from "next/link";

export default function AdminPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { ok, err } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<number>(0);
  const [userSearch, setUserSearch] = useState<string>("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");

  // Audit tab filters
  const [auditCategory, setAuditCategory] = useState<"all" | "security" | "operations" | "admin">("all");
  const [auditSearch, setAuditSearch] = useState<string>("");

  // Role modification modal state
  const [roleModalUser, setRoleModalUser] = useState<AdminUser | null>(null);
  const [selectedRole, setSelectedRole] = useState<'admin' | 'operator' | 'crew'>('operator');

  // Delete modal state
  const [deleteModalUser, setDeleteModalUser] = useState<AdminUser | null>(null);

  // Selected audit entry modal
  const [selectedAudit, setSelectedAudit] = useState<AdminAuditEntry | null>(null);

  // Queries
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery<AdminStats>({
    queryKey: ["admin-stats"],
    queryFn: () => API.adminStats(),
    enabled: user?.role === "admin",
  });

  const { data: users = [], isLoading: usersLoading, refetch: refetchUsers } = useQuery<AdminUser[]>({
    queryKey: ["admin-users"],
    queryFn: () => API.adminUsers(),
    enabled: user?.role === "admin",
  });

  const { data: requests = [], isLoading: requestsLoading, refetch: refetchRequests } = useQuery<AccessRequest[]>({
    queryKey: ["admin-requests"],
    queryFn: () => API.adminRequests(),
    enabled: user?.role === "admin",
  });

  const { data: auditLogs = [], isLoading: auditLoading, refetch: refetchAudit } = useQuery<AdminAuditEntry[]>({
    queryKey: ["admin-audit", auditCategory, auditSearch],
    queryFn: () => API.adminAudit(150, auditCategory, auditSearch || undefined),
    enabled: user?.role === "admin",
  });

  // Mutations
  const approveRequestMutation = useMutation({
    mutationFn: (userId: number) => API.adminApproveRequest(userId),
    onSuccess: (data) => {
      ok(data.message || "Operator access approved");
      queryClient.invalidateQueries({ queryKey: ["admin-requests"] });
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      queryClient.invalidateQueries({ queryKey: ["admin-audit"] });
    },
    onError: (e: any) => {
      err(e.message || "Failed to approve access request");
    },
  });

  const rejectRequestMutation = useMutation({
    mutationFn: (userId: number) => API.adminRejectRequest(userId),
    onSuccess: (data) => {
      ok(data.message || "Access request rejected and removed");
      queryClient.invalidateQueries({ queryKey: ["admin-requests"] });
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      queryClient.invalidateQueries({ queryKey: ["admin-audit"] });
    },
    onError: (e: any) => {
      err(e.message || "Failed to reject access request");
    },
  });
  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: 'admin' | 'operator' | 'crew' }) =>
      API.adminUpdateRole(userId, role),
    onSuccess: (data) => {
      ok(data.message || "User role updated successfully");
      setRoleModalUser(null);
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      queryClient.invalidateQueries({ queryKey: ["admin-audit"] });
    },
    onError: (e: any) => {
      err(e.message || "Failed to update user role");
    },
  });

  const revokeSessionsMutation = useMutation({
    mutationFn: (userId: number) => API.adminRevokeSessions(userId),
    onSuccess: (data) => {
      ok(data.message || "Active sessions revoked");
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      queryClient.invalidateQueries({ queryKey: ["admin-audit"] });
    },
    onError: (e: any) => {
      err(e.message || "Failed to revoke sessions");
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (userId: number) => API.adminDeleteUser(userId),
    onSuccess: (data) => {
      ok(data.message || "User account removed");
      setDeleteModalUser(null);
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      queryClient.invalidateQueries({ queryKey: ["admin-audit"] });
    },
    onError: (e: any) => {
      err(e.message || "Failed to delete user");
    },
  });

  // Filtered users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch =
        u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.display_name.toLowerCase().includes(userSearch.toLowerCase());
      const matchesRole = roleFilter === "ALL" || u.role.toUpperCase() === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [users, userSearch, roleFilter]);

  if (authLoading) {
    return (
      <div className="p-8 text-ink-3 font-sans animate-fade-in">
        Checking administrative authorization…
      </div>
    );
  }

  // Security guard for non-admins
  if (!user || user.role !== "admin") {
    return (
      <div className="p-6 max-w-2xl mx-auto mt-8 font-sans animate-fade-in">
        <Tile className="border-red-500/40 border bg-panel">
          <div className="flex items-start gap-4">
            <Locked size={32} className="fill-current text-red-500 shrink-0 mt-1" />
            <div>
              <h1 className="text-h3 font-semibold text-ink">Administrative Privilege Required</h1>
              <p className="mt-2 text-label text-ink-2 leading-relaxed">
                You are currently signed in as <strong className="text-ink">{user?.email || "anonymous"}</strong> with the{" "}
                <Tag type="green" size="sm">{user?.role || "none"}</Tag> role.
              </p>
              <p className="mt-2 text-label text-ink-3 leading-relaxed">
                The Admin Console is restricted to accounts with full administrative authorization. If you require admin access,
                contact a system administrator or configure <code className="bg-sunken px-1.5 py-0.5 rounded text-micro">ADMIN_EMAILS</code>.
              </p>
              <div className="mt-6 flex gap-3">
                <Button as={Link} href="/overview" kind="primary" size="md">
                  Return to Dashboard
                </Button>
                <Button as={Link} href="/profile" kind="tertiary" size="md">
                  View Profile
                </Button>
              </div>
            </div>
          </div>
        </Tile>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 w-full animate-fade-in font-sans pb-12">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-3 border-b border-line gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-micro font-semibold text-brand-ink uppercase tracking-wider">
              Security &amp; Governance
            </span>
            <span className="text-line">/</span>
            <Tag type="red" size="sm" className="font-semibold uppercase tracking-wide">
              Admin Exclusive
            </Tag>
          </div>
          <h1 className="text-h2 font-semibold text-ink flex items-center gap-2.5">
            <Security size={24} className="fill-current text-brand-ink" aria-hidden="true" />
            Admin Console
          </h1>
          <p className="text-label text-ink-3 mt-0.5">
            User provisioning, role-based access control, session revocation, and security audit trail.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            kind="ghost"
            size="md"
            renderIcon={Renew}
            hasIconOnly
            iconDescription="Refresh admin data"
            onClick={() => {
              refetchStats();
              refetchUsers();
              refetchRequests();
              refetchAudit();
            }}
          />
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <Tile className="p-3 bg-panel border border-line rounded-lg">
          <div className="flex items-center justify-between text-ink-3 mb-1">
            <span className="text-micro uppercase font-semibold">Total Accounts</span>
            <UserMultiple size={16} />
          </div>
          <div className="text-h2 font-bold text-ink">
            {statsLoading ? "—" : stats?.total_users ?? 0}
          </div>
          <div className="text-micro text-ink-3 mt-1">All registered identities</div>
        </Tile>

        <Tile className="p-3 bg-panel border border-line rounded-lg">
          <div className="flex items-center justify-between text-ink-3 mb-1">
            <span className="text-micro uppercase font-semibold text-red-500">Admins</span>
            <UserAdmin size={16} className="text-red-500 fill-current" />
          </div>
          <div className="text-h2 font-bold text-ink">
            {statsLoading ? "—" : stats?.admins_count ?? 0}
          </div>
          <div className="text-micro text-ink-3 mt-1">Full access rights</div>
        </Tile>

        <Tile className="p-3 bg-panel border border-line rounded-lg">
          <div className="flex items-center justify-between text-ink-3 mb-1">
            <span className="text-micro uppercase font-semibold text-green-500">Operators</span>
            <Identification size={16} className="text-green-500 fill-current" />
          </div>
          <div className="text-h2 font-bold text-ink">
            {statsLoading ? "—" : stats?.operators_count ?? 0}
          </div>
          <div className="text-micro text-ink-3 mt-1">Dispatch &amp; simulation</div>
        </Tile>

        <Tile className="p-3 bg-panel border border-line rounded-lg">
          <div className="flex items-center justify-between text-ink-3 mb-1">
            <span className="text-micro uppercase font-semibold text-blue-500">Field Crew</span>
            <UserFollow size={16} className="text-blue-500 fill-current" />
          </div>
          <div className="text-h2 font-bold text-ink">
            {statsLoading ? "—" : stats?.crews_count ?? 0}
          </div>
          <div className="text-micro text-ink-3 mt-1">Assigned work orders</div>
        </Tile>

        <Tile
          className={`p-3 bg-panel border rounded-lg cursor-pointer transition-all ${
            (stats?.pending_requests_count ?? requests.length) > 0
              ? "border-amber-500/60 bg-amber-500/10 shadow-sm hover:border-amber-400"
              : "border-line hover:border-ink-3/40"
          }`}
          onClick={() => setActiveTab(1)}
        >
          <div className="flex items-center justify-between text-ink-3 mb-1">
            <span className="text-micro uppercase font-semibold text-amber-500">Access Requests</span>
            <Hourglass size={16} className="text-amber-500 fill-current" />
          </div>
          <div className="text-h2 font-bold text-amber-400">
            {statsLoading ? "—" : (stats?.pending_requests_count ?? requests.length)}
          </div>
          <div className="text-micro text-ink-3 mt-1">Pending review</div>
        </Tile>

        <Tile className="p-3 bg-panel border border-line rounded-lg">
          <div className="flex items-center justify-between text-ink-3 mb-1">
            <span className="text-micro uppercase font-semibold">Live Sessions</span>
            <Events size={16} />
          </div>
          <div className="text-h2 font-bold text-ink">
            {statsLoading ? "—" : stats?.active_sessions_count ?? 0}
          </div>
          <div className="text-micro text-ink-3 mt-1">Active refresh tokens</div>
        </Tile>

        <Tile className="p-3 bg-panel border border-line rounded-lg">
          <div className="flex items-center justify-between text-ink-3 mb-1">
            <span className="text-micro uppercase font-semibold">Failed Logins</span>
            <WarningAlt size={16} className={stats?.failed_logins_24h ? "text-amber-500 fill-current" : ""} />
          </div>
          <div className={`text-h2 font-bold ${stats?.failed_logins_24h ? "text-amber-500" : "text-ink"}`}>
            {statsLoading ? "—" : stats?.failed_logins_24h ?? 0}
          </div>
          <div className="text-micro text-ink-3 mt-1">Last 24 hours</div>
        </Tile>
      </div>

      {/* Alert banner when access requests are pending */}
      {requests.length > 0 && activeTab !== 1 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
              <Hourglass size={18} />
            </div>
            <div>
              <div className="text-body font-semibold text-ink flex items-center gap-2">
                Operator Access Requests Awaiting Approval
                <Tag type="warm-gray" size="sm" className="font-semibold !bg-amber-500/20 !text-amber-300 border border-amber-500/30">
                  {requests.length} Pending
                </Tag>
              </div>
              <p className="text-micro text-ink-3">
                {requests.length === 1 ? "1 operator candidate is" : `${requests.length} operator candidates are`} waiting for administrative access approval before they can access the console.
              </p>
            </div>
          </div>
          <Button kind="tertiary" size="sm" onClick={() => setActiveTab(1)} renderIcon={UserFollow}>
            Review Requests ({requests.length})
          </Button>
        </div>
      )}

      {/* Content Switcher */}
      <div className="mt-1">
        <ContentSwitcher
          selectedIndex={activeTab}
          onChange={(evt: any) => setActiveTab(evt.index ?? 0)}
        >
          <Switch name="users" text="User Accounts &amp; Roles" />
          <Switch
            name="requests"
            text={
              requests.length > 0
                ? `Access Requests (${requests.length})`
                : "Access Requests"
            }
          />
          <Switch name="audit" text="Security Audit Trail" />
          <Switch name="policies" text="Security &amp; RBAC Architecture" />
        </ContentSwitcher>
      </div>

      {/* TAB 1: User Management */}
      {activeTab === 0 && (
        <div className="flex flex-col gap-3 mt-2">
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-panel p-3 border border-line rounded-lg">
            <div className="flex flex-1 items-center gap-3 w-full sm:w-auto">
              <div className="w-full sm:w-72">
                <TextInput
                  id="user-search"
                  labelText=""
                  placeholder="Filter by name or email…"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  size="md"
                />
              </div>
              <div className="w-44">
                <Select
                  id="role-filter"
                  labelText=""
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  size="md"
                >
                  <SelectItem value="ALL" text="All Roles" />
                  <SelectItem value="ADMIN" text="Admin" />
                  <SelectItem value="OPERATOR" text="Operator" />
                  <SelectItem value="CREW" text="Crew" />
                </Select>
              </div>
            </div>
            <div className="text-micro text-ink-3 whitespace-nowrap">
              Showing {filteredUsers.length} of {users.length} accounts
            </div>
          </div>

          {/* User Table */}
          <div className="bg-panel border border-line rounded-lg overflow-hidden shadow-panel">
            <Table aria-label="Registered user accounts">
              <TableHead>
                <TableRow>
                  <TableHeader>User Identity</TableHeader>
                  <TableHeader>Assigned Role</TableHeader>
                  <TableHeader>Active Sessions</TableHeader>
                  <TableHeader>Account Created</TableHeader>
                  <TableHeader>Last Observed Activity</TableHeader>
                  <TableHeader className="text-right">Actions</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {usersLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-ink-3 font-mono text-micro">
                      Loading user accounts…
                    </TableCell>
                  </TableRow>
                ) : filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-ink-3 font-mono text-micro">
                      No accounts matched the search criteria.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((u) => {
                    const roleColor = u.role === "admin" ? "red" : u.role === "operator" ? "green" : "blue";
                    return (
                      <TableRow key={u.id} className={u.is_self ? "bg-brand-ink/5" : ""}>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-sunken flex items-center justify-center font-bold text-micro text-ink uppercase border border-line">
                              {u.display_name.slice(0, 2)}
                            </div>
                            <div>
                              <div className="font-semibold text-ink flex items-center gap-1.5">
                                {u.display_name}
                                {u.is_self && (
                                  <span className="text-[10px] bg-brand-ink/15 text-brand-ink px-1.5 py-0.2 rounded uppercase font-bold">
                                    You
                                  </span>
                                )}
                              </div>
                              <div className="font-mono text-micro text-ink-3">{u.email}</div>
                            </div>
                          </div>
                        </TableCell>

                        <TableCell>
                          <div className="flex flex-col gap-1 items-start">
                            <Tag type={roleColor} size="md">
                              {u.role.toUpperCase()}
                            </Tag>
                            {u.status === "pending" && (
                              <Tag type="warm-gray" size="sm" className="font-semibold uppercase tracking-wider !bg-amber-500/20 !text-amber-300 border border-amber-500/30">
                                Pending Approval
                              </Tag>
                            )}
                          </div>
                        </TableCell>

                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${u.active_sessions > 0 ? "bg-green-500" : "bg-ink-3/40"}`} />
                            <span className="font-mono text-micro text-ink">
                              {u.active_sessions} {u.active_sessions === 1 ? "session" : "sessions"}
                            </span>
                          </div>
                        </TableCell>

                        <TableCell className="font-mono text-micro text-ink-2">
                          {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                        </TableCell>

                        <TableCell className="font-mono text-micro text-ink-3">
                          {u.last_activity ? new Date(u.last_activity).toLocaleString("en-GB", { hour12: false }) : "None recorded"}
                        </TableCell>

                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {u.status === "pending" && (
                              <Button
                                kind="primary"
                                size="sm"
                                renderIcon={CheckmarkOutline}
                                disabled={approveRequestMutation.isPending}
                                onClick={() => approveRequestMutation.mutate(u.id)}
                                title="Approve operator access request immediately"
                              >
                                Approve
                              </Button>
                            )}

                            <Button
                              kind="ghost"
                              size="sm"
                              renderIcon={UserAdmin}
                              onClick={() => {
                                setRoleModalUser(u);
                                setSelectedRole(u.role);
                              }}
                            >
                              Role
                            </Button>

                            <Button
                              kind="ghost"
                              size="sm"
                              renderIcon={Restart}
                              disabled={u.active_sessions === 0 || revokeSessionsMutation.isPending}
                              onClick={() => revokeSessionsMutation.mutate(u.id)}
                              title="Revoke all active refresh sessions for this user"
                            >
                              Revoke
                            </Button>

                            <Button
                              kind="danger--ghost"
                              size="sm"
                              renderIcon={TrashCan}
                              disabled={u.is_self || deleteUserMutation.isPending}
                              onClick={() => setDeleteModalUser(u)}
                              title={u.is_self ? "Cannot delete yourself" : "Delete account"}
                              hasIconOnly
                              iconDescription="Delete user"
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* TAB 2: Access Requests */}
      {activeTab === 1 && (
        <div className="flex flex-col gap-3 mt-2 animate-fade-in">
          {/* Header Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-panel p-4 border border-line rounded-lg">
            <div>
              <h2 className="text-h3 font-semibold text-ink flex items-center gap-2">
                <Hourglass size={20} className="text-amber-500 fill-current" />
                Operator Access Requests
                {requests.length > 0 && (
                  <Tag type="warm-gray" size="sm" className="font-semibold !bg-amber-500/20 !text-amber-300 border border-amber-500/30">
                    {requests.length} Pending
                  </Tag>
                )}
              </h2>
              <p className="text-micro text-ink-3 mt-1">
                New accounts who signed up as Operators appear here. They do not have access until you verify and approve their request.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                kind="ghost"
                size="sm"
                renderIcon={Renew}
                onClick={() => refetchRequests()}
              >
                Refresh Queue
              </Button>
            </div>
          </div>

          {/* Access Requests Table */}
          <div className="bg-panel border border-line rounded-lg overflow-hidden shadow-panel">
            <Table aria-label="Pending operator access requests">
              <TableHead>
                <TableRow>
                  <TableHeader>Candidate Identity</TableHeader>
                  <TableHeader>Requested Role</TableHeader>
                  <TableHeader>Current Status</TableHeader>
                  <TableHeader>Request Submitted</TableHeader>
                  <TableHeader className="text-right">Actions</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {requestsLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-ink-3 font-mono text-micro">
                      Loading access requests…
                    </TableCell>
                  </TableRow>
                ) : requests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12">
                      <div className="flex flex-col items-center justify-center max-w-md mx-auto text-center">
                        <div className="w-12 h-12 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center text-green-500 mb-3">
                          <CheckmarkOutline size={24} />
                        </div>
                        <h4 className="text-label font-semibold text-ink">No Pending Access Requests</h4>
                        <p className="text-micro text-ink-3 mt-1 leading-relaxed">
                          All operator registration requests have been reviewed. When someone new signs up as an operator, their email and account will appear here for administrative verification and approval.
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  requests.map((req) => (
                    <TableRow key={req.id} className="hover:bg-sunken/40 transition-colors">
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center font-bold text-micro text-amber-500 uppercase">
                            {req.display_name.slice(0, 2)}
                          </div>
                          <div>
                            <div className="font-semibold text-ink flex items-center gap-1.5">
                              {req.display_name}
                            </div>
                            <div className="font-mono text-micro text-ink-3">{req.email}</div>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell>
                        <Tag type="green" size="md">
                          OPERATOR
                        </Tag>
                      </TableCell>

                      <TableCell>
                        <Tag type="warm-gray" size="md" className="font-semibold uppercase tracking-wider !bg-amber-500/20 !text-amber-300 border border-amber-500/30">
                          Pending Approval
                        </Tag>
                      </TableCell>

                      <TableCell className="font-mono text-micro text-ink-2">
                        {req.created_at
                          ? new Date(req.created_at).toLocaleString("en-GB", { hour12: false })
                          : "—"}
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            kind="primary"
                            size="sm"
                            renderIcon={CheckmarkOutline}
                            disabled={approveRequestMutation.isPending || rejectRequestMutation.isPending}
                            onClick={() => approveRequestMutation.mutate(req.id)}
                            title="Approve access and grant operator role immediately"
                          >
                            Approve Operator
                          </Button>

                          <Button
                            kind="danger--ghost"
                            size="sm"
                            renderIcon={TrashCan}
                            disabled={approveRequestMutation.isPending || rejectRequestMutation.isPending}
                            onClick={() => rejectRequestMutation.mutate(req.id)}
                            title="Reject and dismiss this access request"
                          >
                            Reject
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* TAB 3: Security Audit Trail */}
      {activeTab === 2 && (
        <div className="flex flex-col gap-3 mt-2">
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-panel p-3 border border-line rounded-lg">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-micro uppercase font-semibold text-ink-3 mr-1">Filter Category:</span>
              <Button
                kind={auditCategory === "all" ? "primary" : "ghost"}
                size="sm"
                onClick={() => setAuditCategory("all")}
              >
                All Events
              </Button>
              <Button
                kind={auditCategory === "security" ? "primary" : "ghost"}
                size="sm"
                onClick={() => setAuditCategory("security")}
              >
                Security &amp; Auth
              </Button>
              <Button
                kind={auditCategory === "admin" ? "primary" : "ghost"}
                size="sm"
                onClick={() => setAuditCategory("admin")}
              >
                Admin Actions
              </Button>
              <Button
                kind={auditCategory === "operations" ? "primary" : "ghost"}
                size="sm"
                onClick={() => setAuditCategory("operations")}
              >
                Grid Operations
              </Button>
            </div>

            <div className="w-full sm:w-64">
              <TextInput
                id="audit-search"
                labelText=""
                placeholder="Search actor or action…"
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                size="md"
              />
            </div>
          </div>

          {/* Audit Log Table */}
          <div className="bg-panel border border-line rounded-lg overflow-hidden shadow-panel">
            <Table aria-label="System Security and Operations Audit Trail">
              <TableHead>
                <TableRow>
                  <TableHeader>Timestamp</TableHeader>
                  <TableHeader>Category</TableHeader>
                  <TableHeader>Actor / Initiator</TableHeader>
                  <TableHeader>Action</TableHeader>
                  <TableHeader>Event Payload</TableHeader>
                  <TableHeader className="text-right">Details</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {auditLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-ink-3 font-mono text-micro">
                      Loading audit entries…
                    </TableCell>
                  </TableRow>
                ) : auditLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-ink-3 font-mono text-micro">
                      No audit events found matching query.
                    </TableCell>
                  </TableRow>
                ) : (
                  auditLogs.map((log) => {
                    let badgeType: "red" | "green" | "blue" | "magenta" | "warm-gray" = "warm-gray";
                    if (log.action === "LOGIN_FAILED") badgeType = "red";
                    else if (log.action === "LOGIN") badgeType = "green";
                    else if (log.category === "admin") badgeType = "magenta";
                    else if (log.category === "security") badgeType = "blue";

                    const detailSnippet = typeof log.detail === "object" ? JSON.stringify(log.detail) : String(log.detail || "");

                    return (
                      <TableRow key={log.id}>
                        <TableCell className="font-mono text-micro text-ink-3 whitespace-nowrap">
                          {log.ts ? new Date(log.ts).toLocaleString("en-GB", { hour12: false }) : "—"}
                        </TableCell>

                        <TableCell>
                          <Tag type={badgeType} size="sm">
                            {log.category.toUpperCase()}
                          </Tag>
                        </TableCell>

                        <TableCell className="font-mono text-micro font-semibold text-ink">
                          {log.actor}
                        </TableCell>

                        <TableCell className="font-semibold text-ink text-label">
                          {log.action}
                        </TableCell>

                        <TableCell className="font-mono text-micro text-ink-3 max-w-[280px] truncate" title={detailSnippet}>
                          {detailSnippet}
                        </TableCell>

                        <TableCell className="text-right">
                          <Button
                            kind="ghost"
                            size="sm"
                            onClick={() => setSelectedAudit(log)}
                          >
                            Inspect
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* TAB 4: Security & RBAC Architecture */}
      {activeTab === 3 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
          <Tile className="p-4 bg-panel border border-line rounded-lg">
            <h3 className="text-h3 font-semibold text-ink flex items-center gap-2 mb-3">
              <Security size={18} className="text-brand-ink fill-current" />
              Role-Based Access Control (RBAC) &amp; Operator Onboarding
            </h3>
            <div className="space-y-3 text-label text-ink-2 leading-relaxed">
              <p>
                Authorization in this platform is <strong>server-enforced</strong> through HMAC-SHA256 signed access tokens.
                Client-side UI checks are strictly UX affordances and never define security boundaries.
              </p>
              <div className="p-3 bg-sunken rounded border border-line font-mono text-micro space-y-1.5">
                <div><span className="text-red-500 font-bold">admin:</span> Full console, audit streams, user role administration, access request approvals.</div>
                <div><span className="text-green-500 font-bold">operator:</span> Dispatch, work orders, simulation, SCADA import, area calibrations (requires approval).</div>
                <div><span className="text-blue-500 font-bold">crew:</span> Read-only telemetry, maintenance queue, proof-of-work submission.</div>
              </div>
              <p className="text-micro text-ink-3">
                New operator registrations start in <code className="bg-sunken px-1 rounded text-amber-400">pending</code> status. They cannot access telemetry or grid controls until an administrator approves their request in the <strong>Access Requests</strong> tab.
              </p>
            </div>
          </Tile>

          <Tile className="p-4 bg-panel border border-line rounded-lg">
            <h3 className="text-h3 font-semibold text-ink flex items-center gap-2 mb-3">
              <Locked size={18} className="text-brand-ink fill-current" />
              Token &amp; Session Hygiene
            </h3>
            <div className="space-y-3 text-label text-ink-2 leading-relaxed">
              <p>
                Two-token architecture designed to eliminate XSS token theft and protect long-lived sessions:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-micro text-ink-2">
                <li><strong>Access Tokens:</strong> 15-minute validity, held strictly in memory, never in localStorage.</li>
                <li><strong>Refresh Tokens:</strong> 14-day validity, HttpOnly cookie scoped strictly to <code className="bg-sunken px-1 rounded">/api/auth</code>.</li>
                <li><strong>Cryptographic Revocation:</strong> Stored as SHA-256 hashes in SQLite; revoking terminates sessions immediately.</li>
                <li><strong>Single-use Token Rotation:</strong> Every refresh operation revokes the previous refresh token.</li>
              </ul>
            </div>
          </Tile>
        </div>
      )}

      {/* Role Modification Modal */}
      <Modal
        open={!!roleModalUser}
        modalHeading="Modify User Access Role"
        primaryButtonText={updateRoleMutation.isPending ? "Saving…" : "Confirm Role Update"}
        secondaryButtonText="Cancel"
        onRequestClose={() => setRoleModalUser(null)}
        onRequestSubmit={() => {
          if (roleModalUser) {
            updateRoleMutation.mutate({ userId: roleModalUser.id, role: selectedRole });
          }
        }}
      >
        {roleModalUser && (
          <div className="space-y-4 py-2 font-sans">
            <p className="text-label text-ink-2">
              Updating authorization level for <strong className="text-ink">{roleModalUser.display_name}</strong> ({roleModalUser.email}).
            </p>

            <Select
              id="role-select"
              labelText="Select New Role"
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as any)}
            >
              <SelectItem value="operator" text="Operator (Dispatch, Simulation, Data Ingestion)" />
              <SelectItem value="admin" text="Admin (Full System & User Governance)" />
              <SelectItem value="crew" text="Field Crew (Work Order Resolution Only)" />
            </Select>

            {roleModalUser.is_self && selectedRole !== "admin" && (
              <InlineNotification
                kind="warning"
                title="Self-Demotion Warning"
                subtitle="Demoting your own account will immediately remove your ability to access this Admin Console upon next login."
                hideCloseButton
              />
            )}
          </div>
        )}
      </Modal>

      {/* Delete User Modal */}
      <Modal
        open={!!deleteModalUser}
        danger
        modalHeading="Permanently Delete Account"
        primaryButtonText={deleteUserMutation.isPending ? "Deleting…" : "Delete Account"}
        secondaryButtonText="Cancel"
        onRequestClose={() => setDeleteModalUser(null)}
        onRequestSubmit={() => {
          if (deleteModalUser) {
            deleteUserMutation.mutate(deleteModalUser.id);
          }
        }}
      >
        {deleteModalUser && (
          <div className="space-y-3 py-2 font-sans">
            <p className="text-label text-ink">
              Are you sure you want to permanently delete the account for{" "}
              <strong>{deleteModalUser.email}</strong>?
            </p>
            <p className="text-micro text-ink-3">
              This action cannot be undone. All active sessions and refresh tokens will be immediately purged.
            </p>
          </div>
        )}
      </Modal>

      {/* Audit Detail Modal */}
      <Modal
        open={!!selectedAudit}
        passiveModal
        modalHeading={`Audit Event #${selectedAudit?.id || ""} Details`}
        onRequestClose={() => setSelectedAudit(null)}
      >
        {selectedAudit && (
          <div className="space-y-3 py-2 font-sans">
            <div className="grid grid-cols-2 gap-2 text-label">
              <div>
                <span className="text-micro uppercase font-semibold text-ink-3 block">Action</span>
                <span className="font-bold text-ink">{selectedAudit.action}</span>
              </div>
              <div>
                <span className="text-micro uppercase font-semibold text-ink-3 block">Category</span>
                <Tag type="magenta" size="sm">{selectedAudit.category.toUpperCase()}</Tag>
              </div>
              <div>
                <span className="text-micro uppercase font-semibold text-ink-3 block">Actor</span>
                <span className="font-mono text-micro text-ink">{selectedAudit.actor}</span>
              </div>
              <div>
                <span className="text-micro uppercase font-semibold text-ink-3 block">Timestamp</span>
                <span className="font-mono text-micro text-ink-2">{selectedAudit.ts}</span>
              </div>
            </div>

            <div>
              <span className="text-micro uppercase font-semibold text-ink-3 block mb-1">Raw Payload</span>
              <pre className="p-3 bg-sunken rounded border border-line font-mono text-micro text-ink overflow-x-auto max-h-60">
                {JSON.stringify(selectedAudit.detail, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
