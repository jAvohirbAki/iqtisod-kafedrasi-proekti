import { NextRequest, NextResponse } from "next/server";
import { IssueSeverity, IssueSource } from "@prisma/client";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { reportSystemIssue } from "@/lib/monitoring";

const clientReportSchema = z.object({
  title: z.string().trim().min(2).max(200),
  message: z.string().trim().min(2).max(2000),
  route: z.string().trim().max(300).optional(),
  stackTrace: z.string().max(6000).optional(),
  severity: z.nativeEnum(IssueSeverity).optional(),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = clientReportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Noto'g'ri xatolik hisoboti" }, { status: 400 });
  }

  const sessionUser = await getSessionUser().catch(() => null);

  const issue = await reportSystemIssue({
    title: parsed.data.title,
    message: parsed.data.message,
    severity: parsed.data.severity ?? IssueSeverity.ERROR,
    source: IssueSource.CLIENT_UI,
    route: parsed.data.route ?? null,
    method: "CLIENT",
    stackTrace: parsed.data.stackTrace ?? null,
    reportedByUserId: sessionUser?.id ?? null,
  });

  return NextResponse.json({ ok: true, issueId: issue?.id ?? null }, { status: 201 });
}
