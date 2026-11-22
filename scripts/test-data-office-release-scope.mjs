import assert from "node:assert/strict";
import nextConfig from "../next.config.ts";

const redirects = await nextConfig.redirects();
const hiddenRoutes = [
  "/data-governance",
  "/data-governance/requests/:path*",
  "/data-governance/assets/:path*",
  "/data-governance/controls/:path*",
  "/data-governance/quality/:path*",
  "/data-governance/privacy/:path*",
  "/data-governance/sharing/:path*",
  "/data-governance/reports/:path*",
];

assert.deepEqual(
  redirects.map(({ source }) => source),
  hiddenRoutes,
  "The first Data Office release must redirect every unfinished route.",
);
for (const redirect of redirects) {
  assert.equal(redirect.destination, "/data-governance/nudee");
  assert.equal(redirect.permanent, false);
}

console.log("PASS: Data Office release exposes Nudee routes and redirects 8 unfinished route families.");
