import { NextRequest, NextResponse } from "next/server";
import { IssueStatus } from "@prisma/client";
import { z } from "zod";
import { requireApiAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/lib/audit";

const updateIssueSchema = z.object({
  status: z.nativeEnum(IssueStatus),
  resolutionNote: z.string().trim().max(1000).optional(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { user: actor, errorResponse } = await requireApiAuth(["ADMIN"]);
  if (errorResponse) return errorResponse;

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = updateIssueSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Yaroqsiz so'rov" },
      { status: 400 }
    );
  }

  const existing = await prisma.systemIssue.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Muammo yozuvi topilmadi" }, { status: 404 });
  }

  const isClosing =
    parsed.data.status === IssueStatus.RESOLVED ||
    parsed.data.status === IssueStatus.IGNORED;

  const updated = await prisma.systemIssue.update({
    where: { id },
    data: {
      status: parsed.data.status,
      resolutionNote:
        parsed.data.resolutionNote !== undefined
          ? parsed.data.resolutionNote || null
          : existing.resolutionNote,
      resolvedById: isClosing ? actor.id : null,
      resolvedAt: isClosing ? new Date() : null,
    },
  });

  await recordAuditLog({
    actorId: actor.id,
    action: "SYSTEM_ISSUE_UPDATED",
    entityType: "SystemIssue",
    entityId: updated.id,
    oldValue: { status: existing.status, resolutionNote: existing.resolutionNote },
    newValue: { status: updated.status, resolutionNote: updated.resolutionNote },
    reason: parsed.data.resolutionNote,
  });

  return NextResponse.json({ issue: updated });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { user: actor, errorResponse } = await requireApiAuth(["ADMIN"]);
  if (errorResponse) return errorResponse;

  const { id } = await context.params;
  const existing = await prisma.systemIssue.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Muammo yozuvi topilmadi" }, { status: 404 });
  }

  await prisma.systemIssue.delete({ where: { id } });

  await recordAuditLog({
    actorId: actor.id,
    action: "SYSTEM_ISSUE_DELETED",
    entityType: "SystemIssue",
    entityId: id,
    oldValue: { title: existing.title, severity: existing.severity },
  });

  return NextResponse.json({ ok: true });
}
