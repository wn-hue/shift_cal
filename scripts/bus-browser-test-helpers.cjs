'use strict';
const assert=require('node:assert/strict');
async function boot(engine,width,point={latitude:37.3392619,longitude:126.8215787,accuracy:15}){
 const browser=await engine.launch(),page=await browser.newPage({viewport:{width,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',timezoneId:'Asia/Seoul',permissions:['geolocation'],geolocation:point,...(engine.name()==='chromium'?{userAgent:'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36'}:{})}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date('2026-10-26T12:00:00+09:00'));await page.addInitScript(()=>{localStorage.setItem('shift_active_group','C');localStorage.setItem('shift_onboarding_v1','{"status":"existing"}');localStorage.setItem('shift_salary_config_master','{"hireDate":"2015-06-16","baseHourly":10320,"ordinaryHourly":11000}');});await page.route('**/api/**',r=>r.fulfill({json:{configured:false}}));await page.goto(process.env.TEST_URL||'http://127.0.0.1:8770');await page.evaluate(()=>switchView('all'));await page.locator('#commute-open').tap();await page.locator('#bus-period').selectOption('day');
 return {browser,page,errors};
}
async function address(page,query,title){await page.locator('.bus-location-open').tap();await page.locator('#bus-location-picker[open]').waitFor();await page.locator('#bus-location-picker .bus-place-input').fill(query);await page.locator('#bus-location-picker .bus-place-submit').tap();await page.locator('#bus-location-picker .bus-place-choice').filter({has:page.locator('strong',{hasText:title})}).first().tap();await page.waitForFunction(()=>!document.querySelector('#bus-location-picker').open);}
async function gps(page){await page.locator('.bus-use-gps').tap();await page.waitForFunction(()=>!document.querySelector('#bus-location-picker').open&&document.querySelector('.bus-location-open strong')?.textContent==='현재 위치');}
async function query(page){await page.getByRole('button',{name:'버스 조회',exact:true}).tap();}
async function clean(page,errors){assert.equal(await page.locator('#commute-dialog').evaluate(el=>el.scrollWidth>el.clientWidth),false);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);}
module.exports={boot,address,gps,query,clean};
