const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require.resolve('../index.html'),'utf8'),elements=new Map();
function element(){const classes=new Set();return {style:{},dataset:{},attributes:{},children:[],_html:'',hidden:false,
    set innerHTML(v){this._html=v;this.children=[]},get innerHTML(){return this._html},
    setAttribute(k,v){this.attributes[k]=v},appendChild(e){this.children.push(e)},classList:{add(c){classes.add(c)},remove(c){classes.delete(c)},contains(c){return classes.has(c)}}};}
for(const m of html.matchAll(/\bid="([^"]+)"/g)){assert.ok(!elements.has(m[1]),'IDs remain unique: '+m[1]);elements.set(m[1],element());}
const ctx={document:{body:element(),getElementById:id=>elements.get(id),createElement:element},window:null,TextEncoder,URLSearchParams,Date};
ctx.window=ctx;vm.createContext(ctx);
for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))if(m[1].trim())vm.runInContext(m[1],ctx);
vm.runInContext(fs.readFileSync(require.resolve('../calendar-ui.js'),'utf8'),ctx);
const run=s=>vm.runInContext(s,ctx),grid=elements.get('calendar-grid');
run("updateLeaveStats=()=>{};currentGroup='C';currentCalDate=new Date(2026,9,1);dayMemos={'2026-10-01':'<img src=x onerror=alert(1)>'};renderCalendar()");
assert.equal(grid.children.length,35);assert.equal(grid.style.gridTemplateRows,'repeat(5, minmax(88px, 1fr))');
assert.equal(elements.get('cal-month-title-text').innerText,'2026. 10');
assert.equal(elements.get('calendar-group-label').textContent,'C조');
const days=grid.children.filter(e=>e.attributes.role==='button');assert.equal(days.length,31);
assert.equal(grid.children.filter(e=>e.attributes['aria-hidden']==='true').length,4);
const memo=days[0].children[0];assert.equal(memo.textContent,'<img src=x onerror=alert(1)>');assert.ok(!days[0].innerHTML.includes('onerror'));
assert.match(days[2].className,/holiday/);assert.match(days[2].innerHTML,/special-night/);
let opened=null;ctx.capture=(...args)=>opened=args;run('openOverrideModal=capture');
let prevented=false;days[0].onkeydown({key:'Enter',preventDefault(){prevented=true}});
assert.ok(prevented);assert.equal(opened[0],'2026-10-01');
run("currentCalDate=new Date(2026,4,1);renderCalendar()");assert.equal(grid.children.length,42);
run("currentCalDate=new Date(2028,1,1);renderCalendar()");assert.equal(grid.children.filter(e=>e.attributes.role==='button').length,29);
ctx.ShiftUI.showView('leave');assert.equal(ctx.document.body.dataset.view,'leave');assert.equal(elements.get('cal-month-title-btn').hidden,true);assert.equal(elements.get('header-calendar-actions').hidden,true);
ctx.ShiftUI.showView('calendar');assert.equal(elements.get('cal-month-title-btn').hidden,false);assert.equal(elements.get('header-view-title').hidden,true);
ctx.document.querySelectorAll=selector=>(selector==='.nav-item'?['bnav-cal','bnav-pay','bnav-leave']:['view-calendar','view-payroll','view-leave']).map(id=>elements.get(id));
ctx.scrollTo=()=>{};run('syncFromCalendar=()=>{}');
const navIds=['bnav-cal','bnav-pay','bnav-leave'];
for(const [view,id] of [['calendar','bnav-cal'],['payroll','bnav-pay'],['leave','bnav-leave']]){
    run(`switchView('${view}')`);
    assert.ok(elements.get('view-'+view).classList.contains('active'));
    assert.deepEqual(navIds.filter(id=>elements.get(id).classList.contains('active')),[id]);
    assert.deepEqual(navIds.filter(id=>elements.get(id).attributes['aria-current']==='page'),[id]);
}
let animations=0,cancelled=0,reducedMotion=false;
const visual={getAnimations:()=>[{cancel:()=>cancelled++}],animate:(frames,options)=>{animations++;assert.equal(frames.at(-1).backgroundColor,'transparent');assert.ok(options.duration<500)}};
ctx.matchMedia=()=>({matches:reducedMotion});
ctx.ShiftUI.tap({querySelector:()=>visual});assert.equal(animations,1);assert.equal(cancelled,1);
reducedMotion=true;ctx.ShiftUI.tap({querySelector:()=>visual});assert.equal(animations,1,'Reduced motion must keep navigation functional without the tap animation');

// Direct group buttons use the same persisted group and group-specific edits as the calendar.
const stored=new Map([['shift_overrides_A',JSON.stringify({'2026-10-01':'LEAVE'})],['shift_overrides_B',JSON.stringify({'2026-10-02':'NO_OT'})]]);
ctx.localStorage={getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)};
let saved=0,calendarSync=0,selected=null;
ctx.AccountSync={changed:()=>saved++};ctx.GoogleSync={groupChanged:()=>calendarSync++,viewChanged:()=>{}};ctx.SettingsUI={syncGroup:g=>selected=g};
for(const group of ['A','B','C']) {
    run(`setGroup('${group}')`);
    assert.equal(run('currentGroup'),group);assert.equal(stored.get('shift_active_group'),group);
    assert.equal(elements.get('calendar-group-label').textContent,group+'조');assert.equal(selected,group);
    assert.equal(run('JSON.stringify(overrides)'),stored.get('shift_overrides_'+group)||'{}');
}
run("setGroup('invalid')");assert.equal(run('currentGroup'),'C');assert.equal(saved,3);assert.equal(calendarSync,3);
console.log('PASS: calendar month/week layout, leap month, short shift labels, holiday types, accessible day actions, safe memo text and view-aware header.');
