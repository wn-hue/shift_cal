const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const script = fs.readFileSync('native-bridge.js', 'utf8');
async function main() {
  let requests = [], opened = [], listeners = {}, alerts = [];
  const original = async (...args) => { requests.push(args); return new Response('{}'); };
  const window = { fetch: original, alert: text => alerts.push(text), Capacitor: { isNativePlatform: () => true, Plugins: {
    Browser: { open: async value => opened.push(value) },
    CapacitorHttp: { get: async value => { requests.push(value); return { status: 200, data: { meals: [] } }; } }
  } } };
  vm.runInNewContext(script, { window, document: { addEventListener: (name, fn) => listeners[name] = fn },
    location: { href: 'https://localhost/', origin: 'https://localhost' }, URL, Response, DOMException, setTimeout, clearTimeout });
  const status = await window.fetch('/api/google-calendar?action=status');
  assert.equal((await status.json()).connected, false);
  const denied = await window.fetch('/api/google-calendar?action=save', { body: 'private-payroll' });
  assert.equal(denied.status, 409);
  assert.equal(requests.length, 0, 'Personal settings must not be transmitted by preview');
  await window.fetch('/api/today-menu', { body: 'private-payroll' });
  assert.deepEqual(requests.map(x => x.url), ['https://h-lyart-ten.vercel.app/api/today-menu']);
  assert.equal(requests[0].connectTimeout, 15000);
  assert.equal(requests[0].readTimeout, 45000);
  assert.equal(requests[0].body, undefined);
  assert.equal(requests[0].headers, undefined);
  await window.fetch(new URL('https://localhost/api/today-menu'));
  let prevented = false;
  listeners.click({ target: { closest: () => ({ href: 'https://localhost/api/google-calendar?action=login' }) },
    preventDefault: () => prevented = true });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(prevented, true);
  assert.equal(opened[0].url, 'https://h-lyart-ten.vercel.app/#all');
  listeners.click({ target: {} });
  listeners.click({ target: { closest: () => ({ href: 'https://example.com/api/google-calendar?action=login' }) },
    preventDefault: () => assert.fail('External links must retain their destination') });
  assert.equal(opened.length, 1);
  window.Capacitor.Plugins.Browser.open = async () => { throw new Error('Browser unavailable'); };
  listeners.click({ target: { closest: () => ({ href: 'https://localhost/api/google-calendar?action=login' }) },
    preventDefault: () => {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(alerts.length, 1, 'Browser failure must be visible to the user');
  const controller = new AbortController();
  window.Capacitor.Plugins.CapacitorHttp.get = async () => new Promise(() => {});
  const pending = window.fetch('/api/today-menu', { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, error => error.name === 'AbortError');
  const before = requests.length;
  await assert.rejects(window.fetch('/api/today-menu', { signal: controller.signal }), error => error.name === 'AbortError');
  assert.equal(requests.length, before, 'Already cancelled request must not contact the server');
  window.Capacitor.Plugins.CapacitorHttp.get = async () => { throw new Error('Native network error'); };
  await assert.rejects(window.fetch('/api/today-menu'), error => error.message === 'Failed to fetch');
  let expire, timeoutDelay;
  const stalledWindow = { fetch: original, Capacitor: { isNativePlatform: () => true, Plugins: {
    CapacitorHttp: { get: async () => new Promise(() => {}) }
  } } };
  vm.runInNewContext(script, { window: stalledWindow,
    document: { addEventListener: () => {} }, location: { href: 'https://localhost/', origin: 'https://localhost' },
    URL, Response, DOMException, setTimeout: (fn, delay) => { expire = fn; timeoutDelay = delay; return 1; }, clearTimeout: () => {} });
  const stalled = stalledWindow.fetch('/api/today-menu');
  assert.equal(timeoutDelay, 45000);
  expire();
  await assert.rejects(stalled, error => error.name === 'TimeoutError');
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
