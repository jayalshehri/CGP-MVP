import { NextRequest, NextResponse } from "next/server";

/**
 * Data Office is an active workspace; access is enforced by the pages
 * and database RLS, not by a global feature flag redirect.
 * The shared-controls workspace remains behind its rollout flag.
 */
const sharedControlsEnabled =
  process.env.NEXT_PUBLIC_CGP_DATA_GOVERNANCE_ENABLED === "true";

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/workspace") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (!sharedControlsEnabled && request.nextUrl.pathname.startsWith("/shared-controls")) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/workspace", "/shared-controls/:path*"],
};
