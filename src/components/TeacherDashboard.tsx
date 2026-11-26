"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Award,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  FileText,
  PlusCircle,
  Send,
  Trash2,
} from "lucide-react";
import { PortalShell, ShellUser } from "./PortalShell";
import {
  CONTROL_TYPE_LABELS,
  KPI_BLOCK_META,
  KPI_STATUS_LABELS,
  SUBMISSION_STATUS_LABELS,
  getSubmissionStatusLabel,
  calculateKpiScore,
} from "@/lib/domain";
import { canPreviewSubmissionFile } from "@/lib/submission-file-formats";
import { useFormUpload } from "@/lib/use-form-upload";
import { UploadProgress } from "./UploadProgress";
import { PortalEmptyState } from "./PortalEmptyState";
import type { ControlType, KpiBlock, KpiStatus, SubmissionStatus } from "@prisma/client";

interface TeacherOverviewData {
  teachings: {
    id: string;
    subject: { id: string; name: string; code: string; credits: number };
    group: { id: string; name: string; _count: { students: number } };
  }[];
  assignments: {
    id: string;
    title: string;
    description: string;
    controlType: ControlType;
    maxScore: number;
    dueDate: string;
    allowLate: boolean;
    latePenaltyPct: number;
    attachmentName: string | null;
    attachmentPath: string | null;
    subject: { id: string; name: string; code: string };
    group: { id: string; name: string; _count: { students: number }; students: { id: string; fullName: string }[] };
    submissions: {
      id: string;
      version: number;
      gradingRevision: number;
      comment: string | null;
      externalUrl: string | null;
      fileName: string | null;
      filePath: string | null;
      isLate: boolean;
      status: SubmissionStatus;
      score: number | null;
      feedback: string | null;
      submittedAt: string;
      student: { id: string; fullName: string; email: string };
      versions: { id: string; version: number; fileName: string | null; filePath: string | null }[];
      grades: {
        id: string;
        revision: number;
        submissionVersion: number;
        status: SubmissionStatus;
        score: number | null;
        rawScore: number | null;
        appliedLatePenalty: boolean | null;
        feedback: string | null;
        gradedAt: string;
        grader: { fullName: string } | null;
      }[];
    }[];
  }[];
  kpiCriteria: {
    id: string;
    code: string;
    title: string;
    block: KpiBlock;
    pointsPerUnit: number;
    maxPoints: number | null;
    description: string;
    requiresProof: boolean;
  }[];
  kpiEntries: {
    id: string;
    academicYear: string;
    semester: string;
    title: string;
    description: string | null;
    quantity: number;
    calculatedScore: number;
    approvedScore: number | null;
    proofUrl: string | null;
    proofFileName: string | null;
    proofFilePath: string | null;
    status: KpiStatus;
    reviewComment: string | null;
    criterion: { id: string; code: string; title: string; block: KpiBlock };
  }[];
  kpiSummary: {
    totalApprovedKpi: number;
    pendingKpiScore: number;
    approvedByBlock: Record<KpiBlock, number>;
  };
}

export function TeacherDashboard({ user }: { user: ShellUser }) {
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const requestedAssignment = searchParams.get("assignment");
  const requestedSubmission = searchParams.get("submission");
  const [activeTab, setActiveTab] = useState(
    requestedTab === "grading" || requestedTab === "kpi" ? requestedTab : "assignments"
  );
  const [data, setData] = useState<TeacherOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null
  );

  // Create Assignment state
  const [teachingPair, setTeachingPair] = useState("");
  const [aTitle, setATitle] = useState("");
  const [aDesc, setADesc] = useState("");
  const [aControlType, setAControlType] = useState<ControlType>("JORIY");
  const [aMaxScore, setAMaxScore] = useState("20");
  const [aDueDate, setADueDate] = useState("");
  const [aAllowLate, setAAllowLate] = useState(true);
  const [aPenalty, setAPenalty] = useState("10");
  const assignmentUpload = useFormUpload();
  const publishingAssignment = assignmentUpload.busy;

  // Grading state
  const [gradingSubId, setGradingSubId] = useState<string | null>(null);
  const [gradeScore, setGradeScore] = useState("");
  const [gradeFeedback, setGradeFeedback] = useState("");
  const [applyPenalty, setApplyPenalty] = useState(false);
  const [savingGrade, setSavingGrade] = useState(false);
  const gradeInFlight = useRef(false);

  // KPI Entry state
  const [kpiCriterionId, setKpiCriterionId] = useState("");
  const [kpiTitle, setKpiTitle] = useState("");
  const [kpiDesc, setKpiDesc] = useState("");
  const [kpiQuantity, setKpiQuantity] = useState("1");
  const [kpiYear, setKpiYear] = useState("2026-2027");
  const [kpiSemester, setKpiSemester] = useState("Kuzgi");
  const [kpiUrl, setKpiUrl] = useState("");
  const [kpiFile, setKpiFile] = useState<File | null>(null);
  const kpiUpload = useFormUpload();
  const kpiFileInput = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/teacher/overview", { signal });
      if (!res.ok) throw new Error();
      const json: TeacherOverviewData = await res.json();
      if (signal?.aborted) return;
      setData(json);
      setTeachingPair((prev) =>
        prev || json.teachings.length === 0
          ? prev
          : `${json.teachings[0].subject.id}::${json.teachings[0].group.id}`
      );
      setKpiCriterionId((prev) =>
        prev || json.kpiCriteria.length === 0 ? prev : json.kpiCriteria[0].id
      );
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadData(controller.signal).catch(() => {});
    return () => controller.abort();
  }, [loadData]);

  const linkedAssignment = data?.assignments.find(({ id }) => id === requestedAssignment);
  const linkedSubmissionId = linkedAssignment?.submissions.find(({ id }) => id === requestedSubmission)?.id;
  const linkedAssignmentId = linkedAssignment?.id;
  useEffect(() => {
    if (activeTab !== "grading" || !linkedAssignmentId) return;
    const id = linkedSubmissionId ? `submission-${linkedSubmissionId}` : `assignment-${linkedAssignmentId}`;
    const target = document.getElementById(id);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "start" });
  }, [activeTab, linkedAssignmentId, linkedSubmissionId]);

  async function handleCreateAssignment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (publishingAssignment) return;
    setFeedbackMsg(null);
    const form = e.currentTarget;
    const [subjectId, groupId] = teachingPair.split("::");
    if (!subjectId || !groupId) {
      setFeedbackMsg({ type: "err", text: "Fan va guruhni tanlang" });
      return;
    }

    const dueDate = new Date(aDueDate);
    if (!Number.isFinite(dueDate.getTime())) {
      setFeedbackMsg({ type: "err", text: "Muddat sanasi noto'g'ri" });
      return;
    }

    const fd = new FormData(form);
    const attachment = fd.get("attachment");
    if (attachment instanceof File && !attachment.name) fd.delete("attachment");
    fd.append("subjectId", subjectId);
    fd.append("groupId", groupId);
    fd.append("title", aTitle);
    fd.append("description", aDesc);
    fd.append("controlType", aControlType);
    fd.append("maxScore", aMaxScore);
    fd.append("dueDate", dueDate.toISOString());
    fd.append("allowLate", String(aAllowLate));
    fd.append("latePenaltyPct", aPenalty);
    try {
      const result = await assignmentUpload.send<{ notifiedStudentCount: number }>("/api/teacher/assignments", fd);
      if (!result) return;
      if (!result.ok) {
        setFeedbackMsg({ type: "err", text: result.data?.error ?? "Vazifani yuborib bo'lmadi." });
        return;
      }

      setATitle("");
      setADesc("");
      const fileInput = form.elements.namedItem("attachment");
      if (fileInput instanceof HTMLInputElement) fileInput.value = "";
      setFeedbackMsg({
        type: "ok",
        text: result.data?.notifiedStudentCount
          ? `Vazifa yaratildi va ${result.data.notifiedStudentCount} nafar talabaga bildirishnoma yuborildi`
          : "Vazifa yaratildi. Guruhda faol talabalar yo'q.",
      });
    } catch (error) {
      setFeedbackMsg({ type: "err", text: error instanceof Error ? error.message : "Vazifani yuborib bo'lmadi." });
      return;
    }
    await loadData().catch(() => {
      setFeedbackMsg({ type: "ok", text: "Vazifa yuborildi. Ro'yxatni ko'rish uchun sahifani yangilang." });
    });
  }

  async function handleGradeSubmission(
    sub: TeacherOverviewData["assignments"][number]["submissions"][number],
    action: "IN_REVIEW" | "GRADED" | "RETURNED"
  ) {
    if (gradeInFlight.current) return;
    setFeedbackMsg(null);
    if (action === "GRADED" && !gradeScore.trim()) {
      setFeedbackMsg({ type: "err", text: "Ballni kiriting" });
      return;
    }
    gradeInFlight.current = true;
    setSavingGrade(true);
    try {
      const res = await fetch(`/api/teacher/submissions/${sub.id}/grade`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          score: action === "GRADED" ? Number(gradeScore) : undefined,
          applyLatePenalty: action === "GRADED" ? applyPenalty : undefined,
          feedback: action === "IN_REVIEW" ? undefined : gradeFeedback,
          expectedVersion: sub.version,
          expectedRevision: sub.gradingRevision,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setFeedbackMsg({ type: "err", text: json?.error ?? "Baholashda xatolik" });
        if (res.status === 409) {
          setGradingSubId(null);
          await loadData().catch(() => {});
        }
        return;
      }
      setGradingSubId(null);
      setFeedbackMsg({
        type: "ok",
        text: json?.replayed ? "Bu baholash allaqachon saqlangan." :
          action === "IN_REVIEW" ? "Ish tekshiruvga olindi" :
          action === "GRADED" ? "Baho saqlandi va talabaga xabar yuborildi" :
          "Ish qaytarildi. Talaba yangi versiya yuborishi mumkin.",
      });
      await loadData().catch(() => {});
    } catch {
      setFeedbackMsg({ type: "err", text: "Javob olinmadi. Baholashdan oldin ro'yxatni yangilang." });
    } finally {
      gradeInFlight.current = false;
      setSavingGrade(false);
    }
  }

  async function handleSubmitKpi(submitNow: boolean) {
    if (kpiUpload.busy) return;
    setFeedbackMsg(null);
    const fd = new FormData();
    fd.append("criterionId", kpiCriterionId);
    fd.append("academicYear", kpiYear);
    fd.append("semester", kpiSemester);
    fd.append("title", kpiTitle);
    fd.append("description", kpiDesc);
    fd.append("quantity", kpiQuantity);
    fd.append("proofUrl", kpiUrl);
    fd.append("submitNow", String(submitNow));
    if (kpiFile) fd.append("proofFile", kpiFile);

    try {
      const result = await kpiUpload.send("/api/teacher/kpi", fd, false);
      if (!result) return;
      if (!result.ok) {
        setFeedbackMsg({ type: "err", text: result.data?.error ?? "KPI ma'lumotini saqlab bo'lmadi." });
        return;
      }
    } catch (error) {
      setFeedbackMsg({ type: "err", text: error instanceof Error ? error.message : "KPI ma'lumotini yuklab bo'lmadi." });
      return;
    }
    setKpiTitle("");
    setKpiDesc("");
    setKpiUrl("");
    setKpiFile(null);
    if (kpiFileInput.current) kpiFileInput.current.value = "";
    setKpiQuantity("1");
    setFeedbackMsg({
      type: "ok",
      text: submitNow
        ? "KPI ma'lumotingiz saqlandi va Dekanat tasdig'iga yuborildi"
        : "KPI qoralama sifatida saqlandi",
    });
    await loadData().catch(() => {});
  }

  async function handleResubmitKpi(id: string) {
    const res = await fetch(`/api/teacher/kpi/${id}`, { method: "PATCH" });
    if (res.ok) {
      setFeedbackMsg({ type: "ok", text: "KPI arizasi qayta yuborildi" });
      await loadData();
    }
  }

  async function handleDeleteKpi(id: string) {
    const res = await fetch(`/api/teacher/kpi/${id}`, { method: "DELETE" });
    if (res.ok) {
      setFeedbackMsg({ type: "ok", text: "KPI yozuvi o'chirildi" });
      await loadData();
    }
  }

  const allSubmissions = data?.assignments.flatMap((assignment) => assignment.submissions) ?? [];
  const pendingGradingCount = allSubmissions.filter(
    (s) => s.status === "SUBMITTED" || s.status === "RESUBMITTED" || s.status === "IN_REVIEW"
  ).length;

  const selectedCriterion = data?.kpiCriteria.find((c) => c.id === kpiCriterionId);
  const previewScore = selectedCriterion
    ? calculateKpiScore(
        selectedCriterion.pointsPerUnit,
        Number(kpiQuantity) || 1,
        selectedCriterion.maxPoints
      )
    : 0;

  return (
    <PortalShell
      user={user}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      navItems={[
        { id: "assignments", label: "Vazifalar qo'yish" },
        { id: "grading", label: "Baholash navbati", badge: pendingGradingCount },
        { id: "kpi", label: "Mening KPI ma'lumotlarim" },
      ]}
    >
      {feedbackMsg && (
        <div
          role={feedbackMsg.type === "err" ? "alert" : "status"}
          className={`mb-4 rounded-xl border px-4 py-3 text-sm font-medium ${
            feedbackMsg.type === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {feedbackMsg.text}
        </div>
      )}

      {/* Summary Cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Biriktirilgan fan-guruhlar</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {data?.teachings.length ?? 0}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Berilgan vazifalar</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {data?.assignments.length ?? 0}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Tekshirish kutmoqda</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{pendingGradingCount}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Tasdiqlangan KPI ball</p>
          <p className="mt-1 text-2xl font-bold text-indigo-600">
            {data?.kpiSummary.totalApprovedKpi ?? 0}
          </p>
          <p className="text-[11px] text-slate-400">
            Tekshiruvda: +{data?.kpiSummary.pendingKpiScore ?? 0} ball
          </p>
        </div>
      </div>

      {loading && !data ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          Yuklanmoqda...
        </div>
      ) : null}
      {!loading && !data && (
        <PortalEmptyState
          title="Panel ma’lumotlarini yuklab bo‘lmadi"
          description="Internet aloqasini tekshirib, qayta urinib ko‘ring."
          action={<button type="button" className="text-sm font-semibold text-indigo-700 underline" onClick={() => {
            setLoading(true);
            void loadData().catch(() => {});
          }}>Qayta yuklash</button>}
        />
      )}

      {data && activeTab === "assignments" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <form
            onSubmit={handleCreateAssignment}
            onChange={assignmentUpload.resetRequest}
            aria-busy={publishingAssignment}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3 h-fit"
          >
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <PlusCircle className="h-4 w-4 text-indigo-600" />
              Yangi vazifa joylash
            </h2>

            <fieldset disabled={publishingAssignment} className="min-w-0 space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Fan va Guruh
                </label>
                <select
                  required
                  disabled={data.teachings.length === 0}
                  value={teachingPair}
                  onChange={(e) => setTeachingPair(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                >
                  {data.teachings.map((t) => (
                    <option key={t.id} value={`${t.subject.id}::${t.group.id}`}>
                      {t.group.name} — {t.subject.name} ({t.group._count.students} talaba)
                    </option>
                  ))}
                </select>
                {data.teachings.length === 0 && (
                  <p className="mt-1 text-xs text-slate-500">Sizga hozircha fan va guruh biriktirilmagan.</p>
                )}
              </div>

              <input
                required
                minLength={3}
                placeholder="Vazifa sarlavhasi"
                value={aTitle}
                onChange={(e) => setATitle(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />

              <textarea
                required
                minLength={10}
                rows={4}
                placeholder="Vazifa sharti, baholash mezonlari..."
                value={aDesc}
                onChange={(e) => setADesc(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Nazorat turi
                  </label>
                  <select
                    value={aControlType}
                    onChange={(e) => setAControlType(e.target.value as ControlType)}
                    className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-xs"
                  >
                    {Object.entries(CONTROL_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Maksimal ball
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    required
                    value={aMaxScore}
                    onChange={(e) => setAMaxScore(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Topshirish muddati (Deadline)
                </label>
                <input
                  type="datetime-local"
                  required
                  value={aDueDate}
                  onChange={(e) => setADueDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
              </div>

              <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                <label className="flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={aAllowLate}
                    onChange={(e) => setAAllowLate(e.target.checked)}
                  />
                  Kechikib topshirishga ruxsat
                </label>
                {aAllowLate && (
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] text-slate-500">Jarima %:</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={aPenalty}
                      onChange={(e) => setAPenalty(e.target.value)}
                      className="w-14 rounded border border-slate-300 px-2 py-1 text-xs"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Metodik fayl biriktirish (ixtiyoriy)
                </label>
                <input
                  type="file"
                  name="attachment"
                  className="w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-indigo-700"
                />
              </div>

              {publishingAssignment && <UploadProgress progress={assignmentUpload.progress} />}
              <button
                type="submit"
                disabled={publishingAssignment || data.teachings.length === 0}
                className="w-full rounded-xl bg-indigo-600 py-2.5 text-xs font-semibold text-white hover:bg-indigo-700 transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                {publishingAssignment ? "Yuborilmoqda..." : "Vazifani talabalarga yuborish"}
              </button>
            </fieldset>
          </form>

          <div className="lg:col-span-2 space-y-3">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-indigo-600" />
              Yaratilgan vazifalar ({data.assignments.length})
            </h2>
            {!data.assignments.length && <PortalEmptyState title="Hali vazifa yaratilmagan" description="Yangi vazifa yaratganingizda u shu ro‘yxatda chiqadi." />}
            {data.assignments.map((a) => (
              <div
                key={a.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                        {a.group.name}
                      </span>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                        {CONTROL_TYPE_LABELS[a.controlType]}
                      </span>
                      <span className="text-xs text-slate-500">{a.subject.name}</span>
                    </div>
                    <h3 className="mt-1.5 text-sm font-bold text-slate-900">{a.title}</h3>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-800">
                    Max: {a.maxScore} ball
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-600">{a.description}</p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-xs text-slate-500">
                  <span>
                    Muddat: <strong className="text-slate-700">{new Date(a.dueDate).toLocaleString("uz-UZ")}</strong>
                  </span>
                  <span>
                    Topshirildi: <strong>{a.submissions.length}</strong> / {a.group._count.students} talaba
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data && activeTab === "grading" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-slate-900">
            Talabalar topshirgan ishlarni baholash
          </h2>
          {requestedAssignment && !linkedAssignment && (
            <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Havoladagi vazifa joriy ro&apos;yxatda mavjud emas.
            </p>
          )}
          {data.assignments.length === 0 ? (
            <PortalEmptyState title="Baholash uchun vazifalar yo‘q" description="Vazifa yaratilgach, tegishli guruh talabalari shu yerda ko‘rinadi." />
          ) : (
            <div className="space-y-3">
              {data.assignments.map((assignment) => {
                const submissionsByStudent = new Map(assignment.submissions.map((sub) => [sub.student.id, sub]));
                return (
                  <details
                    key={assignment.id}
                    id={`assignment-${assignment.id}`}
                    open={linkedAssignmentId === assignment.id ? true : undefined}
                    tabIndex={-1}
                    className={`scroll-mt-36 rounded-xl border p-4 ${linkedAssignmentId === assignment.id ? "border-indigo-300 bg-indigo-50/30" : "border-slate-200"}`}
                  >
                    <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                      {assignment.subject.name} · {assignment.group.name} · {assignment.title}
                      <span className="ml-2 text-xs font-normal text-slate-500">
                        {assignment.submissions.length} / {assignment.group.students.length} talaba topshirgan
                      </span>
                    </summary>
                    <div className="mt-3 space-y-2">
                      {assignment.group.students.length === 0 && (
                        <p className="text-xs text-slate-500">Guruhda faol talabalar yo&apos;q.</p>
                      )}
                      {assignment.group.students.map((student) => {
                        const sub = submissionsByStudent.get(student.id);
                        if (!sub) return (
                          <div key={student.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 px-4 py-3">
                            <span className="text-sm font-semibold text-slate-900">{student.fullName}</span>
                            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] text-slate-600">
                              {getSubmissionStatusLabel(null)}
                            </span>
                          </div>
                        );
                        const isGrading = gradingSubId === sub.id;
                        const canStartReview = sub.status === "SUBMITTED" || sub.status === "RESUBMITTED";
                        const currentGrade = sub.grades.find((grade) => grade.revision === sub.gradingRevision);
                        const previousFiles = sub.versions.filter((version) => version.filePath && version.filePath !== sub.filePath);
                        return (
                          <div
                            key={sub.id}
                            id={`submission-${sub.id}`}
                            tabIndex={-1}
                            className={`scroll-mt-36 space-y-2 rounded-xl border p-4 ${linkedSubmissionId === sub.id ? "border-indigo-400 bg-white" : "border-slate-200"}`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-bold text-sm text-slate-900">
                                    {sub.student.fullName}
                                  </span>
                                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium">
                                    v{sub.version}
                                  </span>
                                  <span
                                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                                      sub.status === "GRADED"
                                        ? "bg-emerald-100 text-emerald-800"
                                        : sub.status === "RETURNED"
                                        ? "bg-rose-100 text-rose-800"
                                        : "bg-amber-100 text-amber-800"
                                    }`}
                                  >
                                    {getSubmissionStatusLabel(sub)}
                                  </span>
                                  {sub.isLate && !canStartReview && (
                                    <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                                      Kechikkan
                                    </span>
                                  )}
                                </div>
                                {sub.comment && (
                                  <p className="mt-1 text-xs text-slate-600">{sub.comment}</p>
                                )}
                                <div className="mt-2 flex flex-wrap gap-3">
                                  {sub.externalUrl && (
                                    <a
                                      href={sub.externalUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline"
                                    >
                                      <ExternalLink className="h-3.5 w-3.5" />
                                      GitHub / Havola
                                    </a>
                                  )}
                                  {sub.filePath && (
                                    <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-emerald-700">
                                      <a
                                        href={`/api/files/download?path=${encodeURIComponent(sub.filePath)}`}
                                        className="inline-flex items-center gap-1 hover:underline"
                                      >
                                        <FileText className="h-3.5 w-3.5" />
                                        {sub.fileName ?? "Fayl"} (yuklab olish)
                                      </a>
                                      {canPreviewSubmissionFile(sub.filePath, sub.fileName) && (
                                        <a
                                          href={`/api/files/download?path=${encodeURIComponent(sub.filePath)}&preview=1`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="hover:underline"
                                        >
                                          Ochish
                                        </a>
                                      )}
                                    </div>
                                  )}
                                </div>
                                {previousFiles.length > 0 && (
                                  <details className="mt-2 text-xs text-slate-600">
                                    <summary className="cursor-pointer">Oldingi versiyalardagi fayllar</summary>
                                    <ul className="mt-1 space-y-1">
                                      {previousFiles.map((version) => (
                                        <li key={version.id}>
                                          <a
                                            href={`/api/files/download?path=${encodeURIComponent(version.filePath ?? "")}`}
                                            className="text-emerald-700 hover:underline"
                                          >
                                            v{version.version} · {version.fileName ?? "Fayl"}
                                          </a>
                                        </li>
                                      ))}
                                    </ul>
                                  </details>
                                )}
                                {(sub.score !== null || sub.feedback) && (
                                  <p className="mt-2 text-xs font-bold text-emerald-700">
                                    {sub.score !== null && `Ball ${sub.score} / ${assignment.maxScore} · `}
                                    <span className="font-normal text-slate-600">{sub.feedback}</span>
                                  </p>
                                )}
                                {sub.grades.length > 0 && (
                                  <details className="mt-2 text-xs text-slate-600">
                                    <summary className="cursor-pointer font-medium">Baholash tarixi</summary>
                                    <ul className="mt-1 space-y-1">
                                      {sub.grades.map((grade) => (
                                        <li key={grade.id}>
                                          v{grade.submissionVersion} · {new Date(grade.gradedAt).toLocaleString("uz-UZ")}
                                          {grade.grader && ` · ${grade.grader.fullName}`} · {SUBMISSION_STATUS_LABELS[grade.status]}
                                          {grade.score !== null && ` · ${grade.score} / ${assignment.maxScore}`}
                                          {grade.feedback && ` · ${grade.feedback}`}
                                        </li>
                                      ))}
                                    </ul>
                                  </details>
                                )}
                              </div>

                              {!isGrading && (
                                <div className="flex flex-wrap gap-2">
                                  {canStartReview && (
                                    <button
                                      type="button"
                                      disabled={savingGrade}
                                      onClick={() => handleGradeSubmission(sub, "IN_REVIEW")}
                                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                                    >
                                      Tekshiruvni boshlash
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    disabled={savingGrade}
                                    onClick={() => {
                                      setGradingSubId(sub.id);
                                      setGradeScore(String(currentGrade?.rawScore ?? sub.score ?? assignment.maxScore));
                                      setGradeFeedback(sub.feedback ?? "");
                                      setApplyPenalty(currentGrade?.appliedLatePenalty ?? (sub.score === null && sub.isLate));
                                    }}
                                    className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                                  >
                                    {sub.status === "GRADED" ? "Qayta baholash" : "Baholash"}
                                  </button>
                                </div>
                              )}
                            </div>

                            {isGrading && (
                              <div className="mt-3 border-t border-slate-100 pt-3 grid gap-3 sm:grid-cols-4 items-end">
                                <div>
                                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                    Ball (0 – {assignment.maxScore})
                                  </label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min={0}
                                    max={assignment.maxScore}
                                    value={gradeScore}
                                    onChange={(e) => setGradeScore(e.target.value)}
                                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
                                  />
                                  {sub.isLate && assignment.latePenaltyPct > 0 && (
                                    <label className="mt-1 flex items-center gap-1 text-[11px] text-rose-700">
                                      <input
                                        type="checkbox"
                                        checked={applyPenalty}
                                        onChange={(e) => setApplyPenalty(e.target.checked)}
                                      />
                                      -{assignment.latePenaltyPct}% jarima qo&apos;llash
                                    </label>
                                  )}
                                </div>
                                <div className="sm:col-span-2">
                                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                    O&apos;qituvchi izohi (feedback)
                                  </label>
                                  <input
                                    type="text"
                                    maxLength={3000}
                                    value={gradeFeedback}
                                    onChange={(e) => setGradeFeedback(e.target.value)}
                                    placeholder="Ish yuzasidan qisqa izoh yozing..."
                                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
                                  />
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    disabled={savingGrade}
                                    onClick={() => handleGradeSubmission(sub, "GRADED")}
                                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    Saqlash
                                  </button>
                                  <button
                                    type="button"
                                    disabled={savingGrade}
                                    onClick={() => handleGradeSubmission(sub, "RETURNED")}
                                    className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
                                  >
                                    Qayta topshirishga ruxsat
                                  </button>
                                  <button
                                    type="button"
                                    disabled={savingGrade}
                                    onClick={() => setGradingSubId(null)}
                                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
                                  >
                                    Bekor qilish
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </div>
      )}

      {data && activeTab === "kpi" && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Submit KPI Form */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3 h-fit">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Award className="h-4 w-4 text-indigo-600" />
              Yangi KPI ko&apos;rsatkich kiritish
            </h2>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                KPI mezoni (OTM standarti)
              </label>
              <select
                value={kpiCriterionId}
                onChange={(e) => setKpiCriterionId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              >
                {data.kpiCriteria.map((c) => (
                  <option key={c.id} value={c.id}>
                    [{KPI_BLOCK_META[c.block].label}] {c.title} ({c.pointsPerUnit} ball)
                  </option>
                ))}
              </select>
              {selectedCriterion && (
                <p className="mt-1 text-[11px] text-slate-500">
                  {selectedCriterion.description}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input
                value={kpiYear}
                onChange={(e) => setKpiYear(e.target.value)}
                placeholder="O'quv yili"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
              <select
                value={kpiSemester}
                onChange={(e) => setKpiSemester(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              >
                <option value="Kuzgi">Kuzgi semestr</option>
                <option value="Bahorgi">Bahorgi semestr</option>
              </select>
            </div>

            <input
              required
              placeholder="Ilmiy ish / Darslik / Guvohnoma nomi"
              value={kpiTitle}
              onChange={(e) => setKpiTitle(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />

            <textarea
              rows={2}
              placeholder="Qisqa tavsif (jurnal nomi, kvartil, mualliflar...)"
              value={kpiDesc}
              onChange={(e) => setKpiDesc(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />

            <div className="grid grid-cols-2 gap-2 items-center">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Soni / Miqdori
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={kpiQuantity}
                  onChange={(e) => setKpiQuantity(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
              </div>
              <div className="rounded-xl bg-indigo-50 p-2.5 text-center">
                <p className="text-[11px] text-indigo-700">Hisoblangan ball</p>
                <p className="text-base font-bold text-indigo-800">{previewScore} ball</p>
              </div>
            </div>

            <input
              type="url"
              placeholder="DOI yoki tasdiqlovchi havola (https://...)"
              value={kpiUrl}
              onChange={(e) => setKpiUrl(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Tasdiqlovchi hujjat (PDF, rasm, ZIP)
              </label>
              <input
                type="file"
                ref={kpiFileInput}
                disabled={kpiUpload.busy}
                onChange={(e) => setKpiFile(e.target.files?.[0] ?? null)}
                className="w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-indigo-700"
              />
            </div>

            {kpiUpload.busy && <UploadProgress progress={kpiUpload.progress} />}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleSubmitKpi(false)}
                disabled={kpiUpload.busy}
                className="rounded-xl border border-slate-300 bg-white py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Qoralama saqlash
              </button>
              <button
                type="button"
                onClick={() => handleSubmitKpi(true)}
                disabled={kpiUpload.busy}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                <Send className="h-3.5 w-3.5" />
                Tasdiqlashga yuborish
              </button>
            </div>
          </div>

          {/* Teacher KPI History & Block breakdown */}
          <div className="lg:col-span-2 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(Object.keys(KPI_BLOCK_META) as KpiBlock[]).map((block) => (
                <div
                  key={block}
                  className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm"
                >
                  <p className="text-[11px] font-semibold text-slate-500">
                    {KPI_BLOCK_META[block].label}
                  </p>
                  <p className="mt-1 text-lg font-bold text-slate-900">
                    {data.kpiSummary.approvedByBlock[block]} ball
                  </p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
              <h3 className="text-sm font-bold text-slate-900">
                Kiritilgan KPI yozuvlarim ({data.kpiEntries.length})
              </h3>
              {!data.kpiEntries.length && <PortalEmptyState title="KPI yozuvlari hali yo‘q" description="Saqlagan arizalaringiz shu yerda ko‘rinadi." />}
              {data.kpiEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-xl border border-slate-200 p-4 text-xs space-y-1.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">
                        {KPI_BLOCK_META[entry.criterion.block].label}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 font-semibold ${
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
                      <span className="text-slate-400">
                        {entry.academicYear} • {entry.semester}
                      </span>
                    </div>
                    <span className="font-bold text-indigo-700">
                      {entry.status === "APPROVED"
                        ? `${entry.approvedScore ?? entry.calculatedScore} ball`
                        : `${entry.calculatedScore} ball`}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-slate-900">{entry.title}</p>
                  <p className="text-slate-600">{entry.criterion.title}</p>
                  {entry.reviewComment && (
                    <p className="rounded-lg bg-slate-50 px-3 py-1.5 text-slate-700">
                      <span className="font-semibold">Dekanat izohi:</span> {entry.reviewComment}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="flex gap-3">
                      {entry.proofUrl && (
                        <a
                          href={entry.proofUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:underline inline-flex items-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3" /> Havola
                        </a>
                      )}
                      {entry.proofFilePath && (
                        <a
                          href={`/api/files/download?path=${encodeURIComponent(
                            entry.proofFilePath
                          )}&name=${encodeURIComponent(entry.proofFileName ?? "hujjat")}`}
                          className="text-emerald-700 hover:underline inline-flex items-center gap-1"
                        >
                          <FileText className="h-3 w-3" /> {entry.proofFileName}
                        </a>
                      )}
                    </div>
                    {entry.status !== "APPROVED" && (
                      <div className="flex items-center gap-2">
                        {(entry.status === "DRAFT" || entry.status === "REJECTED") && (
                          <button
                            type="button"
                            onClick={() => handleResubmitKpi(entry.id)}
                            className="rounded-lg bg-indigo-50 px-2.5 py-1 font-semibold text-indigo-700 hover:bg-indigo-100"
                          >
                            Yuborish
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteKpi(entry.id)}
                          className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-1 font-semibold text-rose-700 hover:bg-rose-100"
                        >
                          <Trash2 className="h-3 w-3" /> O&apos;chirish
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </PortalShell>
  );
}
