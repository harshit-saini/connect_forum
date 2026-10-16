import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only (cookie present). Real authorization and the onboarding gate run in server
// code (src/server/viewer.ts), which reads the database.
const PUBLIC = [/^\/$/, /^\/sign-in/, /^\/terms/, /^\/privacy/, /^\/offline/, /^\/review\//];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC.some((re) => re.test(pathname))) return NextResponse.next();
  if (!getSessionCookie(request)) {
    const url = new URL("/sign-in", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Everything except API routes (they authorize themselves), Next internals and static files.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|.*\\.(?:png|svg|jpg|ico|webp|txt|xml)$).*)"],
};
