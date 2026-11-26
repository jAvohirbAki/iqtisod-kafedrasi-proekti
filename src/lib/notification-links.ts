import type { Role } from "@prisma/client";
import { getDashboardPath } from "./domain";

export function assignmentNotificationLink(role: "STUDENT" | "TEACHER", assignmentId: string, submissionId?: string) {
  const params = new URLSearchParams({ assignment: assignmentId });
  if (role === "TEACHER") {
    params.set("tab", "grading");
    if (submissionId) params.set("submission", submissionId);
  }
  return `${getDashboardPath(role)}?${params}`;
}

export function notificationLinkForRole(role: Role, link: string | null) {
  if (!link || !link.startsWith("/") || link.startsWith("//") || /[\\\x00-\x20]/.test(link)) return null;
  const url = new URL(link, "https://portal.invalid");
  return url.origin === "https://portal.invalid" && url.pathname === getDashboardPath(role)
    ? `${url.pathname}${url.search}${url.hash}`
    : null;
}
