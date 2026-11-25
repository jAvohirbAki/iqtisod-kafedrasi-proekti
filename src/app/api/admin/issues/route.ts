import { NextRequest, NextResponse } from "next/server";
import { IssueSeverity, IssueSource, IssueStatus } from "@prisma/client";
import { z } from "zod";
import { requireApiAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/lib/audit";
import { reportSystemIssue } from "@/lib/monitoring";

const createIssueSchema = z.object({
  title: z.string().trim().min(3, "Sarlavha kamida 3 ta belgi bo'lishi kerak").max(200),
  message: z.string().trim().min(3, "Tavsif kamida 3 ta belgi bo'lishi kerak").max(2000),
  severity: z.nativeEnum(IssueSeverity).default(IssueSeverity.WARNING),
  source: z.nativeEnum(IssueSource).default(IssueSource.HEALTH_CHECK),
  route: z.string().trim().max(300).optional(),
  method: z.string().trim().max(16).optional(),
});

export async function GET(request: NextRequest) {
  const { errorResponse } = await requireApiAuth(["ADMIN"]);
  if (errorResponse) return errorResponse;

  const { searchParams } = request.nextUrl;
  const statusParam = searchParams.get("status") as IssueStatus | null;
  const severityParam = searchParams.get("severity") as IssueSeverity | null;
  const sourceParam = searchParams.get("source") as IssueSource | null;

  const issues = await prisma.systemIssue.findMany({
    where: {
      ...(statusParam && Object.values(IssueStatus).includes(statusParam)
        ? { status: statusParam }
        : {}),
      ...(severityParam && Object.values(IssueSeverity).includes(severityParam)
        ? { severity: severityParam }
        : {}),
      ...(sourceParam && Object.values(IssueSource).includes(sourceParam)
        ? { source: sourceParam }
        : {}),
    },
    orderBy: [{ lastOccurredAt: "desc" }, { createdAt: "desc" }],
    take: 150,
    include: {
      reportedBy: { select: { id: true, fullName: true, email: true, role: true } },
      resolvedBy: { select: { id: true, fullName: true, email: true } },
    },
  });

  return NextResponse.json({ issues });
}

export async function POST(request: NextRequest) {
  const { user: actor, errorResponse } = await requireApiAuth(["ADMIN"]);
  if (errorResponse) return errorResponse;

  const body = await request.json().catch(() => null);
  const parsed = createIssueSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Muammo ma'lumotlari noto'g'ri" },
      { status: 400 }
    );
  }

  const issue = await reportSystemIssue({
    title: parsed.data.title,
    message: parsed.data.message,
    severity: parsed.data.severity,
    source: parsed.data.source,
    route: parsed.data.route ?? null,
    method: parsed.data.method ?? null,
    reportedByUserId: actor.id,
  });

  if (!issue) {
    return NextResponse.json(
      { error: "Tizim muammosini saqlashda xatolik yuz berdi" },
      { status: 500 }
    );
  }

  await recordAuditLog({
    actorId: actor.id,
    action: "SYSTEM_ISSUE_CREATED",
    entityType: "SystemIssue",
    entityId: issue.id,
    newValue: { title: issue.title, severity: issue.severity, source: issue.source },
  });

  return NextResponse.json({ issue }, { status: 201 });
}
