import { ControlType, KpiBlock, KpiStatus, Role, SubmissionStatus } from "@prisma/client";

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
  DEAN: "Dekanat / Kafedra mudiri",
  TEACHER: "O'qituvchi",
  STUDENT: "Talaba",
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
  GRADED: "Baholangan",
  RETURNED: "Qayta ishlashga qaytarilgan",
};

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
    case "DEAN":
      return "/dean";
    case "TEACHER":
      return "/teacher";
    case "STUDENT":
      return "/student";
  }
}
