import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/lib/audit";

const groupSchema = z.object({
  kind: z.literal("group"),
  name: z.string().min(2),
  courseYear: z.coerce.number().int().min(1).max(6),
  semester: z.coerce.number().int().min(1).max(12),
  specialty: z.string().min(3),
});

const subjectSchema = z.object({
  kind: z.literal("subject"),
  name: z.string().min(3),
  code: z.string().min(2),
  credits: z.coerce.number().int().min(1).max(12),
  semester: z.coerce.number().int().min(1).max(12),
});

const teachingSchema = z.object({
  kind: z.literal("teaching"),
  subjectId: z.string().min(1),
  teacherId: z.string().min(1),
  groupId: z.string().min(1),
});

const payloadSchema = z.discriminatedUnion("kind", [
  groupSchema,
  subjectSchema,
  teachingSchema,
]);

export async function POST(request: NextRequest) {
  const { user: actor, errorResponse } = await requireApiAuth(["DEAN"]);
  if (errorResponse) return errorResponse;

  const body = await request.json().catch(() => null);
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ma'lumotlar noto'g'ri" },
      { status: 400 }
    );
  }

  const department = await prisma.department.findFirst();
  if (!department) {
    return NextResponse.json({ error: "Kafedra topilmadi" }, { status: 404 });
  }

  const data = parsed.data;
  if (data.kind === "group") {
    const existing = await prisma.academicGroup.findUnique({
      where: { name: data.name.trim() },
    });
    if (existing) {
      return NextResponse.json({ error: "Bunday guruh mavjud" }, { status: 409 });
    }
    const group = await prisma.academicGroup.create({
      data: {
        name: data.name.trim(),
        courseYear: data.courseYear,
        semester: data.semester,
        specialty: data.specialty.trim(),
        departmentId: department.id,
      },
    });
    await recordAuditLog({
      actorId: actor.id,
      action: "GROUP_CREATED",
      entityType: "AcademicGroup",
      entityId: group.id,
      newValue: { name: group.name },
    });
    return NextResponse.json({ group }, { status: 201 });
  }

  if (data.kind === "subject") {
    const code = data.code.trim().toUpperCase();
    const existing = await prisma.subject.findUnique({ where: { code } });
    if (existing) {
      return NextResponse.json({ error: "Bunday fan kodi mavjud" }, { status: 409 });
    }
    const subject = await prisma.subject.create({
      data: {
        name: data.name.trim(),
        code,
        credits: data.credits,
        semester: data.semester,
        departmentId: department.id,
      },
    });
    await recordAuditLog({
      actorId: actor.id,
      action: "SUBJECT_CREATED",
      entityType: "Subject",
      entityId: subject.id,
      newValue: { code: subject.code, name: subject.name },
    });
    return NextResponse.json({ subject }, { status: 201 });
  }

  const teaching = await prisma.subjectTeacher.upsert({
    where: {
      subjectId_teacherId_groupId: {
        subjectId: data.subjectId,
        teacherId: data.teacherId,
        groupId: data.groupId,
      },
    },
    update: {},
    create: {
      subjectId: data.subjectId,
      teacherId: data.teacherId,
      groupId: data.groupId,
    },
  });

  await recordAuditLog({
    actorId: actor.id,
    action: "TEACHING_ASSIGNED",
    entityType: "SubjectTeacher",
    entityId: teaching.id,
    newValue: data,
  });

  return NextResponse.json({ teaching }, { status: 201 });
}
