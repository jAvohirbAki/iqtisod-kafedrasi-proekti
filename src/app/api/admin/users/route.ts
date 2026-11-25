import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { z } from "zod";
import { requireApiAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/lib/audit";

const createUserSchema = z.object({
  fullName: z.string().trim().min(3, "F.I.Sh. kamida 3 ta belgi bo'lishi kerak"),
  email: z.string().trim().email("Email noto'g'ri"),
  password: z.string().min(6, "Parol kamida 6 ta belgi bo'lishi kerak"),
  role: z.nativeEnum(Role),
  phone: z.string().trim().optional(),
  academicTitle: z.string().trim().optional(),
  groupId: z.string().optional().nullable(),
});

export async function POST(request: NextRequest) {
  const { user: actor, errorResponse } = await requireApiAuth(["ADMIN"]);
  if (errorResponse) return errorResponse;

  const body = await request.json().catch(() => null);
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Kiritilgan ma'lumotlar noto'g'ri" },
      { status: 400 }
    );
  }

  const email = parsed.data.email.toLowerCase();
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
      fullName: parsed.data.fullName,
      email,
      passwordHash,
      role: parsed.data.role,
      phone: parsed.data.phone || null,
      academicTitle: parsed.data.academicTitle || null,
      departmentId: department?.id ?? null,
      groupId: parsed.data.role === "STUDENT" ? parsed.data.groupId ?? null : null,
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      isActive: true,
      academicTitle: true,
      groupId: true,
    },
  });

  await recordAuditLog({
    actorId: actor.id,
    action: "ADMIN_USER_CREATED",
    entityType: "User",
    entityId: created.id,
    newValue: { email: created.email, role: created.role, fullName: created.fullName },
  });

  return NextResponse.json({ user: created }, { status: 201 });
}
