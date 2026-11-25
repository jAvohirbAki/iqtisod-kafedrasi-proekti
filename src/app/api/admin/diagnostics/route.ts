import { NextResponse } from "next/server";
import { IssueSeverity, IssueSource } from "@prisma/client";
import { requireApiAuth } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { reportSystemIssue, runSystemDiagnostics } from "@/lib/monitoring";

export async function POST() {
  const { user: actor, errorResponse } = await requireApiAuth(["ADMIN"]);
  if (errorResponse) return errorResponse;

  const diagnostics = await runSystemDiagnostics();

  for (const check of diagnostics.checks) {
    if (check.status === "error") {
      await reportSystemIssue({
        title: `Diagnostika xatoligi: ${check.label}`,
        message: check.detail,
        severity: IssueSeverity.CRITICAL,
        source: IssueSource.HEALTH_CHECK,
        route: "/api/admin/diagnostics",
        method: "POST",
        reportedByUserId: actor.id,
        metadata: { checkKey: check.key, latencyMs: check.latencyMs },
      });
    } else if (check.status === "warning" && check.key !== "open_issues") {
      await reportSystemIssue({
        title: `Diagnostika ogohlantirishi: ${check.label}`,
        message: check.detail,
        severity: IssueSeverity.WARNING,
        source: IssueSource.HEALTH_CHECK,
        route: "/api/admin/diagnostics",
        method: "POST",
        reportedByUserId: actor.id,
        metadata: { checkKey: check.key, latencyMs: check.latencyMs },
      });
    }
  }

  await recordAuditLog({
    actorId: actor.id,
    action: "SYSTEM_DIAGNOSTICS_RUN",
    entityType: "SystemDiagnostics",
    entityId: "health-check",
    newValue: {
      overallStatus: diagnostics.overallStatus,
      checksCount: diagnostics.checks.length,
    },
  });

  return NextResponse.json({ diagnostics });
}
