import { NextRequest, NextResponse } from "next/server";
import { KpiStatus, NotificationType } from "@prisma/client";
import { requireApiAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createNotification, recordAuditLog } from "@/lib/audit";

export async function PATCH(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { user, errorResponse } = await requireApiAuth(["TEACHER"]);
  if (errorResponse) return errorResponse;

  const { id } = await context.params;
  const entry = await prisma.kpiEntry.findUnique({ where: { id } });
  if (!entry || entry.teacherId !== user.id) {
    return NextResponse.json({ error: "KPI yozuvi topilmadi" }, { status: 404 });
  }
  if (entry.status !== "DRAFT" && entry.status !== "REJECTED") {
    return NextResponse.json(
      { error: "Faqat qoralama yoki rad etilgan yozuvni qayta yuborish mumkin" },
      { status: 400 }
    );
  }

  const updated = await prisma.kpiEntry.update({
    where: { id },
    data: {
      status: KpiStatus.PENDING,
      submittedAt: new Date(),
      reviewComment: null,
    },
  });

  const deans = await prisma.user.findMany({
    where: { role: "DEAN", isActive: true },
    select: { id: true },
  });

  await Promise.all([
    recordAuditLog({
      actorId: user.id,
      action: "KPI_RESUBMITTED",
      entityType: "KpiEntry",
      entityId: updated.id,
    }),
    ...deans.map((d) =>
      createNotification({
        userId: d.id,
        type: NotificationType.KPI_SUBMITTED,
        title: "KPI arizasi qayta yuborildi",
        message: `${user.fullName} "${updated.title}" bo'yicha arizani tasdiqlashga yubordi.`,
        link: "/dean?tab=kpi",
      })
    ),
  ]);

  return NextResponse.json({ kpiEntry: updated });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { user, errorResponse } = await requireApiAuth(["TEACHER"]);
  if (errorResponse) return errorResponse;

  const { id } = await context.params;
  const entry = await prisma.kpiEntry.findUnique({ where: { id } });
  if (!entry || entry.teacherId !== user.id) {
    return NextResponse.json({ error: "KPI yozuvi topilmadi" }, { status: 404 });
  }
  if (entry.status === "APPROVED") {
    return NextResponse.json(
      { error: "Tasdiqlangan KPI yozuvini o'chirib bo'lmaydi" },
      { status: 400 }
    );
  }

  await prisma.kpiEntry.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
