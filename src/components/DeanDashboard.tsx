"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  ClipboardCheck,
  Download,
  ExternalLink,
  FileText,
  History,
  Layers,
  Plus,
  Users,
  XCircle,
} from "lucide-react";
import { PortalShell, ShellUser } from "./PortalShell";
import { KPI_BLOCK_META, KPI_STATUS_LABELS, ROLE_LABELS } from "@/lib/domain";
import type { KpiBlock, KpiStatus, Role } from "@prisma/client";

interface DeanOverviewData {
  department: { name: string; code: string; faculty: string; headName: string | null } | null;
  stats: {
    teachersCount: number;
    studentsCount: number;
    groupsCount: number;
    subjectsCount: number;
    assignmentsCount: number;
    submissionsCount: number;
    gradedSubmissionsCount: number;
    pendingKpiCount: number;
  };
  groups: {
    id: string;
    name: string;
    courseYear: number;
    semester: number;
    specialty: string;
    _count: { students: number; assignments: number };
  }[];
  subjects: {
    id: string;
    name: string;
    code: string;
    credits: number;
    semester: number;
    teachings: {
      id: string;
      teacher: { id: string; fullName: string };
      group: { id: string; name: string };
    }[];
  }[];
  users: {
    id: string;
    fullName: string;
    email: string;
    role: Role;
    academicTitle: string | null;
    group: { id: string; name: string } | null;
  }[];
  kpiCriteria: {
    id: string;
    code: string;
    title: string;
    block: KpiBlock;
    pointsPerUnit: number;
    maxPoints: number | null;
    description: string;
  }[];
  kpiEntries: {
    id: string;
    title: string;
    description: string | null;
    academicYear: string;
    semester: string;
    quantity: number;
    calculatedScore: number;
    approvedScore: number | null;
    proofUrl: string | null;
    proofFileName: string | null;
    proofFilePath: string | null;
    status: KpiStatus;
    reviewComment: string | null;
    createdAt: string;
    teacher: { id: string; fullName: string; academicTitle: string | null };
    criterion: { id: string; code: string; title: string; block: KpiBlock };
  }[];
  teacherKpiSummary: {
    teacherId: string;
    fullName: string;
    academicTitle: string | null;
    totalApprovedScore: number;
    pendingCount: number;
    approvedCount: number;
    byBlock: Record<KpiBlock, number>;
  }[];
  auditLogs: {
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    oldValue: string | null;
    newValue: string | null;
    reason: string | null;
    createdAt: string;
    actor: { fullName: string; role: Role };
  }[];
}

export function DeanDashboard({ user }: { user: ShellUser }) {
  const [activeTab, setActiveTab] = useState("kpi");
  const [data, setData] = useState<DeanOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null
  );

  // KPI review state
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewScore, setReviewScore] = useState<string>("");
  const [reviewComment, setReviewComment] = useState<string>("");

  // Forms
  const [groupForm, setGroupForm] = useState({
    name: "",
    courseYear: "3",
    semester: "5",
    specialty: "",
  });
  const [subjectForm, setSubjectForm] = useState({
    name: "",
    code: "",
    credits: "6",
    semester: "5",
  });
  const [teachingForm, setTeachingForm] = useState({
    subjectId: "",
    teacherId: "",
    groupId: "",
  });
  const [userForm, setUserForm] = useState({
    fullName: "",
    email: "",
    password: "",
    role: "STUDENT" as Role,
    academicTitle: "",
    groupId: "",
  });
  const [criterionForm, setCriterionForm] = useState({
    code: "",
    title: "",
    block: "SCIENTIFIC" as KpiBlock,
    pointsPerUnit: "10",
    maxPoints: "30",
    description: "",
  });

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/dean/overview");
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/dean/overview")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (active && json) setData(json);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleKpiDecision(id: string, decision: "APPROVED" | "REJECTED") {
    setFeedbackMsg(null);
    const res = await fetch(`/api/dean/kpi/${id}/review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision,
        approvedScore: reviewScore ? Number(reviewScore) : undefined,
        reviewComment,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setFeedbackMsg({ type: "err", text: json.error ?? "Xatolik yuz berdi" });
      return;
    }
    setReviewingId(null);
    setReviewComment("");
    setReviewScore("");
    setFeedbackMsg({
      type: "ok",
      text: decision === "APPROVED" ? "KPI yozuvi tasdiqlandi" : "KPI yozuvi rad etildi",
    });
    await loadData();
  }

  async function submitAcademic(payload: Record<string, unknown>, successText: string) {
    setFeedbackMsg(null);
    const res = await fetch("/api/dean/academics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) {
      setFeedbackMsg({ type: "err", text: json.error ?? "Saqlashda xatolik" });
      return false;
    }
    setFeedbackMsg({ type: "ok", text: successText });
    await loadData();
    return true;
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setFeedbackMsg(null);
    const res = await fetch("/api/dean/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...userForm,
        groupId: userForm.role === "STUDENT" ? userForm.groupId : null,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setFeedbackMsg({ type: "err", text: json.error ?? "Foydalanuvchi yaratishda xatolik" });
      return;
    }
    setUserForm({
      fullName: "",
      email: "",
      password: "",
      role: "STUDENT",
      academicTitle: "",
      groupId: "",
    });
    setFeedbackMsg({ type: "ok", text: "Yangi foydalanuvchi muvaffaqiyatli qo'shildi" });
    await loadData();
  }

  async function handleCreateCriterion(e: React.FormEvent) {
    e.preventDefault();
    setFeedbackMsg(null);
    const res = await fetch("/api/dean/kpi-criteria", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...criterionForm,
        pointsPerUnit: Number(criterionForm.pointsPerUnit),
        maxPoints: criterionForm.maxPoints ? Number(criterionForm.maxPoints) : null,
        requiresProof: true,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setFeedbackMsg({ type: "err", text: json.error ?? "Mezon qo'shishda xatolik" });
      return;
    }
    setCriterionForm({
      code: "",
      title: "",
      block: "SCIENTIFIC",
      pointsPerUnit: "10",
      maxPoints: "30",
      description: "",
    });
    setFeedbackMsg({ type: "ok", text: "Yangi KPI mezoni qo'shildi" });
    await loadData();
  }

  const teachers = data?.users.filter((u) => u.role === "TEACHER") ?? [];

  return (
    <PortalShell
      user={user}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      navItems={[
        {
          id: "kpi",
          label: "KPI Moderatsiya & Reyting",
          badge: data?.stats.pendingKpiCount ?? 0,
        },
        { id: "academics", label: "Guruhlar & Fanlar" },
        { id: "users", label: "Foydalanuvchilar" },
        { id: "criteria", label: "KPI Mezonlari" },
        { id: "audit", label: "Audit Log" },
      ]}
    >
      {feedbackMsg && (
        <div
          className={`mb-4 rounded-xl border px-4 py-3 text-sm font-medium ${
            feedbackMsg.type === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {feedbackMsg.text}
        </div>
      )}

      {/* Stat Cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Kafedra o&apos;qituvchilari</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {data?.stats.teachersCount ?? "—"}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Talabalar: {data?.stats.studentsCount ?? 0} ta
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Guruhlar va Fanlar</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {data?.stats.groupsCount ?? 0} / {data?.stats.subjectsCount ?? 0}
          </p>
          <p className="mt-1 text-xs text-slate-400">Akademik birliklar</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Kutilayotgan KPI arizalar</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">
            {data?.stats.pendingKpiCount ?? 0}
          </p>
          <p className="mt-1 text-xs text-slate-400">Tekshiruv talab qiladi</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">O&apos;quv topshiriqlar</p>
          <p className="mt-1 text-2xl font-bold text-indigo-600">
            {data?.stats.gradedSubmissionsCount ?? 0} / {data?.stats.submissionsCount ?? 0}
          </p>
          <p className="mt-1 text-xs text-slate-400">Baholangan / Jami topshirilgan</p>
        </div>
      </div>

      {loading && !data ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          Ma&apos;lumotlar yuklanmoqda...
        </div>
      ) : null}

      {data && activeTab === "kpi" && (
        <div className="space-y-6">
          {/* Teacher KPI Leaderboard */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  O&apos;qituvchilar KPI Reytingi (Tasdiqlangan ballar)
                </h2>
                <p className="text-xs text-slate-500">
                  Ilmiy, o&apos;quv-uslubiy, innovatsiya va sifat ko&apos;rsatkichlari yig&apos;indisi
                </p>
              </div>
              <a
                href="/api/dean/reports/kpi-csv"
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition"
              >
                <Download className="h-4 w-4" />
                Excel (CSV) hisobotni yuklab olish
              </a>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2.5 pr-4 font-semibold">#</th>
                    <th className="py-2.5 pr-4 font-semibold">O&apos;qituvchi</th>
                    <th className="py-2.5 pr-4 font-semibold">Ilmiy</th>
                    <th className="py-2.5 pr-4 font-semibold">Uslubiy</th>
                    <th className="py-2.5 pr-4 font-semibold">Innovatsiya</th>
                    <th className="py-2.5 pr-4 font-semibold">Sifat</th>
                    <th className="py-2.5 pr-4 font-semibold">Kutilmoqda</th>
                    <th className="py-2.5 font-semibold text-right">Jami KPI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.teacherKpiSummary.map((row, idx) => (
                    <tr key={row.teacherId} className="hover:bg-slate-50/80">
                      <td className="py-3 pr-4 font-bold text-slate-400">{idx + 1}</td>
                      <td className="py-3 pr-4">
                        <p className="font-semibold text-slate-900">{row.fullName}</p>
                        <p className="text-xs text-slate-500">{row.academicTitle ?? "O'qituvchi"}</p>
                      </td>
                      <td className="py-3 pr-4 font-medium">{row.byBlock.SCIENTIFIC}</td>
                      <td className="py-3 pr-4 font-medium">{row.byBlock.METHODICAL}</td>
                      <td className="py-3 pr-4 font-medium">{row.byBlock.INNOVATION}</td>
                      <td className="py-3 pr-4 font-medium">{row.byBlock.QUALITY}</td>
                      <td className="py-3 pr-4">
                        {row.pendingCount > 0 ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                            {row.pendingCount} ta
                          </span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                      <td className="py-3 text-right font-bold text-indigo-700">
                        {row.totalApprovedScore} ball
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* KPI Moderation Queue */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-4">
              <ClipboardCheck className="h-5 w-5 text-indigo-600" />
              KPI Arizalarini Tekshirish va Tasdiqlash
            </h2>
            <div className="space-y-3">
              {data.kpiEntries.map((entry) => {
                const isEditing = reviewingId === entry.id;
                const blockMeta = KPI_BLOCK_META[entry.criterion.block];
                return (
                  <div
                    key={entry.id}
                    className="rounded-xl border border-slate-200 p-4 hover:border-slate-300 transition"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1 max-w-2xl">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                            {blockMeta.label}
                          </span>
                          <span className="text-xs font-mono text-slate-500">
                            {entry.criterion.code}
                          </span>
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                              entry.status === "APPROVED"
                                ? "bg-emerald-100 text-emerald-800"
                                : entry.status === "PENDING"
                                ? "bg-amber-100 text-amber-800"
                                : entry.status === "REJECTED"
                                ? "bg-rose-100 text-rose-800"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {KPI_STATUS_LABELS[entry.status]}
                          </span>
                        </div>
                        <h3 className="text-sm font-bold text-slate-900">{entry.title}</h3>
                        <p className="text-xs text-slate-600">
                          O&apos;qituvchi: <span className="font-semibold">{entry.teacher.fullName}</span> •{" "}
                          {entry.criterion.title} (Soni: {entry.quantity}, Hisoblangan:{" "}
                          <span className="font-bold text-indigo-700">{entry.calculatedScore} ball</span>)
                        </p>
                        {entry.description && (
                          <p className="text-xs text-slate-500">{entry.description}</p>
                        )}
                        <div className="flex flex-wrap gap-3 pt-1">
                          {entry.proofUrl && (
                            <a
                              href={entry.proofUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              Asosiy havola / DOI
                            </a>
                          )}
                          {entry.proofFilePath && (
                            <a
                              href={`/api/files/download?path=${encodeURIComponent(
                                entry.proofFilePath
                              )}&name=${encodeURIComponent(entry.proofFileName ?? "hujjat")}`}
                              className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline"
                            >
                              <FileText className="h-3.5 w-3.5" />
                              {entry.proofFileName ?? "Tasdiqlovchi fayl"}
                            </a>
                          )}
                        </div>
                        {entry.reviewComment && (
                          <p className="mt-1 rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-slate-700">
                            <span className="font-semibold">Dekanat izohi:</span> {entry.reviewComment}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {!isEditing && (
                          <button
                            type="button"
                            onClick={() => {
                              setReviewingId(entry.id);
                              setReviewScore(String(entry.approvedScore ?? entry.calculatedScore));
                              setReviewComment(entry.reviewComment ?? "");
                            }}
                            className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition"
                          >
                            {entry.status === "PENDING" ? "Ko'rib chiqish" : "Qayta ko'rish"}
                          </button>
                        )}
                      </div>
                    </div>

                    {isEditing && (
                      <div className="mt-4 border-t border-slate-100 pt-3 grid gap-3 sm:grid-cols-4 items-end">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Tasdiqlanadigan ball
                          </label>
                          <input
                            type="number"
                            step="0.5"
                            value={reviewScore}
                            onChange={(e) => setReviewScore(e.target.value)}
                            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Qaror izohi (majburiy)
                          </label>
                          <input
                            type="text"
                            value={reviewComment}
                            onChange={(e) => setReviewComment(e.target.value)}
                            placeholder="Masalan: DOI va maqola nusxasi tasdiqlandi"
                            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleKpiDecision(entry.id, "APPROVED")}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Tasdiqlash
                          </button>
                          <button
                            type="button"
                            onClick={() => handleKpiDecision(entry.id, "REJECTED")}
                            className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Rad etish
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {data && activeTab === "academics" && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Create Group */}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await submitAcademic(
                { kind: "group", ...groupForm },
                "Yangi guruh yaratildi"
              );
              if (ok) setGroupForm({ name: "", courseYear: "3", semester: "5", specialty: "" });
            }}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3"
          >
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Plus className="h-4 w-4 text-indigo-600" />
              Yangi guruh yaratish
            </h3>
            <input
              required
              placeholder="Guruh nomi (masalan: AT-302)"
              value={groupForm.name}
              onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                min={1}
                max={6}
                required
                placeholder="Kurs (1-4)"
                value={groupForm.courseYear}
                onChange={(e) => setGroupForm({ ...groupForm, courseYear: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
              <input
                type="number"
                min={1}
                max={12}
                required
                placeholder="Semestr"
                value={groupForm.semester}
                onChange={(e) => setGroupForm({ ...groupForm, semester: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <input
              required
              placeholder="Mutaxassislik nomi"
              value={groupForm.specialty}
              onChange={(e) => setGroupForm({ ...groupForm, specialty: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
            <button
              type="submit"
              className="w-full rounded-lg bg-indigo-600 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
            >
              Guruhni saqlash
            </button>
          </form>

          {/* Create Subject */}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await submitAcademic(
                { kind: "subject", ...subjectForm },
                "Yangi fan yaratildi"
              );
              if (ok) setSubjectForm({ name: "", code: "", credits: "6", semester: "5" });
            }}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3"
          >
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Layers className="h-4 w-4 text-indigo-600" />
              Yangi fan qo&apos;shish
            </h3>
            <input
              required
              placeholder="Fan nomi"
              value={subjectForm.name}
              onChange={(e) => setSubjectForm({ ...subjectForm, name: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
            <input
              required
              placeholder="Fan kodi (masalan: DI-310)"
              value={subjectForm.code}
              onChange={(e) => setSubjectForm({ ...subjectForm, code: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                min={1}
                max={12}
                required
                placeholder="Kredit"
                value={subjectForm.credits}
                onChange={(e) => setSubjectForm({ ...subjectForm, credits: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
              <input
                type="number"
                min={1}
                max={12}
                required
                placeholder="Semestr"
                value={subjectForm.semester}
                onChange={(e) => setSubjectForm({ ...subjectForm, semester: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-indigo-600 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
            >
              Fanni saqlash
            </button>
          </form>

          {/* Assign Teaching */}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await submitAcademic(
                { kind: "teaching", ...teachingForm },
                "O'qituvchi guruh va fanga biriktirildi"
              );
              if (ok) setTeachingForm({ subjectId: "", teacherId: "", groupId: "" });
            }}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3"
          >
            <h3 className="text-sm font-bold text-slate-900">
              O&apos;qituvchiga fan va guruh biriktirish
            </h3>
            <select
              required
              value={teachingForm.teacherId}
              onChange={(e) => setTeachingForm({ ...teachingForm, teacherId: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
            >
              <option value="">O&apos;qituvchini tanlang</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.fullName}
                </option>
              ))}
            </select>
            <select
              required
              value={teachingForm.subjectId}
              onChange={(e) => setTeachingForm({ ...teachingForm, subjectId: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
            >
              <option value="">Fanni tanlang</option>
              {data.subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.name}
                </option>
              ))}
            </select>
            <select
              required
              value={teachingForm.groupId}
              onChange={(e) => setTeachingForm({ ...teachingForm, groupId: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
            >
              <option value="">Guruhni tanlang</option>
              {data.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.specialty})
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="w-full rounded-lg bg-slate-900 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              Biriktirish
            </button>
          </form>

          {/* Existing Groups & Subjects list */}
          <div className="lg:col-span-3 grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-3">Akademik guruhlar</h3>
              <div className="space-y-2">
                {data.groups.map((g) => (
                  <div
                    key={g.id}
                    className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-2.5 text-xs"
                  >
                    <div>
                      <p className="font-bold text-slate-900">{g.name}</p>
                      <p className="text-slate-500">
                        {g.courseYear}-kurs • {g.specialty}
                      </p>
                    </div>
                    <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-slate-700 border border-slate-200">
                      {g._count.students} talaba
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-3">Fanlar va biriktirishlar</h3>
              <div className="space-y-2">
                {data.subjects.map((s) => (
                  <div
                    key={s.id}
                    className="rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-2.5 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-slate-900">
                        {s.code} — {s.name}
                      </p>
                      <span className="text-slate-500">{s.credits} kredit</span>
                    </div>
                    <p className="mt-1 text-slate-600">
                      {s.teachings.length > 0
                        ? s.teachings
                            .map((t) => `${t.teacher.fullName} (${t.group.name})`)
                            .join(" • ")
                        : "Hali o'qituvchi biriktirilmagan"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {data && activeTab === "users" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <form
            onSubmit={handleCreateUser}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3 h-fit"
          >
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Users className="h-4 w-4 text-indigo-600" />
              Yangi foydalanuvchi qo&apos;shish
            </h3>
            <input
              required
              placeholder="F.I.Sh."
              value={userForm.fullName}
              onChange={(e) => setUserForm({ ...userForm, fullName: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
            <input
              type="email"
              required
              placeholder="Email manzil"
              value={userForm.email}
              onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
            <input
              type="password"
              required
              minLength={6}
              placeholder="Boshlang'ich parol (kamida 6 belgi)"
              value={userForm.password}
              onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
            <select
              value={userForm.role}
              onChange={(e) => setUserForm({ ...userForm, role: e.target.value as Role })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
            >
              <option value="STUDENT">Talaba</option>
              <option value="TEACHER">O&apos;qituvchi</option>
              <option value="DEAN">Dekanat / Kafedra mudiri</option>
            </select>
            {userForm.role === "STUDENT" && (
              <select
                required
                value={userForm.groupId}
                onChange={(e) => setUserForm({ ...userForm, groupId: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              >
                <option value="">Guruhni tanlang</option>
                {data.groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            )}
            <input
              placeholder="Ilmiy unvon / Izoh (masalan: Dotsent, PhD)"
              value={userForm.academicTitle}
              onChange={(e) => setUserForm({ ...userForm, academicTitle: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
            <button
              type="submit"
              className="w-full rounded-lg bg-indigo-600 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
            >
              Foydalanuvchi yaratish
            </button>
          </form>

          <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm overflow-x-auto">
            <h3 className="text-sm font-bold text-slate-900 mb-3">
              Barcha foydalanuvchilar ({data.users.length})
            </h3>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-3">F.I.Sh.</th>
                  <th className="py-2 pr-3">Email</th>
                  <th className="py-2 pr-3">Rol</th>
                  <th className="py-2">Guruh / Unvon</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.users.map((u) => (
                  <tr key={u.id}>
                    <td className="py-2.5 pr-3 font-semibold text-slate-900">{u.fullName}</td>
                    <td className="py-2.5 pr-3 font-mono text-slate-600">{u.email}</td>
                    <td className="py-2.5 pr-3">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                        {ROLE_LABELS[u.role]}
                      </span>
                    </td>
                    <td className="py-2.5 text-slate-600">
                      {u.group ? u.group.name : u.academicTitle ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data && activeTab === "criteria" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <form
            onSubmit={handleCreateCriterion}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3 h-fit"
          >
            <h3 className="text-sm font-bold text-slate-900">Yangi KPI mezoni qo&apos;shish</h3>
            <input
              required
              placeholder="Kod (masalan: SCI-CITATION)"
              value={criterionForm.code}
              onChange={(e) => setCriterionForm({ ...criterionForm, code: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
            <input
              required
              placeholder="Mezon nomi"
              value={criterionForm.title}
              onChange={(e) => setCriterionForm({ ...criterionForm, title: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
            <select
              value={criterionForm.block}
              onChange={(e) =>
                setCriterionForm({ ...criterionForm, block: e.target.value as KpiBlock })
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
            >
              {Object.entries(KPI_BLOCK_META).map(([key, meta]) => (
                <option key={key} value={key}>
                  {meta.label} ({meta.weightPct}%)
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                step="0.5"
                required
                placeholder="1 birlik balli"
                value={criterionForm.pointsPerUnit}
                onChange={(e) =>
                  setCriterionForm({ ...criterionForm, pointsPerUnit: e.target.value })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
              <input
                type="number"
                step="0.5"
                placeholder="Max chegara"
                value={criterionForm.maxPoints}
                onChange={(e) =>
                  setCriterionForm({ ...criterionForm, maxPoints: e.target.value })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <textarea
              required
              rows={3}
              placeholder="Talab va tavsif..."
              value={criterionForm.description}
              onChange={(e) =>
                setCriterionForm({ ...criterionForm, description: e.target.value })
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
            <button
              type="submit"
              className="w-full rounded-lg bg-indigo-600 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
            >
              Mezonni qo&apos;shish
            </button>
          </form>

          <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
            <h3 className="text-sm font-bold text-slate-900">
              Amaldagi OTM KPI mezonlari ({data.kpiCriteria.length})
            </h3>
            {data.kpiCriteria.map((c) => (
              <div
                key={c.id}
                className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-indigo-700">{c.code}</span>
                    <span className="rounded-md bg-white px-2 py-0.5 border border-slate-200 font-medium">
                      {KPI_BLOCK_META[c.block].label}
                    </span>
                  </div>
                  <span className="font-bold text-slate-900">
                    {c.pointsPerUnit} ball / birlik {c.maxPoints ? `(max ${c.maxPoints})` : ""}
                  </span>
                </div>
                <p className="mt-1 font-semibold text-slate-900">{c.title}</p>
                <p className="mt-0.5 text-slate-600">{c.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {data && activeTab === "audit" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-4">
            <History className="h-5 w-5 text-indigo-600" />
            Shaffoflik va Audit Jurnali (So&apos;nggi 40 ta amal)
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-3">Vaqt</th>
                  <th className="py-2 pr-3">Ijrochi</th>
                  <th className="py-2 pr-3">Amal</th>
                  <th className="py-2 pr-3">Obyekt</th>
                  <th className="py-2">Sabab / Izoh</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="py-2.5 pr-3 whitespace-nowrap text-slate-500">
                      {new Date(log.createdAt).toLocaleString("uz-UZ")}
                    </td>
                    <td className="py-2.5 pr-3 font-medium text-slate-900">
                      {log.actor.fullName}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-slate-600">{log.entityType}</td>
                    <td className="py-2.5 text-slate-600">{log.reason ?? log.newValue ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </PortalShell>
  );
}
