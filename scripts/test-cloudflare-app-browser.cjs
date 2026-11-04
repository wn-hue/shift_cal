'use strict';
const assert=require('node:assert/strict'),{chromium,webkit}=require('playwright'),cfg=require('../origin-migration-config.json');
(async()=>{
 for(const [name,engine,width]of[['webkit',webkit,390],['chromium',chromium,320]]){
  const browser=await engine.launch({headless:true}),context=await browser.newContext({viewport:{width,height:844}});
  try{
   const legacy=await context.newPage();await legacy.goto(cfg.source+'/origin-transfer.html');await legacy.locator('#transfer').waitFor();
   const original={shift_active_group:'C',shift_day_memos:JSON.stringify({'2026-11-04':'이전 테스트 메모'}),shift_salary_config_master:JSON.stringify({baseHourly:11050,ordinaryHourly:14482,hireDate:'2020-01-01'})};
   await legacy.evaluate(values=>{for(const[k,v]of Object.entries(values))localStorage.setItem(k,v);},original);await legacy.close();
   const page=await context.newPage();await page.goto(cfg.target+'/');await page.locator('#transfer').waitFor();assert(page.url().includes('origin-transfer'));
   assert.equal(await page.evaluate(()=>localStorage.getItem('shift_salary_config_master')),null,'first-visit gate must precede default-setting writes');
   console.log('CHECK '+name+': migration welcome ready');const popupWait=page.waitForEvent('popup');await page.locator('#transfer').click();const popup=await popupWait;await popup.waitForURL(cfg.source+'/**');await popup.locator('#transfer').waitFor();
   console.log('CHECK '+name+': source popup ready');await popup.locator('#transfer').click();await page.waitForURL(cfg.target+'/',{timeout:30000});await page.locator('#view-calendar').waitFor({state:'attached'});
   const copied=await page.evaluate(()=>({memo:localStorage.getItem('shift_day_memos'),group:localStorage.getItem('shift_active_group'),salary:JSON.parse(localStorage.getItem('shift_salary_config_master'))}));assert.equal(copied.memo,original.shift_day_memos);assert.equal(copied.group,'C');assert.equal(copied.salary.baseHourly,11050);
   assert.deepEqual(await popup.evaluate(keys=>Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)])),Object.keys(original)),original,'original local data must remain unchanged');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'mobile horizontal overflow');
   await page.reload();assert(!page.url().includes('origin-transfer'));
   const health=await (await context.request.get(cfg.target+'/api/hosting-status')).json();assert.equal(health.hosting,'cloudflare');assert.equal(health.dataService,'vercel');
   const account=await (await context.request.get(cfg.target+'/api/account?action=status')).json();assert.equal(account.configured,true);assert.equal(account.connected,false);
   const bad=await context.request.post(cfg.target+'/api/origin-transfer?action=issue',{headers:{Origin:'https://attacker.invalid'},data:{}});assert.equal(bad.status(),403);
   for(const resource of['/.env','/wrangler.app.jsonc','/.migration-private/copy-receipt-20261104.json','/cloudflare/DATA-COPY-RESULT.json'])assert.equal((await context.request.get(cfg.target+resource)).status(),404);
   let oauth=null,resolveOAuth;const oauthDone=new Promise(resolve=>{resolveOAuth=resolve;});
   await page.route(cfg.source+'/api/google-calendar?**',async route=>{const login=new URL(route.request().url());assert.equal(login.searchParams.get('web_return'),cfg.target);assert.match(login.searchParams.get('native_challenge'),/^[a-f0-9]{64}$/);const r=await route.fetch({maxRedirects:0});oauth=r.headers()['location'];await route.fulfill({status:200,contentType:'text/plain',body:'OAuth test stop'});resolveOAuth();});
   await page.evaluate(()=>document.getElementById('account-login').click());await oauthDone;const u=new URL(oauth);assert.equal(u.hostname,'accounts.google.com');assert.equal(u.searchParams.get('redirect_uri'),cfg.source+'/api/google-calendar?action=callback');
   console.log('PASS '+name+' '+width+': source→Cloudflare local-data copy, original preservation, no startup overwrite, reload, mobile layout, shared account API, CSRF/private-file guards and OAuth relay');
  }finally{await context.close();await browser.close();}
 }
})().catch(e=>{console.error(e);process.exitCode=1});
