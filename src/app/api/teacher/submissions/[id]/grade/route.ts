import { NextRequest, NextResponse } from "next/server";
import { NotificationType, SubmissionStatus } from "@prisma/client";
import { z } from "zod";
import { requireApiAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateGradedScore } from "@/lib/domain";
import { createNotification, recordAuditLog } from "@/lib/audit";

const gradeSchema = z.object({
  action: z.enum(["GRADED", "RETURNED"]),
  score: z.coerce.number().min(0).optional(),
  applyLatePenalty: z.boolean().optional(),
  feedback: z.string().trim().min(2, "Izoh yozish majburiy"),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { user, errorResponse } = await requireApiAuth(["TEACHER"]);
  if (errorResponse) return errorResponse;

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = gradeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Baholash ma'lumotlari noto'g'ri" },
      { status: 400 }
    );
  }

  const submission = await prisma.submission.findUnique({
    where: { id },
    include: { assignment: true },
  });
  if (!submission) {
    return NextResponse.json({ error: "Topshiriq topilmadi" }, { status: 404 });
  }
  if (submission.assignment.teacherId !== user.id) {
    return NextResponse.json(
      { error: "Faqat o'z faningizdagi ishlarni baholay olasiz" },
      { status: 403 }
    );
  }

  const isGraded = parsed.data.action === "GRADED";
  if (isGraded && (parsed.data.score === undefined || parsed.data.score > submission.assignment.maxScore)) {
    return NextResponse.json(
      { error: `Ball 0 dan ${submission.assignment.maxScore} gacha bo'lishi kerak` },
      { status: 400 }
    );
  }

  const finalScore = isGraded
    ? calculateGradedScore({
        rawScore: parsed.data.score ?? 0,
        maxScore: submission.assignment.maxScore,
        isLate: submission.isLate,
        latePenaltyPct: submission.assignment.latePenaltyPct,
        applyLatePenalty: parsed.data.applyLatePenalty,
      })
    : null;

  const updated = await prisma.submission.update({
    where: { id },
    data: {
      status: isGraded ? SubmissionStatus.GRADED : SubmissionStatus.RETURNED,
      score: finalScore,
      feedback: parsed.data.feedback,
      gradedById: user.id,
      gradedAt: new Date(),
    },
  });

  await Promise.all([
    recordAuditLog({
      actorId: user.id,
      action: isGraded ? "SUBMISSION_GRADED" : "SUBMISSION_RETURNED",
      entityType: "Submission",
      entityId: updated.id,
      oldValue: { status: submission.status, score: submission.score },
      newValue: { status: updated.status, score: updated.score },
      reason: parsed.data.feedback,
    }),
    createNotification({
      userId: submission.studentId,
      type: NotificationType.SUBMISSION_GRADED,
      title: isGraded ? "Vazifangiz baholandi" : "Vazifa qayta ishlashga qaytarildi",
      message: isGraded
        ? `"${submission.assignment.title}" bo'yicha ${finalScore} / ${submission.assignment.maxScore} ball qo'yildi.`
        : `"${submission.assignment.title}" qayta ishlashga qaytarildi. Izoh: ${parsed.data.feedback}`,
      link: "/student",
    }),
  ]);

  return NextResponse.json({ submission: updated });
}
