import { NextRequest, NextResponse } from "next/server";
import { KpiBlock } from "@prisma/client";
import { z } from "zod";
import { requireApiAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/lib/audit";

const criterionSchema = z.object({
  code: z.string().min(3),
  title: z.string().min(3),
  block: z.nativeEnum(KpiBlock),
  pointsPerUnit: z.coerce.number().positive(),
  maxPoints: z.coerce.number().positive().nullable().optional(),
  description: z.string().min(5),
  requiresProof: z.boolean().default(true),
});

export async function POST(request: NextRequest) {
  const { user: actor, errorResponse } = await requireApiAuth(["DEAN"]);
  if (errorResponse) return errorResponse;

  const body = await request.json().catch(() => null);
  const parsed = criterionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "KPI mezoni ma'lumotlari noto'g'ri" },
      { status: 400 }
    );
  }

  const code = parsed.data.code.trim().toUpperCase();
  const exists = await prisma.kpiCriterion.findUnique({ where: { code } });
  if (exists) {
    return NextResponse.json({ error: "Bunday KPI kodi mavjud" }, { status: 409 });
  }

  const criterion = await prisma.kpiCriterion.create({
    data: {
      code,
      title: parsed.data.title.trim(),
      block: parsed.data.block,
      pointsPerUnit: parsed.data.pointsPerUnit,
      maxPoints: parsed.data.maxPoints ?? null,
      description: parsed.data.description.trim(),
      requiresProof: parsed.data.requiresProof,
    },
  });

  await recordAuditLog({
    actorId: actor.id,
    action: "KPI_CRITERION_CREATED",
    entityType: "KpiCriterion",
    entityId: criterion.id,
    newValue: { code: criterion.code, pointsPerUnit: criterion.pointsPerUnit },
  });

  return NextResponse.json({ criterion }, { status: 201 });
}
