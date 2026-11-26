import {
  ControlType,
  IssueSeverity,
  IssueSource,
  IssueStatus,
  KpiBlock,
  KpiStatus,
  Role,
  SubmissionStatus,
} from "@prisma/client";

/**
 * Calculate KPI score for a given criterion and quantity, respecting optional max cap.
 */
export function calculateKpiScore(
  pointsPerUnit: number,
  quantity: number,
  maxPoints: number | null
): number {
  const safeQty = Math.max(1, Math.floor(quantity));
  const raw = Number((pointsPerUnit * safeQty).toFixed(2));
  if (maxPoints !== null && maxPoints > 0) {
    return Math.min(raw, maxPoints);
  }
  return raw;
}

/**
 * Clamp and apply late submission penalty if applicable.
 */
export function calculateGradedScore(params: {
  rawScore: number;
  maxScore: number;
  isLate: boolean;
  latePenaltyPct: number;
  applyLatePenalty?: boolean;
}): number {
  const clamped = Math.max(0, Math.min(params.rawScore, params.maxScore));
  if (params.isLate && params.applyLatePenalty && params.latePenaltyPct > 0) {
    const multiplier = Math.max(0, 1 - params.latePenaltyPct / 100);
    return Number((clamped * multiplier).toFixed(2));
  }
  return Number(clamped.toFixed(2));
}

/**
 * Map a 0-100 percentage to Uzbekistan credit-module numeric & text grade.
 */
export function getUzbekGradeLabel(percentage: number): {
  grade: number;
  label: string;
  tone: "emerald" | "blue" | "amber" | "rose";
} {
  if (percentage >= 86) {
    return { grade: 5, label: "5 (A'lo)", tone: "emerald" };
  }
  if (percentage >= 71) {
    return { grade: 4, label: "4 (Yaxshi)", tone: "blue" };
  }
  if (percentage >= 56) {
    return { grade: 3, label: "3 (Qoniqarli)", tone: "amber" };
  }
  return { grade: 2, label: "2 (Qoniqarsiz)", tone: "rose" };
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Tizim administratori",
  DEAN: "Dekanat / Kafedra mudiri",
  TEACHER: "O'qituvchi",
  STUDENT: "Talaba",
};

export const ISSUE_SEVERITY_LABELS: Record<IssueSeverity, string> = {
  INFO: "Ma'lumot",
  WARNING: "Ogohlantirish",
  ERROR: "Xatolik",
  CRITICAL: "Kritik muammo",
};

export const ISSUE_SOURCE_LABELS: Record<IssueSource, string> = {
  API_SERVER: "Backend API",
  DATABASE: "Ma'lumotlar bazasi",
  CLIENT_UI: "Foydalanuvchi interfeysi",
  HEALTH_CHECK: "Tizim diagnostikasi",
  AUTH: "Autentifikatsiya",
};

export const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = {
  OPEN: "Ochiq",
  ACKNOWLEDGED: "Ko'rib chiqilmoqda",
  RESOLVED: "Hal qilindi",
  IGNORED: "E'tiborsiz qoldirilgan",
};

export const CONTROL_TYPE_LABELS: Record<ControlType, string> = {
  JORIY: "Joriy nazorat (JN)",
  ORALIQ: "Oraliq nazorat (ON)",
  MUSTAQIL: "Mustaqil ta'lim",
  LAB: "Laboratoriya / Amaliy",
  YAKUNIY: "Yakuniy nazorat (YN)",
};

export const SUBMISSION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  SUBMITTED: "Topshirilgan",
  RESUBMITTED: "Qayta topshirilgan",
  IN_REVIEW: "Tekshirilmoqda",
  GRADED: "Baholangan",
  RETURNED: "Qayta ishlashga qaytarilgan",
};

export function getSubmissionStatusLabel(submission: { status: SubmissionStatus; isLate: boolean } | null) {
  if (!submission) return "Topshirilmagan";
  if (submission.isLate && (submission.status === "SUBMITTED" || submission.status === "RESUBMITTED")) {
    return "Kechiktirib topshirilgan";
  }
  return SUBMISSION_STATUS_LABELS[submission.status];
}

export function canSubmitAssignment(
  status: SubmissionStatus | null,
  assignment: { dueDate: string | Date; allowLate: boolean },
  now: Date
) {
  return status === "RETURNED" || (status === null && (assignment.allowLate || now <= new Date(assignment.dueDate)));
}

export const KPI_BLOCK_META: Record<
  KpiBlock,
  { label: string; weightPct: number; color: string }
> = {
  SCIENTIFIC: { label: "Ilmiy-tadqiqot", weightPct: 40, color: "indigo" },
  METHODICAL: { label: "O'quv-uslubiy", weightPct: 30, color: "sky" },
  INNOVATION: { label: "Innovatsiya va grantlar", weightPct: 15, color: "violet" },
  QUALITY: { label: "O'quv sifati va tashkiliy", weightPct: 15, color: "emerald" },
};

export const KPI_STATUS_LABELS: Record<KpiStatus, string> = {
  DRAFT: "Qoralama",
  PENDING: "Tekshiruvda",
  APPROVED: "Tasdiqlangan",
  REJECTED: "Rad etilgan",
};

export function getDashboardPath(role: Role): string {
  switch (role) {
    case "ADMIN":
      return "/admin";
    case "DEAN":
      return "/dean";
    case "TEACHER":
      return "/teacher";
    case "STUDENT":
      return "/student";
  }
}
