import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function csvCell(value: string | number): string {
  const str = String(value).replace(/"/g, '""');
  return `"${str}"`;
}

export async function GET() {
  const { errorResponse } = await requireApiAuth(["DEAN"]);
  if (errorResponse) return errorResponse;

  const [teachers, kpiEntries] = await Promise.all([
    prisma.user.findMany({
      where: { role: "TEACHER" },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, academicTitle: true, email: true },
    }),
    prisma.kpiEntry.findMany({
      where: { status: "APPROVED" },
      include: { criterion: true },
    }),
  ]);

  const header = [
    "O'qituvchi F.I.Sh.",
    "Ilmiy daraja / lavozim",
    "Email",
    "Ilmiy-tadqiqot",
    "O'quv-uslubiy",
    "Innovatsiya va grantlar",
    "O'quv sifati",
    "Jami tasdiqlangan KPI ball",
  ];

  const rows = teachers.map((t) => {
    const entries = kpiEntries.filter((e) => e.teacherId === t.id);
    const byBlock = { SCIENTIFIC: 0, METHODICAL: 0, INNOVATION: 0, QUALITY: 0 };
    for (const e of entries) {
      byBlock[e.criterion.block] += e.approvedScore ?? e.calculatedScore;
    }
    const total =
      byBlock.SCIENTIFIC +
      byBlock.METHODICAL +
      byBlock.INNOVATION +
      byBlock.QUALITY;

    return [
      csvCell(t.fullName),
      csvCell(t.academicTitle ?? "-"),
      csvCell(t.email),
      csvCell(byBlock.SCIENTIFIC),
      csvCell(byBlock.METHODICAL),
      csvCell(byBlock.INNOVATION),
      csvCell(byBlock.QUALITY),
      csvCell(total),
    ].join(",");
  });

  const csvContent = "\uFEFF" + [header.map(csvCell).join(","), ...rows].join("\r\n");

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="kafedra-kpi-hisobot.csv"',
    },
  });
}
