import { NextRequest, NextResponse } from "next/server";
import { NotificationType, Prisma } from "@prisma/client";
import { z } from "zod";
import { requireApiAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateGradedScore } from "@/lib/domain";
import { createNotification, recordAuditLog } from "@/lib/audit";
import { preserveLegacyGrade } from "@/lib/grading";
import { assignmentNotificationLink } from "@/lib/notification-links";

const gradeSchema = z.object({
  action: z.enum(["IN_REVIEW", "GRADED", "RETURNED"]),
  score: z.union([z.number(), z.string().trim().min(1).pipe(z.coerce.number())]).pipe(z.number().min(0)).optional(),
  applyLatePenalty: z.boolean().optional(),
  feedback: z.string().trim().max(3000).optional(),
  expectedVersion: z.number().int().positive().optional(),
  expectedRevision: z.number().int().nonnegative().optional(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { user, errorResponse } = await requireApiAuth(["TEACHER"]);
  if (errorResponse) return errorResponse;

  const { id } = await context.params;
  const parsed = gradeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Baholash ma'lumotlari noto'g'ri. Ball, izoh va amalni tekshiring." },
      { status: 400 }
    );
  }
  const { action, score, feedback, expectedVersion, expectedRevision } = parsed.data;
  const startingReview = action === "IN_REVIEW";
  const isGraded = action === "GRADED";
  if (!startingReview && (!feedback || feedback.length < 2)) {
    return NextResponse.json({ error: "Izoh yozish majburiy" }, { status: 400 });
  }

  const conflict = () => NextResponse.json(
    { error: "Ish holati o'zgargan. Ro'yxatni yangilab, so'nggi versiyani tekshiring." }, { status: 409 }
  );

  try {
    return await prisma.$transaction(async (tx) => {
      const submission = await tx.submission.findUnique({
        where: { id },
        include: { assignment: true, student: { select: { groupId: true, role: true, isActive: true } } },
      });
      if (!submission) {
        return NextResponse.json({ error: "Topshiriq topilmadi" }, { status: 404 });
      }
      const { assignment, student, ...current } = submission;
      const teaching = assignment.teacherId === user.id && student.role === "STUDENT" &&
        student.isActive && student.groupId === assignment.groupId && await tx.subjectTeacher.findUnique({
          where: {
            subjectId_teacherId_groupId: { subjectId: assignment.subjectId, teacherId: user.id, groupId: assignment.groupId },
          },
          select: { id: true },
        });
      if (!teaching) {
        return NextResponse.json(
          { error: "Faqat o'zingizga biriktirilgan fan va guruhdagi ishlarni baholay olasiz" },
          { status: 403 }
        );
      }
      if ((expectedVersion !== undefined && expectedVersion !== submission.version) ||
          (expectedRevision !== undefined && expectedRevision !== submission.gradingRevision)) return conflict();
      if (startingReview && submission.status !== "SUBMITTED" && submission.status !== "RESUBMITTED") {
        return conflict();
      }
      if (isGraded && (score === undefined || score > assignment.maxScore)) {
        return NextResponse.json(
          { error: `Ball 0 dan ${assignment.maxScore} gacha bo'lishi kerak` },
          { status: 400 }
        );
      }

      const appliedLatePenalty = Boolean(isGraded && submission.isLate && assignment.latePenaltyPct > 0 && parsed.data.applyLatePenalty);
      const finalScore = isGraded ? calculateGradedScore({
        rawScore: score ?? 0,
        maxScore: assignment.maxScore,
        isLate: submission.isLate,
        latePenaltyPct: assignment.latePenaltyPct,
        applyLatePenalty: appliedLatePenalty,
      }) : null;
      if (!startingReview && submission.status === action && submission.score === finalScore && submission.feedback === feedback) {
        const previous = await tx.submissionGrade.findUnique({
          where: { submissionId_revision: { submissionId: id, revision: submission.gradingRevision } },
          select: { rawScore: true, appliedLatePenalty: true },
        });
        if (!isGraded || (previous?.rawScore === score && previous?.appliedLatePenalty === appliedLatePenalty)) {
          return NextResponse.json({ submission: current, replayed: true });
        }
      }
      const now = new Date();
      const updated = await tx.submission.update({
        where: {
          id,
          version: submission.version,
          gradingRevision: submission.gradingRevision,
          student: { role: "STUDENT", isActive: true, groupId: assignment.groupId },
          assignment: {
            teacherId: user.id,
            group: { teachings: { some: { teacherId: user.id, subjectId: assignment.subjectId } } },
          },
        },
        data: {
          status: action,
          gradingRevision: { increment: 1 },
          ...(!startingReview && { score: finalScore, feedback, gradedById: user.id, gradedAt: now }),
        },
      });

      if (!startingReview) {
        await preserveLegacyGrade(tx, submission);
        await tx.submissionGrade.create({
          data: {
            submissionId: id,
            submissionVersion: updated.version,
            revision: updated.gradingRevision,
            status: action,
            score: finalScore,
            rawScore: isGraded ? score : null,
            appliedLatePenalty: isGraded ? appliedLatePenalty : null,
            feedback,
            graderId: user.id,
            gradedAt: now,
          },
        });
        const gradeChanged = isGraded && submission.status === "GRADED" && submission.score !== finalScore;
        const message = !isGraded
          ? `"${assignment.title}" qayta ishlashga qaytarildi. Izoh: ${feedback}`
          : gradeChanged
            ? `"${assignment.title}" bahosi ${submission.score} dan ${finalScore} / ${assignment.maxScore} ballga o'zgartirildi.`
            : `"${assignment.title}" bo'yicha ${finalScore} / ${assignment.maxScore} ball qo'yildi.`;
        await createNotification({
          userId: submission.studentId,
          assignmentId: assignment.id,
          type: isGraded ? NotificationType.SUBMISSION_GRADED : NotificationType.SUBMISSION_RETURNED,
          title: gradeChanged ? "Vazifa bahosi o'zgartirildi" : isGraded ? "Vazifangiz baholandi" : "Vazifa qayta ishlashga qaytarildi",
          message,
          link: assignmentNotificationLink("STUDENT", assignment.id),
        }, tx);
      }

      await recordAuditLog({
        actorId: user.id,
        action: startingReview ? "SUBMISSION_REVIEW_STARTED" : isGraded ? "SUBMISSION_GRADED" : "SUBMISSION_RETURNED",
        entityType: "Submission",
        entityId: id,
        oldValue: { status: submission.status, score: submission.score, feedback: submission.feedback, version: submission.version },
        newValue: { status: updated.status, score: updated.score, feedback: updated.feedback, version: updated.version },
        reason: startingReview ? undefined : feedback,
      }, tx);
      return NextResponse.json({ submission: updated });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") return conflict();
    throw err;
  }
}
