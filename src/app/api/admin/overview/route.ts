import { NextResponse } from "next/server";
import { IssueSeverity, IssueStatus } from "@prisma/client";
import { requireApiAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runSystemDiagnostics } from "@/lib/monitoring";

export async function GET() {
  const { errorResponse } = await requireApiAuth(["ADMIN"]);
  if (errorResponse) return errorResponse;

  const [
    issues,
    users,
    groups,
    auditLogs,
    openIssuesCount,
    criticalIssuesCount,
    resolvedIssuesCount,
    assignmentsCount,
    submissionGroups,
    kpiEntriesCount,
    diagnostics,
  ] = await Promise.all([
    prisma.systemIssue.findMany({
      orderBy: [{ lastOccurredAt: "desc" }, { createdAt: "desc" }],
      take: 100,
      include: {
        reportedBy: { select: { id: true, fullName: true, email: true, role: true } },
        resolvedBy: { select: { id: true, fullName: true, email: true } },
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
        department: { select: { id: true, name: true, code: true } },
        createdAt: true,
      },
    }),
    prisma.academicGroup.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, courseYear: true },
    }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 60,
      include: {
        actor: { select: { id: true, fullName: true, role: true, email: true } },
      },
    }),
    prisma.systemIssue.count({
      where: { status: { in: [IssueStatus.OPEN, IssueStatus.ACKNOWLEDGED] } },
    }),
    prisma.systemIssue.count({
      where: {
        status: { in: [IssueStatus.OPEN, IssueStatus.ACKNOWLEDGED] },
        severity: IssueSeverity.CRITICAL,
      },
    }),
    prisma.systemIssue.count({
      where: { status: IssueStatus.RESOLVED },
    }),
    prisma.assignment.count(),
    prisma.submission.groupBy({ by: ["status", "isLate"], _count: { _all: true } }),
    prisma.kpiEntry.count(),
    runSystemDiagnostics(),
  ]);

  const activeUsersCount = users.filter((u) => u.isActive).length;
  const grading = { awaitingReview: 0, inReview: 0, graded: 0, returned: 0, late: 0 };
  let submissionsCount = 0;
  for (const group of submissionGroups) {
    const count = group._count._all;
    submissionsCount += count;
    if (group.isLate) grading.late += count;
    switch (group.status) {
      case "SUBMITTED":
      case "RESUBMITTED":
        grading.awaitingReview += count;
        break;
      case "IN_REVIEW":
        grading.inReview += count;
        break;
      case "GRADED":
        grading.graded += count;
        break;
      case "RETURNED":
        grading.returned += count;
        break;
    }
  }

  return NextResponse.json({
    stats: {
      openIssuesCount,
      criticalIssuesCount,
      resolvedIssuesCount,
      totalUsersCount: users.length,
      activeUsersCount,
      inactiveUsersCount: users.length - activeUsersCount,
      assignmentsCount,
      submissionsCount,
      grading,
      kpiEntriesCount,
      auditLogsCount: auditLogs.length,
    },
    diagnostics,
    issues,
    users,
    groups,
    auditLogs,
  });
}
