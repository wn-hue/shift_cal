'use strict';
const assert = require('node:assert/strict');
const {webkit, chromium} = require(process.env.PLAYWRIGHT_MODULE);

// The new surface stylesheet must not change any calendar or navigation styles.
async function calendarSnapshot(page) {
 return page.evaluate(() => [...document.querySelectorAll('#view-calendar, #view-calendar *, .reference-header, .reference-header *, .bottom-nav, .bottom-nav *')].map(el => {
  const style = getComputedStyle(el), box = el.getBoundingClientRect();
  return [el.tagName, el.id, [box.x, box.y, box.width, box.height], ...Array.from(style, name => [name, style.getPropertyValue(name)])];
 }));
}
(async () => {
 for (const engine of [webkit, chromium]) {
  const browser = await engine.launch();
  for (const width of [320,390,412]) {
   const page = await browser.newPage({viewport:{width,height:844},isMobile:true,reducedMotion:'reduce'});
   const errors=[]; page.on('pageerror', error => errors.push(error.message));
   await page.addInitScript(() => {
    localStorage.setItem('shift_active_group','C');
    localStorage.setItem('shift_salary_config_master',JSON.stringify({baseHourly:10320,ordinaryHourly:11000,hireDate:'2015-06-16'}));
   });
   await page.route('**/api/**', route => route.fulfill({json:{configured:false}}));
   await page.goto(process.env.CHECK_URL || 'http://127.0.0.1:8769/');
   await page.evaluate(() => document.fonts.ready);
   for (const theme of ['current','toss','gpt','dark']) {
    await page.evaluate(theme => {
     document.getElementById('pref-theme').value=theme;
     document.getElementById('pref-theme').dispatchEvent(new Event('change'));
     switchView('calendar'); scrollTo(0,0);
    },theme);
    const redesigned = await calendarSnapshot(page);
    await page.evaluate(() => {document.querySelector('link[href*="mobile-surfaces.css"]').disabled=true});
    assert.deepEqual(await calendarSnapshot(page),redesigned,`${engine.name()} ${width} ${theme}: calendar/header/nav changed`);
    await page.evaluate(() => {document.querySelector('link[href*="mobile-surfaces.css"]').disabled=false});
    for (const view of ['payroll','menu','all']) {
     await page.evaluate(view => switchView(view),view);
     assert(await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth),`${view} horizontal overflow`);
    }
    await page.evaluate(() => openAppPreferences());
    assert(await page.locator('#app-preferences-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth));
    const switchControl=page.getByRole('switch',{name:'공휴일 이름'});
    const checked=await switchControl.isChecked();
    await switchControl.click(); assert.equal(await switchControl.isChecked(),!checked);
    await switchControl.click(); assert.equal(await switchControl.isChecked(),checked);
    const select=page.locator('#pref-theme'); assert((await select.boundingBox()).height>=44);
    await page.getByRole('button',{name:'앱 환경 닫기',exact:true}).click();
   }
   assert.deepEqual(errors,[]);
   await page.close(); console.log('PASS unchanged calendar/header/nav + secondary-page widths + settings switches',engine.name(),width,'4 themes');
  }
  await browser.close();
 }
})().catch(error=>{console.error(error);process.exit(1)});
