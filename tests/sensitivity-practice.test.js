import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createPracticeNote,distantPracticePoint,PRACTICE_MIN_DISTANCE,practiceSliderPosition} from '../src/input/sensitivityPractice.js';
test('practice notes stay far from the previous endpoint even when random retries fail',()=>{
 let previous={x:256,y:192};
 for(let i=0;i<60;i++){
  const note=createPracticeNote(i,previous,38,()=>0.5);
  assert.ok(Math.hypot(note.position.x-previous.x,note.position.y-previous.y)>=PRACTICE_MIN_DISTANCE);
  assert.ok(note.position.x>=50&&note.position.x<=462&&note.position.y>=90&&note.position.y<=290);
  if(note.kind==='slider') assert.ok(Math.hypot(note.end.x-note.position.x,note.end.y-note.position.y)>=PRACTICE_MIN_DISTANCE);
  previous=note.end;
 }
});
test('practice includes long sliders and the ball travels along their full path',()=>{
 const note=createPracticeNote(2,{x:256,y:192},38,()=>0);
 assert.equal(note.kind,'slider');
 assert.deepEqual(practiceSliderPosition(note,0),note.position);
 assert.deepEqual(practiceSliderPosition(note,1400),note.end);
 assert.notDeepEqual(practiceSliderPosition(note,700),note.position);
 assert.equal(createPracticeNote(1,note.end,38).kind,'circle');
});

test('slider tracking and rendered ball agree when appearance adds a lead-in',()=>{
 const original=createPracticeNote(2,{x:256,y:192},38,()=>0);
 const delayed={...original,startTimeMs:900,endTimeMs:2300};
 for(const elapsed of [0,350,700,1050,1400]) assert.deepEqual(practiceSliderPosition(delayed,elapsed),practiceSliderPosition(original,elapsed));
});
