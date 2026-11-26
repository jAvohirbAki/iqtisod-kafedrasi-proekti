import { NextRequest, NextResponse } from "next/server";
import { IssueSeverity, IssueSource, NotificationType, Prisma, SubmissionStatus } from "@prisma/client";
import { requireApiAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/audit";
import { reportSystemIssue } from "@/lib/monitoring";
import { canSubmitAssignment } from "@/lib/domain";
import { preserveLegacyGrade } from "@/lib/grading";
import { prepareSubmissionFile, readSubmissionForm, SubmissionUploadError } from "@/lib/submission-file";
import { assignmentNotificationLink } from "@/lib/notification-links";
import { readRequestId } from "@/lib/request-id";

export async function POST(request: NextRequest) {
  const { user, errorResponse } = await requireApiAuth(["STUDENT"]);
  if (errorResponse) return errorResponse;

  const requestId = readRequestId(request);
  if (requestId === false) {
    return NextResponse.json({ error: "Yuborish so'rovi identifikatori noto'g'ri" }, { status: 400 });
  }
  const now = new Date();
  try {
    const formData = await readSubmissionForm(request);
    const assignmentId = String(formData.get("assignmentId") ?? "").trim();
    const comment = String(formData.get("comment") ?? "").trim() || null;
    const externalUrl = String(formData.get("externalUrl") ?? "").trim() || null;

    if (!assignmentId) {
      return NextResponse.json({ error: "Vazifa ID ko'rsatilmagan" }, { status: 400 });
    }
    if (externalUrl && !/^https?:\/\//i.test(externalUrl)) {
      return NextResponse.json({ error: "Havola http:// yoki https:// bilan boshlanishi kerak" }, { status: 400 });
    }
    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      select: { id: true, title: true, groupId: true, teacherId: true, dueDate: true, allowLate: true },
    });
    if (!assignment) {
      return NextResponse.json({ error: "Vazifa topilmadi" }, { status: 404 });
    }
    if (!user.groupId || assignment.groupId !== user.groupId) {
      return NextResponse.json({ error: "Bu vazifa sizning guruhingizga tegishli emas" }, { status: 403 });
    }

    const isLate = now > assignment.dueDate;
    const file = await prepareSubmissionFile(formData.get("file"));
    if (!file && !externalUrl && !comment) {
      return NextResponse.json({ error: "Kamida fayl, havola yoki izoh kiritishingiz shart" }, { status: 400 });
    }

    const fileMetadata = file ? { fileName: file.name, filePath: file.path, fileSize: file.size } : {};
    const submittedData = { comment, externalUrl, isLate, submittedAt: now, ...fileMetadata };
    const key = { assignmentId: assignment.id, studentId: user.id };
    const saveSubmission = () => prisma.$transaction(async (tx) => {
      const existing = await tx.submission.findUnique({
        where: { assignmentId_studentId: key },
      });
      if (existing && requestId) {
        const saved = await tx.submissionVersion.findUnique({
          where: { submissionId_requestId: { submissionId: existing.id, requestId } },
          select: { version: true },
        });
        if (saved) return { submission: existing, acceptedVersion: saved.version, replayed: true };
      }
      if (!canSubmitAssignment(existing?.status ?? null, assignment, now)) {
        throw new SubmissionUploadError(
          existing ? "Qayta topshirish uchun o'qituvchi ishni qaytarishi kerak" :
            "Topshirish muddati tugagan va kechikib topshirishga ruxsat berilmagan",
          existing ? 403 : 400
        );
      }
      const submission = existing
        ? await tx.submission.update({
            where: { id: existing.id, status: SubmissionStatus.RETURNED, gradingRevision: existing.gradingRevision, version: existing.version },
            data: {
              ...submittedData,
              version: { increment: 1 },
              status: SubmissionStatus.RESUBMITTED,
              score: null,
              gradedAt: null,
              gradedById: null,
            },
          })
        : await tx.submission.create({ data: { ...key, ...submittedData } });

      if (existing) await preserveLegacyGrade(tx, existing);
      if (file) await tx.submissionFile.create({ data: { ...file, submissionId: submission.id } });
      await tx.submissionVersion.create({
        data: {
          submissionId: submission.id,
          version: submission.version,
          requestId,
          comment,
          externalUrl,
          fileName: submission.fileName,
          filePath: submission.filePath,
          fileSize: submission.fileSize,
          isLate,
        },
      });
      await createNotification({
        userId: assignment.teacherId,
        assignmentId: assignment.id,
        type: NotificationType.SUBMISSION_RECEIVED,
        title: submission.version > 1 ? "Vazifa qayta topshirildi" : "Yangi topshiriq kelib tushdi",
        message: `${user.fullName} "${assignment.title}" vazifasini (v${submission.version}) yukladi.`,
        link: assignmentNotificationLink("TEACHER", assignment.id, submission.id),
      }, tx);
      return { submission, acceptedVersion: submission.version, replayed: false };
    }, { timeout: 15_000 });

    const result = await saveSubmission().catch((error: unknown) => {
      // Re-evaluate permissions if a concurrent first submission created the row.
      if (error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === "P2002" || (requestId && error.code === "P2025"))) {
        return saveSubmission();
      }
      throw error;
    });
    return NextResponse.json(result, { status: !result.replayed && result.acceptedVersion === 1 ? 201 : 200 });
  } catch (err) {
    if (err instanceof SubmissionUploadError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Ish holati o'zgargan. Sahifani yangilang." }, { status: 409 });
    }
    await reportSystemIssue({
      title: "Talaba topshirig'ini yuklash xatoligi",
      message: err instanceof Error ? err.message : "Noma'lum yuklash xatoligi",
      severity: IssueSeverity.WARNING,
      source: IssueSource.API_SERVER,
      route: "/api/student/submissions",
      method: "POST",
      statusCode: 500,
      stackTrace: err instanceof Error ? err.stack : null,
      reportedByUserId: user.id,
    }).catch(() => {});
    return NextResponse.json({ error: "Topshiriqni saqlashda xatolik" }, { status: 500 });
  }
}
