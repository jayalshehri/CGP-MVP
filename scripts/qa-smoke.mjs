import { createClient } from '@supabase/supabase-js';

const PRODUCTION_DOMAIN = 'cgp-mvp-grc13.vercel.app';
const PRODUCTION_SUPABASE_REF = 'ahfindosbawqfvhbcplq';
const QA_SUPABASE_REF = 'lkozjnpfufdpzqtzdxhe';

function refuse(reason) {
  console.error(`SAFETY GUARD REFUSED: ${reason}`);
  console.error('This tool is blocked from running against Production to prevent accidental writes, data exposure, or credential misuse. Point CGP_BASE_URL and NEXT_PUBLIC_SUPABASE_URL at the QA/Preview environment instead.');
  process.exit(1);
}

const baseUrl = process.env.CGP_BASE_URL;
if (!baseUrl) {
  refuse('CGP_BASE_URL is not set. Refusing to default to any URL, including Production.');
}
if (baseUrl.includes(PRODUCTION_DOMAIN)) {
  refuse(`CGP_BASE_URL targets the Production domain (${PRODUCTION_DOMAIN}).`);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (supabaseUrl) {
  if (supabaseUrl.includes(PRODUCTION_SUPABASE_REF)) {
    refuse(`NEXT_PUBLIC_SUPABASE_URL targets the Production Supabase project (${PRODUCTION_SUPABASE_REF}).`);
  }
  if (!supabaseUrl.includes(QA_SUPABASE_REF)) {
    refuse(`NEXT_PUBLIC_SUPABASE_URL does not match the approved QA Supabase project (${QA_SUPABASE_REF}).`);
  }
}

console.log(`Safety guard passed: target is not Production.`);

const routes = ['/login', '/', '/controls', '/tasks', '/evidence', '/review', '/reports', '/executive', '/change-password'];
let failed = false;

console.log(`CGP smoke QA: ${baseUrl}`);

for (const route of routes) {
  try {
    const response = await fetch(`${baseUrl}${route}`, { redirect: 'manual' });
    const ok = response.status >= 200 && response.status < 400;
    console.log(`${ok ? 'PASS' : 'FAIL'} route ${route}: HTTP ${response.status}`);
    if (!ok) failed = true;
  } catch (error) {
    console.log(`FAIL route ${route}: ${error.message}`);
    failed = true;
  }
}

const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const email = process.env.QA_EMAIL;
const password = process.env.QA_PASSWORD;

if (supabaseUrl && anonKey && email && password) {
  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: signIn, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError || !signIn.user) {
    console.log(`FAIL login: ${signInError?.message || 'No authenticated user'}`);
    failed = true;
  } else {
    console.log(`PASS login: ${signIn.user.email}`);

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role,is_active')
      .eq('user_id', signIn.user.id)
      .maybeSingle();

    if (profileError || !profile || profile.is_active === false) {
      console.log(`FAIL profile/role check: ${profileError?.message || 'Inactive/missing profile'}`);
      failed = true;
    } else {
      console.log(`PASS profile/role check: ${profile.role}`);

      let taskQuery = supabase
        .from('controls')
        .select('id,control_code,title_ar,control_owner_id', { count: 'exact' });

      // Deliberately unfiltered: this checks database RLS, not only UI filtering.

      const { data: tasks, error: taskError, count } = await taskQuery.limit(5);
      if (taskError) {
        console.log(`FAIL tasks query: ${taskError.message}`);
        failed = true;
      } else if (profile.role === 'control_owner' && tasks.some(task => task.control_owner_id !== signIn.user.id)) {
        console.log('FAIL owner scope: another owner control is visible'); failed = true;
      } else {
        console.log(`PASS tasks query: ${count ?? tasks?.length ?? 0} visible task(s)`);
      }
    }

    const { data: stats, error: dashboardError } = await supabase.rpc('cgp_dashboard');
    if (dashboardError || !stats) { console.log('FAIL live dashboard'); failed = true; }
    else console.log(`PASS live dashboard: ${stats.total} controls`);
    await supabase.auth.signOut();
  }
} else {
  console.log('SKIP authenticated QA: set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, QA_EMAIL and QA_PASSWORD.');
}

if (failed) process.exit(1);
console.log('HTTP smoke checks passed. See authenticated PASS/SKIP results above.');
