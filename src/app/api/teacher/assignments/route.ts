import { NextRequest, NextResponse } from "next/server";
import { ControlType, NotificationType } from "@prisma/client";
import { z } from "zod";
import { requireApiAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveUploadedFile } from "@/lib/storage";
import { createNotification, recordAuditLog } from "@/lib/audit";

const assignmentSchema = z.object({
  title: z.string().trim().min(3, "Sarlavha kamida 3 ta belgi bo'lishi kerak"),
  description: z.string().trim().min(10, "Vazifa sharti kamida 10 ta belgi bo'lishi kerak"),
  subjectId: z.string().min(1),
  groupId: z.string().min(1),
  controlType: z.nativeEnum(ControlType),
  maxScore: z.coerce.number().int().min(1).max(100),
  dueDate: z.string().min(1),
  allowLate: z.boolean().default(true),
  latePenaltyPct: z.coerce.number().int().min(0).max(100).default(10),
});

export async function POST(request: NextRequest) {
  const { user, errorResponse } = await requireApiAuth(["TEACHER"]);
  if (errorResponse) return errorResponse;

  try {
    const formData = await request.formData();
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

    const teaching = await prisma.subjectTeacher.findUnique({
      where: {
        subjectId_teacherId_groupId: {
          subjectId: parsed.data.subjectId,
          teacherId: user.id,
          groupId: parsed.data.groupId,
        },
      },
      include: { subject: true },
    });

    if (!teaching) {
      return NextResponse.json(
        { error: "Sizga ushbu fan va guruh biriktirilmagan" },
        { status: 403 }
      );
    }

    const dueDate = new Date(parsed.data.dueDate);
    if (Number.isNaN(dueDate.getTime())) {
      return NextResponse.json({ error: "Muddat sanasi noto'g'ri" }, { status: 400 });
    }

    const attachment = formData.get("attachment");
    let attachmentName: string | null = null;
    let attachmentPath: string | null = null;

    if (attachment instanceof File && attachment.size > 0) {
      const saved = await saveUploadedFile(attachment, "assignments");
      attachmentName = saved.fileName;
      attachmentPath = saved.filePath;
    }

    const assignment = await prisma.assignment.create({
      data: {
        title: parsed.data.title,
        description: parsed.data.description,
        controlType: parsed.data.controlType,
        maxScore: parsed.data.maxScore,
        dueDate,
        allowLate: parsed.data.allowLate,
        latePenaltyPct: parsed.data.allowLate ? parsed.data.latePenaltyPct : 0,
        attachmentName,
        attachmentPath,
        subjectId: parsed.data.subjectId,
        groupId: parsed.data.groupId,
        teacherId: user.id,
      },
    });

    const students = await prisma.user.findMany({
      where: { role: "STUDENT", groupId: parsed.data.groupId, isActive: true },
      select: { id: true },
    });

    await Promise.all([
      recordAuditLog({
        actorId: user.id,
        action: "ASSIGNMENT_CREATED",
        entityType: "Assignment",
        entityId: assignment.id,
        newValue: { title: assignment.title, groupId: assignment.groupId, maxScore: assignment.maxScore },
      }),
      ...students.map((s) =>
        createNotification({
          userId: s.id,
          type: NotificationType.ASSIGNMENT_CREATED,
          title: `Yangi vazifa: ${teaching.subject.name}`,
          message: `${user.fullName} "${assignment.title}" vazifasini joyladi (max ${assignment.maxScore} ball).`,
          link: "/student",
        })
      ),
    ]);

    return NextResponse.json({ assignment }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Vazifa yaratishda xatolik";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
