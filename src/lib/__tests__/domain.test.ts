import { describe, expect, it } from "vitest";
import {
  calculateGradedScore,
  calculateKpiScore,
  canSubmitAssignment,
  getDashboardPath,
  getSubmissionStatusLabel,
  getUzbekGradeLabel,
} from "../domain";
import { signSessionToken, verifySessionToken } from "../auth";
import { resolveSafeUploadPath, validateUploadFile } from "../storage";
import { buildIssueFingerprint, pickHigherSeverity } from "../monitoring";
import { assignmentNotificationLink, notificationLinkForRole } from "../notification-links";
import { readRequestId } from "../request-id";

describe("Domain calculations", () => {
  it("calculates KPI score and respects maxPoints cap", () => {
    expect(calculateKpiScore(20, 2, 60)).toBe(40);
    expect(calculateKpiScore(20, 5, 60)).toBe(60);
    expect(calculateKpiScore(10, 3, null)).toBe(30);
    expect(calculateKpiScore(15, 0, 30)).toBe(15);
  });

  it("clamps graded score and applies late penalty when requested", () => {
    expect(
      calculateGradedScore({
        rawScore: 25,
        maxScore: 20,
        isLate: false,
        latePenaltyPct: 10,
      })
    ).toBe(20);

    expect(
      calculateGradedScore({
        rawScore: 20,
        maxScore: 20,
        isLate: true,
        latePenaltyPct: 15,
        applyLatePenalty: true,
      })
    ).toBe(17);

    expect(
      calculateGradedScore({
        rawScore: -5,
        maxScore: 20,
        isLate: false,
        latePenaltyPct: 10,
      })
    ).toBe(0);
  });

  it("maps percentages to Uzbekistan credit-module grades", () => {
    expect(getUzbekGradeLabel(92).grade).toBe(5);
    expect(getUzbekGradeLabel(86).grade).toBe(5);
    expect(getUzbekGradeLabel(75).grade).toBe(4);
    expect(getUzbekGradeLabel(60).grade).toBe(3);
    expect(getUzbekGradeLabel(40).grade).toBe(2);
  });

  it("allows a first submission by the deadline and a new version only after return", () => {
    const dueDate = new Date("2026-11-01T12:00:00Z");
    const late = new Date("2026-11-01T12:01:00Z");
    const assignment = { dueDate, allowLate: false };
    expect(canSubmitAssignment(null, assignment, dueDate)).toBe(true);
    expect(canSubmitAssignment(null, assignment, late)).toBe(false);
    expect(canSubmitAssignment(null, { ...assignment, allowLate: true }, late)).toBe(true);
    expect(canSubmitAssignment("RETURNED", assignment, late)).toBe(true);
    for (const status of ["SUBMITTED", "RESUBMITTED", "IN_REVIEW", "GRADED"] as const) {
      expect(canSubmitAssignment(status, assignment, dueDate)).toBe(false);
    }
  });

  it("keeps the review and graded statuses visible for late work", () => {
    expect(getSubmissionStatusLabel(null)).toBe("Topshirilmagan");
    expect(getSubmissionStatusLabel({ status: "SUBMITTED", isLate: true })).toBe("Kechiktirib topshirilgan");
    expect(getSubmissionStatusLabel({ status: "IN_REVIEW", isLate: true })).toBe("Tekshirilmoqda");
    expect(getSubmissionStatusLabel({ status: "GRADED", isLate: true })).toBe("Baholangan");
  });

  it("returns correct dashboard routes for each role", () => {
    expect(getDashboardPath("ADMIN")).toBe("/admin");
    expect(getDashboardPath("DEAN")).toBe("/dean");
    expect(getDashboardPath("TEACHER")).toBe("/teacher");
    expect(getDashboardPath("STUDENT")).toBe("/student");
  });
});

describe("Portal notification links and request identifiers", () => {
  it("builds assignment links for the destination role", () => {
    expect(assignmentNotificationLink("STUDENT", "a1")).toBe("/student?assignment=a1");
    expect(assignmentNotificationLink("TEACHER", "a1", "s2")).toBe("/teacher?assignment=a1&tab=grading&submission=s2");
  });

  it("allows only the recipient's dashboard and rejects external targets", () => {
    expect(notificationLinkForRole("ADMIN", "/admin?tab=issues")).toBe("/admin?tab=issues");
    expect(notificationLinkForRole("STUDENT", "/teacher?tab=grading")).toBeNull();
    expect(notificationLinkForRole("STUDENT", "//example.test/student")).toBeNull();
    expect(notificationLinkForRole("STUDENT", "/\\example.test/student")).toBeNull();
  });

  it("accepts an optional UUID idempotency key and normalizes its case", () => {
    const url = "http://localhost";
    const valid = new Request(url, { headers: { "Idempotency-Key": "550E8400-E29B-41D4-A716-446655440000" } });
    expect(readRequestId(valid)).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(readRequestId(new Request(url))).toBeNull();
    expect(readRequestId(new Request(url, { headers: { "Idempotency-Key": "invalid" } }))).toBe(false);
  });
});

describe("System monitoring helpers", () => {
  it("generates deterministic fingerprints for identical issues", () => {
    const a = buildIssueFingerprint({
      source: "API_SERVER",
      route: "/api/teacher/kpi",
      method: "post",
      title: "  Upload failed ",
    });
    const b = buildIssueFingerprint({
      source: "API_SERVER",
      route: "/api/teacher/kpi",
      method: "POST",
      title: "upload failed",
    });
    const c = buildIssueFingerprint({
      source: "DATABASE",
      route: "/api/teacher/kpi",
      method: "POST",
      title: "upload failed",
    });

    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toHaveLength(16);
  });

  it("picks the higher issue severity when escalating", () => {
    expect(pickHigherSeverity("INFO", "CRITICAL")).toBe("CRITICAL");
    expect(pickHigherSeverity("ERROR", "WARNING")).toBe("ERROR");
    expect(pickHigherSeverity("WARNING", "WARNING")).toBe("WARNING");
  });
});

describe("Security & File Storage helpers", () => {
  it("signs and verifies JWT session tokens", async () => {
    const token = await signSessionToken({
      userId: "user_1",
      role: "TEACHER",
      email: "teacher@kafedra.uz",
    });
    const decoded = await verifySessionToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded?.userId).toBe("user_1");
    expect(decoded?.role).toBe("TEACHER");
  });

  it("validates upload extensions and rejects dangerous executables", () => {
    expect(validateUploadFile({ name: "hisobot.pdf", size: 1024 })).toBeNull();
    expect(validateUploadFile({ name: "virus.exe", size: 1024 })).not.toBeNull();
    expect(validateUploadFile({ name: "empty.pdf", size: 0 })).not.toBeNull();
  });

  it("blocks path traversal in upload resolution", () => {
    expect(resolveSafeUploadPath("submissions/test.pdf")).not.toBeNull();
    expect(resolveSafeUploadPath("../../.env")).toBeNull();
  });
});
