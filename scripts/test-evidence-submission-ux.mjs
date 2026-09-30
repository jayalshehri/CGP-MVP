// Local presentation/interaction tests only. Never connects to Supabase.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
const path = 'components/EvidenceSubmissionOptions.tsx';
const source = readFileSync(path, 'utf8');
let state = [], cursor = 0;
const hooks = { ...React, useState(initial) { const index = cursor++; if (!(index in state)) state[index] = initial; return [state[index], value => { state[index] = value; }]; } };
const loadedModule = { exports: {} };
const ReactJSX = await import('react/jsx-runtime');
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText,
  { module: loadedModule, exports: loadedModule.exports, require(name) { if (name === 'react') return hooks; if (name === 'react/jsx-runtime') return ReactJSX; throw new Error('Unexpected dependency: ' + name); } });
const Options = loadedModule.exports.default;
let props;
function reset(extra = {}) {
  state = [];
  props = { disabled: false, showAdministrativeMetadata: true, versions: [], replaceId: '', replacementLocked: false, validUntil: '', coverageStart: '', coverageEnd: '',
    onReplacement(value) { props.replaceId = value; }, onValidity(value) { props.validUntil = value; },
    onCoverageStart(value) { props.coverageStart = value; }, onCoverageEnd(value) { props.coverageEnd = value; }, ...extra };
}
function render() { cursor = 0; return Options(props); }
function nodes(node, predicate) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(child => nodes(child, predicate));
  return [...(predicate(node) ? [node] : []), ...nodes(node.props?.children, predicate)];
}
const inputs = (type) => nodes(render(), node => node.type === 'input' && node.props.type === type);
const html = () => renderToStaticMarkup(render());
reset();
check(!html().includes('نوع الإرسال'), 'no meaningless type choice without current versions');
check(inputs('date').length === 0, 'dates hidden initially');
check(props.validUntil === '' && props.coverageStart === '' && props.coverageEnd === '', 'no invented date defaults');
inputs('checkbox')[0].props.onChange({ target: { checked: true } });
check(inputs('date').length === 1 && inputs('date')[0].props.value === '', 'validity revealed without default');
inputs('date')[0].props.onChange({ target: { value: '2027-04-01' } });
check(props.validUntil === '2027-04-01', 'explicit expiry preserved');
inputs('checkbox')[0].props.onChange({ target: { checked: false } });
check(props.validUntil === '' && inputs('date').length === 0, 'off clears expiry to existing null command representation');
inputs('checkbox')[1].props.onChange({ target: { checked: true } });
check(inputs('date').length === 2 && inputs('date').every(node => node.props.value === ''), 'coverage revealed without fabricated start/end');
inputs('date')[0].props.onChange({ target: { value: '2026-01-01' } });
inputs('date')[1].props.onChange({ target: { value: '2026-08-31' } });
check(inputs('date')[1].props.min === props.coverageStart, 'existing coverage order constraint preserved in form');
inputs('checkbox')[1].props.onChange({ target: { checked: false } });
check(props.coverageStart === '' && props.coverageEnd === '', 'off clears both coverage endpoints');
for (const role of ['control_owner', 'admin']) {
  reset({ versions: [{ id: 12, file_name: 'current.pdf', version_number: 3 }] });
  check(html().includes('نوع الإرسال') && html().includes('الإصدار 3'), 'meaningful new/version choice preserved: ' + role);
  nodes(render(), node => node.type === 'select')[0].props.onChange({ target: { value: '12' } });
  check(props.replaceId === '12', 'explicit version selection preserved: ' + role);
  reset({ versions: [{ id: 12, file_name: 'current.pdf', version_number: 3 }], replaceId: '12', replacementLocked: true });
  check(!html().includes('<select') && html().includes('#12'), 'explicit replacement context hides redundant choice: ' + role);
  check(props.replaceId === '12', 'replacement target never changed: ' + role);
  props.disabled = true;
  check(inputs('checkbox').every(node => node.props.disabled), 'busy/not-ready fields disabled: ' + role);
}

reset({ showAdministrativeMetadata: false });
check(render() === null, 'owner sees no properties heading/section when no meaningful version choice exists');
reset({ showAdministrativeMetadata: false, versions: [{ id: 12, file_name: 'current.pdf', version_number: 3 }] });
check(!html().includes('خصائص اختيارية') && !html().includes('انتهاء صلاحية') && !html().includes('فترة زمنية'), 'owner administrative metadata hidden');
check(html().includes('إصدار الدليل') && html().includes('<details'), 'owner retains only the meaningful optional version operation behind disclosure');
check(inputs('checkbox').length === 0 && inputs('date').length === 0, 'owner cannot fill optional administrative dates');

const pagePath = 'app/controls/[id]/evidence/new/page.tsx';
const page = readFileSync(pagePath, 'utf8');
const before = execFileSync('git', ['show', '2c49e4bc19a1008cdf4860374ea25e161de56fd8:' + pagePath], { encoding: 'utf8' });
const submit = text => text.slice(text.indexOf('  async function handleSubmit('), text.indexOf('  if(archived)return'));
check(submit(page) === submit(before), 'entire authenticated Storage/upload/command/error-cleanup/return handler byte-for-byte unchanged');
check(page.includes("requireProfile(['admin','cybersecurity_team','control_owner'])"), 'owner/admin/team entry guard unchanged');
check(page.indexOf('<h2>إرفاق الملف') < page.indexOf('<h2>وصف الدليل') && page.indexOf('<h2>وصف الدليل') < page.indexOf('<EvidenceSubmissionOptions'), 'file → optional description → optional properties');
check(page.includes("valid_until:validUntil||null,coverage_start:coverageStart||null,coverage_end:coverageEnd||null"), 'existing optional null payload unchanged');
check(!/uploaded_at\s*:|submitted_at\s*:/.test(page), 'upload/submission timestamps never supplied by client');
const trigger = readFileSync('supabase/migrations/20260916101814_grc_review_lifecycle.sql', 'utf8');
check(trigger.includes('new.uploaded_at:=now(); new.submitted_at:=now();'), 'existing system-generated creation timestamps');
check(page.includes('personalReturn??controlHref(controlId,context,"evidence")'), 'durable MyControls/Control360 return preserved');
check(!source.includes('new Date(') && !source.includes('today'), 'properties do not infer dates');
const roleViews = new Map();

// Exercise the real page under both approved roles with in-memory Auth/Storage/
// RPC doubles. No credentials or remote request are available to this harness.
for (const role of ['control_owner', 'admin', 'cybersecurity_team']) {
  let values = [], position = 0, effect;
  const commands = [], uploads = [], authCalls = [], navigations = [];
  const pageHooks = { ...React, useState(initial) { const index = position++; if (!(index in values)) values[index] = initial; return [values[index], value => { values[index] = value; }]; }, useEffect(callback) { effect ??= callback; } };
  const connection = {
    from(table) { return { select() { return this; }, eq() { return this; }, single() { return Promise.resolve({ data: { id: 42, control_code: '2-7-1', title_ar: 'Local test', frameworks: { code: 'DCC', is_active: true } }, error: null }); }, then(resolve) { return Promise.resolve({ data: table === 'evidence' ? [{ id: 12, file_name: 'current.pdf', version_number: 3 }] : [], error: null }).then(resolve); } }; },
    rpc(name, args) { commands.push({ name, args }); return Promise.resolve({ data: [], error: null }); },
    storage: { from(bucket) { return { upload(path, file, options) { uploads.push({ bucket, path, file, options }); return Promise.resolve({ error: null }); }, remove() { throw new Error('Unexpected cleanup in successful mock'); } }; } },
  };
  const testModule = { exports: {} }, query = new URLSearchParams('replace=12&from=my-controls&my_context=framework%3DDCC');
  const dependencies = {
    react: pageHooks, 'react/jsx-runtime': ReactJSX, 'next/link': { default: ({ children, ...rest }) => React.createElement('a', rest, children) },
    'next/navigation': { useParams: () => ({ id: '42' }), useSearchParams: () => query, useRouter: () => ({ push: url => navigations.push(url), refresh() {} }) },
    '@/lib/auth': { async requireProfile(allowed) { authCalls.push(allowed); return { user: { id: 'local-user' }, profile: { role } }; } },
    '@/lib/supabase': { supabase: connection }, '@/lib/ecc-strategy-example': { getEccOfficialTitle: () => undefined },
    '@/lib/control360': { controlContext: p => p, controlHref: (id, context, tab) => `/controls/${id}?${context}&tab=${tab}` },
    '@/lib/my-controls-context': { myControlsReturn: () => '/my-controls?framework=DCC' },
    '@/components/EvidenceSubmissionOptions': { default: Options }, './evidence-upload.css': {},
  };
  vm.runInNewContext(ts.transpileModule(page.replace('function NewEvidenceContent()', 'export function NewEvidenceContent()'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { module: testModule, exports: testModule.exports, URLSearchParams, window: { location: { search: '?' + query } }, crypto: { randomUUID: () => 'local-test-id' }, require(name) { if (name in dependencies) return dependencies[name]; throw new Error('Unexpected page dependency: ' + name); } });
  const pageRender = () => { position = 0; return testModule.exports.NewEvidenceContent(); };
  pageRender(); effect();
  for (let step = 0; step < 5; step++) await new Promise(resolve => setImmediate(resolve));
  let tree = pageRender();
  state = []; cursor = 0;
  roleViews.set(role, renderToStaticMarkup(tree));
  check(authCalls[0].join('|') === 'admin|cybersecurity_team|control_owner', 'actual page preserves entry roles: ' + role);
  check(commands.some(call => call.name === 'grc_control_mappings') === (role !== 'control_owner'), 'actual page preserves sharing read role split: ' + role);
  const optionNode = nodes(tree, node => node.type === Options)[0];
  check(optionNode.props.replacementLocked && optionNode.props.replaceId === '12' && !optionNode.props.disabled, 'actual page honors deterministic version context and ready state: ' + role);
  check(optionNode.props.showAdministrativeMetadata === (role !== 'control_owner'), 'actual page uses verified profile for metadata visibility: ' + role);
  const mockFile = { name: 'test.pdf', size: 1024, type: 'application/pdf' };
  nodes(tree, node => node.type === 'input' && node.props.type === 'file')[0].props.onChange({ target: { files: [mockFile] } });
  const descriptions = nodes(tree, node => node.type === 'textarea');
  check(descriptions.length === (role === 'control_owner' ? 0 : 1), 'actual page owner minimum form/team optional description: ' + role);
  if (descriptions.length) descriptions[0].props.onChange({ target: { value: 'local synthetic description' } });
  tree = pageRender();
  await nodes(tree, node => node.type === 'form')[0].props.onSubmit({ preventDefault() {} });
  const submitCall = commands.find(call => call.name === 'cgp_grc_command');
  check(submitCall.args.p_action === 'submit' && submitCall.args.p_control_id === 42 && submitCall.args.p_data.replaces_id === 12, 'actual page preserves command and version target: ' + role);
  check(submitCall.args.p_data.description === (role === 'control_owner' ? null : 'local synthetic description'), 'owner does not fabricate optional description, team retains existing field: ' + role);
  check(submitCall.args.p_data.valid_until === null && submitCall.args.p_data.coverage_start === null && submitCall.args.p_data.coverage_end === null, 'actual submission defaults all optional dates to null: ' + role);
  check(!('uploaded_at' in submitCall.args.p_data) && !('submitted_at' in submitCall.args.p_data), 'actual submission leaves timestamps system-generated: ' + role);
  check(uploads.length === 1 && uploads[0].bucket === 'evidence-files' && !uploads[0].options.upsert, 'actual upload uses unchanged non-overwrite contract: ' + role);
  check(navigations[0].includes('my_context=') && navigations[0].includes('tab=evidence'), 'actual success navigation preserves personal/control context: ' + role);
}
console.log(`PASS: ${checks} evidence submission presentation, owner/admin, optional-date interaction and unchanged-command assertions (no DB/Storage calls).`);

if (process.argv.includes('--visual')) {
  const { createServer } = await import('node:http');
  const css = readFileSync('app/controls/[id]/evidence/new/evidence-upload.css', 'utf8');
  createServer((req, res) => {
    const query = new URL(req.url, 'http://127.0.0.1:4189').searchParams;
    reset({ showAdministrativeMetadata: query.get('role') !== 'control_owner', versions: query.has('versions') ? [{ id: 12, file_name: 'example.pdf', version_number: 3 }] : [] });
    state = [query.has('validity'), query.has('coverage')];
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    const view = query.has('full') ? roleViews.get(query.get('role') || 'control_owner') : `<div class="evidence-upload-card">${html()}</div>`;
    res.end(`<!doctype html><html lang="ar" dir="rtl"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local synthetic evidence UX</title><style>body{font-family:Arial,sans-serif;margin:0;background:#f7f9f8}${css}</style><p>عرض محلي اصطناعي فقط — بلا اتصال أو حفظ</p>${view}</html>`);
  }).listen(4189, '127.0.0.1', () => console.log('LOCAL SYNTHETIC EVIDENCE: http://127.0.0.1:4189'));
}
