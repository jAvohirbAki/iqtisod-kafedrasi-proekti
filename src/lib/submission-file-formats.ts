export const SUBMISSION_FILE_TYPES: Readonly<Record<string, string | undefined>> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".zip": "application/zip",
  ".rar": "application/vnd.rar",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".txt": "text/plain",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export const SUBMISSION_FILE_ACCEPT = Object.keys(SUBMISSION_FILE_TYPES).join(",");
export const SUBMISSION_FILE_LIMIT_MB = 20;

export function isPreviewableSubmissionMimeType(mimeType: string) {
  return ["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(mimeType);
}

export function canPreviewSubmissionFile(filePath: string, fileName: string | null) {
  const extension = fileName?.match(/\.[^.]+$/)?.[0].toLowerCase() ?? "";
  return filePath.startsWith("submissions/db-") &&
    isPreviewableSubmissionMimeType(SUBMISSION_FILE_TYPES[extension] ?? "");
}
