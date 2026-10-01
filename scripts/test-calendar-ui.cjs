const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require.resolve('../index.html'),'utf8'),elements=new Map();
function element(){return {style:{},dataset:{},attributes:{},children:[],_html:'',hidden:false,
    set innerHTML(v){this._html=v;this.children=[]},get innerHTML(){return this._html},
    setAttribute(k,v){this.attributes[k]=v},appendChild(e){this.children.push(e)},classList:{add(){},remove(){}}};}
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
console.log('PASS: calendar month/week layout, leap month, short shift labels, holiday types, accessible day actions, safe memo text and view-aware header.');
