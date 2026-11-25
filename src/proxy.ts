import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { getDashboardPath } from "@/lib/domain";

const PROTECTED_PREFIXES = ["/dean", "/teacher", "/student"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (isProtected) {
    if (!session) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }

    const expectedPrefix = getDashboardPath(session.role);
    if (!pathname.startsWith(expectedPrefix)) {
      return NextResponse.redirect(new URL(expectedPrefix, request.url));
    }
  }

  if (pathname === "/login" && session) {
    return NextResponse.redirect(
      new URL(getDashboardPath(session.role), request.url)
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dean/:path*", "/teacher/:path*", "/student/:path*", "/login"],
};
