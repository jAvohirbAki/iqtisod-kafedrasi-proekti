import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ControlType, NotificationType, Prisma } from "@prisma/client";
import { z } from "zod";
import { requireApiAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateUploadFile } from "@/lib/storage";
import { recordAuditLog } from "@/lib/audit";
import { assignmentNotificationLink } from "@/lib/notification-links";
import { readRequestId } from "@/lib/request-id";

const assignmentSchema = z.object({
  title: z.string().trim().min(3, "Sarlavha kamida 3 ta belgi bo'lishi kerak"),
  description: z.string().trim().min(10, "Vazifa sharti kamida 10 ta belgi bo'lishi kerak"),
  subjectId: z.string({ error: "Fanni tanlang" }).min(1, "Fanni tanlang"),
  groupId: z.string({ error: "Guruhni tanlang" }).min(1, "Guruhni tanlang"),
  controlType: z.nativeEnum(ControlType, { error: "Nazorat turini tanlang" }),
  maxScore: z.coerce.number({ error: "Maksimal ballni raqam bilan kiriting" }).int("Ball butun son bo'lishi kerak")
    .min(1, "Maksimal ball 1 dan kam bo'lmasligi kerak").max(100, "Maksimal ball 100 dan oshmasligi kerak"),
  dueDate: z.iso.datetime({ offset: true, error: "Muddat sanasi noto'g'ri" }),
  allowLate: z.boolean().default(true),
  latePenaltyPct: z.coerce.number({ error: "Jarima foizini raqam bilan kiriting" }).int("Jarima foizi butun son bo'lishi kerak")
    .min(0, "Jarima foizi manfiy bo'lmasligi kerak").max(100, "Jarima foizi 100 dan oshmasligi kerak").default(10),
});

async function replayPublication(teacherId: string, requestId: string) {
  const assignment = await prisma.assignment.findUnique({
    where: { teacherId_publishRequestId: { teacherId, publishRequestId: requestId } },
    omit: { publishRequestId: true },
  });
  if (!assignment) return null;
  const notifiedStudentCount = await prisma.notification.count({
    where: { assignmentId: assignment.id, type: NotificationType.ASSIGNMENT_CREATED },
  });
  return NextResponse.json({ assignment, notifiedStudentCount, replayed: true });
}

export async function POST(request: NextRequest) {
  const { user, errorResponse } = await requireApiAuth(["TEACHER"]);
  if (errorResponse) return errorResponse;

  const requestId = readRequestId(request);
  if (requestId === false) {
    return NextResponse.json({ error: "Yuborish so'rovi identifikatori noto'g'ri" }, { status: 400 });
  }
  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "Vazifa ma'lumotlari noto'g'ri" }, { status: 400 });
  }

  const parsed = assignmentSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    subjectId: formData.get("subjectId"),
    groupId: formData.get("groupId"),
    controlType: formData.get("controlType") ?? "JORIY",
    maxScore: formData.get("maxScore"),
    dueDate: formData.get("dueDate"),
    allowLate: formData.get("allowLate") === "true",
    latePenaltyPct: formData.get("latePenaltyPct") ?? 10,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Vazifa ma'lumotlari noto'g'ri" },
      { status: 400 }
    );
  }

  const input = parsed.data;
  const file = formData.get("attachment");
  if (file instanceof File) {
    const error = validateUploadFile(file);
    if (error) return NextResponse.json({ error }, { status: 400 });
  } else if (file !== null) {
    return NextResponse.json({ error: "Metodik fayl noto'g'ri" }, { status: 400 });
  }

  try {
    if (requestId) {
      const replay = await replayPublication(user.id, requestId);
      if (replay) return replay;
    }
    const attachment = file instanceof File
      ? {
          name: file.name,
          path: `assignments/${randomUUID()}`,
          content: new Uint8Array(await file.arrayBuffer()),
        }
      : null;

    const published = await prisma.$transaction(async (tx) => {
      const teaching = await tx.subjectTeacher.findUnique({
        where: {
          subjectId_teacherId_groupId: {
            subjectId: input.subjectId,
            teacherId: user.id,
            groupId: input.groupId,
          },
        },
        select: { subject: { select: { name: true } } },
      });
      if (!teaching) return null;

      const assignment = await tx.assignment.create({
        omit: { publishRequestId: true },
        data: {
          ...input,
          dueDate: new Date(input.dueDate),
          latePenaltyPct: input.allowLate ? input.latePenaltyPct : 0,
          teacherId: user.id,
          publishRequestId: requestId,
          ...(attachment && {
            attachmentName: attachment.name,
            attachmentPath: attachment.path,
            attachment: { create: { content: attachment.content } },
          }),
        },
      });

      const students = await tx.user.findMany({
        where: { role: "STUDENT", groupId: assignment.groupId, isActive: true },
        select: { id: true },
      });

      await recordAuditLog({
        actorId: user.id,
        action: "ASSIGNMENT_CREATED",
        entityType: "Assignment",
        entityId: assignment.id,
        newValue: { title: assignment.title, groupId: assignment.groupId, maxScore: assignment.maxScore },
      }, tx);

      const notifications = await tx.notification.createMany({
        data: students.map(({ id }) => ({
          userId: id,
          assignmentId: assignment.id,
          type: NotificationType.ASSIGNMENT_CREATED,
          title: `Yangi vazifa: ${teaching.subject.name}`,
          message: `${user.fullName} "${assignment.title}" vazifasini joyladi (max ${assignment.maxScore} ball).`,
          link: assignmentNotificationLink("STUDENT", assignment.id),
        })),
      });

      return { assignment, notifiedStudentCount: notifications.count };
    });

    if (!published) {
      return NextResponse.json(
        { error: "Sizga ushbu fan va guruh biriktirilmagan" },
        { status: 403 }
      );
    }

    return NextResponse.json(published, { status: 201 });
  } catch (err) {
    if (requestId && err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const replay = await replayPublication(user.id, requestId);
      if (replay) return replay;
    }
    console.error("Vazifa yaratishda xatolik", err);
    return NextResponse.json({ error: "Vazifa yaratishda xatolik" }, { status: 500 });
  }
}
