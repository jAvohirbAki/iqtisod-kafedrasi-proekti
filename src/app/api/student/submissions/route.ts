import { NextRequest, NextResponse } from "next/server";
import { IssueSeverity, IssueSource, NotificationType, SubmissionStatus } from "@prisma/client";
import { requireApiAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveUploadedFile } from "@/lib/storage";
import { createNotification } from "@/lib/audit";
import { reportSystemIssue } from "@/lib/monitoring";

export async function POST(request: NextRequest) {
  const { user, errorResponse } = await requireApiAuth(["STUDENT"]);
  if (errorResponse) return errorResponse;

  try {
    const formData = await request.formData();
    const assignmentId = String(formData.get("assignmentId") ?? "").trim();
    const comment = String(formData.get("comment") ?? "").trim() || null;
    const externalUrl = String(formData.get("externalUrl") ?? "").trim() || null;
    const file = formData.get("file");

    if (!assignmentId) {
      return NextResponse.json({ error: "Vazifa ID ko'rsatilmagan" }, { status: 400 });
    }

    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment) {
      return NextResponse.json({ error: "Vazifa topilmadi" }, { status: 404 });
    }
    if (!user.groupId || assignment.groupId !== user.groupId) {
      return NextResponse.json(
        { error: "Bu vazifa sizning guruhingizga tegishli emas" },
        { status: 403 }
      );
    }

    const now = new Date();
    const isLate = now > assignment.dueDate;
    if (isLate && !assignment.allowLate) {
      return NextResponse.json(
        { error: "Topshirish muddati tugagan va kechikib topshirishga ruxsat berilmagan" },
        { status: 400 }
      );
    }

    let fileName: string | null = null;
    let filePath: string | null = null;
    let fileSize: number | null = null;
    if (file instanceof File && file.size > 0) {
      const saved = await saveUploadedFile(file, "submissions");
      fileName = saved.fileName;
      filePath = saved.filePath;
      fileSize = saved.fileSize;
    }

    if (!filePath && !externalUrl && !comment) {
      return NextResponse.json(
        { error: "Kamida fayl, havola yoki izoh kiritishingiz shart" },
        { status: 400 }
      );
    }

    const existing = await prisma.submission.findUnique({
      where: {
        assignmentId_studentId: {
          assignmentId: assignment.id,
          studentId: user.id,
        },
      },
    });

    const nextVersion = existing ? existing.version + 1 : 1;
    const nextStatus = existing
      ? SubmissionStatus.RESUBMITTED
      : SubmissionStatus.SUBMITTED;

    const submission = await prisma.$transaction(async (tx) => {
      const upserted = existing
        ? await tx.submission.update({
            where: { id: existing.id },
            data: {
              version: nextVersion,
              comment,
              externalUrl,
              fileName: fileName ?? existing.fileName,
              filePath: filePath ?? existing.filePath,
              fileSize: fileSize ?? existing.fileSize,
              isLate,
              status: nextStatus,
              submittedAt: now,
            },
          })
        : await tx.submission.create({
            data: {
              assignmentId: assignment.id,
              studentId: user.id,
              version: 1,
              comment,
              externalUrl,
              fileName,
              filePath,
              fileSize,
              isLate,
              status: SubmissionStatus.SUBMITTED,
              submittedAt: now,
            },
          });

      await tx.submissionVersion.create({
        data: {
          submissionId: upserted.id,
          version: nextVersion,
          comment,
          externalUrl,
          fileName,
          filePath,
          fileSize,
          isLate,
        },
      });

      return upserted;
    });

    await createNotification({
      userId: assignment.teacherId,
      type: NotificationType.SUBMISSION_RECEIVED,
      title: existing ? "Vazifa qayta topshirildi" : "Yangi topshiriq kelib tushdi",
      message: `${user.fullName} "${assignment.title}" vazifasini (v${nextVersion}) yukladi.`,
      link: "/teacher?tab=grading",
    });

    return NextResponse.json({ submission }, { status: existing ? 200 : 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Yuklashda xatolik";
    await reportSystemIssue({
      title: "Talaba topshirig'ini yuklash xatoligi",
      message,
      severity: IssueSeverity.WARNING,
      source: IssueSource.API_SERVER,
      route: "/api/student/submissions",
      method: "POST",
      statusCode: 400,
      stackTrace: err instanceof Error ? err.stack : null,
      reportedByUserId: user.id,
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
