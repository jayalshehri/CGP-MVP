import { NextRequest, NextResponse } from "next/server";

const dataGovernanceEnabled =
  process.env.NEXT_PUBLIC_CGP_DATA_GOVERNANCE_ENABLED === "true";

/**
 * Keep the unfinished data-governance workspace out of the active production
 * experience. The pages and their data remain intact for the later rollout.
 */
export function proxy(request: NextRequest) {
  if (
    !dataGovernanceEnabled &&
    request.nextUrl.pathname.startsWith("/data-governance")
  ) {
    return NextResponse.redirect(new URL("/workspace", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/data-governance/:path*"],
};
