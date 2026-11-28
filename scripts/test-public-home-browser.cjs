'use strict';

const assert = require('node:assert/strict');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const base = (process.env.TEST_URL || 'http://127.0.0.1:8787').replace(/\/+$/, '');
const versionHeaders = process.env.TEST_WORKER_VERSION
    ? { 'Cloudflare-Workers-Version-Overrides': `work-routine="${process.env.TEST_WORKER_VERSION}"` }
    : {};
const guestCookies = [
  '',
  '__Host-work-routine-ready=1',
  '__Host-shiftcal-google=expired-session',
  '__Host-shiftcal-apple=expired-session',
];
const workspaceRoutes = [
  '/index', '/index.html', '/index/', '/app', '/app/', '/app.html', '/%69ndex.html', '//index.html',
  '/?open=bus-search', '/bus-stop-locations', '/local-food.html', '/meal-animation-options', '/shared-schedule.html',
];
const legacyRecords = {
  shift_origin_ready_v1: '1',
  shift_active_group: 'C',
  shift_day_memos: JSON.stringify({ '2026-11-24': '기존 기기 테스트 메모' }),
  shift_salary_config_master: JSON.stringify({ baseHourly: 11050, ordinaryHourly: 14482 }),
};

function calendarMarkup(html) {
  return /\bid=["'](?:view-calendar|calendar-grid|account-restore-screen)["']/i.test(html);
}

async function readGuestPage(context, pathname, cookie) {
  const headers = cookie ? { Cookie: cookie } : {};
  const response = await context.request.get(base + pathname, { headers });
  const body = await response.text();
  assert(!calendarMarkup(body), `${pathname} exposed the calendar shell without a session`);
  assert.equal(response.status(), 200, pathname);
  assert.match(response.headers()['content-type'] || '', /text\/html/i, pathname);
  assert.match(body, /근무 루틴/, pathname);
  return body;
}

async function checkLegalLinks(page) {
  for (const [label, publicPath] of [[/개인정보처리방침/, '/privacy'], [/이용약관/, '/terms']]) {
    const link = page.getByRole('link', { name: label }).first();
    assert(await link.isVisible(), `${publicPath} link is visible`);
    const target = new URL(await link.getAttribute('href'), page.url());
    assert.equal(target.pathname.replace(/\.html$/, ''), publicPath);
    const response = await page.context().request.get(base + target.pathname);
    assert.equal(response.status(), 200, publicPath);
    assert.match(await response.text(), label, publicPath);
  }
}

async function checkPager(page, width) {
  const current = page.locator('[data-home-go][aria-current="step"]');
  const next = page.getByRole('button', { name: '다음 화면' });
  const previous = page.getByRole('button', { name: '이전 화면' });
  const pager = page.locator('#home-pager');
  async function atPanel(id) {
    await page.waitForFunction(id => {
      const selected = document.querySelector('[data-home-go][aria-current="step"]')?.dataset.homeGo;
      const pager = document.getElementById('home-pager');
      const panel = document.getElementById(id);
      return selected === id && !panel.inert &&
        Math.abs(pager.scrollLeft - pager.clientWidth * [...pager.children].indexOf(panel)) < 2;
    }, id);
    assert.equal(await current.getAttribute('data-home-go'), id);
    assert.equal(await pager.locator('.home-panel:not([inert])').count(), 1);
  }

  await atPanel('home');
  assert(await previous.isDisabled());
  assert.equal(await page.locator('.preview-calendar td').count(), 35, 'calendar preview stays on the first panel');
  assert.match(await page.getByRole('link', { name: 'iPhone 앱 받기' }).getAttribute('href'), /apps\.apple\.com/);
  await next.click();
  await atPanel('features');
  const guide = page.getByRole('link', { name: '교대생활 가이드 보기' });
  assert.equal(new URL(await guide.getAttribute('href'), page.url()).pathname, '/shift-life-guide');
  await next.click();
  await atPanel('themes');
  assert(await page.getByRole('heading', { name: '달력 테마', exact: false }).isVisible());
  await page.setViewportSize({ width: width + 31, height: 820 });
  await atPanel('themes');
  await page.setViewportSize({ width, height: 850 });
  await atPanel('themes');
  await next.click();
  await atPanel('login');
  assert(await next.isDisabled());
  await previous.click();
  await atPanel('themes');
  await page.getByRole('button', { name: '처음', exact: true }).click();
  await atPanel('home');

  // Trackpads and mobile swipes both use the same native scroll-snap track.
  await pager.hover({ position: { x: 60, y: 60 } });
  await page.mouse.wheel(width, 0);
  await atPanel('features');
  await page.goto(base + '/#themes');
  await atPanel('themes');
  await page.goto(base + '/#login');
  await atPanel('login');
  await page.getByText('이전에 저장한 기록이 있나요?', { exact: true }).click();
  assert.equal(await page.getByRole('link', { name: '이전 웹 주소의 브라우저 기록 가져오기' }).getAttribute('href'), '/origin-transfer');
}

async function checkBrowser(engine, width) {
  const browser = await engine.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width, height: 850 }, locale: 'ko-KR', extraHTTPHeaders: versionHeaders });
  try {
    const homepage = await readGuestPage(context, '/');
    for (const cookie of guestCookies) {
      for (const path of ['/', '/login', ...workspaceRoutes]) {
        assert.equal(await readGuestPage(context, path, cookie), homepage,
          `${path} should show the same public homepage for ${cookie.split('=')[0] || 'a new visitor'}`);
      }
    }

    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/apple-account?*', route => {
      if (new URL(route.request().url()).searchParams.get('action') === 'status') {
        return route.fulfill({ json: { configured: true } });
      }
      return route.continue();
    });
    await page.addInitScript(records => {
      if (sessionStorage.getItem('public-home-browser-seeded')) return;
      for (const [key, value] of Object.entries(records)) localStorage.setItem(key, value);
      sessionStorage.setItem('public-home-browser-seeded', '1');
    }, legacyRecords);

    await page.goto(base + '/');
    await page.getByRole('heading', { level: 1 }).first().waitFor();
    assert.equal(await page.locator('#view-calendar').count(), 0, 'no protected DOM is attached');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px horizontal overflow`);
    await checkLegalLinks(page);
    await checkPager(page, width);

    for (const [path, entry] of [['/local-food.html#login', 'local-food'], ['/bus-stop-locations#features', 'bus-stop-locations']]) {
      await page.goto(base + path);
      assert.equal(new URL(page.url()).searchParams.get('entry'), entry, 'preserve the verified login destination');
      assert.equal(await page.evaluate(() => scrollY), 0, 'guest feature links enter at the top of the homepage');
      assert.equal(await page.locator('#view-calendar').count(), 0);
    }

    const sharedHash = '#live=' + 'a'.repeat(64);
    await page.goto(base + '/shared-schedule.html' + sharedHash);
    assert.equal(new URL(page.url()).searchParams.get('entry'), 'shared-schedule');
    assert.equal(new URL(page.url()).hash, sharedHash, 'keep the public share token in the browser fragment');
    assert.equal(await page.evaluate(() => scrollY), 0);
    await page.getByRole('link', { name: '웹에서 로그인' }).click();
    assert.equal(new URL(page.url()).hash, sharedHash, 'homepage section links do not erase the share token');
    assert.equal(await page.locator('[data-home-go][aria-current=step]').getAttribute('data-home-go'), 'login');

    await page.goto(base + '/login');
    const google = page.locator('#welcome-google-login');
    await google.waitFor({ state: 'visible' });
    const login = new URL(await google.getAttribute('href'), page.url());
    assert.equal(login.pathname, '/api/google-calendar');
    assert.equal(login.searchParams.get('action'), 'login');
    assert.notEqual(await google.getAttribute('aria-disabled'), 'true');
    const apple = page.locator('#welcome-apple-login');
    await apple.waitFor({ state: 'visible' });
    const appleLogin = new URL(await apple.getAttribute('href'), page.url());
    assert.equal(appleLogin.pathname, '/api/apple-account');
    assert.equal(appleLogin.searchParams.get('action'), 'login');
    assert.notEqual(await apple.getAttribute('aria-disabled'), 'true', 'available Apple login is actionable');
    assert.equal(await page.locator('#view-calendar').count(), 0);
    assert.deepEqual(await page.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])), Object.keys(legacyRecords)), legacyRecords, 'neither public page rewrites local app records');
    assert.deepEqual(errors, [], 'no uncaught page errors');

    await page.goto(base + '/origin-transfer');
    await page.locator('#transfer:enabled').waitFor();
    assert.equal(await page.locator('input[type=file], #file-area, #source-file, #overwrite').count(), 0);
    assert(await page.locator('#cloud-login').isVisible(), 'Google recovery stays available');

    const noScripts = await browser.newContext({ javaScriptEnabled: false, viewport: { width, height: 850 }, extraHTTPHeaders: versionHeaders });
    try {
      const staticHome = await noScripts.newPage();
      await staticHome.goto(base + '/');
      assert(await staticHome.getByRole('heading', { level: 1 }).first().isVisible());
      await checkLegalLinks(staticHome);
    } finally {
      await noScripts.close();
    }

    // Only a test fixture may provide this value. Production smoke tests run anonymously.
    if (process.env.TEST_SESSION_COOKIE) {
      for (const path of ['/', '/app']) {
        const authenticated = await context.request.get(base + path, { headers: { Cookie: process.env.TEST_SESSION_COOKIE } });
        assert.equal(authenticated.status(), 200, path);
        assert(calendarMarkup(await authenticated.text()), `${path} did not render the app for a verified fixture session`);
        assert.match(authenticated.headers()['cache-control'] || '', /no-store/i, path);
      }
      assert.equal(await readGuestPage(context, '/app', guestCookies[1]), homepage);
    }

    console.log(`PASS ${engine.name()} ${width}px: anonymous route guards, stale cookie denial, login entry, public policies, and retained local records`);
  } finally {
    await context.close();
    await browser.close();
  }
}

(async () => {
  for (const [engine, width] of [[webkit, 390], [chromium, 320], [chromium, 1280]]) await checkBrowser(engine, width);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
