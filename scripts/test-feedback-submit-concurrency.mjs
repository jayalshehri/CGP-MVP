import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Execute the actual component's submit handler with inert React/JSX hooks and
// a mocked Supabase client. No network, credentials, browser or database writes.
// The hook stub intentionally keeps the same handler between two events,
// reproducing the interval before a React state update is rendered.
const source = readFileSync(new URL('../components/FeedbackWidget.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  target: ts.ScriptTarget.ES2022, esModuleInterop: true
}}).outputText;

function mount({ getUser, insert, online = true }) {
  let stateIndex = 0;
  const states = [];
  const react = {
    useState(initial) {
      const i = stateIndex++;
      states[i] = i === 0 ? true : i === 3 ? 'Synthetic QA message' : initial;
      return [states[i], value => { states[i] = value; }];
    },
    useRef: initial => ({ current: initial }),
    useMemo: fn => fn(),
  };
  const makeElement = (type, props) => ({ type, props });
  const supabase = {
    auth: { getUser },
    from(table) {
      assert.equal(table, 'feedback');
      return { insert };
    },
  };
  const context = {
    exports: {},
    navigator: { onLine: online },
    require(name) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx: makeElement, jsxs: makeElement, Fragment: Symbol('Fragment') };
      if (name === '@supabase/supabase-js') return {
        isAuthRetryableFetchError: e => e?.retryable === true,
        isAuthSessionMissingError: e => e?.missing === true,
      };
      if (name === '@/lib/supabase') return { supabase };
      if (name === '@/components/AccessibleDialog') return function MockDialog() {};
      throw Error('Unexpected import in isolated feedback test: ' + name);
    },
  };
  runInNewContext(compiled, context, { timeout: 1000 });
  const tree = context.exports.default({ pagePath: '/controls/12', visible: true });
  function findForm(node) {
    if (Array.isArray(node)) {
      for (const child of node) { const found = findForm(child); if (found) return found; }
      return null;
    }
    if (!node || typeof node !== 'object') return null;
    return node.type === 'form' ? node : findForm(node.props?.children);
  }
  const form = findForm(tree);
  assert.ok(form, 'actual feedback component must render a submit form');
  return { submit: () => form.props.onSubmit({ preventDefault() {} }), states, navigator: context.navigator };
}

const authOk = () => ({ data: { user: { id: 'qa-user' } }, error: null });
const insertOk = () => ({ error: null, status: 201 });
const baseline = process.env.AIEO_EXPECT_BASELINE_DUPLICATE === '1';

test(baseline ? 'baseline demonstrates duplicate in-flight submissions' : 'blocks duplicate submission before React rerender', async () => {
  let authCalls = 0, inserts = 0;
  const pending = [];
  const app = mount({
    getUser: () => { authCalls++; return new Promise(resolve => pending.push(resolve)); },
    insert: async row => { inserts++; assert.equal(row.control_id, 12); return insertOk(); },
  });
  const first = app.submit();
  const second = app.submit();
  for (const resolve of pending) resolve(authOk());
  await Promise.all([first, second]);
  assert.equal(authCalls, baseline ? 2 : 1);
  assert.equal(inserts, baseline ? 2 : 1);
});

if (!baseline) {
  test('releases submission lock after an offline attempt', async () => {
    let inserts = 0;
    const app = mount({ online: false, getUser: async () => authOk(), insert: async () => { inserts++; return insertOk(); } });
    await app.submit();
    assert.equal(app.states[4], 'error');
    assert.equal(inserts, 0);
    app.navigator.onLine = true;
    await app.submit();
    assert.equal(inserts, 1);
    assert.equal(app.states[4], 'success');
  });

  test('releases submission lock after a thrown insert and allows retry', async () => {
    let inserts = 0;
    const app = mount({ getUser: async () => authOk(), insert: async () => {
      if (++inserts === 1) throw Error('mock network failure');
      return insertOk();
    }});
    await app.submit();
    assert.equal(app.states[4], 'error');
    await app.submit();
    assert.equal(inserts, 2);
    assert.equal(app.states[4], 'success');
  });

  test('releases submission lock after an authentication failure', async () => {
    let authCalls = 0, inserts = 0;
    const app = mount({
      getUser: async () => ++authCalls === 1
        ? { data: { user: null }, error: { status: 401 } }
        : authOk(),
      insert: async () => { inserts++; return insertOk(); },
    });
    await app.submit();
    assert.equal(app.states[4], 'error');
    assert.equal(inserts, 0);
    await app.submit();
    assert.equal(inserts, 1);
    assert.equal(app.states[4], 'success');
  });
}
