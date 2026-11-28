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
  const next = page.locator('#home-pager-next');
  const previous = page.locator('#home-pager-prev');
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
  const home = page.locator('#home');
  assert(await home.getByRole('heading', { level: 1, name: '교대근무, 한눈에.', exact: true }).isVisible());
  assert(await home.getByText('근무표부터 예상 급여까지.', { exact: true }).isVisible());
  assert.equal(await home.getByRole('link', { name: '웹에서 시작하기' }).getAttribute('href'), '#login');
  assert.equal(await home.getByRole('link', { name: 'iPhone 앱 받기' }).getAttribute('href'), 'https://apps.apple.com/kr/app/id6832033312');

  const art = home.locator('img.hero-calendar');
  assert(await art.isVisible());
  const alt = await art.getAttribute('alt');
  for (const label of ['C조', '22', '28', '주간', '휴무']) assert(alt.includes(label), `calendar image describes ${label}`);
  const rendered = await art.evaluate(async image => {
    await image.decode();
    const rect = image.getBoundingClientRect();
    const panel = document.getElementById('home').getBoundingClientRect();
    const candidates = image.srcset.split(',').map(item =>
      new URL(item.trim().split(/\s+/)[0], document.baseURI).href);
    return {
      loaded: image.naturalWidth > 0 && image.naturalHeight > 0,
      matchingSource: candidates.length > 1 && candidates.includes(image.currentSrc),
      centerOffset: Math.abs((rect.left + rect.right - panel.left - panel.right) / 2),
    };
  });
  assert(rendered.loaded && rendered.matchingSource, `calendar artwork loads at ${width}px`);
  assert(rendered.centerOffset <= 8, `calendar artwork is centered at ${width}px`);
  // A visitor who has not clicked the page yet can still use keyboard navigation.
  await page.keyboard.press('ArrowRight');
  await atPanel('features');
  await page.keyboard.press('ArrowLeft');
  await atPanel('home');
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
  await page.mouse.wheel(Math.round(width * 0.55), 0);
  await atPanel('features');
  await page.waitForFunction(() => location.hash === '#features');
  await page.reload();
  await atPanel('features');
  await page.locator('[data-home-go="themes"]').click();
  await atPanel('themes');
  await page.reload();
  await atPanel('themes');
  await page.goto(base + '/#themes');
  await atPanel('themes');
  await page.goto(base + '/#login');
  await atPanel('login');
  const oldRecords = page.locator('#login a[href="/origin-transfer"]');
  const existingDetails = page.locator('#login details');
  if (await existingDetails.count()) await existingDetails.locator('summary').click();
  assert(await oldRecords.isVisible(), 'old records recovery is discoverable from the login panel');
}

// The source window contains only test records. The exchange endpoint is stubbed
// so the test exercises browser messaging and the real restore UI without a live account.
async function checkTransferResults(browser) {
  const source = 'https://old-records.example';
  const cases = [
    { values: {}, expected: /기록을 찾지 못/ },
    { values: { shift_origin_ready_v1: '1' }, expected: /기록을 찾지 못/ },
    { values: { shift_active_group: 'A' }, expected: /모두 새 주소/ },
    { values: { shift_active_group: 'A', shift_transfer_sample: 'fixture' }, expected: /1개 항목/ },
  ];
  for (const { values, expected } of cases) {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.route('**/origin-migration-config.json', route => route.fulfill({
        json: { source, target: base, sources: [source] }
      }));
      let exchanges = 0;
      await page.route('**/api/origin-transfer?action=exchange', route => {
        exchanges++;
        return route.fulfill({ json: { ok: true } });
      });
      await context.route(source + '/**', route => route.fulfill({
        contentType: 'text/html; charset=utf-8', body: '<button>복사하기</button>'
      }));
      await page.goto(base + '/origin-transfer');
      await page.evaluate(() => localStorage.setItem('shift_active_group', 'C'));
      const opened = page.waitForEvent('popup');
      await page.locator('#transfer:enabled').click();
      const popup = await opened;
      await popup.waitForURL(source + '/origin-transfer.html#**');
      await popup.evaluate(({ base, values }) => {
        const state = new URLSearchParams(location.hash.slice(1)).get('state');
        document.querySelector('button').onclick = () => {
          const message = { type: 'work-routine-transfer', state, ticket: 'fixture', data: { version: 1, values } };
          window.opener.postMessage(message, base);
          window.opener.postMessage(message, base);
        };
      }, { base, values });
      await popup.getByRole('button', { name: '복사하기' }).click();
      await page.locator('#status').filter({ hasText: expected }).waitFor();
      assert.equal(exchanges, 1, 'repeated source message triggers one transfer');
      assert.equal(new URL(page.url()).pathname, '/origin-transfer', 'result stays visible until acknowledged');
      assert.equal(await page.evaluate(() => localStorage.getItem('shift_active_group')), 'C');
      assert.equal(await page.evaluate(() => localStorage.getItem('shift_origin_ready_v1')), null);
      assert.equal(await page.evaluate(() => localStorage.getItem('shift_transfer_sample')), values.shift_transfer_sample ?? null);
      await page.locator('#start').click();
      await page.waitForURL(base + '/?cloud=connect#login');
    } finally {
      await context.close();
    }
  }
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
    await page.getByRole('link', { name: '웹에서 시작하기' }).click();
    assert.equal(new URL(page.url()).hash, sharedHash, 'homepage section links do not erase the share token');
    assert.equal(await page.locator('[data-home-go][aria-current=step]').getAttribute('data-home-go'), 'login');

    for (const suffix of ['?google=denied#login', '?apple=denied', '?login=unavailable']) {
      await page.goto(base + '/welcome' + suffix);
      const message = page.locator('#welcome-login-status');
      await message.waitFor({ state: 'visible' });
      assert.equal(await page.locator('[aria-current="step"]').getAttribute('data-home-go'), 'login');
      assert(await message.evaluate(el => !el.closest('[inert]')), 'login feedback is available to assistive technology');
      const rect = await message.boundingBox();
      assert(rect && rect.x >= 0 && rect.x + rect.width <= width + 1, 'login feedback is onscreen');
      if (suffix.endsWith('unavailable')) assert(await page.locator('#welcome-retry').isVisible());
    }

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
    await page.route('**/origin-migration-config.json', route => route.fulfill({ status: 503, body: '' }), { times: 1 });
    await page.reload();
    await page.locator('#retry-transfer:visible').waitFor();
    assert(await page.locator('#start').isEnabled(), 'return to login when the old address cannot be loaded');
    assert(await page.locator('#cloud-login').isVisible());
    await page.locator('#retry-transfer').click();
    await page.locator('#transfer:enabled').waitFor();
    assert(await page.locator('#retry-transfer').isHidden());
    assert.deepEqual(errors, []);

    if (engine === chromium && width === 1280) await checkTransferResults(browser);

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
