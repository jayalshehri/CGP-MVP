/**
 * Data governance remains in the codebase but is not part of the active
 * production workspace until its operating model and workflows are ready.
 *
 * Set NEXT_PUBLIC_CGP_DATA_GOVERNANCE_ENABLED=true in Vercel and redeploy to
 * make the workspace available again.
 */
export const dataGovernanceEnabled =
  process.env.NEXT_PUBLIC_CGP_DATA_GOVERNANCE_ENABLED === "true";
