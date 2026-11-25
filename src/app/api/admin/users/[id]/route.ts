import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { z } from "zod";
import { requireApiAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/lib/audit";

const updateUserSchema = z.object({
  isActive: z.boolean().optional(),
  role: z.nativeEnum(Role).optional(),
  newPassword: z.string().min(6, "Parol kamida 6 ta belgi bo'lishi kerak").optional(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { user: actor, errorResponse } = await requireApiAuth(["ADMIN"]);
  if (errorResponse) return errorResponse;

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Yaroqsiz ma'lumot" },
      { status: 400 }
    );
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json({ error: "Foydalanuvchi topilmadi" }, { status: 404 });
  }

  if (target.id === actor.id && parsed.data.isActive === false) {
    return NextResponse.json(
      { error: "O'zingizning administrator hisobingizni bloklay olmaysiz" },
      { status: 400 }
    );
  }

  if (target.id === actor.id && parsed.data.role && parsed.data.role !== "ADMIN") {
    return NextResponse.json(
      { error: "O'zingizning administrator rolingizni o'zgartira olmaysiz" },
      { status: 400 }
    );
  }

  const updateData: {
    isActive?: boolean;
    role?: Role;
    passwordHash?: string;
  } = {};

  if (parsed.data.isActive !== undefined) {
    updateData.isActive = parsed.data.isActive;
  }
  if (parsed.data.role !== undefined) {
    updateData.role = parsed.data.role;
  }
  if (parsed.data.newPassword) {
    updateData.passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  }

  const updated = await prisma.user.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      isActive: true,
    },
  });

  await recordAuditLog({
    actorId: actor.id,
    action: "ADMIN_USER_UPDATED",
    entityType: "User",
    entityId: updated.id,
    oldValue: { role: target.role, isActive: target.isActive },
    newValue: {
      role: updated.role,
      isActive: updated.isActive,
      passwordReset: Boolean(parsed.data.newPassword),
    },
  });

  return NextResponse.json({ user: updated });
}
