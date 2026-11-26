// Regression harness for three UI-only maintenance tasks; no network or live data.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const [task, mode] = process.argv.slice(2);
assert.ok(['baseline', 'candidate'].includes(mode), 'explicit test mode required');
const baseline = mode === 'baseline';

function load(path, imports = {}, globals = {}) {
  const source = readFileSync(path, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  });
  const exports = {};
  const jsx = (type, props) => ({ type, props });
  runInNewContext(outputText, {
    exports, URLSearchParams,
    require(name) {
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (Object.hasOwn(imports, name)) return imports[name];
      throw Error('Unexpected isolated regression import: ' + name);
    },
    ...globals,
  }, { timeout: 1000 });
  return exports;
}

if (task === 'status-label-fallback') {
  const { statusText, default: Badge } = load('components/StatusBadge.tsx');
  assert.equal(statusText('IMPLEMENTED'), 'مطبق كليًا');
  assert.equal(statusText('unknown_status'), 'unknown_status');
  if (baseline) {
    assert.equal(typeof statusText('constructor'), 'function');
    assert.equal(typeof statusText('__proto__'), 'object');
    assert.equal(statusText('   '), '   ');
  } else {
    for (const value of ['constructor', '__proto__', 'hasOwnProperty', ' unknown_status ']) {
      assert.equal(statusText(value), value.trim());
    }
    assert.equal(statusText('   '), 'غير محدد');
    assert.equal(Badge({ status: '__proto__' }).props.children[1], '__proto__');
  }
} else if (task === 'dialog-busy-accessibility') {
  let closed = 0;
  const { default: Dialog } = load('components/AccessibleDialog.tsx', {
    react: { useRef: value => ({ current: value }), useEffect() {} },
    './accessible-dialog.css': {},
  });
  const render = busy => Dialog({ busy, labelledBy: 'title', backdropClassName: 'backdrop',
    className: 'panel', children: 'QA', onClose() { closed++; } });
  const active = render(true), idle = render(false);
  assert.equal(active.type, 'dialog');
  assert.equal(active.props['aria-labelledby'], 'title');
  assert.equal(active.props['aria-busy'], baseline ? undefined : true);
  assert.equal(idle.props['aria-busy'], baseline ? undefined : false);
  let prevented = 0;
  active.props.onCancel({ preventDefault() { prevented++; } });
  assert.equal(closed, 0);
  idle.props.onCancel({ preventDefault() { prevented++; } });
  assert.equal(closed, 1);
  assert.equal(prevented, 2);
} else if (task === 'strategy-filter-anchor') {
  const events = [];
  const location = { pathname: '/roadmap', search: '?q=old', hash: '#section' };
  const history = {
    replaceState(...args) { events.push(['replace', args[2]]); },
    pushState(...args) { events.push(['push', args[2]]); },
  };
  const { updateStrategyQuery, projectIdFromPath } = load('lib/strategy-navigation.ts', {}, {
    window: { location, history },
  });
  assert.equal(projectIdFromPath('12'), 12);
  assert.equal(projectIdFromPath('12junk'), null);
  updateStrategyQuery('q', 'new');
  assert.deepEqual(events.pop(), ['replace', '/roadmap?q=new' + (baseline ? '' : '#section')]);
  updateStrategyQuery('priority', 'P1');
  assert.deepEqual(events.pop(), ['push', '/roadmap?q=old&priority=P1' + (baseline ? '' : '#section')]);
  updateStrategyQuery('q', 'old');
  assert.equal(events.length, 0);
  location.hash = '';
  updateStrategyQuery('q', '');
  assert.deepEqual(events.pop(), ['replace', '/roadmap']);
} else {
  throw Error('unapproved regression task');
}

console.log(task + ': ' + mode + ' confirmed');
