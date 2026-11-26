import type { UserRole } from "@/lib/auth";

/**
 * Data governance remains in the codebase but is not part of the active
 * production workspace until its operating model and workflows are ready.
 *
 * Set NEXT_PUBLIC_CGP_DATA_GOVERNANCE_ENABLED=true in Vercel and redeploy to
 * make the workspace available again.
 */
export const dataGovernanceEnabled =
  process.env.NEXT_PUBLIC_CGP_DATA_GOVERNANCE_ENABLED === "true";

/** Choose an existing workspace after authentication; this grants no access. */
export function roleHomePath(role: UserRole): string {
  if (role === "nudee_owner") return "/data-governance/nudee";
  if (role === "data_governance_team") return "/data-governance/nudee-dashboard";
  return "/";
}
