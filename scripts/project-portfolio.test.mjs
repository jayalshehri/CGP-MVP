import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyPortfolioForm, portfolioPayload, executionYear, defaultPortfolioFilters, matchesPortfolioFilters, formatDuration } from '../lib/project-portfolio.ts';

const form = { ...emptyPortfolioForm, project_code: 'QA-TEST', name_ar: '  Exact — اسم  ', portfolio_priority: 'P1', duration_value: '6', duration_unit: 'month' };
test('exact names, source duration, unclassified business fields and planned creation', () => {
  const result = portfolioPayload({ ...form, status: 'completed' }, true);
  assert.equal(result.name_ar, form.name_ar);
  assert.equal(result.duration_value, 6);
  assert.equal(result.duration_unit, 'month');
  assert.equal(result.work_type, null);
  assert.equal(result.executive_owner_code, null);
  assert.equal(result.status, 'planned');
  for (const key of ['execution_year', 'planned_quarter', 'target_end_date', 'archived_at', 'project_owner', 'lifecycle_mode']) assert.equal(key in result, false);
});
test('priority derives years without changing an edited status', () => {
  for (const [priority, year] of [['P1', 1], ['P2', 2], ['P3', 3]]) {
    assert.equal(executionYear(priority), year);
    assert.equal(portfolioPayload({ ...form, portfolio_priority: priority, status: 'on_hold' }, false).status, 'on_hold');
  }
  assert.equal(executionYear(null), null);
});
test('reject invalid duration and Other; clear stale Other text', () => {
  for (const duration_value of ['0', '-1', 'NaN', 'Infinity']) assert.throws(() => portfolioPayload({ ...form, duration_value }, true));
  assert.throws(() => portfolioPayload({ ...form, duration_unit: '' }, true));
  assert.throws(() => portfolioPayload({ ...form, executive_owner_code: 'other' }, true));
  assert.equal(portfolioPayload({ ...form, executive_owner_code: 'it', executive_owner_other: 'stale' }, false).executive_owner_other, null);
});
test('archive, year, classification, duration filters remain independent', () => {
  const project = { ...portfolioPayload(form, true), execution_year: 1, archived_at: null };
  assert.equal(matchesPortfolioFilters(project, defaultPortfolioFilters), true);
  assert.equal(matchesPortfolioFilters({ ...project, archived_at: '2026-10-06' }, defaultPortfolioFilters), false);
  assert.equal(matchesPortfolioFilters(project, { ...defaultPortfolioFilters, priority: 'P2' }), false);
  assert.equal(matchesPortfolioFilters(project, { ...defaultPortfolioFilters, year: '2' }), false);
  assert.equal(matchesPortfolioFilters(project, { ...defaultPortfolioFilters, workType: 'unset', owner: 'unset', durationUnit: 'month', durationMin: '6', durationMax: '6' }), true);
  assert.equal(matchesPortfolioFilters(project, { ...defaultPortfolioFilters, workType: 'assessment' }), false);
  assert.equal(matchesPortfolioFilters(project, { ...defaultPortfolioFilters, durationMin: '7' }), false);
  assert.equal(formatDuration(6, 'month'), '6 أشهر');
});

test('mapping completeness filter distinguishes all four review states', () => {
  for (const state of ['verified', 'partially_mapped', 'mapping_pending', 'source_error']) {
    const project = { ...portfolioPayload(form, true), execution_year: 1, archived_at: null, mapping_completeness: state };
    assert.equal(matchesPortfolioFilters(project, { ...defaultPortfolioFilters, mappingCompleteness: state }), true);
    for (const other of ['verified', 'partially_mapped', 'mapping_pending', 'source_error'].filter(x => x !== state)) {
      assert.equal(matchesPortfolioFilters(project, { ...defaultPortfolioFilters, mappingCompleteness: other }), false);
    }
  }
});
