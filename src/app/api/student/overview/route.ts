import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUzbekGradeLabel } from "@/lib/domain";

export async function GET() {
  const { user, errorResponse } = await requireApiAuth(["STUDENT"]);
  if (errorResponse) return errorResponse;

  if (!user.groupId) {
    return NextResponse.json({
      subjects: [],
      assignments: [],
      gradebook: [],
      summary: { totalEarned: 0, totalMax: 0, averagePct: 0, pendingCount: 0 },
    });
  }

  const [teachings, assignments] = await Promise.all([
    prisma.subjectTeacher.findMany({
      where: { groupId: user.groupId },
      include: {
        subject: true,
        teacher: { select: { id: true, fullName: true, academicTitle: true } },
      },
    }),
    prisma.assignment.findMany({
      omit: { publishRequestId: true },
      where: { groupId: user.groupId },
      orderBy: { dueDate: "asc" },
      include: {
        subject: { select: { id: true, name: true, code: true, credits: true } },
        teacher: { select: { id: true, fullName: true, academicTitle: true } },
        submissions: {
          where: { studentId: user.id },
          include: {
            versions: { omit: { requestId: true }, orderBy: { version: "desc" } },
          },
        },
      },
    }),
  ]);

  // Compute subject-by-subject gradebook
  const subjectStats = new Map<
    string,
    {
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
    }
  >();

  for (const t of teachings) {
    if (!subjectStats.has(t.subjectId)) {
      subjectStats.set(t.subjectId, {
        subjectId: t.subject.id,
        code: t.subject.code,
        name: t.subject.name,
        credits: t.subject.credits,
        teacherName: t.teacher.fullName,
        earned: 0,
        possibleGraded: 0,
        totalMax: 0,
        gradedCount: 0,
        assignmentCount: 0,
      });
    }
  }

  let totalEarned = 0;
  let totalPossibleGraded = 0;
  let pendingCount = 0;

  const formattedAssignments = assignments.map((a) => {
    const submission = a.submissions[0] ?? null;
    const entry = subjectStats.get(a.subjectId);
    if (entry) {
      entry.assignmentCount += 1;
      entry.totalMax += a.maxScore;
    }

    if (!submission || submission.status === "RETURNED") {
      pendingCount += 1;
    }

    if (submission && submission.status === "GRADED" && submission.score !== null) {
      totalEarned += submission.score;
      totalPossibleGraded += a.maxScore;
      if (entry) {
        entry.earned += submission.score;
        entry.possibleGraded += a.maxScore;
        entry.gradedCount += 1;
      }
    }

    return {
      ...a,
      submission,
    };
  });

  const gradebook = Array.from(subjectStats.values()).map((s) => {
    const pct = s.possibleGraded > 0 ? Math.round((s.earned / s.possibleGraded) * 100) : 0;
    return {
      ...s,
      percentage: pct,
      gradeInfo: s.gradedCount > 0 ? getUzbekGradeLabel(pct) : null,
    };
  });

  const averagePct =
    totalPossibleGraded > 0 ? Math.round((totalEarned / totalPossibleGraded) * 100) : 0;

  return NextResponse.json({
    subjects: teachings,
    assignments: formattedAssignments,
    gradebook,
    summary: {
      totalEarned: Number(totalEarned.toFixed(2)),
      totalMax: totalPossibleGraded,
      averagePct,
      pendingCount,
      overallGrade: totalPossibleGraded > 0 ? getUzbekGradeLabel(averagePct) : null,
    },
  });
}
