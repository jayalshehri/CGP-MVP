// Single source of truth for which frameworks have an integrated assessment
// tool today. NCA is the source of truth for whether a framework has an
// official assessment methodology; this list only tracks whether CGP has
// wired one up -- it must never be used to imply a framework lacking a
// route has no NCA requirements, only that no assessment workflow exists
// for it in CGP yet. ECC and CCC intentionally map to `null`: there is no
// fabricated assessment route for them.
export const ASSESSMENT_ROUTES: { code: string; href: string | null }[] = [
 { code: "ECC", href: null },
 { code: "DCC", href: "/dcc-assessment" },
 { code: "CSCC", href: "/assessments" },
 { code: "TCC", href: "/tcc-assessment" },
 { code: "OSMACC", href: "/osmacc-assessment" },
 { code: "CCC", href: null },
];

export const assessmentHrefFor = (code: string): string | null =>
 ASSESSMENT_ROUTES.find((item) => item.code === code)?.href ?? null;
