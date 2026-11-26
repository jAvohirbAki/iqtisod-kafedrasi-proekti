"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  History,
  Info,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ServerCrash,
  ShieldAlert,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  UserX,
} from "lucide-react";
import { PortalShell, ShellUser } from "./PortalShell";
import { PortalEmptyState } from "./PortalEmptyState";
import {
  ISSUE_SEVERITY_LABELS,
  ISSUE_SOURCE_LABELS,
  ISSUE_STATUS_LABELS,
  ROLE_LABELS,
} from "@/lib/domain";
import type { IssueSeverity, IssueSource, IssueStatus, Role } from "@prisma/client";

interface SystemIssueItem {
  id: string;
  title: string;
  message: string;
  severity: IssueSeverity;
  source: IssueSource;
  status: IssueStatus;
  route: string | null;
  method: string | null;
  statusCode: number | null;
  stackTrace: string | null;
  metadata: string | null;
  fingerprint: string;
  occurrenceCount: number;
  lastOccurredAt: string;
  resolutionNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
  reportedBy: { id: string; fullName: string; email: string; role: Role } | null;
  resolvedBy: { id: string; fullName: string; email: string } | null;
}

interface AdminUserItem {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  phone: string | null;
  academicTitle: string | null;
  isActive: boolean;
  groupId: string | null;
  group: { id: string; name: string } | null;
  department: { id: string; name: string; code: string } | null;
  createdAt: string;
}

interface DiagnosticCheck {
  key: string;
  label: string;
  status: "ok" | "warning" | "error";
  latencyMs: number;
  detail: string;
}

interface AdminOverviewData {
  stats: {
    openIssuesCount: number;
    criticalIssuesCount: number;
    resolvedIssuesCount: number;
    totalUsersCount: number;
    activeUsersCount: number;
    inactiveUsersCount: number;
    assignmentsCount: number;
    submissionsCount: number;
    grading: { awaitingReview: number; inReview: number; graded: number; returned: number; late: number };
    kpiEntriesCount: number;
    auditLogsCount: number;
  };
  diagnostics: {
    overallStatus: "healthy" | "degraded" | "critical";
    checkedAt: string;
    uptimeSeconds: number;
    nodeVersion: string;
    checks: DiagnosticCheck[];
  };
  issues: SystemIssueItem[];
  users: AdminUserItem[];
  groups: { id: string; name: string; courseYear: number }[];
  auditLogs: {
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    oldValue: string | null;
    newValue: string | null;
    reason: string | null;
    createdAt: string;
    actor: { id: string; fullName: string; role: Role; email: string };
  }[];
}

const SEVERITY_BADGE: Record<IssueSeverity, string> = {
  INFO: "bg-sky-50 text-sky-700 border-sky-200",
  WARNING: "bg-amber-50 text-amber-800 border-amber-200",
  ERROR: "bg-orange-50 text-orange-800 border-orange-200",
  CRITICAL: "bg-rose-50 text-rose-800 border-rose-200",
};

const ISSUE_STATUS_BADGE: Record<IssueStatus, string> = {
  OPEN: "bg-rose-50 text-rose-700 border-rose-200",
  ACKNOWLEDGED: "bg-amber-50 text-amber-800 border-amber-200",
  RESOLVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  IGNORED: "bg-slate-100 text-slate-600 border-slate-200",
};

export function AdminDashboard({ user }: { user: ShellUser }) {
  const [activeTab, setActiveTab] = useState("issues");
  const [data, setData] = useState<AdminOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningDiag, setRunningDiag] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null
  );

  // Issue filters & expandable detail state
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");
  const [sourceFilter, setSourceFilter] = useState<string>("ALL");
  const [issueQuery, setIssueQuery] = useState("");
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");

  // Manual issue creation form
  const [showNewIssue, setShowNewIssue] = useState(false);
  const [issueForm, setIssueForm] = useState({
    title: "",
    message: "",
    severity: "WARNING" as IssueSeverity,
    source: "HEALTH_CHECK" as IssueSource,
    route: "",
  });

  // User management state
  const [userSearch, setUserSearch] = useState("");
  const [resetPwUserId, setResetPwUserId] = useState<string | null>(null);
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [userForm, setUserForm] = useState({
    fullName: "",
    email: "",
    password: "",
    role: "TEACHER" as Role,
    academicTitle: "",
    phone: "",
    groupId: "",
  });

  const loadData = useCallback((signal?: AbortSignal) =>
    fetch("/api/admin/overview", { signal })
      .then((response) => response.ok ? response.json() : null)
      .then((result) => {
        if (result && !signal?.aborted) setData(result);
      })
      .catch(() => {})
      .finally(() => {
        if (!signal?.aborted) setLoading(false);
      }),
  []);

  useEffect(() => {
    const controller = new AbortController();
    void loadData(controller.signal);
    return () => controller.abort();
  }, [loadData]);

  const filteredIssues = useMemo(() => {
    if (!data) return [];
    const q = issueQuery.trim().toLowerCase();
    return data.issues.filter((issue) => {
      if (statusFilter !== "ALL" && issue.status !== statusFilter) return false;
      if (severityFilter !== "ALL" && issue.severity !== severityFilter) return false;
      if (sourceFilter !== "ALL" && issue.source !== sourceFilter) return false;
      if (q) {
        const hay = `${issue.title} ${issue.message} ${issue.route ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, statusFilter, severityFilter, sourceFilter, issueQuery]);

  const filteredUsers = useMemo(() => {
    if (!data) return [];
    const q = userSearch.trim().toLowerCase();
    if (!q) return data.users;
    return data.users.filter((u) =>
      `${u.fullName} ${u.email} ${u.role} ${u.academicTitle ?? ""}`.toLowerCase().includes(q)
    );
  }, [data, userSearch]);

  async function handleRunDiagnostics() {
    setFeedbackMsg(null);
    setRunningDiag(true);
    try {
      const res = await fetch("/api/admin/diagnostics", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setFeedbackMsg({ type: "err", text: json.error ?? "Diagnostika xatoligi" });
        return;
      }
      await loadData();
      setFeedbackMsg({
        type: "ok",
        text: `Tizim diagnostikasi yakunlandi: ${
          json.diagnostics.overallStatus === "healthy"
            ? "Barcha komponentlar barqaror"
            : "Ogohlantirish yoki muammolar aniqlandi"
        }`,
      });
    } finally {
      setRunningDiag(false);
    }
  }

  async function handleIssueStatusChange(
    id: string,
    status: IssueStatus,
    note?: string
  ) {
    setFeedbackMsg(null);
    const res = await fetch(`/api/admin/issues/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        resolutionNote: note !== undefined ? note : undefined,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setFeedbackMsg({ type: "err", text: json.error ?? "Holatni yangilab bo'lmadi" });
      return;
    }
    setResolvingId(null);
    setResolutionNote("");
    await loadData();
    setFeedbackMsg({
      type: "ok",
      text: `Muammo holati "${ISSUE_STATUS_LABELS[status]}" ga o'zgartirildi.`,
    });
  }

  async function handleDeleteIssue(id: string) {
    setFeedbackMsg(null);
    const res = await fetch(`/api/admin/issues/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setFeedbackMsg({ type: "err", text: json.error ?? "O'chirishda xatolik" });
      return;
    }
    await loadData();
    setFeedbackMsg({ type: "ok", text: "Muammo yozuvi o'chirildi." });
  }

  async function handleCreateIssue(e: React.FormEvent) {
    e.preventDefault();
    setFeedbackMsg(null);
    const res = await fetch("/api/admin/issues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(issueForm),
    });
    const json = await res.json();
    if (!res.ok) {
      setFeedbackMsg({ type: "err", text: json.error ?? "Yozuv yaratib bo'lmadi" });
      return;
    }
    setIssueForm({
      title: "",
      message: "",
      severity: "WARNING",
      source: "HEALTH_CHECK",
      route: "",
    });
    setShowNewIssue(false);
    await loadData();
    setFeedbackMsg({ type: "ok", text: "Yangi tizim muammosi qayd etildi." });
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setFeedbackMsg(null);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...userForm,
        groupId: userForm.role === "STUDENT" ? userForm.groupId || null : null,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setFeedbackMsg({ type: "err", text: json.error ?? "Foydalanuvchi yaratilmadi" });
      return;
    }
    setUserForm({
      fullName: "",
      email: "",
      password: "",
      role: "TEACHER",
      academicTitle: "",
      phone: "",
      groupId: "",
    });
    await loadData();
    setFeedbackMsg({ type: "ok", text: "Yangi foydalanuvchi tizimga qo'shildi." });
  }

  async function handleUpdateUser(
    id: string,
    payload: { isActive?: boolean; role?: Role; newPassword?: string }
  ) {
    setFeedbackMsg(null);
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) {
      setFeedbackMsg({ type: "err", text: json.error ?? "Foydalanuvchini yangilab bo'lmadi" });
      return;
    }
    setResetPwUserId(null);
    setNewPasswordInput("");
    await loadData();
    setFeedbackMsg({ type: "ok", text: "Foydalanuvchi ma'lumotlari yangilandi." });
  }

  const navItems = [
    {
      id: "issues",
      label: "Xatoliklar va Muammolar",
      badge: data?.stats.openIssuesCount ?? 0,
    },
    { id: "diagnostics", label: "Tizim diagnostikasi" },
    { id: "grading", label: "Vazifalar va baholash" },
    { id: "users", label: "Foydalanuvchilar", badge: data?.stats.totalUsersCount ?? 0 },
    { id: "audit", label: "Audit jurnali" },
  ];

  return (
    <PortalShell
      user={user}
      navItems={navItems}
      activeTab={activeTab}
      onTabChange={setActiveTab}
    >
      {loading ? (
        <div className="flex items-center justify-center py-20 text-sm text-slate-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Tizim ma&apos;lumotlari yuklanmoqda...
        </div>
      ) : !data ? (
        <PortalEmptyState
          title="Admin paneli ma’lumotlarini yuklab bo‘lmadi"
          description="Internet aloqasini tekshirib, qayta urinib ko‘ring."
          action={<button type="button" className="text-sm font-semibold text-indigo-700 underline" onClick={() => {
            setLoading(true);
            void loadData();
          }}>Qayta yuklash</button>}
        />
      ) : (
        <div className="space-y-6">
          {/* Top KPI & Health Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Ochiq muammolar</span>
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              </div>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {data.stats.openIssuesCount}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Hal qilingan: {data.stats.resolvedIssuesCount} ta
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Kritik nosozliklar</span>
                <AlertOctagon className="h-4 w-4 text-rose-600" />
              </div>
              <p className="mt-2 text-2xl font-bold text-rose-600">
                {data.stats.criticalIssuesCount}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Tezkor aralashuv talab etiladi
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Tizim holati</span>
                <Activity className="h-4 w-4 text-indigo-600" />
              </div>
              <p className="mt-2 text-lg font-bold">
                {data.diagnostics.overallStatus === "healthy" ? (
                  <span className="text-emerald-600">Barqaror (Healthy)</span>
                ) : data.diagnostics.overallStatus === "degraded" ? (
                  <span className="text-amber-600">Ogohlantirish (Degraded)</span>
                ) : (
                  <span className="text-rose-600">Kritik (Critical)</span>
                )}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Node {data.diagnostics.nodeVersion} • Uptime {data.diagnostics.uptimeSeconds}s
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Foydalanuvchilar</span>
                <Users className="h-4 w-4 text-sky-600" />
              </div>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {data.stats.activeUsersCount} / {data.stats.totalUsersCount}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Bloklangan: {data.stats.inactiveUsersCount} ta
              </p>
            </div>
          </div>

          {feedbackMsg && (
            <div
              className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-xs sm:text-sm font-medium ${
                feedbackMsg.type === "ok"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-rose-200 bg-rose-50 text-rose-800"
              }`}
            >
              {feedbackMsg.type === "ok" ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              ) : (
                <ShieldAlert className="h-4 w-4 shrink-0" />
              )}
              <span>{feedbackMsg.text}</span>
            </div>
          )}

          {/* TAB 1: SYSTEM ISSUES */}
          {activeTab === "issues" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={issueQuery}
                      onChange={(e) => setIssueQuery(e.target.value)}
                      placeholder="Xatolik, marshrut bo'yicha qidirish..."
                      className="rounded-xl border border-slate-300 bg-white pl-9 pr-3 py-1.5 text-xs sm:text-sm focus:border-indigo-500 focus:outline-none"
                    />
                  </div>

                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs sm:text-sm"
                  >
                    <option value="ALL">Barcha holatlar</option>
                    {Object.entries(ISSUE_STATUS_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>

                  <select
                    value={severityFilter}
                    onChange={(e) => setSeverityFilter(e.target.value)}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs sm:text-sm"
                  >
                    <option value="ALL">Barcha darajalar</option>
                    {Object.entries(ISSUE_SEVERITY_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>

                  <select
                    value={sourceFilter}
                    onChange={(e) => setSourceFilter(e.target.value)}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs sm:text-sm"
                  >
                    <option value="ALL">Barcha manbalar</option>
                    {Object.entries(ISSUE_SOURCE_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRunDiagnostics}
                    disabled={runningDiag}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${runningDiag ? "animate-spin" : ""}`} />
                    Diagnostika
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowNewIssue((v) => !v)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-700 transition"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Muammo qayd etish
                  </button>
                </div>
              </div>

              {showNewIssue && (
                <form
                  onSubmit={handleCreateIssue}
                  className="rounded-2xl border border-indigo-200 bg-white p-5 shadow-sm space-y-4"
                >
                  <h3 className="text-sm font-bold text-slate-900">
                    Yangi texnik muammo yoki profilaktika qaydi
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      type="text"
                      required
                      value={issueForm.title}
                      onChange={(e) => setIssueForm({ ...issueForm, title: e.target.value })}
                      placeholder="Muammo sarlavhasi"
                      className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    />
                    <input
                      type="text"
                      value={issueForm.route}
                      onChange={(e) => setIssueForm({ ...issueForm, route: e.target.value })}
                      placeholder="Marshrut (masalan: /api/teacher/kpi)"
                      className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    />
                    <select
                      value={issueForm.severity}
                      onChange={(e) =>
                        setIssueForm({ ...issueForm, severity: e.target.value as IssueSeverity })
                      }
                      className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    >
                      {Object.entries(ISSUE_SEVERITY_LABELS).map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={issueForm.source}
                      onChange={(e) =>
                        setIssueForm({ ...issueForm, source: e.target.value as IssueSource })
                      }
                      className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    >
                      {Object.entries(ISSUE_SOURCE_LABELS).map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <textarea
                    required
                    rows={2}
                    value={issueForm.message}
                    onChange={(e) => setIssueForm({ ...issueForm, message: e.target.value })}
                    placeholder="Batafsil tavsif..."
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowNewIssue(false)}
                      className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
                    >
                      Bekor qilish
                    </button>
                    <button
                      type="submit"
                      className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                    >
                      Saqlash
                    </button>
                  </div>
                </form>
              )}

              <div className="space-y-3">
                {filteredIssues.length === 0 ? (
                  <PortalEmptyState title="Tizim muammolari topilmadi" description="Boshqa natijalarni ko‘rish uchun qidiruv yoki filtrlarni o‘zgartiring." />
                ) : (
                  filteredIssues.map((issue) => {
                    const expanded = expandedIssueId === issue.id;
                    return (
                      <div
                        key={issue.id}
                        className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${SEVERITY_BADGE[issue.severity]}`}
                              >
                                {ISSUE_SEVERITY_LABELS[issue.severity]}
                              </span>
                              <span
                                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${ISSUE_STATUS_BADGE[issue.status]}`}
                              >
                                {ISSUE_STATUS_LABELS[issue.status]}
                              </span>
                              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-700">
                                {ISSUE_SOURCE_LABELS[issue.source]}
                              </span>
                              {issue.occurrenceCount > 1 && (
                                <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700">
                                  {issue.occurrenceCount} marta takrorlangan
                                </span>
                              )}
                            </div>

                            <h3 className="text-sm sm:text-base font-bold text-slate-900">
                              {issue.title}
                            </h3>
                            <p className="text-xs sm:text-sm text-slate-600">{issue.message}</p>

                            <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-slate-500">
                              {issue.route && (
                                <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-700">
                                  {issue.method ? `${issue.method} ` : ""}
                                  {issue.route}
                                  {issue.statusCode ? ` (${issue.statusCode})` : ""}
                                </code>
                              )}
                              <span>
                                Oxirgi marta:{" "}
                                {new Date(issue.lastOccurredAt).toLocaleString("uz-UZ")}
                              </span>
                              {issue.reportedBy && (
                                <span>
                                  Foydalanuvchi: {issue.reportedBy.fullName} (
                                  {ROLE_LABELS[issue.reportedBy.role]})
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            {issue.status === "OPEN" && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleIssueStatusChange(issue.id, "ACKNOWLEDGED")
                                }
                                className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                              >
                                Ko&apos;rib chiqish
                              </button>
                            )}
                            {issue.status !== "RESOLVED" && (
                              <button
                                type="button"
                                onClick={() => {
                                  setResolvingId(resolvingId === issue.id ? null : issue.id);
                                  setResolutionNote(issue.resolutionNote ?? "");
                                }}
                                className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                              >
                                Hal qilindi
                              </button>
                            )}
                            {issue.status !== "IGNORED" && issue.status !== "RESOLVED" && (
                              <button
                                type="button"
                                onClick={() => handleIssueStatusChange(issue.id, "IGNORED")}
                                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                              >
                                E&apos;tiborsiz
                              </button>
                            )}
                            {(issue.status === "RESOLVED" || issue.status === "IGNORED") && (
                              <button
                                type="button"
                                onClick={() => handleIssueStatusChange(issue.id, "OPEN")}
                                className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                              >
                                Qayta ochish
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedIssueId(expanded ? null : issue.id)
                              }
                              className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"
                              title="Texnik tafsilotlar"
                            >
                              {expanded ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteIssue(issue.id)}
                              className="rounded-lg border border-rose-200 p-1.5 text-rose-600 hover:bg-rose-50"
                              title="O'chirish"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        {resolvingId === issue.id && (
                          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                            <input
                              type="text"
                              value={resolutionNote}
                              onChange={(e) => setResolutionNote(e.target.value)}
                              placeholder="Qanday tuzatilgani haqida izoh (ixtiyoriy)..."
                              className="flex-1 min-w-[200px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                handleIssueStatusChange(issue.id, "RESOLVED", resolutionNote)
                              }
                              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                            >
                              Tasdiqlash
                            </button>
                          </div>
                        )}

                        {issue.resolutionNote && issue.status === "RESOLVED" && (
                          <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                            <strong>Yechim izohi:</strong> {issue.resolutionNote}
                            {issue.resolvedBy ? ` — ${issue.resolvedBy.fullName}` : ""}
                          </p>
                        )}

                        {expanded && (
                          <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-xs">
                            <p className="text-slate-500">
                              <strong>Fingerprint:</strong>{" "}
                              <code className="font-mono">{issue.fingerprint}</code> •{" "}
                              <strong>Birinchi qayd:</strong>{" "}
                              {new Date(issue.createdAt).toLocaleString("uz-UZ")}
                            </p>
                            {issue.metadata && (
                              <div>
                                <p className="font-semibold text-slate-700 mb-1">Metadata:</p>
                                <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-[11px] text-slate-100">
                                  {issue.metadata}
                                </pre>
                              </div>
                            )}
                            {issue.stackTrace && (
                              <div>
                                <p className="font-semibold text-slate-700 mb-1">Stack trace:</p>
                                <pre className="max-h-52 overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] text-rose-200">
                                  {issue.stackTrace}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 2: SYSTEM DIAGNOSTICS */}
          {activeTab === "diagnostics" && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Tizim infratuzilmasi va komponentlar diagnostikasi
                  </h2>
                  <p className="text-xs text-slate-500">
                    Oxirgi tekshiruv:{" "}
                    {new Date(data.diagnostics.checkedAt).toLocaleString("uz-UZ")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRunDiagnostics}
                  disabled={runningDiag}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  <RefreshCw className={`h-4 w-4 ${runningDiag ? "animate-spin" : ""}`} />
                  Jonli tekshiruvni ishga tushirish
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {data.diagnostics.checks.map((check) => (
                  <div
                    key={check.key}
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-900">{check.label}</span>
                      {check.status === "ok" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          OK
                        </span>
                      ) : check.status === "warning" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                          <Info className="h-3.5 w-3.5" />
                          Ogohlantirish
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
                          <ServerCrash className="h-3.5 w-3.5" />
                          Xatolik
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-slate-600">{check.detail}</p>
                    <p className="mt-2 text-[11px] font-mono text-slate-400">
                      Javob vaqti: {check.latencyMs} ms
                    </p>
                  </div>
                ))}
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-medium text-slate-500">Jami vazifalar</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">
                    {data.stats.assignmentsCount}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-medium text-slate-500">Topshirilgan ishlar</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">
                    {data.stats.submissionsCount}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-medium text-slate-500">KPI yozuvlari</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">
                    {data.stats.kpiEntriesCount}
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === "grading" && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-bold text-slate-900">Topshiriqlar statistikasi</h2>
                <button
                  type="button"
                  onClick={() => void loadData()}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Yangilash
                </button>
              </div>
              <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["Jami vazifalar", data.stats.assignmentsCount],
                  ["Topshirilgan ishlar", data.stats.submissionsCount],
                  ["Kechiktirib topshirilgan", data.stats.grading.late],
                  ["Tekshiruvni kutmoqda", data.stats.grading.awaitingReview],
                  ["Tekshirilmoqda", data.stats.grading.inReview],
                  ["Baholangan", data.stats.grading.graded],
                  ["Qayta ishlashga qaytarilgan", data.stats.grading.returned],
                ].map(([label, count]) => (
                  <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <dt className="text-xs font-medium text-slate-600">{label}</dt>
                    <dd className="mt-1 text-xl font-bold text-slate-900">{count}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {/* TAB 3: USER MANAGEMENT */}
          {activeTab === "users" && (
            <div className="grid gap-6 lg:grid-cols-3">
              <form
                onSubmit={handleCreateUser}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3 h-fit"
              >
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  <UserPlus className="h-4 w-4 text-indigo-600" />
                  Yangi foydalanuvchi qo&apos;shish
                </div>
                <input
                  type="text"
                  required
                  value={userForm.fullName}
                  onChange={(e) => setUserForm({ ...userForm, fullName: e.target.value })}
                  placeholder="F.I.Sh."
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                  type="email"
                  required
                  value={userForm.email}
                  onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                  placeholder="Email manzil"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={userForm.password}
                  onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                  placeholder="Parol (kamida 6 belgi)"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                />
                <select
                  value={userForm.role}
                  onChange={(e) =>
                    setUserForm({ ...userForm, role: e.target.value as Role })
                  }
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                >
                  {Object.entries(ROLE_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
                {userForm.role === "STUDENT" && (
                  <select
                    required
                    value={userForm.groupId}
                    onChange={(e) => setUserForm({ ...userForm, groupId: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="">Akademik guruhni tanlang</option>
                    {data.groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} ({g.courseYear}-kurs)
                      </option>
                    ))}
                  </select>
                )}
                <input
                  type="text"
                  value={userForm.academicTitle}
                  onChange={(e) =>
                    setUserForm({ ...userForm, academicTitle: e.target.value })
                  }
                  placeholder="Lavozim / Ilmiy unvon (ixtiyoriy)"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  className="w-full rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                  Foydalanuvchi yaratish
                </button>
              </form>

              <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-sm font-bold text-slate-900">
                    Tizimdagi barcha foydalanuvchilar ({filteredUsers.length})
                  </h2>
                  <div className="relative">
                    <Search className="absolute left-3 top-2 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      placeholder="Ism, email yoki rol..."
                      className="rounded-xl border border-slate-300 pl-9 pr-3 py-1.5 text-xs"
                    />
                  </div>
                </div>

                <div className="divide-y divide-slate-100">
                  {!filteredUsers.length && <PortalEmptyState title="Foydalanuvchi topilmadi" description="Boshqa ism yoki elektron pochta bo‘yicha qidiring." />}
                  {filteredUsers.map((u) => (
                    <div key={u.id} className="py-3 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-900">
                              {u.fullName}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                u.isActive
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-rose-50 text-rose-700"
                              }`}
                            >
                              {u.isActive ? "Faol" : "Bloklangan"}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500">
                            {u.email}
                            {u.academicTitle ? ` • ${u.academicTitle}` : ""}
                            {u.group ? ` • ${u.group.name}` : ""}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            value={u.role}
                            disabled={u.id === user.id}
                            onChange={(e) =>
                              handleUpdateUser(u.id, { role: e.target.value as Role })
                            }
                            className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs disabled:opacity-60"
                          >
                            {Object.entries(ROLE_LABELS).map(([k, label]) => (
                              <option key={k} value={k}>
                                {label}
                              </option>
                            ))}
                          </select>

                          <button
                            type="button"
                            onClick={() => {
                              setResetPwUserId(resetPwUserId === u.id ? null : u.id);
                              setNewPasswordInput("");
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <KeyRound className="h-3.5 w-3.5" />
                            Parol
                          </button>

                          {u.id !== user.id && (
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateUser(u.id, { isActive: !u.isActive })
                              }
                              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium ${
                                u.isActive
                                  ? "border-rose-200 text-rose-700 hover:bg-rose-50"
                                  : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                              }`}
                            >
                              {u.isActive ? (
                                <>
                                  <UserX className="h-3.5 w-3.5" />
                                  Bloklash
                                </>
                              ) : (
                                <>
                                  <UserCheck className="h-3.5 w-3.5" />
                                  Faollashtirish
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      {resetPwUserId === u.id && (
                        <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-2">
                          <input
                            type="password"
                            minLength={6}
                            value={newPasswordInput}
                            onChange={(e) => setNewPasswordInput(e.target.value)}
                            placeholder="Yangi parol (kamida 6 belgi)"
                            className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs"
                          />
                          <button
                            type="button"
                            disabled={newPasswordInput.length < 6}
                            onClick={() =>
                              handleUpdateUser(u.id, { newPassword: newPasswordInput })
                            }
                            className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            Saqlash
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: AUDIT LOGS */}
          {activeTab === "audit" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <History className="h-4 w-4 text-indigo-600" />
                <h2 className="text-sm font-bold text-slate-900">
                  Tizim Audit Jurnali (oxirgi {data.auditLogs.length} ta amal)
                </h2>
              </div>
              <div className="divide-y divide-slate-100">
                {!data.auditLogs.length && <PortalEmptyState title="Audit yozuvlari hali yo‘q" />}
                {data.auditLogs.map((log) => (
                  <div key={log.id} className="py-3 text-xs space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-indigo-50 px-2 py-0.5 font-mono font-semibold text-indigo-700">
                          {log.action}
                        </span>
                        <span className="font-semibold text-slate-900">
                          {log.actor.fullName}
                        </span>
                        <span className="text-slate-500">
                          ({ROLE_LABELS[log.actor.role]})
                        </span>
                      </div>
                      <span className="text-slate-400">
                        {new Date(log.createdAt).toLocaleString("uz-UZ")}
                      </span>
                    </div>
                    <p className="text-slate-600">
                      Obyekt: <code>{log.entityType}</code> ({log.entityId})
                      {log.reason ? ` • Sabab: ${log.reason}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </PortalShell>
  );
}
