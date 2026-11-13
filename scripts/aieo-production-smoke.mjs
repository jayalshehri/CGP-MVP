const origin = 'https://cgp-mvp-grc13.vercel.app';
const routes = ['/login', '/', '/controls', '/tasks', '/evidence', '/review', '/reports', '/executive'];

for (const route of routes) {
  try {
    const response = await fetch(new URL(route, origin), {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
    });
    await response.body?.cancel();
    const location = response.headers.get('location');
    const redirect = location && new URL(location, origin);
    const redirectsToLogin = route !== '/login' &&
      [302, 303, 307, 308].includes(response.status) &&
      redirect && redirect.origin === origin && redirect.pathname === '/login';
    const passed = (response.status === 200 &&
      response.headers.get('content-type')?.includes('text/html')) || redirectsToLogin;
    console.log(`${passed ? 'PASS' : 'FAIL'} ${route} HTTP ${response.status}`);
    if (!passed) process.exitCode = 1;
  } catch (error) {
    console.log(`ERROR ${route} ${error.name}`);
    process.exitCode = 1;
  }
}
console.log('NOT TESTED: authenticated pages, database access, and evidence lifecycle');
