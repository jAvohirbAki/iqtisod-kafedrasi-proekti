import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { errorResponse } = await requireApiAuth(["DEAN"]);
  if (errorResponse) return errorResponse;

  const [
    department,
    groups,
    subjects,
    teachings,
    users,
    kpiCriteria,
    kpiEntries,
    auditLogs,
    assignmentsCount,
    submissionsCount,
    gradedSubmissionsCount,
  ] = await Promise.all([
    prisma.department.findFirst(),
    prisma.academicGroup.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { students: true, assignments: true } } },
    }),
    prisma.subject.findMany({
      orderBy: { code: "asc" },
      include: {
        teachings: {
          include: {
            teacher: { select: { id: true, fullName: true, academicTitle: true } },
            group: { select: { id: true, name: true } },
          },
        },
      },
    }),
    prisma.subjectTeacher.findMany({
      include: {
        subject: { select: { id: true, name: true, code: true } },
        teacher: { select: { id: true, fullName: true } },
        group: { select: { id: true, name: true } },
      },
    }),
    prisma.user.findMany({
      orderBy: [{ role: "asc" }, { fullName: "asc" }],
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        phone: true,
        academicTitle: true,
        isActive: true,
        groupId: true,
        group: { select: { id: true, name: true } },
        createdAt: true,
      },
    }),
    prisma.kpiCriterion.findMany({
      orderBy: [{ block: "asc" }, { code: "asc" }],
    }),
    prisma.kpiEntry.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: {
        teacher: { select: { id: true, fullName: true, academicTitle: true, email: true } },
        criterion: true,
        reviewedBy: { select: { id: true, fullName: true } },
      },
    }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 40,
      include: {
        actor: { select: { id: true, fullName: true, role: true } },
      },
    }),
    prisma.assignment.count(),
    prisma.submission.count(),
    prisma.submission.count({ where: { status: "GRADED" } }),
  ]);

  // Compute teacher KPI summary ranking
  const teachers = users.filter((u) => u.role === "TEACHER");
  const teacherKpiSummary = teachers
    .map((teacher) => {
      const entries = kpiEntries.filter((k) => k.teacherId === teacher.id);
      const approvedEntries = entries.filter((k) => k.status === "APPROVED");
      const pendingCount = entries.filter((k) => k.status === "PENDING").length;

      const byBlock = {
        SCIENTIFIC: 0,
        METHODICAL: 0,
        INNOVATION: 0,
        QUALITY: 0,
      };
      for (const entry of approvedEntries) {
        const pts = entry.approvedScore ?? entry.calculatedScore;
        byBlock[entry.criterion.block] += pts;
      }
      const totalApprovedScore = Number(
        (
          byBlock.SCIENTIFIC +
          byBlock.METHODICAL +
          byBlock.INNOVATION +
          byBlock.QUALITY
        ).toFixed(2)
      );

      return {
        teacherId: teacher.id,
        fullName: teacher.fullName,
        academicTitle: teacher.academicTitle,
        email: teacher.email,
        totalApprovedScore,
        pendingCount,
        approvedCount: approvedEntries.length,
        byBlock,
      };
    })
    .sort((a, b) => b.totalApprovedScore - a.totalApprovedScore);

  return NextResponse.json({
    department,
    stats: {
      teachersCount: teachers.length,
      studentsCount: users.filter((u) => u.role === "STUDENT").length,
      groupsCount: groups.length,
      subjectsCount: subjects.length,
      assignmentsCount,
      submissionsCount,
      gradedSubmissionsCount,
      pendingKpiCount: kpiEntries.filter((k) => k.status === "PENDING").length,
    },
    groups,
    subjects,
    teachings,
    users,
    kpiCriteria,
    kpiEntries,
    teacherKpiSummary,
    auditLogs,
  });
}
