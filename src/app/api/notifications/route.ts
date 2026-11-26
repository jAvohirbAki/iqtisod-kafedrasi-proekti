import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/auth";
import { notificationLinkForRole } from "@/lib/notification-links";
import { prisma } from "@/lib/prisma";

const headers = { "Cache-Control": "private, no-store" };
const notificationId = z.string().min(1).max(100);
const listOptions = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(30),
  cursor: notificationId.optional(),
});
const markOptions = z.union([
  z.strictObject({ id: notificationId }),
  z.strictObject({ all: z.literal(true) }),
  z.strictObject({}),
]);

export async function GET(request: NextRequest) {
  const { user, errorResponse } = await requireApiAuth();
  if (errorResponse) return errorResponse;

  const query = request.nextUrl.searchParams;
  const parsed = listOptions.safeParse({ limit: query.get("limit") ?? undefined, cursor: query.get("cursor") ?? undefined });
  if (!parsed.success) {
    return NextResponse.json({ error: "Bildirishnoma sahifasi parametrlari noto'g'ri" }, { status: 400, headers });
  }
  const { limit, cursor } = parsed.data;
  const anchor = cursor ? await prisma.notification.findFirst({
    where: { id: cursor, userId: user.id },
    select: { id: true, createdAt: true },
  }) : null;
  if (cursor && !anchor) {
    return NextResponse.json({ error: "Bildirishnoma sahifasi topilmadi" }, { status: 404, headers });
  }

  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: {
        userId: user.id,
        ...(anchor && { OR: [
          { createdAt: { lt: anchor.createdAt } },
          { createdAt: anchor.createdAt, id: { lt: anchor.id } },
        ] }),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    }),
    prisma.notification.count({ where: { userId: user.id, isRead: false } }),
  ]);
  return NextResponse.json({
    notifications: items.slice(0, limit).map((item) => ({
      ...item,
      link: notificationLinkForRole(user.role, item.link),
    })),
    unreadCount,
    nextCursor: items.length > limit ? items[limit - 1].id : null,
  }, { headers });
}

export async function PATCH(request: NextRequest) {
  const { user, errorResponse } = await requireApiAuth();
  if (errorResponse) return errorResponse;

  const parsed = markOptions.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "O'qilgan deb belgilash so'rovi noto'g'ri" }, { status: 400, headers });
  }
  const id = "id" in parsed.data ? parsed.data.id : undefined;
  const [updated, unreadCount] = await prisma.$transaction([
    prisma.notification.updateMany({
      where: { userId: user.id, ...(id ? { id } : { isRead: false }) },
      data: { isRead: true },
    }),
    prisma.notification.count({ where: { userId: user.id, isRead: false } }),
  ]);
  if (id && updated.count === 0) {
    return NextResponse.json({ error: "Bildirishnoma topilmadi" }, { status: 404, headers });
  }
  return NextResponse.json({ ok: true, unreadCount }, { headers });
}
