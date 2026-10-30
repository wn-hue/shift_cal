const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require.resolve('../index.html'),'utf8'),elements=new Map();
function element(){const classes=new Set();return {style:{},dataset:{},attributes:{},children:[],_html:'',hidden:false,
    set innerHTML(v){this._html=v;this.children=[]},get innerHTML(){return this._html},
    setAttribute(k,v){this.attributes[k]=v},getAttribute(k){return this.attributes[k]},removeAttribute(k){delete this.attributes[k]},querySelector(selector){this._queries??=new Map();if(!this._queries.has(selector))this._queries.set(selector,element());return this._queries.get(selector)},appendChild(e){this.children.push(e)},classList:{add(c){classes.add(c)},remove(c){classes.delete(c)},contains(c){return classes.has(c)}}};}
for(const m of html.matchAll(/\bid="([^"]+)"/g)){assert.ok(!elements.has(m[1]),'IDs remain unique: '+m[1]);elements.set(m[1],element());}
const ctx={document:{body:element(),getElementById:id=>elements.get(id),createElement:element},window:null,TextEncoder,URLSearchParams,Date};
ctx.window=ctx;vm.createContext(ctx);
for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))if(m[1].trim())vm.runInContext(m[1],ctx);
vm.runInContext(fs.readFileSync(require.resolve('../calendar-ui.js'),'utf8'),ctx);
const run=s=>vm.runInContext(s,ctx),grid=elements.get('calendar-grid');
run("updateLeaveStats=()=>{};currentGroup='C';currentCalDate=new Date(2026,9,1);dayMemos={'2026-10-01':'<img src=x onerror=alert(1)>'};renderCalendar()");
assert.equal(grid.children.length,35);assert.equal(grid.style.gridTemplateRows,'repeat(5, minmax(88px, 1fr))');
assert.equal(elements.get('cal-month-title-text').innerText,'2026. 10');
assert.equal(elements.has('calendar-group-label'),false);
const days=grid.children.filter(e=>['button','group'].includes(e.attributes.role));assert.equal(days.length,31);
assert.equal(grid.children.filter(e=>e.attributes['aria-hidden']==='true').length,4);
const memo=days[0].children[0];assert.equal(memo.textContent,'<img src=x onerror=alert(1)>');assert.ok(!days[0].innerHTML.includes('onerror'));
assert.match(days[2].className,/holiday/);assert.match(days[2].innerHTML,/special-night/);
let opened=null;ctx.capture=(...args)=>opened=args;run('openOverrideModal=capture');
let prevented=false;days[0].querySelector('.day-meta').onkeydown({key:'Enter',preventDefault(){prevented=true},stopPropagation(){}});
assert.ok(prevented);assert.equal(opened[0],'2026-10-01');
let memoEntries=0;ctx.MemoComposer={enter:()=>memoEntries++};memo.onclick({stopPropagation(){}});assert.equal(memoEntries,1,'calendar memo enters writing directly');
run("currentCalDate=new Date(2026,4,1);renderCalendar()");assert.equal(grid.children.length,42);
run("currentCalDate=new Date(2028,1,1);renderCalendar()");assert.equal(grid.children.filter(e=>e.attributes.role==='button').length,29);
ctx.ShiftUI.showView('all');assert.equal(ctx.document.body.dataset.view,'all');assert.equal(elements.get('cal-month-title-btn').hidden,true);assert.equal(elements.get('header-calendar-actions').hidden,true);
ctx.ShiftUI.showView('calendar');assert.equal(elements.get('cal-month-title-btn').hidden,false);assert.equal(elements.get('header-view-title').hidden,true);
ctx.document.querySelectorAll=selector=>(selector==='.nav-item'?['bnav-cal','bnav-pay','bnav-menu','account-menu-button']:['view-calendar','view-payroll','view-menu','view-all']).map(id=>elements.get(id));
ctx.scrollTo=()=>{};run('syncFromCalendar=()=>{}');
let menuLoads=0;ctx.TodayMenu={load:()=>menuLoads++};
const navIds=['bnav-cal','bnav-pay','bnav-menu','account-menu-button'];
for(const [view,id] of [['calendar','bnav-cal'],['payroll','bnav-pay'],['menu','bnav-menu'],['all','account-menu-button']]){
    run(`switchView('${view}')`);
    assert.ok(elements.get('view-'+view).classList.contains('active'));
    assert.deepEqual(navIds.filter(id=>elements.get(id).classList.contains('active')),[id]);
    assert.deepEqual(navIds.filter(id=>elements.get(id).attributes['aria-current']==='page'),[id]);
}
assert.equal(menuLoads,1);assert.equal(elements.get('header-view-title').textContent,'전체');
let leaveOpened=0;ctx.SettingsUI={openLeave:()=>leaveOpened++};run("switchView('leave')");assert.equal(leaveOpened,1);assert.ok(elements.get('view-all').classList.contains('active'));assert.equal(elements.has('bnav-leave'),false);
let animations=0,cancelled=0,reducedMotion=false,tapColor='',lastTapColor='';
ctx.getComputedStyle=()=>({getPropertyValue:()=>tapColor});
const visual={getAnimations:()=>[{cancel:()=>cancelled++}],animate:(frames,options)=>{animations++;lastTapColor=frames[0].backgroundColor;assert.equal(frames.at(-1).backgroundColor,'transparent');assert.ok(options.duration<500)}};
ctx.matchMedia=()=>({matches:reducedMotion});
ctx.ShiftUI.tap({querySelector:()=>visual});assert.equal(animations,1);assert.equal(cancelled,1);assert.equal(lastTapColor,'#ececed');
tapColor='#dbeafe';ctx.ShiftUI.tap({querySelector:()=>visual});assert.equal(lastTapColor,'#dbeafe');
reducedMotion=true;ctx.ShiftUI.tap({querySelector:()=>visual});assert.equal(animations,2,'Reduced motion must keep navigation functional without the tap animation');

// Direct group buttons use the same persisted group and group-specific edits as the calendar.
const stored=new Map([['shift_overrides_A',JSON.stringify({'2026-10-01':'LEAVE'})],['shift_overrides_B',JSON.stringify({'2026-10-02':'NO_OT'})]]);
ctx.localStorage={getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)};
let saved=0,calendarSync=0,selected=null;
ctx.AccountSync={changed:()=>saved++};ctx.GoogleSync={groupChanged:()=>calendarSync++,viewChanged:()=>{}};ctx.SettingsUI={syncGroup:g=>selected=g};
for(const group of ['A','B','C']) {
    run(`setGroup('${group}')`);
    assert.equal(run('currentGroup'),group);assert.equal(stored.get('shift_active_group'),group);
    assert.ok(elements.get('cal-month-title-btn').attributes['aria-label'].startsWith(group+'조'));assert.equal(selected,group);
    assert.equal(run('JSON.stringify(overrides)'),stored.get('shift_overrides_'+group)||'{}');
}
run("setGroup('invalid')");assert.equal(run('currentGroup'),'C');assert.equal(saved,3);assert.equal(calendarSync,3);
console.log('PASS: calendar month/week layout, leap month, short shift labels, holiday types, accessible day actions, safe memo text and view-aware header.');

assert.ok(!html.slice(html.indexOf('<header'),html.indexOf('</header>')).includes('account-menu-button'));
assert.match(html, /id="account-menu-button"[^>]+aria-controls="view-all"/);
assert.ok(!html.includes('<dialog id="account-management-dialog"'));

const header=html.slice(html.indexOf('<header'),html.indexOf('</header>'));
assert.ok(!header.includes('id="calendar-group-label"'));
assert.ok(!html.slice(html.indexOf('<div class="calendar-month-controls">'),html.indexOf('<div class="calendar-card"')).includes('3조 2교대'));
for(const page of ['about.html','privacy.html','terms.html']) {
 const source=fs.readFileSync(require.resolve('../'+page),'utf8');
 assert.ok(source.includes('class="service-back"'));
 assert.ok(source.includes('aria-label="전체 메뉴로 돌아가기"'));
 assert.ok(!source.includes('>웹앱</a>'));
}
// Rest-day attendance cannot create deductions or artificial work.
for(const type of ['LEAVE','HALF_PRE','HALF_POST','UNPAID_OFF','UNPAID_HALF_PRE','UNPAID_HALF_POST','NO_OT']) {
    assert.match(run(`validateDayOverride('2026-10-04','${type}')`),/휴무일/);
    assert.equal(run(`validateDayOverride('2026-10-07','${type}')`),'');
}
assert.equal(run("validateDayOverride('2026-10-04',null)"),'');
