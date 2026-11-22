# CGP design system

Status: adopted foundation and incremental migration standard, 17 November 2026.

This document describes the shared design foundation present in the repository and the standard for subsequent changes. It does **not** assert that all pages have migrated, that WCAG 2.2 AA conformance has been established, or that the audit branch has been released. Production readiness belongs to the release and QA evidence for the exact commit.

## 1. Product principles

- Use a calm navy and teal institutional identity, clear Arabic, and a predictable page hierarchy. Preserve the existing CGP identity; do not reproduce another design system's branding.
- Start with the user's next task. Keep the page title, current state, owner, due date, and next permitted action easy to find.
- Show truthful operational data. Zero means a successful query returned zero; loading, unavailable, unauthorized, and empty are separate states.
- Make statuses understandable in words. Color, an icon, or a position alone must not carry the meaning.
- Preserve established workflows, evidence history, audit trails, access rules, and all Nudee calculations. Presentation changes do not authorize new data access.
- Deliver improvements on an independent development branch. Do not add a visual redesign to PR #237 or treat a design change as approval to merge or deploy.

## 2. What exists and what remains to migrate

| Foundation | Repository implementation | Adoption status |
|---|---|---|
| Color, surface, radius, shadow, focus | [`app/globals.css`](../app/globals.css) | Existing shared foundation; many local values remain |
| Arabic font and document direction | [`app/layout.tsx`](../app/layout.tsx) | `Noto_Sans_Arabic`, `lang="ar"`, `dir="rtl"`; audit legacy overrides |
| Application shell and navigation | [`components/AppShell.tsx`](../components/AppShell.tsx) | Shared shell; verify all role and responsive variants |
| Heading, metric, result count | [`components/WorkflowUI.tsx`](../components/WorkflowUI.tsx) | `WorkflowHeading`, `WorkflowMetric`, `ResultSummary`; not used by every route |
| Textual status badge | [`components/StatusBadge.tsx`](../components/StatusBadge.tsx) | `StatusBadge` and `statusText`; use only for supported semantic states |
| Modal foundation | [`components/AccessibleDialog.tsx`](../components/AccessibleDialog.tsx) | Added on the audit branch; native dialog foundation, not a production verification claim |
| Data Office layouts | [`app/data-governance/data-governance.css`](../app/data-governance/data-governance.css) | Existing local classes; migrate gradually to shared standards |
| Nudee dashboard | [`nudee-dashboard.module.css`](../app/data-governance/nudee-dashboard/nudee-dashboard.module.css) | Existing module styles; retain all values and calculation semantics |
| Shared Button, Field, Notice, DataTable and EmptyState React APIs | Not yet a single common component library | Migration backlog; do not import invented components or tokens |

When changing a page, reuse current exports and classes first. Extract a component when it consolidates a repeated behavior, particularly validation, loading, focus, or state handling. Avoid adding another cosmetic wrapper without reducing variation.

## 3. Colors and semantic meaning

These are the actual root tokens in `app/globals.css`:

| Token | Current value | Intended use |
|---|---|---|
| `--cgp-ink` | `#0f172a` | Main text, navy foundation |
| `--cgp-muted` | `#64748b` | Secondary text on an appropriate light surface |
| `--cgp-teal` | `#0f766e` | Primary action, active navigation, links |
| `--cgp-teal-dark` | `#115e59` | Primary hover/strong emphasis |
| `--cgp-accent` | `#14b8a6` | Accent detail; not a default small-text color |
| `--cgp-success` | `#22c55e` | Existing bright semantic primitive; not an approved text/background pairing |
| `--cgp-warning` | `#f59e0b` | Existing bright semantic primitive; not an approved text/background pairing |
| `--cgp-danger` | `#ef4444` | Existing bright semantic primitive; not an approved text/background pairing |
| `--cgp-line` | `#dbe3ea` | Subtle separators and decorative borders |
| `--cgp-bg` | `#f8fafc` | Page background |
| `--cgp-surface` | `#fff` | Card and form surface |

The existing status classes use stronger foregrounds than the bright primitive tokens:

| Existing class | Foreground / background | Meaning |
|---|---|---|
| `.cgp-status-success` | `#0b635a` / `#e8f5f2` | Approved, accepted, verified, or implemented, as appropriate to the underlying workflow |
| `.cgp-status-warning` | `#87520b` / `#fff4df` | Partial progress, changes requested, mapping work needed |
| `.cgp-status-danger` | `#a3261a` / `#ffefec` | Rejected, failed, expired |
| `.cgp-status-info` | `#244fa6` / `#edf3ff` | Uploaded or awaiting review |
| `.cgp-status-neutral` | `#52616d` / `#edf1f4` | Other explicitly named states |

Use a visible Arabic label with every status. Decorative dots remain `aria-hidden`. A state that is not in `StatusBadge` needs an explicit label and mapping; do not rely on an English database value becoming readable by itself.

**Nudee invariant:** assignment, submission, review approval, official compliance, and final-review progress are distinct concepts. Sharing a green badge never makes them equivalent. Do not change their calculations or stored values to simplify a chart.

Measured reference pairs: `#0f766e` on white is approximately **5.47:1**; `#64748b` on white is **4.76:1**. These results apply only to those exact pairs. Recheck actual computed styles on tinted surfaces, overlays, hover, and focus. Do not use `#718096` as normal text on white (approximately 4.02:1). `--cgp-line` is not a guarantee of the 3:1 contrast required when a boundary is the sole visual means of identifying an active control.

Migration backlog: add semantic foreground/background aliases only when their usage and tested pairs are defined; replace local duplicates incrementally. Do not add dark mode until all component states have a complete contrast and interaction review.

## 4. Arabic typography and direction

The current font stack is `var(--font-cgp-arabic), Tahoma, Arial, sans-serif`; `--font-cgp-arabic` is supplied by `Noto_Sans_Arabic` through `next/font/google`. Keep a single Arabic typeface across account pages, forms, navigation, and reports. The presence of the font variable does not override an inline legacy `fontFamily` declaration.

The following ramp is the migration target, not a claim that every current page uses it:

| Role | Target size | Guidance |
|---|---|---|
| Main page title | 28–32px desktop; 24–28px narrow screens | One clear page heading; allow wrapping |
| Section heading | 18–22px | Weight 600–700; stable spacing before sections |
| Body and descriptions | 14–16px | Prefer 16px for reading; line-height 1.6–1.8 |
| Form input | 16px | Keep entered text comfortable on mobile |
| Label and table body | 14px | Do not compress essential content to fit more columns |
| Supporting caption | 12–13px | Only supplementary information; never the only status or action instruction |
| Metric value | 28–40px | `font-variant-numeric: tabular-nums` |

Use semantic headings rather than selecting a heading level for its appearance. Keep source order consistent with reading order. Use `text-align: start`, `padding-inline`, `margin-inline`, `border-inline-start`, and logical positioning. Use `<bdi>` or a bounded `dir="ltr"` for codes, email addresses, CVEs, and filenames when necessary. Mirror directional arrows, not file or shield icons.

## 5. Spacing, shape, and elevation

The existing root shape token is `--cgp-radius: 12px`. The existing shadow is `--cgp-shadow: 0 1px 2px rgba(15,23,42,.04), 0 8px 24px rgba(15,23,42,.045)`.

Use a spacing scale of **4, 8, 12, 16, 24, 32, 48px** for new and migrated layouts. These values are a documented scale; named spacing tokens do not yet exist. Use 8px for field corners and 12px for regular cards where compatible with the component. Existing 9/10/14/16/18px local corners are migration work, not a reason for an unrelated page rewrite.

Use borders and whitespace to group information. Reserve stronger elevation for overlays; do not give every table cell or nested item a shadow. Limit decorative gradients to established overview areas. Maintain a quiet white/light-gray work surface for operational pages.

## 6. Responsive layout and navigation

| Existing threshold | Current scope | Standard when modifying it |
|---|---|---|
| `max-width: 760px` / `min-width: 761px` | Shared shell and operational pages | Mobile navigation below the threshold; all permitted destinations remain reachable |
| `max-width: 1100px` | Shared intermediate layouts | Reduce columns and side-navigation width; preserve readable content |
| 680px / 1000px | Data Office local CSS | Existing local thresholds; reconcile only with visual regression evidence |
| 390px / 700px / 1120px | Nudee dashboard local CSS | Existing layout thresholds; retain charts and tables without losing information |

Do not add a new breakpoint for each page. Prefer intrinsic layout, wrapping, `minmax(0, 1fr)`, and the existing shell thresholds. Any deliberate module-specific threshold must have a content reason and a tested narrow case.

The desktop and mobile navigation represent the same permitted destinations. A collapsed sidebar must expose every permitted group; hiding a disclosure control must not leave its links inaccessible. Every icon link needs a stable accessible name and a usable visible hint. Match the most specific route for the page context and use `aria-current="page"` for the actual current destination.

On narrow screens, selecting a requirement must make its details discoverable. Preserve the selected identity, announce selection where appropriate, and provide a clear way back to the result list. Move focus deliberately when navigation changes the working context; do not move it for every filter keystroke.

Test content reflow at **320 CSS px**. Data tables that need two-dimensional comparison may scroll locally; the surrounding page, fields, dialogs, and task actions must still reflow. An iPhone-sized Chromium viewport is responsive testing, not an iPhone Safari test.

## 7. Component standards

### Page heading and actions

Use `WorkflowHeading` when its structure fits. Keep the title task-oriented and the description concise. Identify one primary action for a work area, and show only actions already permitted by the established authorization model. Use a link for navigation and a button for an action. Do not style a noninteractive metric as a clickable control.

Existing button classes are `.workflow-button`, `.workflow-primary`, and module-specific secondary/destructive variants. New shared variants are backlog work. Preserve a visible focus indicator in every variant. Existing buttons commonly use 42px minimum height; **44px** is the recommended comfortable target for touch, not the WCAG AA minimum. Validate the 24×24 CSS-pixel target or the applicable WCAG 2.5.8 exception.

### Forms

- Give each field a persistent visible label associated through `htmlFor`/`id` or a wrapping label. Placeholder text is additional help, not the label.
- Put format, size limits, and required-field guidance before submission. Associate help and validation text with `aria-describedby`; apply `aria-invalid` to invalid fields.
- Preserve all input on a failed mutation. Disable repeated submission while pending, and return the control to an actionable state in `finally`.
- Distinguish a committed save followed by a failed reload from a failed save. Retry the read without silently repeating the write.
- Display human-readable state labels; never expose raw enum values as the normal experience.
- Group lengthy forms by the user's task. Progressive disclosure must preserve values and make hidden errors discoverable.
- Handle ambiguous evidence submission outcomes conservatively; do not delete a possibly committed file or create duplicate evidence to make the interface appear successful.

### Filters and results

Place filters next to the result set. Use persistent labels and a clear reset action. Use `ResultSummary` where appropriate; it already announces counts with `role="status"`. Keep the result count and the scope explicit, such as `عرض 12 من 364`.

Use a `role="group"` with `aria-pressed` for buttons that filter one result set. Use `tablist`, `tab`, and `tabpanel` only when the full tab interaction model is implemented. Preserve filters when opening and returning from a record where the navigation model supports it. Distinguish no records from no matches.

### Tables

Use a semantic `<table>`, a meaningful caption or accessible label, and appropriate column/row headers. Start with identity, state, owner, and due date, followed by a clear primary action. Preserve sorting labels and state if sorting exists.

`.cgp-table-scroll` is an existing overflow wrapper; it does not automatically supply semantics. For a keyboard-scrollable region, use an appropriate accessible name and `tabIndex={0}`, and verify the visible focus indicator. Keep long Arabic text readable. Use horizontal scroll for genuine comparison tables, or a complete card representation for simple records. Do not remove columns or information solely to make a screenshot fit.

### Dialogs

Prefer `AccessibleDialog` for new modal work on this branch. Mount it only while open. Supply `labelledBy` pointing to the visible title, the existing backdrop and panel class names, `onClose`, and `busy` when dismissal must be prevented during a write. It uses native `showModal()` for modality and restores focus on unmount.

The calling form remains responsible for meaningful initial focus, visible close/cancel controls, form validation, and pending feedback. If `busy` blocks Escape/backdrop dismissal, disable other close buttons consistently and always release pending state after an error. Confirm focus containment, Shift+Tab, Escape, background inertness, and restoration in the actual supported browsers. The shell's custom search dialog must meet the same behavior standard even while it has a separate implementation.

### Loading, empty, error, and success

| State | Required presentation | Example Arabic copy |
|---|---|---|
| Initial loading | Announced status; stable layout; no fabricated zero values | `جاري تحميل المتطلبات…` |
| Empty successful query | Explain what is empty and the next permitted action | `لا توجد متطلبات مسندة إلى حسابك حالياً.` |
| No filter matches | Preserve filters and offer reset | `لا توجد نتائج مطابقة. جرّب تعديل التصفية.` |
| Read failure | Clear error and retry in the same context | `تعذر تحميل السجل. أعد المحاولة.` |
| Write failure | Retain input; explain recovery; `role="alert"` | `تعذر حفظ الأصل. احتفظنا بمدخلاتك لتعيد المحاولة.` |
| Save confirmed; refresh failed | Confirm the completed action; retry reading only | `تم الحفظ، وتعذر تحديث العرض. أعد تحميل السجل.` |
| Success | Concise `role="status"`; updated state remains visible | `تم إسناد المتطلب بنجاح.` |

Do not redirect every fetch error to the home page. Differentiate session/access errors from network and data errors. Avoid showing database internals or migration instructions in the normal product flow. Put technical references in a separate help or methodology disclosure when useful.

### Charts and evidence

Pair every meaningful color with a label and value. Supply an accessible equivalent, such as a table or complete summary. Avoid touch-only reliance on `title` tooltips. Use a consistent color for the same state across views.

Keep official compliance separate from evidence review and project progress. Preserve the original Nudee formulas, denominators, unknown-value treatment, source records, and audited manual phase-four progress. Improving chart presentation must not change any of these.

Evidence presentation should identify the requirement, filename, version or submission, review state, relevant dates, and feedback. Keep original submissions and review history available within existing permissions. Reuse of evidence must follow the authorized relationship and review rules; a shared UI component is not a shared data entitlement.

## 8. Migration order

1. Resolve P0/P1 functional and access barriers: inaccessible navigation, modal behavior, silent mutation failure, misleading values, and confirmed text contrast problems.
2. Standardize read/mutation states, field labels, and filters across Data Office and Nudee. Keep the business operations and role checks unchanged unless a separately reviewed defect requires a fix.
3. Consolidate Field, Notice, EmptyState, Button, and DataTable behavior through bounded changes with explicit consumers. Avoid a wholesale framework replacement.
4. Adopt the typography, spacing, and semantic color targets gradually; remove obsolete local overrides only after visual comparison.
5. Improve dashboard hierarchy and disclosures on a separate branch, retaining every existing function and calculation.

## 9. WCAG 2.2 AA and responsive validation

This is a validation checklist, **not a conformance statement**. Record `PASS`, `FAIL`, or `BLOCKED` for each executed scenario, with its actual evidence. A successful build, automated scan, or screenshot alone does not establish accessibility.

- [ ] **Semantics and names:** headings, landmarks, labels, table headers, state announcements, and name/role/value; include 1.3.1, 3.3.2, 4.1.2, and 4.1.3.
- [ ] **Keyboard:** every task can be completed without a pointer; focus order and visibility are clear; dialogs contain and restore focus; include 2.1.1, 2.1.2, 2.4.3, and 2.4.7.
- [ ] **Focus not obscured:** sticky bars, dialogs, mobile menus, and the feedback trigger do not fully obscure the focused component; 2.4.11.
- [ ] **Contrast:** normal text at least 4.5:1, qualifying large text 3:1; test relevant nontext indicators at 3:1 and all interaction states; 1.4.3 and 1.4.11. Evaluate exceptions correctly.
- [ ] **Color independence:** states, chart meaning, validation, and selection remain understandable without color; 1.4.1.
- [ ] **Resize, reflow, and text spacing:** 200% text resize, 320 CSS-pixel equivalent width, and the text-spacing overrides required by 1.4.12; assess 1.4.4, 1.4.10, and 1.4.12.
- [ ] **Touch targets:** at least 24×24 CSS px or a documented 2.5.8 exception; target 44px for comfortable primary actions.
- [ ] **Errors and authentication:** identify errors, provide useful corrections, preserve input, allow password managers/paste, and avoid unnecessary repeated entry; include 3.3.1, 3.3.3, 3.3.7, and 3.3.8.
- [ ] **RTL and content:** long Arabic labels, mixed Arabic/English codes, date inputs, filenames, menus, and dialogs render in the intended reading order.
- [ ] **Motion:** honor reduced-motion preferences and verify any animation or automatically updating content against its applicable criteria.
- [ ] **Representative viewports:** desktop 1440×900, tablet 768×1024, mobile 393×852, and 320 CSS px. Record actual browser and device, including a separate iPhone Safari result when available.
- [ ] **Roles and full workflow:** independently authenticated authorized personas complete assignment, upload, return, resubmit, approval, and dashboard reflection; unauthorized navigation and actions remain denied.

For each before/after comparison, record the commit, route, role, synthetic dataset, viewport, browser, scenario, expected outcome, actual outcome, and screenshot/evidence path. Match the same state and data on both sides. Avoid personal information in distributable screenshots. Never label generated mockups as screenshots of the application.

## 10. Official references

- [WCAG 2.2 normative standard](https://www.w3.org/TR/WCAG22/)
- [W3C: contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- [W3C: reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)
- [W3C: target size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- [W3C: focus not obscured minimum](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)
- [WAI-ARIA APG: modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- [Microsoft Fluent: design tokens](https://fluent2.microsoft.design/design-tokens/)
- [Microsoft Fluent: accessibility](https://fluent2.microsoft.design/accessibility)
- [Ant Design: design values](https://ant.design/docs/spec/values/)
- [Material Design: foundations](https://m3.material.io/foundations/)

Fluent informs token organization and consistent component states; Ant Design informs predictable enterprise task patterns; Material informs adaptable structure and explicit semantic roles. These are design references, not libraries that CGP is required to install or proof that CGP meets their accessibility standards.
