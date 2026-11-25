import { describe, expect, it } from "vitest";
import {
  calculateGradedScore,
  calculateKpiScore,
  getDashboardPath,
  getUzbekGradeLabel,
} from "../domain";
import { signSessionToken, verifySessionToken } from "../auth";
import { resolveSafeUploadPath, validateUploadFile } from "../storage";

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

  it("returns correct dashboard routes for each role", () => {
    expect(getDashboardPath("DEAN")).toBe("/dean");
    expect(getDashboardPath("TEACHER")).toBe("/teacher");
    expect(getDashboardPath("STUDENT")).toBe("/student");
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
