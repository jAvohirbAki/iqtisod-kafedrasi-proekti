import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { IssueSeverity, IssueSource } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE_NAME, signSessionToken } from "@/lib/auth";
import { getDashboardPath } from "@/lib/domain";
import { reportSystemIssue } from "@/lib/monitoring";

const loginSchema = z.object({
  email: z.string().email("To'g'ri email manzil kiriting"),
  password: z.string().min(4, "Parol kamida 4 ta belgidan iborat bo'lishi kerak"),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Ma'lumotlar noto'g'ri" },
        { status: 400 }
      );
    }

    const email = parsed.data.email.trim().toLowerCase();
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        fullName: true,
        role: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      return NextResponse.json(
        { error: "Email yoki parol noto'g'ri, yoki hisob faol emas" },
        { status: 401 }
      );
    }

    const isValid = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json(
        { error: "Email yoki parol noto'g'ri" },
        { status: 401 }
      );
    }

    const token = await signSessionToken({
      userId: user.id,
      role: user.role,
      email: user.email,
    });

    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
      redirectTo: getDashboardPath(user.role),
    });

    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (err) {
    console.error("Login error:", err);
    await reportSystemIssue({
      title: "Autentifikatsiya server xatoligi",
      message: err instanceof Error ? err.message : "Noma'lum login xatoligi",
      severity: IssueSeverity.CRITICAL,
      source: IssueSource.AUTH,
      route: "/api/auth/login",
      method: "POST",
      statusCode: 500,
      stackTrace: err instanceof Error ? err.stack : null,
    });
    return NextResponse.json(
      { error: "Tizimga kirishda server xatoligi yuz berdi" },
      { status: 500 }
    );
  }
}
