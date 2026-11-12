// AIEO v1: exactly one approved real-file fix; fail closed on source drift.
// No dynamic paths, shell commands, secrets, or arbitrary model-generated patches.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const path='components/FeedbackWidget.tsx';
const old='^\\/controls\\/(\\d+)';
const newValue='^\\/controls\\/(\\d+)(?:\\/|$)';
const source=readFileSync(path,'utf8');
const oldForm='const controlId = useMemo(() => /^\\/controls\\/(\\d+)/.exec(pagePath)?.[1] ?? null, [pagePath]);';
const updatedForm='const controlId = useMemo(() => /^\\/controls\\/(\\d+)(?:\\/|$)/.exec(pagePath)?.[1] ?? null, [pagePath]);';
if (source.includes(updatedForm)) {
 console.log('NO_CHANGE: approved repair already present');process.exit(0);
}
if(source.split(oldForm).length!==2) throw Error('Source mismatch: cannot safely apply patch');
const fixed=source.replace(oldForm,updatedForm);
if (fixed===source) throw Error('No safe change applied');
if(process.env.AIEO_APPLY==='1'){
 writeFileSync(path,fixed);
 console.log('CHANGED: bounded FeedbackWidget route repair');
}else{
 console.log('PASS: bounded real-file repair candidate validated; no file changes');
}
