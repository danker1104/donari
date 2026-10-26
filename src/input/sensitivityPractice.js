// @ts-check
import { sliderPositionAt } from '../rules/sliderJudge.js';

export const PRACTICE_MIN_DISTANCE = 220;
export const PRACTICE_BOUNDS = {left:50,right:462,top:90,bottom:290};
/** @param {{x:number,y:number}} previous @param {()=>number} [random] @param {{left:number,right:number,top:number,bottom:number}} [bounds] */
export function distantPracticePoint(previous, random = Math.random, bounds = PRACTICE_BOUNDS) {
  const {left,right,top,bottom}=bounds;
  const corners=[{x:left,y:top},{x:right,y:top},{x:left,y:bottom},{x:right,y:bottom}];
  const minimum=Math.min(PRACTICE_MIN_DISTANCE,Math.hypot(right-left,bottom-top)*0.48);
  for (let attempt=0; attempt<24; attempt++) {
    const point={x:left+random()*(right-left),y:top+random()*(bottom-top)};
    if (Math.hypot(point.x-previous.x,point.y-previous.y)>=minimum) return point;
  }
  return {...corners.reduce((best,p)=> Math.hypot(p.x-previous.x,p.y-previous.y)>Math.hypot(best.x-previous.x,best.y-previous.y)?p:best)};
}
/** @param {number} index @param {{x:number,y:number}} previous @param {number} radius @param {()=>number} [random] @param {{left:number,right:number,top:number,bottom:number}} [bounds] */
export function createPracticeNote(index, previous, radius, random = Math.random, bounds = PRACTICE_BOUNDS) {
  const position=distantPracticePoint(previous,random,bounds);
  const kind=index%3===2?'slider':'circle';
  const end=kind==='slider'?distantPracticePoint(position,random,bounds):position;
  const middle={x:(position.x+end.x)/2,y:Math.min(bounds.bottom,Math.max(bounds.top,(position.y+end.y)/2+(index%2?65:-65)))};
  return {id:index,kind,position,radius,end,pathPoints:[position,middle,end],startTimeMs:0,endTimeMs:1400,spanCount:1};
}
/** @param {any} note @param {number} elapsedMs */
export function practiceSliderPosition(note,elapsedMs) { return sliderPositionAt(note,note.startTimeMs+elapsedMs); }
