import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assistAim } from '../src/input/aimAssist.js';
import { InputManager } from '../src/input/inputManager.js';

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
