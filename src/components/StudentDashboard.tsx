"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  GraduationCap,
  Upload,
} from "lucide-react";
import { PortalShell, ShellUser } from "./PortalShell";
import { canSubmitAssignment, CONTROL_TYPE_LABELS, getSubmissionStatusLabel } from "@/lib/domain";
import { SUBMISSION_FILE_ACCEPT, SUBMISSION_FILE_LIMIT_MB } from "@/lib/submission-file-formats";
import { useFormUpload } from "@/lib/use-form-upload";
import { UploadProgress } from "./UploadProgress";
import { PortalEmptyState } from "./PortalEmptyState";
import type { ControlType, SubmissionStatus } from "@prisma/client";

interface StudentOverviewData {
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
    subject: { id: string; name: string; code: string; credits: number };
    teacher: { id: string; fullName: string; academicTitle: string | null };
    submission: {
      id: string;
      version: number;
      comment: string | null;
      externalUrl: string | null;
      fileName: string | null;
      filePath: string | null;
      isLate: boolean;
      status: SubmissionStatus;
      score: number | null;
      feedback: string | null;
      submittedAt: string;
      versions: {
        id: string;
        version: number;
        comment: string | null;
        externalUrl: string | null;
        fileName: string | null;
        filePath: string | null;
        createdAt: string;
      }[];
    } | null;
  }[];
  gradebook: {
    subjectId: string;
    code: string;
    name: string;
    credits: number;
    teacherName: string;
    earned: number;
    possibleGraded: number;
    totalMax: number;
    gradedCount: number;
    assignmentCount: number;
    percentage: number;
    gradeInfo: { grade: number; label: string; tone: string } | null;
  }[];
  summary: {
    totalEarned: number;
    totalMax: number;
    averagePct: number;
    pendingCount: number;
    overallGrade: { grade: number; label: string; tone: string } | null;
  };
}

export function StudentDashboard({ user }: { user: ShellUser }) {
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const requestedAssignment = searchParams.get("assignment");
  const [activeTab, setActiveTab] = useState(requestedTab === "grades" ? "grades" : "tasks");
  const [data, setData] = useState<StudentOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null
  );

  // Submission drawer/form state
  const [activeAssignmentId, setActiveAssignmentId] = useState<string | null>(null);
  const [subComment, setSubComment] = useState("");
  const [subUrl, setSubUrl] = useState("");
  const [subFile, setSubFile] = useState<File | null>(null);
  const submissionUpload = useFormUpload();
  const submitting = submissionUpload.busy;

  const loadData = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/student/overview", { signal });
      if (!res.ok) throw new Error();
      const json: StudentOverviewData = await res.json();
      if (!signal?.aborted) setData(json);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadData(controller.signal).catch(() => {});
    return () => controller.abort();
  }, [loadData]);

  const linkedAssignmentId = data?.assignments.find(({ id }) => id === requestedAssignment)?.id;
  useEffect(() => {
    if (activeTab !== "tasks" || !linkedAssignmentId) return;
    const target = document.getElementById(`assignment-${linkedAssignmentId}`);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "start" });
  }, [activeTab, linkedAssignmentId]);

  async function handleSubmitAssignment(e: React.FormEvent, assignmentId: string) {
    e.preventDefault();
    if (submitting) return;
    setFeedbackMsg(null);
    if (subFile && subFile.size > SUBMISSION_FILE_LIMIT_MB * 1024 * 1024) {
      setFeedbackMsg({ type: "err", text: `Fayl hajmi ${SUBMISSION_FILE_LIMIT_MB} MiB dan oshmasligi kerak` });
      return;
    }
    try {
      const fd = new FormData();
      fd.append("assignmentId", assignmentId);
      fd.append("comment", subComment);
      fd.append("externalUrl", subUrl);
      if (subFile) fd.append("file", subFile);

      const result = await submissionUpload.send<{ replayed: boolean }>("/api/student/submissions", fd);
      if (!result) return;
      if (!result.ok) {
        setFeedbackMsg({ type: "err", text: result.data?.error ?? "Vazifani topshirib bo'lmadi." });
        return;
      }
      setActiveAssignmentId(null);
      setSubComment("");
      setSubUrl("");
      setSubFile(null);
      setFeedbackMsg({
        type: "ok",
        text: result.data?.replayed ? "Bu versiya allaqachon topshirilgan." :
          "Vazifangiz saqlandi va o'qituvchiga xabar yuborildi.",
      });
      await loadData().catch(() => {
        setFeedbackMsg({ type: "ok", text: "Vazifa yuborildi. Ro'yxatni ko'rish uchun sahifani yangilang." });
      });
    } catch (error) {
      setFeedbackMsg({ type: "err", text: error instanceof Error ? error.message : "Vazifani yuborib bo'lmadi." });
    }
  }

  return (
    <PortalShell
      user={user}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      navItems={[
        {
          id: "tasks",
          label: "Vazifalar & Topshirish",
          badge: data?.summary.pendingCount ?? 0,
        },
        { id: "grades", label: "Reyting daftarchasi" },
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

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Akademik guruh</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {user.group?.name ?? "Biriktirilmagan"}
          </p>
          <p className="text-[11px] text-slate-400">
            {user.group?.specialty ?? ""}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Topshirilishi kerak</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">
            {data?.summary.pendingCount ?? 0} ta
          </p>
          <p className="text-[11px] text-slate-400">Yangi yoki qaytarilgan</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Yig&apos;ilgan ball</p>
          <p className="mt-1 text-2xl font-bold text-indigo-600">
            {data?.summary.totalEarned ?? 0} / {data?.summary.totalMax ?? 0}
          </p>
          <p className="text-[11px] text-slate-400">
            O&apos;zlashtirish: {data?.summary.averagePct ?? 0}%
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Joriy OTM baho</p>
          <p className="mt-1 text-xl font-bold text-emerald-700">
            {data?.summary.overallGrade?.label ?? "Baholanmoqda"}
          </p>
          <p className="text-[11px] text-slate-400">100 ballik kredit-modul</p>
        </div>
      </div>

      {loading && !data ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          Vazifalar yuklanmoqda...
        </div>
      ) : null}
      {!loading && !data && (
        <PortalEmptyState
          title="Vazifalarni yuklab bo‘lmadi"
          description="Internet aloqasini tekshirib, qayta urinib ko‘ring."
          action={<button type="button" className="text-sm font-semibold text-indigo-700 underline" onClick={() => {
            setLoading(true);
            void loadData().catch(() => {});
          }}>Qayta yuklash</button>}
        />
      )}

      {data && activeTab === "tasks" && (
        <div className="space-y-4">
          {requestedAssignment && !linkedAssignmentId && (
            <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Havoladagi vazifa joriy ro&apos;yxatda mavjud emas.
            </p>
          )}
          {!data.assignments.length && <PortalEmptyState title="Hali vazifa yo‘q" description="Guruhingizga yangi vazifa berilganda u shu yerda ko‘rinadi." />}
          {data.assignments.map((a) => {
            const sub = a.submission;
            const now = new Date();
            const isExpired = now > new Date(a.dueDate);
            const canSubmit = canSubmitAssignment(sub?.status ?? null, a, now);
            const isOpen = activeAssignmentId === a.id;

            return (
              <div
                key={a.id}
                id={`assignment-${a.id}`}
                tabIndex={-1}
                className={`scroll-mt-36 break-words rounded-2xl border bg-white p-4 shadow-sm sm:p-5 ${linkedAssignmentId === a.id ? "border-indigo-400 ring-2 ring-indigo-100" : "border-slate-200"}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="max-w-3xl space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                        {a.subject.code} — {a.subject.name}
                      </span>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                        {CONTROL_TYPE_LABELS[a.controlType]}
                      </span>
                      {sub ? (
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                            sub.status === "GRADED"
                              ? "bg-emerald-100 text-emerald-800"
                              : sub.status === "RETURNED"
                              ? "bg-rose-100 text-rose-800"
                              : "bg-sky-100 text-sky-800"
                          }`}
                        >
                          {getSubmissionStatusLabel(sub)} (v{sub.version})
                        </span>
                      ) : (
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                            isExpired
                              ? "bg-rose-100 text-rose-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {getSubmissionStatusLabel(null)}
                        </span>
                      )}
                      {sub?.isLate && sub.status !== "SUBMITTED" && sub.status !== "RESUBMITTED" && (
                        <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700">
                          Kechiktirib topshirilgan
                        </span>
                      )}
                    </div>

                    <h3 className="text-base font-bold text-slate-900">{a.title}</h3>
                    <p className="text-xs text-slate-600 leading-relaxed">{a.description}</p>
                    <p className="text-xs text-slate-500">
                      O&apos;qituvchi: <span className="font-semibold">{a.teacher.fullName}</span> •{" "}
                      Muddat:{" "}
                      <span className={isExpired ? "text-rose-600 font-semibold" : "font-semibold"}>
                        {new Date(a.dueDate).toLocaleString("uz-UZ")}
                      </span>
                    </p>

                    {a.attachmentPath && (
                      <a
                        href={`/api/files/download?path=${encodeURIComponent(
                          a.attachmentPath
                        )}&name=${encodeURIComponent(a.attachmentName ?? "metodika")}`}
                        className="inline-flex items-center gap-1.5 pt-1 text-xs font-semibold text-indigo-600 hover:underline"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        O&apos;qituvchi biriktirgan fayl: {a.attachmentName}
                      </a>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <div className="rounded-xl bg-slate-100 px-3 py-1.5 text-right">
                      <p className="text-[11px] text-slate-500">Ball</p>
                      <p className="text-sm font-bold text-slate-900">
                        {sub?.status === "GRADED" && sub.score !== null
                          ? `${sub.score} / ${a.maxScore}`
                          : `Max ${a.maxScore}`}
                      </p>
                    </div>

                    {canSubmit && (
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => {
                          if (activeAssignmentId && activeAssignmentId !== a.id) submissionUpload.resetRequest();
                          setActiveAssignmentId(isOpen ? null : a.id);
                          setSubComment(sub?.comment ?? "");
                          setSubUrl(sub?.externalUrl ?? "");
                          setSubFile(null);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-700 transition"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        {sub ? "Qayta topshirish" : "Vazifani yuklash"}
                      </button>
                    )}
                  </div>
                </div>

                {sub?.status === "RETURNED" && (
                  <p className="mt-3 text-xs font-semibold text-amber-800">
                    O&apos;qituvchi qayta topshirishga ruxsat berdi. Yangi versiyani yuborishingiz mumkin.
                  </p>
                )}
                {sub?.feedback && (
                  <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-2.5 text-xs text-emerald-900">
                    <span className="font-bold">{sub.status === "RESUBMITTED" || sub.status === "IN_REVIEW" ? "Oldingi izoh" : "O'qituvchi izohi"}:</span> {sub.feedback}
                  </div>
                )}

                {sub && sub.versions.length > 0 && (
                  <div className="mt-3 border-t border-slate-100 pt-2.5">
                    <p className="text-[11px] font-semibold text-slate-500 mb-1.5">
                      Topshirish tarixi:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {sub.versions.map((v) => (
                        <div
                          key={v.id}
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-700"
                        >
                          <span className="font-bold">v{v.version}</span>
                          <span>{new Date(v.createdAt).toLocaleDateString("uz-UZ")}</span>
                          {v.externalUrl && (
                            <a
                              href={v.externalUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-indigo-600 hover:underline inline-flex items-center gap-0.5"
                            >
                              <ExternalLink className="h-3 w-3" /> Havola
                            </a>
                          )}
                          {v.filePath && (
                            <a
                              href={`/api/files/download?path=${encodeURIComponent(
                                v.filePath
                              )}`}
                              className="text-emerald-700 hover:underline inline-flex items-center gap-0.5"
                            >
                              <FileText className="h-3 w-3" /> {v.fileName}
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {isOpen && canSubmit && (
                  <form
                    onSubmit={(e) => handleSubmitAssignment(e, a.id)}
                    onChange={submissionUpload.resetRequest}
                    aria-busy={submitting}
                    className="mt-4 border-t border-slate-200 pt-4 grid gap-3 sm:grid-cols-2"
                  >
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Izoh / Bajarilgan ish tavsifi
                      </label>
                      <textarea
                        disabled={submitting}
                        rows={2}
                        value={subComment}
                        onChange={(e) => setSubComment(e.target.value)}
                        placeholder="Masalan: Barcha talablar bajarildi, GitHub repo va PDF hisobot ilova qilindi."
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        GitHub / Google Drive havolasi (ixtiyoriy)
                      </label>
                      <input
                        type="url"
                        disabled={submitting}
                        value={subUrl}
                        onChange={(e) => setSubUrl(e.target.value)}
                        placeholder="https://github.com/..."
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Fayl yuklash (PDF, DOCX, DOC, arxiv, jadval yoki rasm · {SUBMISSION_FILE_LIMIT_MB} MiB gacha)
                      </label>
                      <input
                        type="file"
                        disabled={submitting}
                        accept={SUBMISSION_FILE_ACCEPT}
                        onChange={(e) => setSubFile(e.target.files?.[0] ?? null)}
                        className="w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-indigo-700"
                      />
                    </div>
                    {submitting && <div className="sm:col-span-2"><UploadProgress progress={submissionUpload.progress} /></div>}
                    <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-2 pt-1">
                      {isExpired ? (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                          <Clock className="h-3.5 w-3.5" />
                          {a.latePenaltyPct > 0
                            ? `Muddat o'tgan · −${a.latePenaltyPct}% jarima qo'llanilishi mumkin`
                            : "Muddat o'tgan"}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Muddat ichida topshirilmoqda
                        </span>
                      )}
                      <button
                        type="submit"
                        disabled={submitting}
                        className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {submitting ? "Yuklanmoqda..." : "Ishni yuborish"}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}

      {data && activeTab === "grades" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-4">
            <GraduationCap className="h-5 w-5 text-indigo-600" />
            Fanlar kesimida reyting daftarchasi (100 ballik kredit-modul)
          </h2>
          {!data.gradebook.length ? (
            <PortalEmptyState title="Reyting daftarchasi bo‘sh" description="Guruhingizga fan biriktirilganda natijalar shu yerda ko‘rinadi." />
          ) : <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2.5 pr-4">Fan kodi va nomi</th>
                  <th className="py-2.5 pr-4">O&apos;qituvchi</th>
                  <th className="py-2.5 pr-4">Kredit</th>
                  <th className="py-2.5 pr-4">Baholangan ishlar</th>
                  <th className="py-2.5 pr-4">Ball / Natija</th>
                  <th className="py-2.5 text-right">Baho</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.gradebook.map((g) => (
                  <tr key={g.subjectId}>
                    <td className="py-3 pr-4">
                      <p className="font-bold text-slate-900">{g.name}</p>
                      <p className="text-xs font-mono text-slate-500">{g.code}</p>
                    </td>
                    <td className="py-3 pr-4 text-slate-700">{g.teacherName}</td>
                    <td className="py-3 pr-4">{g.credits}</td>
                    <td className="py-3 pr-4">
                      {g.gradedCount} / {g.assignmentCount}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900">
                          {g.earned} / {g.possibleGraded}
                        </span>
                        <span className="text-xs text-slate-500">({g.percentage}%)</span>
                      </div>
                      <div className="mt-1 h-1.5 w-32 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full bg-indigo-600 rounded-full"
                          style={{ width: `${Math.min(100, g.percentage)}%` }}
                        />
                      </div>
                    </td>
                    <td className="py-3 text-right font-bold">
                      {g.gradeInfo ? (
                        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs text-emerald-800">
                          {g.gradeInfo.label}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">Kutilmoqda</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
        </div>
      )}
    </PortalShell>
  );
}
