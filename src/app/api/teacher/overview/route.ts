import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { user, errorResponse } = await requireApiAuth(["TEACHER"]);
  if (errorResponse) return errorResponse;

  const teachings = await prisma.subjectTeacher.findMany({
    where: { teacherId: user.id },
    include: {
      subject: true,
      group: {
        include: { _count: { select: { students: { where: { isActive: true, role: "STUDENT" } } } } },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  const [assignments, kpiCriteria, kpiEntries] = await Promise.all([
    prisma.assignment.findMany({
      omit: { publishRequestId: true },
      where: {
        teacherId: user.id,
        OR: teachings.map(({ subjectId, groupId }) => ({ subjectId, groupId })),
      },
      orderBy: { createdAt: "desc" },
      include: {
        subject: { select: { id: true, name: true, code: true } },
        group: {
          select: {
            id: true,
            name: true,
            _count: { select: { students: { where: { isActive: true, role: "STUDENT" } } } },
            students: {
              where: { isActive: true, role: "STUDENT" },
              select: { id: true, fullName: true },
              orderBy: [{ fullName: "asc" }, { id: "asc" }],
            },
          },
        },
        submissions: {
          where: { student: { isActive: true, role: "STUDENT" } },
          orderBy: { submittedAt: "desc" },
          include: {
            student: { select: { id: true, fullName: true, email: true, groupId: true } },
            versions: { omit: { requestId: true }, orderBy: { version: "desc" } },
            grades: {
              orderBy: { revision: "desc" },
              include: { grader: { select: { fullName: true } } },
            },
          },
        },
      },
    }),
    prisma.kpiCriterion.findMany({
      where: { isActive: true },
      orderBy: [{ block: "asc" }, { code: "asc" }],
    }),
    prisma.kpiEntry.findMany({
      where: { teacherId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        criterion: true,
        reviewedBy: { select: { id: true, fullName: true } },
      },
    }),
  ]);

  const approvedByBlock = {
    SCIENTIFIC: 0,
    METHODICAL: 0,
    INNOVATION: 0,
    QUALITY: 0,
  };
  let totalApprovedKpi = 0;
  let pendingKpiScore = 0;

  for (const entry of kpiEntries) {
    if (entry.status === "APPROVED") {
      const pts = entry.approvedScore ?? entry.calculatedScore;
      approvedByBlock[entry.criterion.block] += pts;
      totalApprovedKpi += pts;
    } else if (entry.status === "PENDING") {
      pendingKpiScore += entry.calculatedScore;
    }
  }

  return NextResponse.json({
    teachings,
    assignments: assignments.map((assignment) => ({
      ...assignment,
      submissions: assignment.submissions.filter((submission) => submission.student.groupId === assignment.groupId),
    })),
    kpiCriteria,
    kpiEntries,
    kpiSummary: {
      totalApprovedKpi: Number(totalApprovedKpi.toFixed(2)),
      pendingKpiScore: Number(pendingKpiScore.toFixed(2)),
      approvedByBlock,
    },
  });
}
