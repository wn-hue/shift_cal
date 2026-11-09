'use strict';

const assert = require('node:assert/strict');
const { webkit, chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.TEST_URL || 'http://localhost:8768/';
const date = '2026-10-03';

async function verify(engine, browser, width, theme) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, timezoneId: 'Asia/Seoul', reducedMotion: 'reduce' });
    try {
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.clock.setFixedTime(new Date('2026-10-25T12:00:00+09:00'));
        await page.addInitScript(theme => {
            localStorage.setItem('shift_origin_ready_v1', '1');
            if (localStorage.getItem('shift_active_group')) return;
            localStorage.setItem('shift_active_group', 'C');
            localStorage.setItem('shift_display_theme', theme);
            localStorage.setItem('shift_onboarding_v1', JSON.stringify({ status: 'existing' }));
            localStorage.setItem('shift_salary_config_master', JSON.stringify({ hireDate: '2015-06-16', baseHourly: 10320, ordinaryHourly: 11000 }));
        }, theme);
        await page.route('**/api/**', route => route.fulfill({ json: { configured: false } }));
        await page.goto(url);

        const day = page.locator(`.cal-day[data-date="${date}"]`);
        const sticker = day.locator('.calendar-sticker');
        const trigger = page.getByRole('button', { name: '날짜 스티커 선택', exact: true });
        const picker = page.locator('#sticker-dialog');
        const options = picker.locator('#calendar-sticker-options');
        const choice = id => options.locator(`[data-sticker="${id}"]`);
        const clear = picker.locator('#calendar-sticker-clear');
        const draft = page.locator('#memo-inline-input');
        const openPicker = async () => {
            await trigger.click();
            await picker.waitFor({ state: 'visible' });
        };
        const select = async id => {
            await choice(id).click();
            await picker.waitFor({ state: 'hidden' });
        };

        await day.locator('.day-num').click();
        await openPicker();
        assert.equal(await options.getByRole('button').count(), 14);
        const assets = await options.locator('img').evaluateAll(async images => {
            await Promise.all(images.map(image => image.decode()));
            return images.every(image => image.naturalWidth > 0);
        });
        assert(assets);
        assert(await clear.isDisabled());
        await select('soju');
        assert.equal(await trigger.locator('img').getAttribute('src'), './assets/stickers/soju.svg?v=2');
        assert.equal(await sticker.getAttribute('alt'), '소주 스티커');

        await openPicker();
        assert.equal(await choice('soju').getAttribute('aria-pressed'), 'true');
        await select('soju');
        assert.equal(await sticker.getAttribute('alt'), '소주 스티커');

        await draft.fill('메모와 스티커 같이 저장');
        await openPicker();
        await select('cake');
        assert.equal(await sticker.getAttribute('aria-label'), '케이크 스티커');
        assert.equal(await sticker.locator('text').textContent(), '🎂');
        assert.equal(await draft.inputValue(), '메모와 스티커 같이 저장');
        assert.equal(await page.evaluate(date => JSON.parse(localStorage.getItem('shift_day_stickers'))[date], date), undefined);
        await page.locator('#memo-inline-save').click();

        await page.reload();
        assert.equal(await sticker.getAttribute('aria-label'), '케이크 스티커');
        await page.evaluate(() => {
            localStorage.setItem('shift_account_owner_v1', 'test-account');
            CalendarStickers.ownerChanged();
        });
        assert.equal(await sticker.count(), 0);
        await page.evaluate(() => {
            localStorage.removeItem('shift_account_owner_v1');
            CalendarStickers.ownerChanged();
        });
        assert.equal(await sticker.getAttribute('aria-label'), '케이크 스티커');

        await day.locator('.day-num').click();
        await openPicker();
        await clear.click();
        await picker.waitFor({ state: 'hidden' });
        assert.equal(await sticker.count(), 0);
        assert.equal(await day.locator('.memo-tag').textContent(), '메모와 스티커 같이 저장');

        await page.setViewportSize({ width, height: 360 });
        await openPicker();
        const last = choice('jjamppong');
        await last.scrollIntoViewIfNeeded();
        const lastBounds = await last.boundingBox();
        assert(lastBounds.y >= 0 && lastBounds.y + lastBounds.height <= 360);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await select('jjamppong');

        await page.reload();
        assert.equal(await sticker.getAttribute('alt'), '짬뽕 스티커');
        const bounds = await day.evaluate(cell => {
            const shift = cell.querySelector('.shift-badge').getBoundingClientRect();
            const sticker = cell.querySelector('.calendar-sticker').getBoundingClientRect();
            return { cell: cell.getBoundingClientRect().toJSON(), shift: shift.toJSON(), sticker: sticker.toJSON() };
        });
        assert(bounds.sticker.top >= bounds.shift.bottom && bounds.sticker.left >= bounds.cell.left && bounds.sticker.right <= bounds.cell.right + 1);
        assert.deepEqual(errors, []);
        console.log(engine.name(), width, theme, 'passed sticker selection, persistence, account isolation and memo preservation');
    } finally {
        await page.close();
    }
}

(async () => {
    for (const engine of [webkit, chromium]) {
        const browser = await engine.launch();
        try {
            for (const [width, theme] of [[320, 'test'], [390, 'current'], [320, 'test1'], [320, 'test3'], [320, 'test4']]) {
                await verify(engine, browser, width, theme);
            }
        } finally {
            await browser.close();
        }
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
