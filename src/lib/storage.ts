import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";

export const UPLOAD_ROOT = path.resolve(process.cwd(), "storage", "uploads");

export const ALLOWED_EXTENSIONS = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".zip",
  ".rar",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".txt",
  ".xlsx",
  ".pptx",
]);

export const MAX_UPLOAD_BYTES = Number(
  process.env.MAX_UPLOAD_BYTES ?? 20 * 1024 * 1024
);

export function sanitizeFilename(filename: string): string {
  const base = path.basename(filename);
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "file";
}

export function validateUploadFile(file: { name: string; size: number }): string | null {
  if (file.size <= 0) {
    return "Yuklangan fayl bo'sh bo'lishi mumkin emas";
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return `Fayl hajmi ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB dan oshmasligi kerak`;
  }
  const ext = path.extname(file.name).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return `Ruxsat etilmagan fayl turi (${ext}). Ruxsat etilgan: PDF, DOCX, ZIP, rasm, XLSX, PPTX`;
  }
  return null;
}

export async function saveUploadedFile(
  file: File,
  folder: "assignments" | "submissions" | "kpi"
): Promise<{ fileName: string; filePath: string; fileSize: number }> {
  const validationError = validateUploadFile({ name: file.name, size: file.size });
  if (validationError) {
    throw new Error(validationError);
  }

  const targetDir = path.join(UPLOAD_ROOT, folder);
  await fs.mkdir(targetDir, { recursive: true });

  const safeOriginal = sanitizeFilename(file.name);
  const storedName = `${Date.now()}-${randomUUID().slice(0, 8)}-${safeOriginal}`;
  const fullPath = path.join(targetDir, storedName);

  const arrayBuffer = await file.arrayBuffer();
  await fs.writeFile(fullPath, Buffer.from(arrayBuffer));

  return {
    fileName: file.name,
    filePath: path.posix.join(folder, storedName),
    fileSize: file.size,
  };
}

export function resolveSafeUploadPath(relativePath: string): string | null {
  if (
    !relativePath ||
    relativePath.includes("\0") ||
    relativePath.includes("..") ||
    path.isAbsolute(relativePath)
  ) {
    return null;
  }
  const resolved = path.resolve(UPLOAD_ROOT, relativePath);
  if (!resolved.startsWith(UPLOAD_ROOT + path.sep)) {
    return null;
  }
  return resolved;
}
