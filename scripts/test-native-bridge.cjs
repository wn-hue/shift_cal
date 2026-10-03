const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const script = fs.readFileSync('native-bridge.js', 'utf8');
async function main() {
  let requests = [], opened = [], listeners = {};
  const original = async (...args) => { requests.push(args); return new Response('{}'); };
  const window = { fetch: original, Capacitor: { isNativePlatform: () => true, Plugins: {
    Browser: { open: async value => opened.push(value) },
    CapacitorHttp: { get: async value => { requests.push(value); return { status: 200, data: { meals: [] } }; } }
  } } };
  vm.runInNewContext(script, { window, document: { addEventListener: (name, fn) => listeners[name] = fn },
    location: { href: 'https://localhost/', origin: 'https://localhost' }, URL, Response });
  const status = await window.fetch('/api/google-calendar?action=status');
  assert.equal((await status.json()).connected, false);
  const denied = await window.fetch('/api/google-calendar?action=save', { body: 'private-payroll' });
  assert.equal(denied.status, 409);
  assert.equal(requests.length, 0, 'Personal settings must not be transmitted by preview');
  await window.fetch('/api/today-menu', { body: 'private-payroll' });
  assert.deepEqual(requests.map(x => x.url), ['https://h-lyart-ten.vercel.app/api/today-menu']);
  assert.equal(Object.keys(requests[0]).length, 1);
  let prevented = false;
  listeners.click({ target: { closest: () => ({ href: 'https://localhost/api/google-calendar?action=login' }) },
    preventDefault: () => prevented = true });
  assert.equal(prevented, true);
  assert.equal(opened[0].url, 'https://h-lyart-ten.vercel.app/#all');
  const webWindow = { fetch: original };
  vm.runInNewContext(script, { window: webWindow });
  assert.equal(webWindow.fetch, original, 'Website must retain existing behavior');
  for (const asset of ['google-sync.js', 'account-sync.js', 'privacy.html', 'calendar-ui.css', 'google-signin.png']) {
    assert.ok(fs.existsSync('www/' + asset), 'Mobile bundle missing ' + asset);
  }
  assert.ok(!fs.existsSync('www/api'), 'Server code must not be bundled');
  console.log('PASS: native preview privacy, external Google browser, public meals, web isolation and bundled assets.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
