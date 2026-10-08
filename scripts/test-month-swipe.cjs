const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
let reduced=false,frames=new Map(),frameId=0,timers=[];
const context={window:{matchMedia:()=>({matches:reduced})},document:{getElementById:()=>null,createElement:()=>({style:{},append(){},before(){},remove(){}})},requestAnimationFrame:f=>{frames.set(++frameId,f);return frameId;},cancelAnimationFrame:id=>frames.delete(id),setTimeout:f=>{timers.push(f);return timers.length;}};
vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../calendar-ui.js'),'utf8'),context);
const api=context.window.ShiftUI;
function surface(){const handlers={},classes=new Set(),animations=[];return {handlers,animations,dataset:{},style:{},clientWidth:390,classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)},before(){},cloneNode(){return {...surface(),removeAttribute(){},setAttribute(){},querySelectorAll:()=>[]};},getBoundingClientRect:()=>({width:390,height:500}),addEventListener:(type,f)=>{handlers[type]=f;},animate:(keyframes,options)=>{const a={keyframes,options,cancelled:false,finished:Promise.resolve(),cancel(){this.cancelled=true;}};animations.push(a);return a;}};}
function touch(x,y,count=1){return {touches:Array.from({length:count},()=>({clientX:x,clientY:y})),changedTouches:[{clientX:x,clientY:y}],target:{closest:()=>null},cancelable:true,preventDefault(){this.prevented=true;}};}
function paint(){for(const f of frames.values())f();frames.clear();}
const settle=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};
(async()=>{
 let changes=[];const card=surface(),grid=surface();api.bindMonthSwipe(card,grid,d=>changes.push(d));
 // Vertical scrolling and a tap leave the month alone.
 card.handlers.touchstart(touch(180,100));card.handlers.touchmove(touch(184,190));card.handlers.touchend(touch(184,190));await settle();assert.deepEqual(changes,[]);
 card.handlers.touchstart(touch(180,100));card.handlers.touchend(touch(180,100));assert.deepEqual(changes,[]);
 // A horizontal drag paints before release, commits once, and suppresses the follow-up tap.
 card.handlers.touchstart(touch(180,100));const move=touch(90,103);card.handlers.touchmove(move);paint();assert.equal(move.prevented,true);assert.match(grid.style.transform,/-90px/);
 card.handlers.touchend(touch(90,103));assert.deepEqual(changes,[1],'Prepare the incoming month once before the shared animation');
 const click={preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}};card.handlers.click(click);assert.equal(click.stopped,true);
 await settle();assert.deepEqual(changes,[1]);assert.equal(grid.style.transform,'');assert.equal(grid.style.willChange,'');assert.equal(grid.animations.length,1);assert.match(grid.animations[0].keyframes[0].transform,/300px/);assert.ok(grid.animations[0].options.duration>300);
 // Touch cancellation never changes the month; no stale drag survives.
 card.handlers.touchstart(touch(180,100));card.handlers.touchmove(touch(100,100));card.handlers.touchcancel();assert.equal(grid.style.transform,'');assert.equal(frames.size,0);assert.deepEqual(changes,[1]);
 // Pinch/multi-touch is not a month gesture.
 card.handlers.touchstart(touch(180,100,2));card.handlers.touchend(touch(10,100));assert.deepEqual(changes,[1]);
 // Short drag settles back without a month change.
 card.handlers.touchstart(touch(180,100));card.handlers.touchmove(touch(160,100));paint();card.handlers.touchend(touch(160,100));await settle();assert.deepEqual(changes,[1]);assert.equal(grid.style.transform,'');
 // Reduced motion remains fully usable without animation.
 reduced=true;card.handlers.touchstart(touch(100,100));card.handlers.touchmove(touch(200,100));card.handlers.touchend(touch(200,100));assert.deepEqual(changes,[1,-1]);
 // Rapid navigation cannot commit two overlapping month transitions.
 reduced=false;let commits=0;const s=surface();await Promise.all([api.slideMonth(s,1,()=>commits++),api.slideMonth(s,1,()=>commits++)]);assert.equal(commits,1);assert.equal(s.style.transform,'');
 console.log('PASS: swipe follows touch, commits once, settles back, ignores vertical/pinch/cancel/tap, suppresses accidental day opening, and respects reduced motion.');
})().catch(e=>{console.error(e);process.exitCode=1;});
