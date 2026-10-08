import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { defaultPortfolioFilters, matchesPortfolioFilters, portfolioPayload, emptyPortfolioForm } from '../lib/project-portfolio.ts';

// Inputs: by default a small tracked synthetic fixture (no QA data). To verify the
// saved independent QA post-cutover read, pass both files explicitly, e.g.
//   CGP_QA_POST_CUTOVER=/path/POST_CUTOVER.json CGP_QA_APPROVED_PAYLOAD=/path/APPROVED_PAYLOAD.json \
//     node --test scripts/qa-portfolio-register.test.mjs
// QA snapshots are never committed to the repository.
const external = Boolean(process.env.CGP_QA_POST_CUTOVER || process.env.CGP_QA_APPROVED_PAYLOAD);
if (external && !(process.env.CGP_QA_POST_CUTOVER && process.env.CGP_QA_APPROVED_PAYLOAD)) {
  throw new Error('Set both CGP_QA_POST_CUTOVER and CGP_QA_APPROVED_PAYLOAD, or neither for the synthetic fixture.');
}
const input = (variable, fixture) => external ? process.env[variable] : new URL(`./fixtures/portfolio-register/${fixture}`, import.meta.url);
const state = JSON.parse(fs.readFileSync(input('CGP_QA_POST_CUTOVER', 'post-cutover.json')));
const source = JSON.parse(fs.readFileSync(input('CGP_QA_APPROVED_PAYLOAD', 'approved-payload.json')));
const filter = changes => state.projects.filter(p => matchesPortfolioFilters(p, { ...defaultPortfolioFilters, ...changes }));
const historical = state.projects.filter(p => p.archived_at);
const completeness = p => {
  const exact = p.mappings.filter(r => r.match_status === 'exact_match').length;
  const errors = p.mappings.filter(r => r.source_error).length;
  return errors ? 'source_error' : exact === 0 ? 'mapping_pending' : exact === p.mappings.length ? 'verified' : 'partially_mapped';
};

test('Project Register defaults show exactly the approved source rows and hide historical projects', () => {
  assert.equal(filter({}).length, source.length);
  assert.equal(filter({ archive: 'archived' }).length, historical.length);
  assert.equal(filter({ archive: 'all' }).length, state.projects.length);
  assert.deepEqual(filter({}).map(p => p.name_ar).sort(), source.map(p => p.name).sort());
});
test('Register priority/year/status and all classification filters work on imported records', () => {
  for (const priority of ['P1', 'P2', 'P3']) {
    const n = source.filter(p => p.priority === priority).length;
    assert.equal(filter({ priority }).length, n);
    assert.equal(filter({ year: priority.slice(1) }).length, n);
  }
  assert.equal(filter({ status: 'planned' }).length, source.length);
  assert.equal(filter({ status: 'completed' }).length, 0);
  for (const [key, field] of [['workType', 'work_type'], ['owner', 'executive_owner_code']]) {
    for (const value of new Set(source.map(p => p[field]))) {
      assert.equal(filter({ [key]: value }).length, source.filter(p => p[field] === value).length);
    }
  }
  assert.equal(filter({ query: source[0].name }).length, 1);
  for (const unit of new Set(source.map(p => p.duration_unit))) assert.equal(filter({ durationUnit: unit }).length, source.filter(p => p.duration_unit === unit).length);
  assert.equal(filter({ durationMin: '6', durationMax: '8' }).length, source.filter(p => p.duration_value >= 6 && p.duration_value <= 8).length);
});
test('Completeness filters agree with approved per-project source references and active exact links', () => {
  for (const p of source) {
    const actual = filter({}).find(x => x.import_staging_id === p.stage_id);
    const expected = completeness(p);
    assert.equal(actual.mapping_completeness, expected);
    assert.equal(actual.mapping_exact_count, p.mappings.filter(r => r.match_status === 'exact_match').length);
    assert.equal(state.links.filter(l => l.project_id === actual.id).length, actual.mapping_exact_count);
    assert.ok(filter({ mappingCompleteness: expected }).some(x => x.id === actual.id));
  }
  for (const state of ['verified', 'partially_mapped', 'mapping_pending', 'source_error']) {
    assert.equal(filter({ mappingCompleteness: state }).length, source.filter(p => completeness(p) === state).length);
  }
});
test('Saved QA snapshot matches the approved QA cutover totals', { skip: !external && 'synthetic fixture run; pass CGP_QA_* paths to verify the QA snapshot' }, () => {
  assert.equal(state.qa_ref, 'lkozjnpfufdpzqtzdxhe');
  assert.deepEqual([filter({}).length, filter({ archive: 'archived' }).length, filter({ archive: 'all' }).length], [43, 32, 75]);
  assert.deepEqual(['P1', 'P2', 'P3'].map(priority => filter({ priority }).length), [18, 16, 9]);
  assert.deepEqual(['verified', 'partially_mapped', 'mapping_pending', 'source_error'].map(m => filter({ mappingCompleteness: m }).length), [1, 11, 30, 1]);
  assert.equal(filter({ query: 'MFA — التحقق متعدد العناصر' }).length, 1);
  assert.equal(filter({ durationUnit: 'month' }).length, 43);
});
test('Create/edit payloads exclude archive/provenance/derived counts and deprecated fields', () => {
  const form = { ...emptyPortfolioForm, project_code: 'QA-FORM', name_ar: '  Exact name  ', portfolio_priority: 'P2',
    duration_value: '8', duration_unit: 'month', work_type: 'technical_change', executive_owner_code: 'other', executive_owner_other: 'Procurement / Legal', status: 'on_hold' };
  for (const creating of [true, false]) {
    const p = portfolioPayload(form, creating);
    assert.equal(p.name_ar, form.name_ar);
    assert.equal(p.status, creating ? 'planned' : 'on_hold');
    for (const key of ['project_owner','planned_quarter','planned_year','planned_start_date','target_end_date','actual_end_date','lifecycle_mode','execution_year','import_staging_id','archived_at','mapping_completeness','mapping_exact_count']) assert.equal(key in p, false);
  }
});
