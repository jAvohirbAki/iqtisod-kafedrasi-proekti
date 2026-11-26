import { NotificationType, type Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export async function recordAuditLog(params: {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string;
}, db: Pick<Prisma.TransactionClient, "auditLog"> = prisma) {
  return db.auditLog.create({
    data: {
      actorId: params.actorId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      oldValue: params.oldValue !== undefined ? JSON.stringify(params.oldValue) : null,
      newValue: params.newValue !== undefined ? JSON.stringify(params.newValue) : null,
      reason: params.reason ?? null,
    },
  });
}

export async function createNotification(params: {
  userId: string;
  assignmentId?: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
}, db: Pick<Prisma.TransactionClient, "notification"> = prisma) {
  return db.notification.create({
    data: {
      userId: params.userId,
      assignmentId: params.assignmentId,
      type: params.type,
      title: params.title,
      message: params.message,
      link: params.link ?? null,
    },
  });
}
