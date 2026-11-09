'use strict';

const assert = require('node:assert/strict');
const {webkit, chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.TEST_URL || 'http://127.0.0.1:8768/';
const day = '2026-11-25';

async function verify(browser, width, height, theme, reducedMotion) {
    const page = await browser.newPage({viewport: {width, height}, isMobile: width < 600, hasTouch: width < 600, reducedMotion, timezoneId: 'Asia/Seoul'});
    try {
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.clock.setFixedTime(new Date('2026-11-10T12:00:00+09:00'));
        await page.route('**/api/**', route => route.fulfill({json: {configured: false}}));
        if (url.startsWith('https:')) {
            await page.context().addCookies([{name: '__Host-work-routine-ready', value: '1', url, secure: true, sameSite: 'Lax'}]);
        }
        await page.addInitScript(theme => {
            if (localStorage.getItem('shift_active_group')) return;
            localStorage.setItem('shift_origin_ready_v1', '1');
            localStorage.setItem('shift_active_group', 'C');
            localStorage.setItem('shift_display_theme', theme);
            localStorage.setItem('shift_onboarding_v1', '{"status":"existing"}');
            localStorage.setItem('shift_salary_config_master', JSON.stringify({hireDate: '2015-01-01', baseHourly: 11050, ordinaryHourly: 14482, leaveByYear: {2026: 19}, leaveManualYears: {2026: true}}));
        }, theme);
        await page.goto(url);

        const editor = page.locator('#modal-override > .override-sheet');
        const trigger = editor.locator('.design-attendance');
        const picker = page.locator('#attendance-picker');
        const settings = page.locator('#leave-settings-dialog');
        const close = picker.getByRole('button', {name: '뒤로', exact: true});
        const choose = type => picker.locator(`[data-override="${type}"]`);
        const waitForPicker = async () => {
            await picker.waitFor({state: 'visible'});
            await page.waitForFunction(() => {
                const sheet = document.querySelector('#attendance-picker');
                const bounds = sheet.getBoundingClientRect();
                return sheet.open && bounds.bottom <= innerHeight + 1 && sheet.getAnimations().every(animation => animation.playState !== 'running');
            });
        };
        const open = async () => {
            await trigger.click();
            await waitForPicker();
        };
        const returned = async () => {
            await picker.waitFor({state: 'hidden'});
            await editor.waitFor({state: 'visible'});
            await page.waitForFunction(() => document.activeElement.matches('.design-attendance'));
        };

        await page.locator(`.cal-day[data-date="${day}"] .day-num`).click();
        await open();
        assert(await editor.isHidden(), 'The shift editor must not show behind the attendance sheet');
        assert.equal(await editor.evaluate(node => getComputedStyle(node.parentElement).backgroundColor), 'rgba(0, 0, 0, 0)', 'Only the attendance sheet should dim the calendar');
        assert.equal(await page.locator('dialog[open]').count(), 1);
        assert.equal(await picker.locator('#attendance-picker-balance').textContent(), '남은 연차 19일');
        assert(await picker.locator('.attendance-unpaid').isHidden());
        const fit = await picker.evaluate(node => {
            const bounds = node.getBoundingClientRect();
            const row = node.querySelector('[data-override=LEAVE]');
            const text = row.querySelector('.design-choice-label').getBoundingClientRect();
            return {
                top: bounds.top,
                bottom: bounds.bottom,
                inset: text.left - row.getBoundingClientRect().left,
                overflow: document.documentElement.scrollWidth > innerWidth
            };
        });
        assert(!fit.overflow && fit.inset >= 12 && fit.top >= height * 0.17 && fit.bottom <= height + 1, JSON.stringify(fit));
        if (process.env.ATTENDANCE_PROOF_DIR) {
            await page.screenshot({path: `${process.env.ATTENDANCE_PROOF_DIR}/${browser.browserType().name()}-${width}-${theme}.png`, animations: 'disabled'});
        }

        await close.click();
        await returned();
        await open();
        await page.mouse.click(12, 32);
        await returned();
        await open();
        await page.keyboard.press('Escape');
        await returned();

        await open();
        await picker.locator('#attendance-picker-settings').click();
        await settings.waitFor({state: 'visible'});
        assert(await picker.isHidden());
        assert(await editor.isHidden());
        assert.equal(await page.locator('dialog[open]').count(), 1);
        const leaveTotal = settings.locator('#input-total-leave');
        await leaveTotal.fill('0');
        await leaveTotal.press('Tab');
        await settings.getByRole('button', {name: '완료', exact: true}).click();
        await waitForPicker();
        assert(await settings.isHidden());
        assert(await editor.isHidden());
        assert.equal(await picker.locator('#attendance-picker-balance').textContent(), '남은 연차 0일');

        const finalOption = choose('UNPAID_HALF_POST');
        await finalOption.scrollIntoViewIfNeeded();
        const rowBounds = await finalOption.boundingBox();
        assert(rowBounds.y >= 0 && rowBounds.y + rowBounds.height <= height + 1, JSON.stringify(rowBounds));
        assert(await close.isVisible());
        await finalOption.click();
        await returned();
        assert.equal(await page.evaluate(day => JSON.parse(localStorage.getItem('shift_overrides_C'))[day], day), 'UNPAID_HALF_POST');
        assert.equal(await editor.locator('#design-ot-toggle').getAttribute('aria-checked'), 'false');

        await open();
        await picker.locator('.sheet-dismiss-handle').evaluate(handle => {
            const {x, y, width} = handle.getBoundingClientRect();
            for (const [type, offset] of [['touchstart', 0], ['touchmove', 120], ['touchend', 120]]) {
                const touch = {clientX: x + width / 2, clientY: y + 10 + offset};
                const event = new Event(type, {bubbles: true, cancelable: true});
                Object.defineProperties(event, {touches: {value: type === 'touchend' ? [] : [touch]}, changedTouches: {value: [touch]}});
                handle.dispatchEvent(event);
            }
        });
        await returned();
        assert.deepEqual(errors, []);
        console.log('PASS', browser.browserType().name(), width, height, theme, 'single sheet, safe bounds, close and focus, settings, unpaid selection, and swipe');
    } finally {
        await page.close();
    }
}

(async () => {
    await Promise.all([webkit, chromium].map(async engine => {
        const browser = await engine.launch();
        try {
            for (const [width, height, theme, motion] of [[390, 844, 'current', 'no-preference'], [320, 375, 'dark', 'reduce'], [1280, 900, 'current', 'reduce']]) {
                await verify(browser, width, height, theme, motion);
            }
        } finally {
            await browser.close();
        }
    }));
})().catch(error => { console.error(error); process.exitCode = 1; });
