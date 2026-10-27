import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assistAim, brakeAimMovement } from '../src/input/aimAssist.js';
import { InputManager } from '../src/input/inputManager.js';

test('beginner braking preserves approach, slows overshoot and allows deliberate exit', () => {
 const target={position:{x:100,y:100},radius:40,startTimeMs:1000};
 const brake=(a,b,difficulty='Easy',time=1000)=>brakeAimMovement(a,b,target,time,180,difficulty);
 for (const difficulty of ['Easy','Normal']) {
  assert.deepEqual(brake({x:0,y:100},{x:90,y:100},difficulty),{x:90,y:100});
  assert.ok(brake({x:100,y:100},{x:140,y:100},difficulty).x < 130);
  assert.ok(brake({x:0,y:100},{x:200,y:100},difficulty).x < 170);
  assert.deepEqual(brake({x:0,y:200},{x:200,y:200},difficulty),{x:200,y:200});
  assert.deepEqual(brake({x:180,y:100},{x:200,y:100},difficulty),{x:200,y:100});
  assert.deepEqual(brake({x:100,y:100},{x:100,y:100},difficulty),{x:100,y:100});
  assert.deepEqual(brake({x:100,y:100},{x:140,y:100},difficulty,1121),{x:140,y:100});
  assert.ok(brake({x:100,y:100},{x:500,y:100},difficulty).x>400);
 }
 assert.deepEqual(brake({x:100,y:100},{x:140,y:100},'Hard'),{x:140,y:100});
});

test('movement braking persists in cursor state without reapplying on clicks or reads', () => {
 const target={position:{x:100,y:100},radius:40,startTimeMs:1000};
 const input=new InputManager({clock:{getMapTimeMs:()=>1000,eventTimestampToMapTime:t=>({mapTimeMs:t,fallback:false})},mapper:{screenToPlayfield:p=>p},requestPause:()=>{},
  correctMovement:(a,b,t)=>brakeAimMovement(a,b,target,t,120,'Normal')});
 input.setActive(true);
 input.handlePointerMove({clientX:100,clientY:100,timeStamp:1000});
 input.handlePointerMove({clientX:140,clientY:100,timeStamp:1000});
 assert.ok(input.playfieldPosition.x > 100 && input.playfieldPosition.x < 130);
 const beforeClick = {...input.playfieldPosition};
 input.handlePointerDown({clientX:140,clientY:100,timeStamp:1000,button:0});
 assert.deepEqual(input.playfieldPosition,beforeClick);
 assert.deepEqual(input.state.transitions.find(t=>t.phase==='press').playfieldPosition,beforeClick);
});

test('Easy and Normal widen attraction and rescue near misses while other difficulties retain original aim', () => {
 const target={position:{x:100,y:100},radius:40,startTimeMs:1000};
 for (const difficulty of ['Easy','Normal']) {
  assert.deepEqual(assistAim({x:152,y:100},target,1000,180,difficulty),{x:139,y:100});
  assert.deepEqual(assistAim({x:160,y:100},target,1000,180,difficulty),{x:145,y:100});
  assert.deepEqual(assistAim({x:161,y:100},target,1000,180,difficulty),{x:161,y:100});
  assert.deepEqual(assistAim({x:152,y:100},target,1121,180,difficulty),{x:152,y:100});
  assert.deepEqual(assistAim({x:152,y:100},target,1081,80,difficulty),{x:152,y:100});
 }
 for (const difficulty of ["Rocket's Hard","pkhg's Insane","Mamayu's Insane","Yiyo's Insane",'Kage','']) {
  assert.deepEqual(assistAim({x:152,y:100},target,1000,180,difficulty),{x:152,y:100});
  assert.deepEqual(assistAim({x:144,y:100},target,1000,180,difficulty),{x:139.2,y:100});
 }
});

test('nearby aim is gently corrected without snapping or helping distant targets', () => {
 const target={id:1,startTimeMs:1000,radius:40,position:{x:100,y:100}};
 const near=assistAim({x:144,y:100},target,1000,120);
 assert.ok(near.x<144 && near.x>=139.2);
 assert.deepEqual(assistAim({x:160,y:100},target,1000,120),{x:160,y:100});
 assert.deepEqual(assistAim({x:144,y:100},target,500,120),{x:144,y:100});
 assert.deepEqual(assistAim({x:144,y:100},null,1000,120),{x:144,y:100});
});
test('1.27 sensitivity scales movement and pointer clicks do not move the cursor twice', () => {
 const input=new InputManager({clock:{getMapTimeMs:()=>1000,eventTimestampToMapTime:t=>({mapTimeMs:t,fallback:false})},mapper:{screenToPlayfield:p=>p},requestPause:()=>{},sensitivity:1.27});
 input.setActive(true);
 input.handlePointerMove({clientX:100,clientY:100,timeStamp:1000});
 input.handlePointerMove({clientX:110,clientY:120,timeStamp:1001});
 assert.deepEqual(input.playfieldPosition,{x:112.7,y:125.4});
 input.handlePointerDown({clientX:110,clientY:120,timeStamp:1001,button:0});
 assert.deepEqual(input.playfieldPosition,{x:112.7,y:125.4});
 assert.equal(input.state.transitions.filter(t=>t.phase==='press').length,1);
});


test('smooth aim follows sensitivity and is stable across pointer event rates', () => {
 const target={position:{x:100,y:100},radius:40,startTimeMs:1000};
 const run=(sensitivity,count)=>{
  const input=new InputManager({clock:{getMapTimeMs:()=>1000,eventTimestampToMapTime:t=>({mapTimeMs:t,fallback:false})},
   mapper:{screenToPlayfield:p=>p},requestPause:()=>{},sensitivity,
   correctMovement:(a,b,t)=>brakeAimMovement(a,b,target,t,120,'Easy')});
  input.setActive(true);
  input.handlePointerMove({clientX:100,clientY:100,timeStamp:1000});
  for(let i=1;i<=count;i++)input.handlePointerMove({clientX:100+60*i/count,clientY:100,timeStamp:1000});
  return input.playfieldPosition.x;
 };
 const results=[1,1.15,1.27,1.5].map(s=>run(s,60));
 for(let i=1;i<results.length;i++)assert.ok(results[i]>results[i-1]);
 for(const sensitivity of [1,1.27,1.5])assert.ok(Math.abs(run(sensitivity,1)-run(sensitivity,120))<0.8);
});

test('braking fades smoothly at spatial/time boundaries and steers near misses', () => {
 const target={position:{x:100,y:100},radius:40,startTimeMs:1000};
 const move=(x,time)=>brakeAimMovement({x,y:100},{x:x+0.01,y:100},target,time,120,'Easy').x-x;
 assert.ok(Math.abs(move(159.99,1000)-move(160.01,1000))<0.00001);
 assert.ok(Math.abs(move(120,1119.99)-move(120,1120.01))<0.00001);
 assert.ok(Math.abs(move(99.999,1000)-move(100.001,1000))<0.00001);
 const near=brakeAimMovement({x:60,y:120},{x:110,y:120},target,1000,120,'Normal');
 assert.ok(near.y<120 && near.y>100);
 const point={x:120,y:120};
 assert.deepEqual(brakeAimMovement(point,point,null,1000,120,'Easy'),point);
 assert.deepEqual(brakeAimMovement(point,point,{...target,position:{x:300,y:300}},1000,120,'Easy'),point);
});
