const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require.resolve('../index.html'),'utf8'),els=new Map();
function el(){return {open:false,hidden:false,textContent:'',attributes:{},setAttribute(k,v){this.attributes[k]=v},handlers:{},showModal(){this.open=true},close(){this.open=false},focus(){this.focused=true},scrollIntoView(){this.scrolled=true},addEventListener(k,f){this.handlers[k]=f}};}
for(const m of html.matchAll(/\bid="([^"]+)"/g))els.set(m[1],el());
const buttons=[el(),el(),el()];els.get('first-use-guide').querySelectorAll=()=>buttons;
els.get('menu-leave-settings').querySelector=()=>buttons[1];
let updated=0;const ctx={document:{getElementById:id=>els.get(id)},window:{},updateLeaveStats:()=>updated++};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(require.resolve('../settings-ui.js'),'utf8'),ctx);
const api=ctx.window.SettingsUI,state={group:'C',hireDate:'',baseHourly:0,ordinaryHourly:0,year:2026,total:19,used:2.5,remain:16.5};
api.refresh(state);assert.equal(els.get('first-use-guide').hidden,false);assert.equal(buttons[1].hidden,false);assert.equal(buttons[2].hidden,false);
assert.equal(els.get('menu-leave-remain').textContent,'16.5일');assert.equal(els.get('menu-leave-year').textContent,'2026년');
api.refresh({...state,hireDate:'2020-01-01'});assert.equal(buttons[1].hidden,true);assert.equal(buttons[2].hidden,false);
api.refresh({...state,baseHourly:11050,ordinaryHourly:14482});assert.equal(buttons[1].hidden,false);assert.equal(buttons[2].hidden,true);
api.refresh({...state,hireDate:'2020-01-01',baseHourly:11050,ordinaryHourly:14482});assert.equal(els.get('first-use-guide').hidden,true);
api.openMenu('salary');assert.equal(els.get('account-management-dialog').open,true);assert.equal(els.get('payroll-sms-open').focused,true);
api.openLeave();assert.equal(updated,1);assert.equal(els.get('account-management-dialog').open,false);assert.equal(els.get('leave-settings-dialog').open,true);
for(const view of ['payroll','leave']){const section=html.slice(html.indexOf('<section id="view-'+view+'"'));assert.ok(!section.slice(0,section.indexOf('</section>')).includes('PayrollEstimate.open()'));assert.ok(!section.slice(0,section.indexOf('</section>')).includes('id="payroll-sms-open"'));}
const dialog=html.slice(html.indexOf('<dialog id="leave-settings-dialog"'));assert.ok(dialog.slice(0,dialog.indexOf('</dialog>')).includes('id="input-hire-date"'));
console.log('PASS: incomplete/new-user guidance, imported complete settings, fractional annual leave, separate menu settings and single SMS entry point.');

api.refresh({...state,group:null,hireDate:'2020-01-01',baseHourly:11050,ordinaryHourly:14482});assert.equal(els.get('first-use-guide').hidden,false);assert.equal(buttons[0].hidden,false);assert.match(els.get('first-use-copy').textContent,/교대조/);api.openMenu('group');assert.equal(els.get('group-choice-A').focused,true);
for(const group of ['A','B','C']) {
    api.refresh({...state,group});
    assert.equal(els.get('group-select').value,group);
    assert.match(els.get('group-selection-status').textContent,new RegExp(group+'조 근무표 적용됨'));
    for(const other of ['A','B','C']) assert.equal(els.get('group-choice-'+other).attributes['aria-pressed'],String(group===other));
    api.openMenu('group');assert.equal(els.get('group-choice-'+group).focused,true);
}
api.syncGroup(null);for(const group of ['A','B','C']) assert.equal(els.get('group-choice-'+group).attributes['aria-pressed'],'false');
