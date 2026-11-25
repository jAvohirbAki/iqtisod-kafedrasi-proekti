import fs from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveSafeUploadPath } from "@/lib/storage";

export async function GET(request: NextRequest) {
  const { user, errorResponse } = await requireApiAuth();
  if (errorResponse) return errorResponse;

  const relPath = request.nextUrl.searchParams.get("path");
  const downloadName = request.nextUrl.searchParams.get("name");
  if (!relPath) {
    return NextResponse.json({ error: "Fayl yo'li ko'rsatilmagan" }, { status: 400 });
  }

  const resolved = resolveSafeUploadPath(relPath);
  if (!resolved) {
    return NextResponse.json({ error: "Noto'g'ri fayl yo'li" }, { status: 400 });
  }

  // Authorization check per folder
  const normalized = relPath.replace(/\\/g, "/");
  if (normalized.startsWith("submissions/") && user.role === "STUDENT") {
    const owned = await prisma.submissionVersion.findFirst({
      where: {
        filePath: normalized,
        submission: { studentId: user.id },
      },
      select: { id: true },
    });
    if (!owned) {
      return NextResponse.json(
        { error: "Bu faylni yuklab olish huquqingiz yo'q" },
        { status: 403 }
      );
    }
  } else if (normalized.startsWith("kpi/") && user.role === "STUDENT") {
    return NextResponse.json({ error: "Ruxsat yo'q" }, { status: 403 });
  }

  try {
    const buffer = await fs.readFile(resolved);
    const filename = downloadName || path.basename(resolved);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Fayl topilmadi" }, { status: 404 });
  }
}
