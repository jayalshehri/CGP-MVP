import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { defaultPortfolioFilters, matchesPortfolioFilters, portfolioPayload, emptyPortfolioForm } from '../lib/project-portfolio.ts';

// Saved independent QA post-cutover read, not synthetic portfolio data.
const state = JSON.parse(fs.readFileSync(new URL('../backups/portfolio-qa-cutover-20261006/POST_CUTOVER.json', import.meta.url)));
const source = JSON.parse(fs.readFileSync(new URL('../backups/portfolio-qa-cutover-20261006/APPROVED_PAYLOAD.json', import.meta.url)));
const filter = changes => state.projects.filter(p => matchesPortfolioFilters(p, { ...defaultPortfolioFilters, ...changes }));

test('Project Register defaults show exactly the approved 43 and hide all 32 historical projects', () => {
  assert.equal(state.qa_ref, 'lkozjnpfufdpzqtzdxhe');
  assert.equal(filter({}).length, 43);
  assert.equal(filter({ archive: 'archived' }).length, 32);
  assert.equal(filter({ archive: 'all' }).length, 75);
  assert.deepEqual(filter({}).map(p => p.name_ar).sort(), source.map(p => p.name).sort());
});
test('Register priority/year/status and all classification filters work on actual imported records', () => {
  for (const [priority, n] of [['P1', 18], ['P2', 16], ['P3', 9]]) {
    assert.equal(filter({ priority }).length, n);
    assert.equal(filter({ year: priority.slice(1) }).length, n);
  }
  assert.equal(filter({ status: 'planned' }).length, 43);
  assert.equal(filter({ status: 'completed' }).length, 0);
  for (const [key, field] of [['workType', 'work_type'], ['owner', 'executive_owner_code']]) {
    for (const value of new Set(source.map(p => p[field]))) {
      assert.equal(filter({ [key]: value }).length, source.filter(p => p[field] === value).length);
    }
  }
  assert.equal(filter({ query: 'MFA — التحقق متعدد العناصر' }).length, 1);
  assert.equal(filter({ durationUnit: 'month' }).length, 43);
  assert.equal(filter({ durationMin: '6', durationMax: '8' }).length, source.filter(p => p.duration_value >= 6 && p.duration_value <= 8).length);
});
test('Completeness filters agree with approved per-project source references and active exact links', () => {
  for (const p of source) {
    const actual = filter({}).find(x => x.import_staging_id === p.stage_id);
    const exact = p.mappings.filter(r => r.match_status === 'exact_match').length;
    const errors = p.mappings.filter(r => r.source_error).length;
    const expected = errors ? 'source_error' : exact === 0 ? 'mapping_pending' : exact === p.mappings.length ? 'verified' : 'partially_mapped';
    assert.equal(actual.mapping_completeness, expected);
    assert.equal(actual.mapping_exact_count, exact);
    assert.equal(state.links.filter(l => l.project_id === actual.id).length, exact);
    assert.ok(filter({ mappingCompleteness: expected }).some(x => x.id === actual.id));
  }
  assert.equal(filter({ mappingCompleteness: 'verified' }).length, 1);
  assert.equal(filter({ mappingCompleteness: 'partially_mapped' }).length, 11);
  assert.equal(filter({ mappingCompleteness: 'mapping_pending' }).length, 30);
  assert.equal(filter({ mappingCompleteness: 'source_error' }).length, 1);
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
