import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { z } from "zod";
import { requireApiAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/lib/audit";

const createUserSchema = z.object({
  fullName: z.string().min(3, "F.I.Sh. kamida 3 ta belgi bo'lishi kerak"),
  email: z.string().email("Email noto'g'ri"),
  password: z.string().min(6, "Parol kamida 6 ta belgi bo'lishi kerak"),
  role: z.nativeEnum(Role),
  phone: z.string().optional(),
  academicTitle: z.string().optional(),
  groupId: z.string().optional().nullable(),
});

export async function POST(request: NextRequest) {
  const { user: actor, errorResponse } = await requireApiAuth(["DEAN"]);
  if (errorResponse) return errorResponse;

  const body = await request.json().catch(() => null);
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Kiritilgan ma'lumotlar noto'g'ri" },
      { status: 400 }
    );
  }

  const email = parsed.data.email.trim().toLowerCase();
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) {
    return NextResponse.json(
      { error: "Bu email bilan foydalanuvchi allaqachon mavjud" },
      { status: 409 }
    );
  }

  if (parsed.data.role === "STUDENT" && !parsed.data.groupId) {
    return NextResponse.json(
      { error: "Talaba uchun akademik guruh tanlanishi shart" },
      { status: 400 }
    );
  }

  const department = await prisma.department.findFirst();
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  const created = await prisma.user.create({
    data: {
      fullName: parsed.data.fullName.trim(),
      email,
      passwordHash,
      role: parsed.data.role,
      phone: parsed.data.phone?.trim() || null,
      academicTitle: parsed.data.academicTitle?.trim() || null,
      departmentId: department?.id ?? null,
      groupId: parsed.data.role === "STUDENT" ? parsed.data.groupId ?? null : null,
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      academicTitle: true,
      groupId: true,
    },
  });

  await recordAuditLog({
    actorId: actor.id,
    action: "USER_CREATED",
    entityType: "User",
    entityId: created.id,
    newValue: { email: created.email, role: created.role, fullName: created.fullName },
  });

  return NextResponse.json({ user: created }, { status: 201 });
}
