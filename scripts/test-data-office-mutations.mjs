/**
 * Executes the production page event handlers with deterministic React-hook and
 * transport doubles. These are component-logic regressions, NOT browser, RLS or
 * authenticated integration tests. No network or database writes occur.
 */
import * as dates from '../lib/dates.ts';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const tick = () => new Promise(resolve => setImmediate(resolve));
const text = node => node == null || typeof node === 'boolean' ? '' : Array.isArray(node) ? node.map(text).join('') : typeof node === 'object' ? text(node.props?.children) : String(node);
function walk(node, predicate) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(child => walk(child, predicate));
  return [...(predicate(node) ? [node] : []), ...walk(node.props?.children, predicate)];
}

function createPage(kind, seed = []) {
  const slots = [];
  const effects = [];
  let index = 0;
  const calls = { insert: [], rpc: [] };
  const transport = { failRead: false, failInsert: false, failRpc: false };
  const data = {
    data_assets: kind === 'assets' ? seed : [],
    data_governance_requests: kind === 'requests' ? seed : [],
    data_governance_request_events: [],
    data_quality_assessments: [],
    privacy_processing_activities: [],
    data_sharing_requests: [],
  };
  const react = {
    Fragment: 'fragment',
    useState(initial) {
      const i = index++;
      if (!(i in slots)) slots[i] = initial;
      return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }];
    },
    useRef(initial) { const i = index++; return slots[i] ??= { current: initial }; },
    useCallback(callback) { index++; return callback; },
    useEffect(callback) { const i = index++; if (!(i in slots)) { slots[i] = true; effects.push(callback); } },
  };
  const jsx = (type, props) => ({ type, props });
  const supabase = {
    from(table) {
      return {
        select() { return { order: async () => transport.failRead ? { data: null, error: { message: 'read offline' } } : { data: data[table], error: null } }; },
        async insert(payload) {
          calls.insert.push(payload);
          await tick();
          if (transport.failInsert) return { error: { code: 'NETWORK', message: 'lost response' } };
          data[table] = [{ id: 17, ...payload }, ...data[table]];
          return { error: null };
        },
      };
    },
    async rpc(name, args) {
      calls.rpc.push({ name, args });
      await tick();
      if (transport.failRpc) throw new Error('network unavailable');
      return { data: null, error: null };
    },
  };
  const testModule = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(`../app/data-governance/${kind}/page.tsx`, import.meta.url), 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(code, {
    module: testModule, exports: testModule.exports,
    require(name) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
      if (name === '@/lib/auth') return { requireProfile: async () => ({ user: { id: 'qa-office' }, profile: { role: 'data_governance_team' } }) };
      if (name === '@/lib/supabase') return { supabase };
      if (name === '@/lib/dates') return dates;
      if (name.endsWith('.css')) return {};
      throw new Error(`Unexpected module: ${name}`);
    },
    crypto: { randomUUID }, Intl, Date, console,
  });
  let tree;
  const render = () => { index = 0; tree = testModule.exports.default(); return tree; };
  const button = label => {
    const matches = walk(tree, n => n.type === 'button' && text(n).includes(label));
    assert.equal(matches.length, 1, `one button: ${label}`);
    return matches[0];
  };
  const click = label => { const b = button(label); assert.ok(!b.props.disabled, `${label} enabled`); return b.props.onClick(); };
  const form = () => walk(tree, n => n.type === 'form')[0];
  const input = value => walk(tree, n => n.type === 'input' && n.props.value === value)[0];
  const byRole = role => walk(tree, n => n.props?.role === role).map(text).join(' ');
  return { render, button, click, form, input, byRole, transport, calls,
    get tree() { return tree; },
    async init() { render(); effects.forEach(effect => effect()); await tick(); await tick(); render(); },
    async openForm() { click({ assets: 'إضافة أصل بيانات', requests: 'طلب جديد', quality: 'تقييم جديد', privacy: 'نشاط معالجة', sharing: 'طلب مشاركة' }[kind]); render(); },
    setFirstInput(value) { walk(tree, n => n.type === 'input')[0].props.onChange({ target: { value } }); render(); },
  };
}

test('asset insert failure preserves entered data and releases pending state', async () => {
  const page = createPage('assets'); await page.init(); await page.openForm();
  page.setFirstInput('QA-ASSET-1'); page.transport.failInsert = true;
  await page.form().props.onSubmit({ preventDefault() {} }); page.render();
  assert.ok(page.form(), 'form remains open');
  assert.ok(page.input('QA-ASSET-1'), 'entered code retained');
  assert.match(page.byRole('alert'), /احتفظنا بالحقول/);
  assert.equal(page.button('حفظ الأصل').props.disabled, false);
});

test('asset double submit makes one insert, and committed save survives refresh failure', async () => {
  const page = createPage('assets'); await page.init(); await page.openForm(); page.setFirstInput('QA-ASSET-2');
  page.transport.failRead = true;
  const handler = page.form().props.onSubmit;
  await Promise.all([handler({ preventDefault() {} }), handler({ preventDefault() {} })]); page.render();
  assert.equal(page.calls.insert.length, 1);
  assert.equal(page.form(), undefined);
  assert.equal(page.byRole('alert'), '');
  assert.match(page.byRole('status'), /تم حفظ أصل البيانات بنجاح/);
  assert.match(page.byRole('status'), /تعذر تحديث السجل/);
  assert.equal(page.button('تحديث السجل').props.disabled, false);
  assert.equal(page.button('إضافة أصل بيانات').props.disabled, true);
  page.transport.failRead = false; await page.click('تحديث السجل'); page.render();
  assert.equal(page.button('إضافة أصل بيانات').props.disabled, false);
});

test('initial read failure is not presented as an empty asset register', async () => {
  const page = createPage('assets'); page.transport.failRead = true; await page.init();
  assert.doesNotMatch(text(page.tree), /لا توجد أصول بيانات مسجلة/);
  assert.match(text(page.tree), /تعذر تحميل أصول البيانات/);
  assert.equal(page.button('إضافة أصل بيانات').props.disabled, true);
});

const request = { id: 9, request_code: 'QA-REQUEST', request_type: 'data_sharing', title_ar: 'طلب اختبار', business_owner: 'مالك', data_steward: null, status: 'submitted', review_comment: null, last_action_at: null, created_at: '2026-11-17T00:00:00Z' };

test('request transition exception retains notes and releases processing', async () => {
  const page = createPage('requests', [request]); await page.init(); page.click('فتح الاعتماد'); page.render();
  walk(page.tree, n => n.type === 'textarea')[0].props.onChange({ target: { value: 'QA NOTE' } }); page.render();
  page.transport.failRpc = true; await page.click('بدء مراجعة أمين البيانات'); page.render();
  assert.equal(walk(page.tree, n => n.type === 'textarea')[0].props.value, 'QA NOTE');
  assert.equal(page.button('بدء مراجعة أمين البيانات').props.disabled, false);
  assert.match(page.byRole('alert'), /احتفظنا بالملاحظة/);
});

test('committed request transition is successful even when refresh fails; stale actions blocked', async () => {
  const page = createPage('requests', [request]); await page.init(); page.click('فتح الاعتماد'); page.render();
  page.transport.failRead = true;
  await page.click('بدء مراجعة أمين البيانات'); page.render();
  assert.equal(page.byRole('alert'), '');
  assert.match(page.byRole('status'), /تم حفظ الإجراء/);
  assert.equal(page.button('بدء مراجعة أمين البيانات').props.disabled, true);
  assert.equal(page.button('تحديث الطلبات').props.disabled, false);
});

test('request concurrent submissions are locked and uncertain retry retains its unique code', async () => {
  const page = createPage('requests'); await page.init(); await page.openForm(); page.setFirstInput('QA OWNER');
  page.transport.failInsert = true;
  let handler = page.form().props.onSubmit;
  await Promise.all([handler({ preventDefault() {} }), handler({ preventDefault() {} })]); page.render();
  assert.equal(page.calls.insert.length, 1); assert.ok(page.form()); assert.ok(page.input('QA OWNER'));
  handler = page.form().props.onSubmit; await handler({ preventDefault() {} }); page.render();
  assert.equal(page.calls.insert.length, 2);
  assert.equal(page.calls.insert[0].request_code, page.calls.insert[1].request_code);
  assert.equal(page.button('إرسال للمراجعة').props.disabled, false);
});


for (const [kind, submitLabel, openLabel] of [
  ['quality', 'حفظ التقييم', 'تقييم جديد'],
  ['privacy', 'حفظ النشاط', 'نشاط معالجة'],
  ['sharing', 'إرسال للمراجعة', 'طلب مشاركة'],
]) {
  test(`${kind}: rejected insert preserves fields, releases pending and serializes duplicate events`, async () => {
    const page = createPage(kind); await page.init(); await page.openForm(); page.setFirstInput('QA RETAIN');
    page.transport.failInsert = true;
    const handler = page.form().props.onSubmit;
    await Promise.all([handler({ preventDefault() {} }), handler({ preventDefault() {} })]); page.render();
    assert.equal(page.calls.insert.length, 1);
    assert.ok(page.input('QA RETAIN')); assert.ok(page.form());
    assert.match(page.byRole('alert'), /احتفظنا بالحقول/);
    assert.equal(page.button(submitLabel).props.disabled, false);
  });

  test(`${kind}: post-commit reload failure preserves successful outcome and permits refresh`, async () => {
    const page = createPage(kind); await page.init(); await page.openForm(); page.setFirstInput('QA COMMIT');
    page.transport.failRead = true;
    await page.form().props.onSubmit({ preventDefault() {} }); page.render();
    assert.equal(page.byRole('alert'), ''); assert.equal(page.form(), undefined);
    assert.match(page.byRole('status'), /تم حفظ/);
    assert.match(page.byRole('status'), /تعذر تحديث السجل/);
    assert.equal(page.button('تحديث السجل').props.disabled, false);
    assert.equal(page.button(openLabel).props.disabled, true);
    page.transport.failRead = false; await page.click('تحديث السجل'); page.render();
    assert.equal(page.button(openLabel).props.disabled, false);
  });

  test(`${kind}: load failure is an error with retry, not an empty register`, async () => {
    const page = createPage(kind); page.transport.failRead = true; await page.init();
    assert.match(text(page.tree), /تعذر تحميل السجل/);
    assert.match(text(page.tree), /لم تتوفر بيانات السجل بعد/);
    assert.equal(page.button(openLabel).props.disabled, true);
    assert.equal(page.button('تحديث السجل').props.disabled, false);
  });
}
