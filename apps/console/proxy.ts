import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PREFIXES = ["/auth", "/_next", "/favicon.ico", "/logo", "/icon.png", "/services/"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Cookie presence check only — Edge runtime cannot run SQLite.
  // Full expiry + DB validation is the second layer inside the shell layout.
  const session = request.cookies.get("nuble_console");
  if (!session?.value) {
    return NextResponse.redirect(new URL("/auth", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
