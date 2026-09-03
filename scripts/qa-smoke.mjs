import { createClient } from '@supabase/supabase-js';

const baseUrl = process.env.CGP_BASE_URL || 'https://cgp-mvp-grc13.vercel.app';
const routes = ['/login', '/', '/controls', '/tasks', '/change-password'];
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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
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

      if (profile.role === 'control_owner') {
        taskQuery = taskQuery.eq('control_owner_id', signIn.user.id);
      }

      const { data: tasks, error: taskError, count } = await taskQuery.limit(5);
      if (taskError) {
        console.log(`FAIL tasks query: ${taskError.message}`);
        failed = true;
      } else {
        console.log(`PASS tasks query: ${count ?? tasks?.length ?? 0} visible task(s)`);
      }
    }

    await supabase.auth.signOut();
  }
} else {
  console.log('SKIP authenticated QA: set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, QA_EMAIL and QA_PASSWORD.');
}

if (failed) process.exit(1);
console.log('CGP smoke QA completed successfully.');
