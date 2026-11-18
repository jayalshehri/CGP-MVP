/**
 * Runs the production Nudee component's handlers with deterministic hook and
 * transport doubles. Not browser, authenticated E2E, RLS, or Storage API tests.
 * No network or database writes occur. Storage retention tests exercise only
 * client decisions under simulated outcomes; database guards need separate QA.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const ts = createRequire(import.meta.url)('typescript');
const tick = () => new Promise(resolve => setImmediate(resolve));
const text = node => node == null || typeof node === 'boolean' ? '' : Array.isArray(node) ? node.map(text).join('') : typeof node === 'object' ? text(node.props?.children) : String(node);
function walk(node, predicate) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(child => walk(child, predicate));
  return [...(predicate(node) ? [node] : []), ...walk(node.props?.children, predicate)];
}
const requirement = id => ({ id, source_row: id, standard_code: `QA-${id}`, domain_name: 'مجال اختبار', requirement_title: `متطلب ${id}`, maturity_level: 'المستوى 1: البناء', evidence_name: `دليل اختبار ${id}`, evidence_description: null, source_compliance: null });
const assignment = (id, status) => ({ id: id + 100, requirement_id: id, assignee_id: 'qa-owner', status, due_date: null, review_notes: null });

function createPage({ role = 'data_governance_team', initialStatus, empty = false } = {}) {
  const slots = [], effects = [];
  let cursor = 0;
  const calls = { rpc: [], upload: [], remove: [] };
  const transport = { failRead: false, submitError: null, confirmSubmission: false, failConfirmation: false };
  const db = {
    nudee_requirements: empty ? [] : [requirement(1), requirement(2)],
    nudee_assignments: empty || !initialStatus ? [] : [assignment(1, initialStatus), assignment(2, initialStatus)],
    nudee_submissions: [],
  };
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = initial;
      return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }];
    },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useCallback(callback) { cursor++; return callback; },
    useMemo(factory) { cursor++; return factory(); },
    useEffect(callback) { const i = cursor++; if (!(i in slots)) { slots[i] = true; effects.push(callback); } },
  };
  const supabase = {
    from(table) {
      let single = false;
      const result = () => single
        ? { data: transport.confirmSubmission ? { id: 500 } : null, error: transport.failConfirmation ? { message: 'confirmation offline' } : null }
        : transport.failRead ? { data: null, error: { message: 'reload offline' } } : { data: db[table], error: null };
      const query = {
        select() { return query; }, order() { return query; }, limit() { return query; }, eq() { return query; },
        maybeSingle() { single = true; return query; },
        then(resolve, reject) { return Promise.resolve().then(result).then(resolve, reject); },
      };
      return query;
    },
    async rpc(name, args) {
      if (name === 'nudee_assignees') return { data: [{ user_id: 'qa-owner', display_name: 'مالك اختبار', role: 'nudee_owner' }], error: null };
      calls.rpc.push({ name, args });
      await tick();
      if (name === 'nudee_submit_evidence' && transport.submitError) return { data: null, error: transport.submitError };
      if (name === 'nudee_assign' || name === 'nudee_assign_many') {
        const ids = name === 'nudee_assign' ? [args.p_requirement_id] : args.p_requirement_ids;
        for (const id of ids) {
          const previous = db.nudee_assignments.find(row => row.requirement_id === id);
          if (previous) { previous.assignee_id = args.p_assignee_id; previous.status = 'assigned'; }
          else db.nudee_assignments.push(assignment(id, 'assigned'));
        }
        return { data: ids.length, error: null };
      }
      if (name === 'nudee_review_evidence') {
        db.nudee_assignments = db.nudee_assignments.map(row => row.id === args.p_assignment_id ? { ...row, status: args.p_decision, review_notes: args.p_notes } : row);
      }
      return { data: null, error: null };
    },
    storage: {
      from() {
        return {
          async upload(path, file, options) { calls.upload.push({ path, file, options }); return { error: null }; },
          async remove(paths) { calls.remove.push(paths); return { error: null }; },
        };
      },
    },
  };
  const jsx = (type, props) => ({ type, props });
  const compiled = { exports: {} };
  const source = ts.transpileModule(readFileSync(new URL('../app/data-governance/nudee/page.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(source, {
    module: compiled, exports: compiled.exports,
    require(name) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
      if (name === '../nudee-workspace') return {
        NudeeHeading: 'header', NudeeMetric: 'article', NudeeNavigation: 'nav',
        formatCount: new Intl.NumberFormat('ar-SA'),
      };
      if (name === '@/lib/auth') return { requireProfile: async () => ({ user: { id: role === 'nudee_owner' ? 'qa-owner' : 'qa-office' }, profile: { role } }) };
      if (name === '@/lib/supabase') return { supabase };
      if (name.endsWith('.css')) return { default: {} };
      throw new Error(`Unexpected dependency: ${name}`);
    }, crypto: { randomUUID }, console, Date, Intl,
  });
  let tree;
  const render = () => { cursor = 0; tree = compiled.exports.default(); return tree; };
  const nodes = predicate => walk(tree, predicate);
  const button = label => {
    const matches = nodes(node => node.type === 'button' && text(node).includes(label));
    assert.equal(matches.length, 1, `one button: ${label}`); return matches[0];
  };
  const click = label => { const node = button(label); assert.ok(!node.props.disabled, `${label} enabled`); return node.props.onClick({ currentTarget: null }); };
  const byRole = expected => nodes(node => node.props?.role === expected).map(text).join(' ');
  const selectRequirement = id => { click(`دليل اختبار ${id}`); render(); };
  const change = (predicate, value) => { const [node] = nodes(predicate); assert.ok(node); node.props.onChange({ target: { value } }); render(); };
  return { calls, transport, db, render, nodes, button, click, byRole, selectRequirement, change,
    get tree() { return tree; },
    async init() { render(); effects.forEach(effect => effect()); await tick(); await tick(); render(); },
    selectBulk(id) { const [box] = nodes(n => n.type === 'input' && n.props['aria-label'] === `تحديد الدليل دليل اختبار ${id}`); assert.ok(!box.props.disabled); box.props.onChange({ target: { checked: true } }); render(); },
    chooseFile() { const [input] = nodes(n => n.props?.id === 'nudee-file'); input.props.onChange({ target: { files: [{ name: 'qa.pdf', type: 'application/pdf', size: 1234 }] } }); render(); },
  };
}

async function assertCommittedRefreshState(page, success) {
  page.render();
  assert.equal(page.byRole('alert'), '');
  assert.match(page.byRole('status'), success);
  assert.match(page.byRole('status'), /تعذر تحديث القائمة/);
  assert.equal(page.button('إعادة تحميل البيانات').props.disabled, false, 'pending released for retry');
}

test('single assignment: one write for concurrent triggers, committed success survives reload failure, retry guard', async () => {
  const page = createPage(); await page.init(); page.selectRequirement(1);
  page.change(n => n.props?.id === 'nudee-assignee', 'qa-owner');
  page.transport.failRead = true;
  const handler = page.button('حفظ التكليف').props.onClick;
  await Promise.all([handler(), handler()]);
  await assertCommittedRefreshState(page, /تم إنشاء التكليف/);
  assert.equal(page.calls.rpc.length, 1);
  assert.equal(page.button('حفظ التكليف').props.disabled, true);
  await page.button('حفظ التكليف').props.onClick();
  assert.equal(page.calls.rpc.length, 1, 'needsRefresh guards handler too');
  page.transport.failRead = false; await page.click('إعادة تحميل البيانات'); page.render();
  assert.equal(page.button('حفظ التكليف').props.disabled, false);
});

test('bulk assignment: no concurrent duplicate, committed count retained, newly selected item cannot bypass refresh guard', async () => {
  const page = createPage(); await page.init(); page.selectBulk(1);
  page.change(n => n.type === 'select' && !n.props.id, 'qa-owner');
  page.transport.failRead = true;
  const handler = page.button('إسناد المحدد').props.onClick;
  await Promise.all([handler(), handler()]);
  await assertCommittedRefreshState(page, /تم إسناد 1 متطلب بنجاح/);
  assert.equal(page.calls.rpc.length, 1);
  page.selectBulk(2);
  assert.equal(page.button('إسناد المحدد').props.disabled, true);
  await page.button('إسناد المحدد').props.onClick();
  assert.equal(page.calls.rpc.length, 1);
  page.transport.failRead = false; await page.click('إعادة تحميل البيانات'); page.render();
  assert.equal(page.button('إسناد المحدد').props.disabled, false);
});

for (const [buttonLabel, decision, success] of [
  ['اعتماد الدليل', 'approved', /تم اعتماد الدليل/],
  ['إعادة للتعديل', 'changes_requested', /أعيد الدليل للمكلّف/],
]) {
  test(`review ${decision}: commit is reconciled, same-event duplicates and stale follow-up decisions blocked`, async () => {
    const page = createPage({ initialStatus: 'submitted' }); await page.init(); page.selectRequirement(1);
    page.change(n => n.type === 'textarea', 'QA REVIEW NOTE');
    page.transport.failRead = true;
    const handler = page.button(buttonLabel).props.onClick;
    await Promise.all([handler(), handler()]);
    await assertCommittedRefreshState(page, success);
    assert.equal(page.calls.rpc.length, 1);
    assert.equal(page.calls.rpc[0].args.p_decision, decision);
    assert.equal(page.calls.rpc[0].args.p_notes, 'QA REVIEW NOTE');
    assert.equal(page.nodes(n => n.type === 'button' && text(n) === buttonLabel).length, 0, 'completed decision leaves current review panel');
    page.selectRequirement(2); page.change(n => n.type === 'textarea', 'NEXT NOTE');
    assert.equal(page.button(buttonLabel).props.disabled, true);
    await page.button(buttonLabel).props.onClick();
    assert.equal(page.calls.rpc.length, 1);
    page.transport.failRead = false; await page.click('إعادة تحميل البيانات'); page.render();
    assert.equal(page.button(buttonLabel).props.disabled, false);
  });
}

test('dedicated owner with no assignments receives normal empty state and no office actions', async () => {
  const page = createPage({ role: 'nudee_owner', empty: true }); await page.init();
  assert.equal(page.byRole('alert'), '');
  assert.match(text(page.tree), /لا توجد متطلبات مسندة إلى حسابك حاليًا/);
  assert.match(page.byRole('status'), /٠ من ٠ متطلب/);
  assert.equal(page.nodes(n => n.type === 'button' && /إسناد|اعتماد/.test(text(n))).length, 0);
  assert.equal(page.nodes(n => n.type === 'nav' && n.props.current === 'evidence').length, 0);
  assert.equal(page.calls.rpc.length, 0);
});

test('ambiguous upload response preserves binary and selected file; does not infer rollback from absent submission', async () => {
  const page = createPage({ role: 'nudee_owner', initialStatus: 'assigned' }); await page.init(); page.selectRequirement(1); page.chooseFile();
  page.transport.submitError = { code: 'PGRST_TIMEOUT', message: 'uncertain response' };
  await page.click('رفع وإرسال للمراجعة'); page.render();
  assert.equal(page.calls.upload.length, 1); assert.equal(page.calls.remove.length, 0);
  assert.match(page.byRole('alert'), /حالة الإرسال غير مؤكدة/);
  assert.equal(page.button('رفع وإرسال للمراجعة').props.disabled, false, 'file retained and pending released');
});

test('explicit upload submission rejection permits cleanup only after an absent-submission confirmation', async () => {
  const page = createPage({ role: 'nudee_owner', initialStatus: 'assigned' }); await page.init(); page.selectRequirement(1); page.chooseFile();
  page.transport.submitError = { code: '42501', message: 'explicit database rejection' };
  await page.click('رفع وإرسال للمراجعة'); page.render();
  assert.equal(page.calls.remove.length, 1);
  assert.equal(page.calls.remove[0][0], page.calls.upload[0].path);
  assert.equal(page.button('رفع وإرسال للمراجعة').props.disabled, false);
});

test('failed submission confirmation preserves uploaded binary even after explicit rejection', async () => {
  const page = createPage({ role: 'nudee_owner', initialStatus: 'assigned' }); await page.init(); page.selectRequirement(1); page.chooseFile();
  page.transport.submitError = { code: '42501', message: 'explicit rejection' };
  page.transport.failConfirmation = true;
  await page.click('رفع وإرسال للمراجعة'); page.render();
  assert.equal(page.calls.remove.length, 0);
  assert.match(page.byRole('alert'), /تعذر التحقق من حالة الإرسال/);
});
