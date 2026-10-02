'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {koreaDate, menuDate, resolveDate, extractToday, SOURCE_URL} = require('../lib/today-menu.cjs');
const {downloadPdf} = require('../api/today-menu.js');
const fixture = require('./fixtures/menu-layout.json');
const copy = () => structuredClone(fixture);

async function main() {
    assert.equal(koreaDate(new Date('2026-10-02T14:59:59Z')),'2026-10-02');
    assert.equal(koreaDate(new Date('2026-10-02T15:00:00Z')),'2026-10-03');
    for (const time of ['15:00:00','17:40:00','17:59:59.999']) {
        const now = new Date('2026-10-02T' + time + 'Z');
        assert.equal(menuDate(now),'2026-10-02','00:00–02:59 KST retains the previous meal day');
        assert.equal(extractToday(copy(),now).date,'2026-10-02');
    }
    assert.equal(menuDate(new Date('2026-10-02T18:00:00Z')),'2026-10-03');
    assert.equal(extractToday(copy(),new Date('2026-10-02T18:00:00Z')).date,'2026-10-03');
    assert.equal(menuDate(new Date('2026-12-31T17:59:59Z')),'2026-12-31');
    assert.equal(menuDate(new Date('2026-12-31T18:00:00Z')),'2027-01-01');
    assert.equal(menuDate(new Date('2026-09-30T17:59:59Z')),'2026-09-30');
    assert.equal(menuDate(new Date('2026-09-30T18:00:00Z')),'2026-10-01');
    assert.equal(resolveDate('1/1(금)','2026-12-31'),'2027-01-01');
    assert.equal(resolveDate('12/31(목)','2027-01-01'),'2026-12-31');
    assert.equal(resolveDate('2/30(금)','2026-02-20'),null);
    assert.equal(resolveDate('10/2(월)','2026-10-02'),null);
    const result = extractToday(copy(),new Date('2026-10-02T13:55:00Z'));
    assert.equal(result.status,'ok'); assert.equal(result.date,'2026-10-02');
    assert.deepEqual(result.meals.map(m=>m.name),['조식','중식','석식','야식']);
    assert.ok(result.meals.every(m=>m.groups[0].items.length===6));
    // Only the selected day column appears; adjacent columns contain different markers.
    const target = fixture.Pages[0].Texts.find(t=>t.y===5.161 && t.x>23 && t.x<24).R[0].T;
    const adjacent = fixture.Pages[0].Texts.find(t=>t.y===5.161 && t.x<6).R[0].T;
    assert.equal(result.meals[0].groups[0].items[0],target);
    assert.ok(!JSON.stringify(result.meals).includes('"'+adjacent+'"'));
    assert.ok(result.meals[1].groups.some(g=>g.title==='후식'),'Merged tea row is shared across all dates');
    const split = copy();
    split.Pages[0].Texts.find(t=>t.y===19.541 && t.x>23 && t.x<23.5).R[0].T='치킨';
    split.Pages[0].Texts.find(t=>t.y===19.541 && t.x>23.5 && t.x<24).R[0].T='버거/콜라';
    assert.ok(extractToday(split,new Date('2026-10-02T00:00:00Z')).meals[2].groups[1].items.includes('치킨버거/콜라'));
    for(let day=0;day<14;day++) {
        const date=new Date(Date.UTC(2026,8,28+day));
        assert.equal(extractToday(copy(),date).status,'ok','Both week rows and weekend columns must parse: '+date.toISOString());
    }
    const shifted=copy();
    for(const page of shifted.Pages) {
        page.Width*=1.2;page.Height=page.Height*1.2+2;
        for(const t of page.Texts){t.x*=1.2;t.w*=1.2;t.y=t.y*1.2+2;}
        for(const f of page.Fills){f.x*=1.2;f.w*=1.2;f.y=f.y*1.2+2;f.h*=1.2;}
    }
    assert.deepEqual(extractToday(shifted,new Date('2026-10-02T00:00:00Z')).meals,result.meals,'Page position and scale must not change extracted day');
    const missing=extractToday(copy(),new Date('2026-10-12T00:00:00Z'));
    assert.equal(missing.status,'not_published'); assert.deepEqual(missing.meals,[],'Missing date never substitutes another day');
    assert.equal(extractToday(copy(),new Date('2037-10-02T00:00:00Z')).status,'not_published','Old PDFs cannot reappear when weekdays repeat years later');
    const broken=copy();broken.Pages[0].Texts=broken.Pages[0].Texts.filter(t=>t.R[0].T!=='야식');
    assert.throws(()=>extractToday(broken,new Date('2026-10-02T00:00:00Z')),/MENU_LAYOUT/);
    const duplicate=copy();duplicate.Pages.push(structuredClone(duplicate.Pages[0]));
    assert.throws(()=>extractToday(duplicate,new Date('2026-10-02T00:00:00Z')),/MENU_LAYOUT/);
    let fetchedUrl;
    await assert.rejects(downloadPdf(async url=>{fetchedUrl=url;return new Response('login html');}),/MENU_PDF/);
    assert.equal(fetchedUrl,SOURCE_URL);
    await assert.rejects(downloadPdf(async()=>new Response('abc',{headers:{'content-length':'4000000'}})),/MENU_SOURCE/);
    await assert.rejects(downloadPdf(async()=>new Response(new Uint8Array(3145729))),/MENU_SIZE/);
    await assert.rejects(downloadPdf(async()=>new Response('',{status:503})),/MENU_SOURCE/);
    const handler=require('../api/today-menu.js');
    const response={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(data){this.data=data;return this;}};
    await handler({method:'POST'},response);assert.equal(response.code,405);assert.equal(response.headers.Allow,'GET');
    console.log('PASS: Korean date rollover, year/weekday checks, 14 date columns, spatial meal sections, merged/split cells, missing/stale/invalid PDFs, fixed upstream URL and payload limits.');

    const elements=new Map();
    function el(){return {textContent:'',children:[],hidden:false,disabled:false,attributes:{},handlers:{},setAttribute(k,v){this.attributes[k]=v},appendChild(c){this.children.push(c)},replaceChildren(){this.children=[]},addEventListener(n,f){this.handlers[n]=f}};}
    for(const id of ['today-menu-date','today-menu-refresh','today-menu-status','today-menu-panel','today-menu-cards','today-menu-empty','today-menu-note','today-menu-checked'])elements.set(id,el());
    let instant=new Date('2026-10-02T13:00:00Z'), requests=0, reply={...result,checkedAt:instant.toISOString()};
    class Clock extends Date{constructor(...args){super(...(args.length?args:[instant]));}static now(){return instant.getTime();}}
    const ctx={window:null,Intl,Date:Clock,AbortSignal,document:{body:{dataset:{view:'menu'}},getElementById:id=>elements.get(id),createElement:el,addEventListener(){},hidden:false},setInterval(){},fetch:async()=>{requests++;return {ok:true,json:async()=>reply};}};
    ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../today-menu.js'),'utf8'),ctx);
    await ctx.TodayMenu.load();assert.equal(elements.get('today-menu-cards').children.length,4);assert.equal(elements.get('today-menu-refresh').disabled,false);
    await ctx.TodayMenu.load();assert.equal(requests,1,'Repeated tab visits use the current-day cache');
    reply=structuredClone(reply);reply.meals[0].groups[0].items[0]='<img src=x onerror=alert(1)>';
    await ctx.TodayMenu.load(true);
    assert.equal(elements.get('today-menu-cards').children[0].children[1].children[0].textContent,'<img src=x onerror=alert(1)>','PDF text must never become HTML');
    instant=new Date('2026-10-02T15:00:00Z');
    await ctx.TodayMenu.load();assert.equal(elements.get('today-menu-cards').children.length,4,'Midnight retains the previous meal day');
    instant=new Date('2026-10-02T17:40:00Z');
    await ctx.TodayMenu.load();assert.equal(elements.get('today-menu-cards').children.length,4,'02:40 KST still shows the previous meal day');
    instant=new Date('2026-10-02T17:59:59.999Z');
    await ctx.TodayMenu.load(true);assert.equal(elements.get('today-menu-cards').children.length,4,'Refresh before 03:00 retains the previous meal day');
    instant=new Date('2026-10-02T18:00:00Z');
    await ctx.TodayMenu.load();assert.equal(elements.get('today-menu-cards').children.length,0,'Yesterday is cleared when browser or server date changes');
    reply={status:'not_published',date:'2026-10-03',message:'오늘 식단 미등록',meals:[]};
    await ctx.TodayMenu.load(true);assert.equal(elements.get('today-menu-empty').textContent,'오늘 식단 미등록');
    ctx.fetch=async()=>{throw new Error('Failed to fetch');};
    await ctx.TodayMenu.load(true);assert.match(elements.get('today-menu-empty').textContent,/인터넷 연결/);assert.equal(elements.get('today-menu-panel').attributes['aria-busy'],'false');
    console.log('PASS: Today menu loading/cache/refresh, accessible status, safe text rendering, 03:00 Korean meal-day rollover and offline recovery.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
