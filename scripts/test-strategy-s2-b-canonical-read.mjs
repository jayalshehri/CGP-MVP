import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const root = new URL('..', import.meta.url);
const source = readFileSync(new URL('lib/strategy-relationships.ts', root), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { canonicalRelationships, legacyRelationships, mappingMultiplicity } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
let checks = 0;
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const pr = (project_id, requirement_id, coverage_type = 'partial') => ({ project_id, requirement_id, coverage_type });
const rc = (requirement_id, control_id, coverage_type = 'full', mapping_confidence = 'confirmed') => ({ requirement_id, control_id, coverage_type, mapping_confidence });
const first = canonicalRelationships([1, 2], [pr(1, 1), pr(2, 1)], [rc(1, 1), rc(1, 2)]);
equal(first.counts, { projects: 2, requirements: 1, projectRequirementLinks: 2, controls: 2, requirementControlLinks: 2, paths: 4, projectControlPairs: 4 }, 'shared requirement counts distinct portfolio units');
equal(first.byProject.get(1).controls, 2, 'first project retains both controls');
equal(first.byProject.get(2).controls, 2, 'second project retains both controls');

const projects = [1, 2, 3];
const projectRequirements = [pr(1, 1), pr(1, 2), pr(2, 1), pr(2, 3), pr(3, 2)];
const mappings = [rc(1, 1), rc(1, 2), rc(2, 2), rc(2, 3), rc(3, 1), rc(3, 4)];
const second = canonicalRelationships(projects, projectRequirements, mappings);
equal(second.counts, { projects: 3, requirements: 3, projectRequirementLinks: 5, controls: 4, requirementControlLinks: 6, paths: 10, projectControlPairs: 8 }, 'many-to-many count contract');
for (let i = 0; i < 12; i++) {
  const shuffledPr = [...projectRequirements].sort((a, b) => ((a.project_id * 7 + i) % 11) - ((b.project_id * 7 + i) % 11) || b.requirement_id - a.requirement_id);
  const shuffledRc = [...mappings].sort((a, b) => ((a.control_id * 5 + i) % 13) - ((b.control_id * 5 + i) % 13) || b.requirement_id - a.requirement_id);
  const result = canonicalRelationships([...projects].reverse(), shuffledPr, shuffledRc);
  equal(result.counts, second.counts, 'row order cannot change portfolio totals');
  equal(result.paths, second.paths, 'row order cannot change exact paths');
}
equal(canonicalRelationships([1], projectRequirements, mappings).counts.projectControlPairs, 3, 'authorized visible subset only');
equal(canonicalRelationships([999], projectRequirements, mappings).counts.paths, 0, 'hidden projects do not leak paths');
for (const [role, visible] of Object.entries({ admin: [1, 2, 3], cybersecurity_team: [1, 2, 3], control_owner: [1], nca_external_auditor: [2] })) {
  const scoped = canonicalRelationships(visible, projectRequirements, mappings);
  equal(scoped.counts.projects, visible.length, `${role}: only authorized project identities counted`);
  equal(scoped.paths.every(path => visible.includes(path.project_id)), true, `${role}: no hidden project ID or path`);
}
equal(canonicalRelationships([1, 2], [pr(1, 1), pr(2, 1), pr(1, 1)], [rc(1, 1), rc(1, 1)]).counts.paths, 2, 'stable edge dedup');

const legacy = [{ project_id: 1, control_id: 1 }, { project_id: 1, control_id: 5 }, { project_id: 1, control_id: 5 }, { project_id: 2, control_id: 7 }];
equal(legacyRelationships(projects, legacy, second.paths), { links: 3, controls: 3, overlap: 1 }, 'legacy overlap tracked, not unioned');
equal(legacyRelationships(projects, [], second.paths), { links: 0, controls: 0, overlap: 0 }, 'true legacy zero');
equal(legacyRelationships(projects, legacy, null)?.overlap, null, 'modern source unavailable is not absence');
equal(legacyRelationships(projects, null, second.paths), null, 'legacy source unavailable is not zero');
equal(legacyRelationships([3], legacy, []), { links: 0, controls: 0, overlap: 0 }, 'legacy scope follows visible projects');

const mixed = [rc(1, 1, 'full', 'confirmed'), rc(2, 1, 'partial', 'probable')];
const qualities = mappingMultiplicity(mixed);
equal([...qualities.get(1).coverage].sort(), ['full', 'partial'], 'coverage multiplicity preserved');
equal([...qualities.get(1).confidence].sort(), ['confirmed', 'probable'], 'confidence multiplicity preserved');
equal(canonicalRelationships([1], [pr(1, 1, 'full'), pr(1, 2, 'supporting')], mixed).paths.map(p => [p.project_coverage_type, p.mapping_coverage_type, p.mapping_confidence]), [['full', 'full', 'confirmed'], ['supporting', 'partial', 'probable']], 'separate coverage on each edge');
const metricSource = readFileSync(new URL('app/roadmap/portfolio-metrics.ts', root), 'utf8');
const metricJs = ts.transpileModule(metricSource, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { requirementRollup } = await import(`data:text/javascript;base64,${Buffer.from(metricJs).toString('base64')}`);
const controlState = { evidence_status: 'accepted', verification_status: 'verified' };
const rollupMappings = mixed.map(row => ({ ...row, ...controlState }));
const forward = requirementRollup([pr(1, 1), pr(1, 2)], rollupMappings);
const backward = requirementRollup([pr(1, 1), pr(1, 2)], [...rollupMappings].reverse());
equal(forward, backward, 'mixed mapping quality cannot depend on first row');
equal([forward.linkedControlsCount, forward.verified, forward.confirmedMappings, forward.probableMappings], [1, 1, 1, 1], 'control status distinct, quality per mapping');

const control = readFileSync(new URL('app/controls/[id]/page.tsx', root), 'utf8');
equal(control.includes('projectLinks.find('), false, 'Control 360 cannot select first project');
equal(control.includes('visibleProjects.length?visibleProjects:[null]'), true, 'Control 360 renders every visible project');
const register = readFileSync(new URL('app/roadmap/page.tsx', root), 'utf8');
equal(register.includes('reqToProject'), false, 'register cannot collapse requirement to one project');
const detail = readFileSync(new URL('app/roadmap/[id]/page.tsx', root), 'utf8');
equal(detail.includes('seenForCoverage'), false, 'detail cannot collapse multiple mapping coverage');
equal(detail.includes('روابط مباشرة موروثة'), true, 'legacy appears separately');
console.log(`S2-B canonical read: ${checks} assertions PASS`);
