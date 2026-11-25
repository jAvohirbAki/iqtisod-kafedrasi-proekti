import { NextRequest, NextResponse } from "next/server";
import { KpiStatus, NotificationType } from "@prisma/client";
import { z } from "zod";
import { requireApiAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createNotification, recordAuditLog } from "@/lib/audit";

const reviewSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  approvedScore: z.coerce.number().min(0).max(200).optional(),
  reviewComment: z.string().trim().min(3, "Izoh kamida 3 ta belgi bo'lishi kerak"),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { user: actor, errorResponse } = await requireApiAuth(["DEAN"]);
  if (errorResponse) return errorResponse;

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Tasdiqlash ma'lumotlari noto'g'ri" },
      { status: 400 }
    );
  }

  const existing = await prisma.kpiEntry.findUnique({
    where: { id },
    include: { criterion: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "KPI yozuvi topilmadi" }, { status: 404 });
  }

  const isApproved = parsed.data.decision === "APPROVED";
  const finalScore = isApproved
    ? parsed.data.approvedScore ?? existing.calculatedScore
    : 0;

  const updated = await prisma.kpiEntry.update({
    where: { id },
    data: {
      status: isApproved ? KpiStatus.APPROVED : KpiStatus.REJECTED,
      approvedScore: isApproved ? finalScore : null,
      reviewComment: parsed.data.reviewComment,
      reviewedById: actor.id,
      reviewedAt: new Date(),
    },
  });

  await recordAuditLog({
    actorId: actor.id,
    action: isApproved ? "KPI_APPROVED" : "KPI_REJECTED",
    entityType: "KpiEntry",
    entityId: updated.id,
    oldValue: { status: existing.status, approvedScore: existing.approvedScore },
    newValue: { status: updated.status, approvedScore: updated.approvedScore },
    reason: parsed.data.reviewComment,
  });

  await createNotification({
    userId: existing.teacherId,
    type: NotificationType.KPI_REVIEWED,
    title: isApproved ? "KPI arizangiz tasdiqlandi" : "KPI arizangiz rad etildi",
    message: `"${existing.title}" bo'yicha qaror: ${
      isApproved ? `${finalScore} ball tasdiqlandi` : "Rad etildi"
    }. Izoh: ${parsed.data.reviewComment}`,
    link: "/teacher?tab=kpi",
  });

  return NextResponse.json({ kpiEntry: updated });
}
