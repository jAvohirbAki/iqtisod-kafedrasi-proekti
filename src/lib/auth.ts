import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "./prisma";

export const SESSION_COOKIE_NAME = "kafedra_session";

function getSecretKey(): Uint8Array {
  const secret =
    process.env.AUTH_SECRET || "kafedra-portal-fallback-dev-secret-key-2026";
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  userId: string;
  role: Role;
  email: string;
}

export async function signSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecretKey());
}

export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (
      typeof payload.userId === "string" &&
      typeof payload.role === "string" &&
      typeof payload.email === "string"
    ) {
      return {
        userId: payload.userId,
        role: payload.role as Role,
        email: payload.email,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function getSessionUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = await verifySessionToken(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      phone: true,
      academicTitle: true,
      isActive: true,
      departmentId: true,
      groupId: true,
      department: { select: { id: true, name: true, code: true, faculty: true } },
      group: { select: { id: true, name: true, courseYear: true, semester: true, specialty: true } },
    },
  });

  if (!user || !user.isActive) return null;
  return user;
}

export type AuthUser = NonNullable<Awaited<ReturnType<typeof getSessionUser>>>;

/**
 * Enforce authentication and optional role allowlist inside API Route Handlers.
 */
export async function requireApiAuth(allowedRoles?: Role[]): Promise<
  | { user: AuthUser; errorResponse: null }
  | { user: null; errorResponse: NextResponse }
> {
  const user = await getSessionUser();
  if (!user) {
    return {
      user: null,
      errorResponse: NextResponse.json(
        { error: "Tizimga kirish talab etiladi" },
        { status: 401 }
      ),
    };
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return {
      user: null,
      errorResponse: NextResponse.json(
        { error: "Ushbu amal uchun sizda ruxsat mavjud emas" },
        { status: 403 }
      ),
    };
  }

  return { user, errorResponse: null };
}
