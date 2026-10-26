'use strict';
const assert=require('node:assert/strict');
async function boot(engine,width,point={latitude:37.3392619,longitude:126.8215787,accuracy:15}){
 const browser=await engine.launch(),page=await browser.newPage({viewport:{width,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',timezoneId:'Asia/Seoul',permissions:['geolocation'],geolocation:point,...(engine.name()==='chromium'?{userAgent:'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36'}:{})}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date('2026-10-26T12:00:00+09:00'));await page.addInitScript(()=>{localStorage.setItem('shift_active_group','C');localStorage.setItem('shift_onboarding_v1','{"status":"existing"}');localStorage.setItem('shift_salary_config_master','{"hireDate":"2015-06-16","baseHourly":10320,"ordinaryHourly":11000}');});await page.route('**/api/**',r=>r.fulfill({json:{configured:false}}));await page.goto(process.env.TEST_URL||'http://127.0.0.1:8770');await page.evaluate(()=>switchView('all'));await page.locator('#commute-open').tap();await page.locator('#bus-period').selectOption('day');return {browser,page,errors};
}
async function booking(page){if(await page.evaluate(()=>history.state?.shiftBusResults)){await page.locator('#commute-back').tap();}await page.waitForFunction(()=>!document.getElementById('commute-dialog').classList.contains('bus-results-mode'));}
async function direction(page,value){await booking(page);await page.getByRole('button',{name:value,exact:true}).tap();}
async function period(page,value){await booking(page);await page.locator('#bus-period').selectOption(value);}
async function factory(page,value){await booking(page);await page.locator('#bus-factory').selectOption(value);}
async function browse(page,collapse=false){await booking(page);await page.getByRole('button',{name:collapse?'전체 노선 접기':'전체 노선 보기',exact:true}).tap();}
async function openSearch(page,q=''){if(await page.locator('#commute-dialog').evaluate(el=>el.classList.contains('bus-results-mode')))await page.locator('.bus-result-journey').tap();else await page.getByRole('button',{name:'통합 검색 열기',exact:true}).tap();await page.locator('#bus-unified-search:not([hidden])').waitFor();await page.locator('#bus-unified-input').fill(q);}
async function closed(page){await page.waitForFunction(()=>document.querySelector('#bus-unified-search').hidden);await page.waitForFunction(()=>!document.querySelector('.commute-page-body').inert);}
async function address(page,q,title){await booking(page);await openSearch(page,q);if(!await page.locator('.bus-unified-place').filter({has:page.locator('strong',{hasText:title})}).count()){await page.locator('.bus-unified-submit').tap();}await page.locator('.bus-unified-place').filter({has:page.locator('strong',{hasText:title})}).first().tap();await closed(page);}
async function routeSearch(page,q){await openSearch(page,q);await page.locator('.bus-unified-query-all').tap();await closed(page);}
async function gps(page){await booking(page);await page.locator('.bus-use-gps').tap();await page.waitForFunction(()=>document.querySelector('.bus-location-open strong')?.textContent==='현재 위치');}
async function query(page){await booking(page);await page.getByRole('button',{name:'버스 조회',exact:true}).tap();}
async function clean(page,errors){assert.equal(await page.locator('#commute-dialog').evaluate(el=>el.scrollWidth>el.clientWidth),false);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);}
module.exports={boot,booking,direction,period,factory,browse,openSearch,closed,address,routeSearch,gps,query,clean};
