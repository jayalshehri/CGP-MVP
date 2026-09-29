# P2-B5.2.2 — isolated QA inline-review certification design

This is a design for a later, separately approved QA operator run. No fixture is created by this change.

## Entry gate

- Open `/review/qa-certification` only on a dedicated Vercel Preview deployment connected to `lkozjnpfufdpzqtzdxhe.supabase.co` with server-only `CGP_QA_CERT_MODE=true`. The server route returns 404 otherwise, including Production. `/review` never opts in via a query parameter.
- Verify the QA migration ledger and current fixture state before any later mutation. Stop if the `QA_SYNTH` framework or `QA-C-01` control is inactive, archived, or no longer assigned to the intended owner.
- Use active, approved QA identities only: owner/uploader `qa-owner@cgp-qa.test`; independent reviewer `qa-team@cgp-qa.test`; fallback independent reviewer `qa-admin@cgp-qa.test`. Reconfirm their profiles/roles and assignment at execution time. No role/assignment changes are part of this plan.

## New fixture only

Create exactly three independent, new QA_SYNTH evidence records on `QA-C-01`, with filenames clearly tagged `P2B52_QA_SYNTH_ACCEPT.pdf`, `P2B52_QA_SYNTH_CHANGES.pdf`, and `P2B52_QA_SYNTH_REJECT.pdf`. The owner uploads ACCEPT and REJECT. For the SoD case, the existing authorized team identity uploads CHANGES, then the independent admin reviews it. Each starts at its own first version (`replaces_id=null`); never supersede existing evidence. Do not touch evidence 4/6/7, versions 7–12, completed assessments, or their validity metadata. Do not create cycles, findings, or corrective actions.

Before each upload, generate with `scripts/qa-pdf-fixture.mjs` and require MIME `application/pdf`, strict parse, valid stream lengths/xref, successful render, and recorded SHA-256. Use the existing Control Owner evidence submission path: Storage upload with `upsert:false`, then the existing `cgp_grc_command` `submit` action. Do not write business tables directly or overwrite Storage objects. Capture every newly created evidence/version/Storage ID/path before any decision.

After upload, require the exact new version is current, its Storage object exists, the signed preview responds successfully and renders nonblank, and downloaded bytes hash to the source SHA-256. Stop if the UI cannot show the exact version. The reviewer opens each new row from the QA-only ReviewWorkQueue and uses the existing ReviewEvidenceDecision component, which re-reads the version and calls `cgp_review_evidence`; no alternate mutation path is provided.

## Decision scenarios

1. ACCEPT: independent team reviewer inspects the exact version, enters a reason, accepts, then verify status/review/audit rows and refreshed queue state.
2. REQUEST CHANGES: team-uploaded evidence; first require that same team identity cannot self-review, then independent admin submits canonical `changes_requested` with a reason and verifies status, history, and queue refresh.
3. REJECT: separate evidence; independent reviewer submits canonical `rejected` with a reason and verifies status, history, and queue refresh.
4. SELF REVIEW: the team uploader attempts review of the CHANGES version before its independent admin decision. The existing backend must reject without creating a review row.
5. STALE STATE: open the same pending ACCEPT version in two decision contexts. After one valid team decision, the stale second context must receive a stale-state response, make no new decision, and refresh the queue.

No fourth evidence record/version is authorized by this design. Do not alter roles, RLS, grants, RPCs, or business evidence to make the scenarios pass. All certification records may remain as QA_SYNTH audit history, but must stay absent from normal Compliance Center, My Controls, `/review`, and Business KPIs.
