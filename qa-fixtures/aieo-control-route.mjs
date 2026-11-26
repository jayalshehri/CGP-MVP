// Deliberately isolated QA pilot: never imported by the CGP application.
// The route boundary logic matches the synthetic OpenRouter proposal attested
// in GitHub Actions run 45881673723. No provider call or runtime deployment.
export function controlIdFromPath(pagePath) {
  return /^\/controls\/(\d+)(?:\/|$)/.exec(pagePath)?.[1] ?? null;
}
