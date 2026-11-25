import { createHash } from "crypto";
import fs from "fs/promises";
import { IssueSeverity, IssueSource, IssueStatus, NotificationType } from "@prisma/client";
import { prisma } from "./prisma";
import { UPLOAD_ROOT } from "./storage";

const SEVERITY_RANK: Record<IssueSeverity, number> = {
  INFO: 1,
  WARNING: 2,
  ERROR: 3,
  CRITICAL: 4,
};

/**
 * Compute a deterministic fingerprint for grouping recurring system issues.
 */
export function buildIssueFingerprint(params: {
  source: IssueSource;
  route?: string | null;
  method?: string | null;
  title: string;
}): string {
  const normalized = [
    params.source,
    (params.method ?? "").trim().toUpperCase(),
    (params.route ?? "").trim().toLowerCase(),
    params.title.trim().toLowerCase(),
  ].join("|");

  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

/**
 * Pick the higher severity between two levels so existing issues never silently downgrade.
 */
export function pickHigherSeverity(a: IssueSeverity, b: IssueSeverity): IssueSeverity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

export interface ReportIssueInput {
  title: string;
  message: string;
  severity?: IssueSeverity;
  source?: IssueSource;
  route?: string | null;
  method?: string | null;
  statusCode?: number | null;
  stackTrace?: string | null;
  metadata?: Record<string, unknown> | string | null;
  reportedByUserId?: string | null;
}

/**
 * Record or deduplicate a system issue and alert active ADMIN users on high-severity events.
 */
export async function reportSystemIssue(input: ReportIssueInput) {
  const severity = input.severity ?? IssueSeverity.ERROR;
  const source = input.source ?? IssueSource.API_SERVER;
  const title = input.title.trim().slice(0, 200);
  const message = input.message.trim().slice(0, 2000);
  const route = input.route?.trim().slice(0, 300) || null;
  const method = input.method?.trim().toUpperCase().slice(0, 16) || null;
  const stackTrace = input.stackTrace?.slice(0, 6000) || null;
  const metadataStr =
    typeof input.metadata === "string"
      ? input.metadata.slice(0, 4000)
      : input.metadata
        ? JSON.stringify(input.metadata).slice(0, 4000)
        : null;

  const fingerprint = buildIssueFingerprint({ source, route, method, title });

  try {
    const existing = await prisma.systemIssue.findFirst({
      where: {
        fingerprint,
        status: { in: [IssueStatus.OPEN, IssueStatus.ACKNOWLEDGED] },
      },
      orderBy: { createdAt: "desc" },
    });

    if (existing) {
      return await prisma.systemIssue.update({
        where: { id: existing.id },
        data: {
          message,
          severity: pickHigherSeverity(existing.severity, severity),
          statusCode: input.statusCode ?? existing.statusCode,
          stackTrace: stackTrace ?? existing.stackTrace,
          metadata: metadataStr ?? existing.metadata,
          occurrenceCount: { increment: 1 },
          lastOccurredAt: new Date(),
        },
      });
    }

    const created = await prisma.systemIssue.create({
      data: {
        title,
        message,
        severity,
        source,
        status: IssueStatus.OPEN,
        route,
        method,
        statusCode: input.statusCode ?? null,
        stackTrace,
        metadata: metadataStr,
        fingerprint,
        reportedByUserId: input.reportedByUserId ?? null,
      },
    });

    if (severity === IssueSeverity.ERROR || severity === IssueSeverity.CRITICAL) {
      const admins = await prisma.user.findMany({
        where: { role: "ADMIN", isActive: true },
        select: { id: true },
      });
      if (admins.length > 0) {
        await prisma.notification.createMany({
          data: admins.map((admin) => ({
            userId: admin.id,
            type: NotificationType.SYSTEM_ALERT,
            title:
              severity === IssueSeverity.CRITICAL
                ? `Kritik tizim muammosi: ${title}`
                : `Yangi tizim xatoligi: ${title}`,
            message: message.slice(0, 240),
            link: "/admin?tab=issues",
          })),
        });
      }
    }

    return created;
  } catch (err) {
    console.error("Failed to persist SystemIssue:", err);
    return null;
  }
}

export interface DiagnosticCheckResult {
  key: string;
  label: string;
  status: "ok" | "warning" | "error";
  latencyMs: number;
  detail: string;
}

export interface SystemDiagnosticsReport {
  overallStatus: "healthy" | "degraded" | "critical";
  checkedAt: string;
  uptimeSeconds: number;
  nodeVersion: string;
  checks: DiagnosticCheckResult[];
}

/**
 * Run live diagnostics across database, local file storage, auth secret, and open issues.
 */
export async function runSystemDiagnostics(): Promise<SystemDiagnosticsReport> {
  const checks: DiagnosticCheckResult[] = [];

  // 1. Database connectivity check
  const dbStart = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const latency = Date.now() - dbStart;
    checks.push({
      key: "database",
      label: "PostgreSQL ma'lumotlar bazasi",
      status: latency > 1000 ? "warning" : "ok",
      latencyMs: latency,
      detail:
        latency > 1000
          ? `Ulanish sekin (${latency} ms)`
          : `Barqaror ishlamoqda (${latency} ms)`,
    });
  } catch (err) {
    checks.push({
      key: "database",
      label: "PostgreSQL ma'lumotlar bazasi",
      status: "error",
      latencyMs: Date.now() - dbStart,
      detail: err instanceof Error ? err.message : "Ma'lumotlar bazasiga ulanib bo'lmadi",
    });
  }

  // 2. Storage directory check
  const storageStart = Date.now();
  try {
    await fs.mkdir(UPLOAD_ROOT, { recursive: true });
    await fs.access(UPLOAD_ROOT);
    checks.push({
      key: "storage",
      label: "Fayl ombori (storage/uploads)",
      status: "ok",
      latencyMs: Date.now() - storageStart,
      detail: `Katalog mavjud va yozish uchun tayyor`,
    });
  } catch (err) {
    checks.push({
      key: "storage",
      label: "Fayl ombori (storage/uploads)",
      status: "error",
      latencyMs: Date.now() - storageStart,
      detail: err instanceof Error ? err.message : "Fayl omboriga kirishda xatolik",
    });
  }

  // 3. Auth secret check
  const authStart = Date.now();
  const hasCustomSecret = Boolean(
    process.env.AUTH_SECRET &&
      process.env.AUTH_SECRET !== "kafedra-portal-fallback-dev-secret-key-2026"
  );
  checks.push({
    key: "auth_secret",
    label: "JWT sessiya kaliti (AUTH_SECRET)",
    status: hasCustomSecret ? "ok" : "warning",
    latencyMs: Date.now() - authStart,
    detail: hasCustomSecret
      ? "Maxsus muhit kaliti faol"
      : "Standart ishlab chiqish (dev) kaliti ishlatilmoqda",
  });

  // 4. Open critical issues check
  const issuesStart = Date.now();
  try {
    const [criticalOpen, errorOpen] = await Promise.all([
      prisma.systemIssue.count({
        where: { status: { in: [IssueStatus.OPEN, IssueStatus.ACKNOWLEDGED] }, severity: IssueSeverity.CRITICAL },
      }),
      prisma.systemIssue.count({
        where: { status: { in: [IssueStatus.OPEN, IssueStatus.ACKNOWLEDGED] }, severity: IssueSeverity.ERROR },
      }),
    ]);

    checks.push({
      key: "open_issues",
      label: "Hal qilinmagan xatoliklar holati",
      status: criticalOpen > 0 ? "error" : errorOpen > 0 ? "warning" : "ok",
      latencyMs: Date.now() - issuesStart,
      detail:
        criticalOpen > 0
          ? `${criticalOpen} ta kritik va ${errorOpen} ta oddiy ochiq xatolik mavjud`
          : errorOpen > 0
            ? `${errorOpen} ta ochiq xatolik tekshirishni kutmoqda`
            : "Ochiq xatoliklar aniqlanmadi",
    });
  } catch {
    checks.push({
      key: "open_issues",
      label: "Hal qilinmagan xatoliklar holati",
      status: "warning",
      latencyMs: Date.now() - issuesStart,
      detail: "Xatoliklar jadvalini o'qib bo'lmadi",
    });
  }

  const hasError = checks.some((c) => c.status === "error");
  const hasWarning = checks.some((c) => c.status === "warning");

  return {
    overallStatus: hasError ? "critical" : hasWarning ? "degraded" : "healthy",
    checkedAt: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    nodeVersion: process.version,
    checks,
  };
}
