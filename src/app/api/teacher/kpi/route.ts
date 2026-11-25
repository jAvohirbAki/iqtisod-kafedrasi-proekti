import { NextRequest, NextResponse } from "next/server";
import { IssueSeverity, IssueSource, KpiStatus, NotificationType } from "@prisma/client";
import { z } from "zod";
import { requireApiAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateKpiScore } from "@/lib/domain";
import { saveUploadedFile } from "@/lib/storage";
import { createNotification, recordAuditLog } from "@/lib/audit";
import { reportSystemIssue } from "@/lib/monitoring";

const kpiSchema = z.object({
  criterionId: z.string().min(1),
  academicYear: z.string().trim().min(4).default("2026-2027"),
  semester: z.string().trim().min(2).default("Kuzgi"),
  title: z.string().trim().min(3, "Ish nomi kamida 3 ta belgi bo'lishi kerak"),
  description: z.string().trim().optional(),
  quantity: z.coerce.number().int().min(1).max(50).default(1),
  proofUrl: z.string().trim().optional(),
  submitNow: z.boolean().default(true),
});

export async function POST(request: NextRequest) {
  const { user, errorResponse } = await requireApiAuth(["TEACHER"]);
  if (errorResponse) return errorResponse;

  try {
    const formData = await request.formData();
    const parsed = kpiSchema.safeParse({
      criterionId: formData.get("criterionId"),
      academicYear: formData.get("academicYear") || "2026-2027",
      semester: formData.get("semester") || "Kuzgi",
      title: formData.get("title"),
      description: formData.get("description") || undefined,
      quantity: formData.get("quantity") || 1,
      proofUrl: formData.get("proofUrl") || undefined,
      submitNow: formData.get("submitNow") !== "false",
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "KPI ma'lumotlari noto'g'ri" },
        { status: 400 }
      );
    }

    const criterion = await prisma.kpiCriterion.findUnique({
      where: { id: parsed.data.criterionId },
    });
    if (!criterion || !criterion.isActive) {
      return NextResponse.json({ error: "KPI mezoni topilmadi" }, { status: 404 });
    }

    const proofFile = formData.get("proofFile");
    let proofFileName: string | null = null;
    let proofFilePath: string | null = null;
    if (proofFile instanceof File && proofFile.size > 0) {
      const saved = await saveUploadedFile(proofFile, "kpi");
      proofFileName = saved.fileName;
      proofFilePath = saved.filePath;
    }

    if (
      parsed.data.submitNow &&
      criterion.requiresProof &&
      !proofFilePath &&
      !parsed.data.proofUrl
    ) {
      return NextResponse.json(
        { error: "Tasdiqlash uchun hujjat (PDF) yoki DOI/havola kiritish shart" },
        { status: 400 }
      );
    }

    const calculatedScore = calculateKpiScore(
      criterion.pointsPerUnit,
      parsed.data.quantity,
      criterion.maxPoints
    );

    const status = parsed.data.submitNow ? KpiStatus.PENDING : KpiStatus.DRAFT;

    const kpiEntry = await prisma.kpiEntry.create({
      data: {
        teacherId: user.id,
        criterionId: criterion.id,
        academicYear: parsed.data.academicYear,
        semester: parsed.data.semester,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        quantity: parsed.data.quantity,
        calculatedScore,
        proofUrl: parsed.data.proofUrl || null,
        proofFileName,
        proofFilePath,
        status,
        submittedAt: parsed.data.submitNow ? new Date() : null,
      },
      include: { criterion: true },
    });

    if (parsed.data.submitNow) {
      const deans = await prisma.user.findMany({
        where: { role: "DEAN", isActive: true },
        select: { id: true },
      });

      await Promise.all([
        recordAuditLog({
          actorId: user.id,
          action: "KPI_SUBMITTED",
          entityType: "KpiEntry",
          entityId: kpiEntry.id,
          newValue: { title: kpiEntry.title, calculatedScore },
        }),
        ...deans.map((d) =>
          createNotification({
            userId: d.id,
            type: NotificationType.KPI_SUBMITTED,
            title: "Yangi KPI arizasi",
            message: `${user.fullName} "${kpiEntry.title}" (${calculatedScore} ball) bo'yicha tasdiq so'radi.`,
            link: "/dean?tab=kpi",
          })
        ),
      ]);
    }

    return NextResponse.json({ kpiEntry }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "KPI saqlashda xatolik";
    await reportSystemIssue({
      title: "KPI yuklash/saqlash xatoligi",
      message,
      severity: IssueSeverity.WARNING,
      source: IssueSource.API_SERVER,
      route: "/api/teacher/kpi",
      method: "POST",
      statusCode: 400,
      stackTrace: err instanceof Error ? err.stack : null,
      reportedByUserId: user.id,
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
