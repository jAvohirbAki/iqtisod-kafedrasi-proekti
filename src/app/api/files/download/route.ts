import fs from "fs/promises";
import path from "path";
import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth, type AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveSafeUploadPath, UPLOAD_ROOT } from "@/lib/storage";
import { isPreviewableSubmissionMimeType } from "@/lib/submission-file-formats";

function fileResponse(bytes: Uint8Array<ArrayBuffer>, name: string, mimeType = "application/octet-stream", inline = false) {
  const encodedName = encodeURIComponent(name.toWellFormed()).replace(/['()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodedName}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}

async function readLegacyFile(relativePath: string, resolved: string) {
  const [root, realFile] = await Promise.all([fs.realpath(UPLOAD_ROOT), fs.realpath(resolved)]);
  if (path.relative(path.join(root, relativePath), realFile) !== "") throw new Error("Invalid upload path");
  return fs.readFile(realFile);
}

function forbidden() {
  return NextResponse.json({ error: "Bu faylni yuklab olish huquqingiz yo'q" }, { status: 403 });
}

function missingFile() {
  return NextResponse.json({ error: "Fayl topilmadi" }, { status: 404 });
}

async function serveSubmissionFile(user: AuthUser, relativePath: string, resolved: string, preview: boolean) {
  let scope: Prisma.SubmissionWhereInput;
  switch (user.role) {
    case "ADMIN":
      scope = {};
      break;
    case "STUDENT":
      scope = { studentId: user.id };
      break;
    case "TEACHER": {
      const teachings = await prisma.subjectTeacher.findMany({
        where: { teacherId: user.id },
        select: { subjectId: true, groupId: true },
      });
      scope = {
        OR: teachings.map(({ subjectId, groupId }) => ({
          assignment: { teacherId: user.id, subjectId, groupId },
          student: { role: "STUDENT", isActive: true, groupId },
        })),
      };
      break;
    }
    default:
      return forbidden();
  }

  if (relativePath.startsWith("submissions/db-")) {
    const file = await prisma.submissionFile.findFirst({
      where: { path: relativePath, submission: scope },
      select: { content: true, name: true, mimeType: true },
    });
    if (!file) return forbidden();
    return fileResponse(
      new Uint8Array(file.content), file.name, file.mimeType,
      preview && isPreviewableSubmissionMimeType(file.mimeType)
    );
  }

  const submission = await prisma.submission.findFirst({
    where: {
      AND: [scope],
      OR: [{ filePath: relativePath }, { versions: { some: { filePath: relativePath } } }],
    },
    select: {
      filePath: true,
      fileName: true,
      versions: {
        where: { filePath: relativePath },
        select: { fileName: true },
        take: 1,
      },
    },
  });
  if (!submission) return forbidden();
  const filename = submission.versions[0]?.fileName ||
    (submission.filePath === relativePath ? submission.fileName : null) || path.basename(resolved);
  try {
    return fileResponse(await readLegacyFile(relativePath, resolved), filename);
  } catch {
    return missingFile();
  }
}

export async function GET(request: NextRequest) {
  const { user, errorResponse } = await requireApiAuth();
  if (errorResponse) return errorResponse;

  const relPath = request.nextUrl.searchParams.get("path");
  const downloadName = request.nextUrl.searchParams.get("name");
  if (!relPath) {
    return NextResponse.json({ error: "Fayl yo'li ko'rsatilmagan" }, { status: 400 });
  }

  const resolved = resolveSafeUploadPath(relPath.replace(/\\/g, "/"));
  if (!resolved) {
    return NextResponse.json({ error: "Noto'g'ri fayl yo'li" }, { status: 400 });
  }

  const normalized = path.relative(UPLOAD_ROOT, resolved).split(path.sep).join("/");
  const folder = normalized.split("/", 1)[0].toLowerCase();
  if (folder === "submissions") {
    return serveSubmissionFile(user, normalized, resolved, request.nextUrl.searchParams.get("preview") === "1");
  }
  if (folder !== "assignments" && folder !== "kpi") return missingFile();
  let assignmentId: string | undefined;
  let assignmentFilename: string | null = null;

  if (folder === "assignments") {
    const assignment = await prisma.assignment.findFirst({
      where: { attachmentPath: normalized },
      select: { id: true, attachmentName: true, teacherId: true, groupId: true },
    });
    if (!assignment) {
      return missingFile();
    }
    if (
      (user.role === "STUDENT" && user.groupId !== assignment.groupId) ||
      (user.role === "TEACHER" && user.id !== assignment.teacherId)
    ) {
      return forbidden();
    }
    assignmentId = assignment.id;
    assignmentFilename = assignment.attachmentName;
  } else if (folder === "kpi" && user.role === "STUDENT") {
    return NextResponse.json({ error: "Ruxsat yo'q" }, { status: 403 });
  }

  try {
    const attachment = assignmentId
      ? await prisma.assignmentAttachment.findUnique({
          where: { assignmentId },
          select: { content: true },
        })
      : null;
    const buffer = attachment ? new Uint8Array(attachment.content) : await readLegacyFile(normalized, resolved);
    const filename = assignmentFilename || downloadName || path.basename(resolved);
    return fileResponse(buffer, filename);
  } catch {
    return missingFile();
  }
}
