# Nudee original workbook reconciliation — 2026-11-16

> Source: user-supplied XLSX, inspected read-only. No source workbook, personal data, or 364-row CSV is committed to Git.

## Provenance and method

- Source file SHA-256: `2c3c63c98c27c24723e9cb1146e506a284930415392e1853dd2d6ff6436dbfde`.
- Workbook contains 5 worksheets (مقدمة, لوحة البيانات, متابعة الأدلة الداعمة, الجدول الزمني, hidden Calc) and 7 chart definitions.
- Data is rows **2–365** on **متابعة الأدلة الداعمة**; 364 unique nonempty evidence names, 14 domains, 42 standard codes; 52/146/166 rows for maturity levels 1/2/3.
- Imported CGP-QA was checked **directly against the actual uploaded workbook** using independent per-column ordered MD5 digests across all 364 source rows, sorted by `source_row`. For dates, Excel date serials were converted to ISO yyyy-mm-dd. For progress, numeric representations were normalized (0.0000→0, 1.0000→1). NULL and empty strings were normalized equivalently. The delimiter was ASCII unit separator (0x1F); this is a data-reconciliation fingerprint, **not** a cryptographic authenticity signature.

## 18/18 exact column fingerprints — XLSX equals CGP-QA

| Field | Ordered MD5 (both XLSX and CGP-QA) |
|---|---|
| source_row | `061b173955047d105b67778bd83cfc5c` |
| domain_name | `dd6acec72e548f07a86fde488b099289` |
| standard_code | `17f8ff27ac5f0019dee3cff6e73091ac` |
| requirement_title | `f54c1e7e27746b63f46961f4c123afa1` |
| maturity_level | `74a6f49a7bfdb8ff82a5e671bd8fd310` |
| evidence_name | `83c0c2c1e568210967bf962836e8f607` |
| evidence_description | `72bf5af81c27e570ce495f328decbf8f` |
| responsible_department | `e3790a83c402be88e96d7b7af4d7828b` |
| specification_code | `293da7b870c655ee376075e26d2f88b0` |
| source_compliance | `690377182e84e048f3b85d05cc870943` |
| source_notes | `1138423aa70a60aebe9b5c46fa31106d` |
| review_phase | `81279b737ea9178b8e70f69e239db11c` |
| planned_start | `62c274a69ffabd757b9d9c1fdba16ca6` |
| planned_end | `24174cce58e76976ae5f80e71d9d1143` |
| actual_end | `1138423aa70a60aebe9b5c46fa31106d` |
| source_review_status | `d054908a023bce08c3af60e50f079a37` |
| source_progress | `ea5baac8562cfe4c3a79f09ae5f1a5dd` |
| schedule_indicator | `311152ae893455e0d1b917f14c367b99` |

All 18 column digests match. **QA data migration does not need a reimport**. This does not verify production, which has no Nudee data import yet.

## Reconciled Excel Calc baseline

At the workbook's frozen measurement date **2026-11-05**, with four dashboard filters all set to `الكل`:

| Calc cell | Result | Rule |
|---|---|---|
| B8 | 364 | Evidence count |
| B9 | 0 | Exact `ممتثل بالكامل` |
| B10 | 1 | Exact `ممتثل للمعالي فقط`, despite heading `ممتثل لمتطلبات الهيئة` |
| B11 | 2 | `غير ممتثل` |
| B12 | 0 | `لا ينطبق` |
| B13 | 360 | Blank source compliance |
| B17 | 1 | `مكتمل` |
| B19 | 0 | Schedule indicator equals `متأخر` |
| B15 | 0% | NDMO = B9/(B8-B12) |
| B16 | ~0.274725% | Combined = (B9+B10)/(B8-B12) |
| B18 | ~0.274725% | Review completion = B17/B8 |

There is an additional nonstandard value on source row 2: `ممتثل لمتطلبات الهيئة`; it is NOT counted in Excel's `B10` formula. The application must preserve/flag that value, not silently reinterpret it as the similarly titled `ممتثل للمعالي فقط`.

## Chart reference inventory

- Excel chart1/2/3: per-domain NDMO rates for maturity levels 1, 2, 3 from `Calc!H30:H43`, `Q30:Q43`, `Z30:Z43`.
- Excel chart4: compliance category counts `Calc!A50:B54`.
- Excel chart5: eight-week planned/actual progress `Calc!D60:E67`, with week labels `A60:A67`.
- Excel chart7: five-category domain compliance matrix `Calc!AD30:AH43`.
- Excel chart6: four-stage stacked timetable `Calc!B72:F75`.

Chart #5 planned series is **12.5%, 25%, 37.5%, 50%, 62.5%, 75%, 87.5%, 100%**; it is *not* the percentage of evidence records past their planned due date. The app was corrected on the feature branch to use weighted eight-week progression and make the dynamic date model explicit; authenticated visual check is still required. The original cached actual series is all 0%, because the workbook measures 2026-11-05 before the 2026-11-08 program start.

## Remaining release blockers

- QA's actual authenticated invitation/first-login, binary Storage upload/download/signed URL, independent office-review E2E, and mobile/desktop RTL visual checks have **not** been executed.
- Confirm exact visual series parity of all 7 Excel chart equivalents, including stacked domain and phase timetable charts; an equivalent tabular view is not the same thing as a matched chart.
- A current successful CI build and ready Vercel Preview for the final commit are necessary, not evidence of browser/storage E2E.
- Keep PR #237 draft, preserve production schema/data and alias, and do **not** merge until those release gates pass.
