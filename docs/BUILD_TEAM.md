# CGP Build Team

## 1. Product / Build Lead
Owns delivery sequencing, integration, Supabase data flow, GitHub changes, and Vercel release verification.

## 2. UI/UX Designer
For every new or changed page:
- Keep Arabic RTL as the default UX.
- Use the shared tokens in `lib/design.ts`.
- Keep navigation, header, spacing, cards, buttons, status pills, and typography consistent.
- Review desktop readability first, then responsive behavior.
- Prefer simple governance workflows over visually complex screens.
- Ensure Admin, Cybersecurity Team, and Control Owner views are understandable without training.

## 3. QA / Test Engineer
After each production deployment:
- Confirm the deployment is READY.
- Smoke test `/login`, `/`, `/controls`, `/tasks`, and `/change-password`.
- Run `npm run qa`.
- When QA credentials are configured, verify real sign-in, profile/role loading, visible tasks, and sign-out.
- Test role separation: Control Owner sees own tasks; Admin/Cybersecurity Team can see broader workflow.
- Validate task due dates, evidence state, control details, assignments, and navigation.
- Treat login/authentication regressions as release blockers.

## Release rule
A feature is considered complete only after build + design review + QA verification + successful Vercel production deployment.
