// @ts-check
import { InputManager } from '../input/inputManager.js';
import { CoordinateMapper } from '../input/coordinateMapper.js';
import { assistAim } from '../input/aimAssist.js';
import { createPracticeNote, practiceSliderPosition } from '../input/sensitivityPractice.js';
import { PlayfieldRenderer } from '../renderer/playfieldRenderer.js';
import { createHitFeedback } from '../renderer/hitFeedback.js';
import { circleSizeToRadius } from '../rules/standardRules.js';
import { SLIDER_FOLLOW_RADIUS_MULTIPLIER } from '../rules/sliderJudge.js';

export class SensitivityTrainer {
  /** @param {any} options */
  constructor(options) {
    this.options=options;
    this.dialog=/** @type {HTMLDialogElement} */(document.getElementById('sensitivity-dialog'));
    this.canvas=/** @type {HTMLCanvasElement} */(document.getElementById('sensitivity-canvas'));
    this.range=/** @type {HTMLInputElement} */(document.getElementById('mouse-sensitivity'));
    this.output=document.getElementById('mouse-sensitivity-value');
    this.status=document.getElementById('sensitivity-status');
    this.stats=document.getElementById('sensitivity-stats');
    this.canvas.tabIndex=0;
    this.canvas.addEventListener('pointerenter',()=>{if(this.dialog.open)this.canvas.focus({preventScroll:true});});
    this.canvas.addEventListener('pointerdown',()=>this.canvas.focus({preventScroll:true}));
    this.canvas.addEventListener('pointermove',()=>{if(this.running&&document.activeElement!==this.canvas)this.canvas.focus({preventScroll:true});});
    this.running=false;
    this.raf=0;
    this.input=null;
    this.dialog.addEventListener('cancel',()=>this.stop());
    this.dialog.addEventListener('close',()=>this.stop());
    document.getElementById('sensitivity-close')?.addEventListener('click',()=>this.dialog.close());
    document.getElementById('sensitivity-apply')?.addEventListener('click',()=>{
      this.options.apply(Number(this.range.value)); this.dialog.close();
    });
    this.range.addEventListener('input',()=>this.changeSensitivity());
    document.getElementById('mouse-sensitivity-reset')?.addEventListener('click',()=>{this.range.value='1';this.changeSensitivity();});
    document.getElementById('sensitivity-restart')?.addEventListener('click',()=>this.reset());
    this.resize=()=>{this.mapper?.resizeToViewport(window,this.canvas,this.context);if(this.running)this.reset();};
  }
  changeSensitivity() {
    this.range.setAttribute('aria-valuetext',`${Number(this.range.value).toFixed(2)}배`);
    if(this.output) this.output.textContent=`${Number(this.range.value).toFixed(2)}배`;
    if(this.input) {this.input.sensitivity=Number(this.range.value);this.input.lastPointerPosition=null;}
    this.reset();
  }
  async open() {
    if(this.dialog.open)return;
    this.dialog.showModal();
    const generation=this.loadGeneration=(this.loadGeneration??0)+1;
    const controls=[this.range,...this.dialog.querySelectorAll('footer button')];
    controls.forEach(control=>control.disabled=true);
    if(this.status)this.status.textContent='본 게임의 노트·슬라이더 스킨을 불러오는 중…';
    let skin;
    try { skin=await this.options.loadSkin(); }
    catch(error) { if(this.status)this.status.textContent='스킨을 불러오지 못했습니다. 닫고 다시 시도해 주세요.'; return; }
    if(!this.dialog.open||generation!==this.loadGeneration)return;
    controls.forEach(control=>control.disabled=false);
    this.range.value=String(this.options.settings().mouseSensitivity);
    this.context=this.canvas.getContext('2d');
    if(!this.context)return;
    this.mapper=new CoordinateMapper(window.innerWidth,window.innerHeight,window.devicePixelRatio);
    this.resize();
    this.skin=skin;
    this.renderer=new PlayfieldRenderer(this.context,this.mapper,skin);
    this.renderer.setBackground(skin.get('background'));
    this.renderer.setVisualSettings(this.options.settings());
    this.renderer.drawHud=()=>{};
    this.radius=circleSizeToRadius(this.options.circleSize());
    this.clock={getMapTimeMs:()=>performance.now(),eventTimestampToMapTime:(/** @type {number} */t)=>({mapTimeMs:t>1e12?t-performance.timeOrigin:t,fallback:false})};
    this.input=new InputManager({clock:this.clock,mapper:this.mapper,sensitivity:Number(this.range.value),
      keyBindings:this.options.settings().keyBindings,
      requestPause:()=>{if(this.input){this.input.state.clear(performance.now(),this.input.playfieldPosition);this.input.lastPointerPosition=null;}},
      correctAim:(point,time)=>{
        if(!this.note||this.dragStarted!==null)return point;
        return assistAim(point,{...this.note,startTimeMs:time},time,120);
      }});
    this.input.attach(this.canvas,window,document);
    this.input.setActive(true);
    window.addEventListener('resize',this.resize);
    this.running=true;
    this.changeSensitivity();
    this.canvas.focus();
    this.raf=requestAnimationFrame(()=>this.frame());
  }
  reset() {
    const top=document.querySelector('.sensitivity-trainer-header')?.getBoundingClientRect().bottom??90;
    const bottom=document.querySelector('.sensitivity-trainer-panel')?.getBoundingClientRect().top??window.innerHeight-200;
    const margin=(this.radius??38)+10;
    const upper=this.mapper?.screenToPlayfield({x:0,y:top+margin*(this.mapper?.scale??1)}).y??90;
    const lower=this.mapper?.screenToPlayfield({x:0,y:bottom-margin*(this.mapper?.scale??1)}).y??290;
    const minY=Math.max(margin,upper),maxY=Math.min(384-margin,lower);
    this.bounds={left:margin,right:512-margin,top:Math.min(minY,maxY),bottom:Math.max(minY,maxY)};
    this.index=0;this.hits=0;this.misses=0;this.lastEnd={x:256,y:(this.bounds.top+this.bounds.bottom)/2};this.feedback=null;
    if(this.input){this.input.state.clear(performance.now(),this.input.playfieldPosition);this.input.lastPointerPosition=null;}
    this.next('멀리 있는 원을 클릭하거나 Z / X로 누르세요. 긴 슬라이더도 등장합니다.');
  }
  /** @param {string} message */
  next(message) {
    this.note=createPracticeNote(this.index++,this.lastEnd,this.radius??38,Math.random,this.bounds);
    this.bornAt=performance.now();
    this.note.startTimeMs=900;this.note.endTimeMs=2300;
    this.note.comboNumber=(this.index-1)%9+1;
    const colours=this.skin?.config.colours.comboColours??[[101,230,255]];
    this.note.comboColour=colours[(this.index-1)%colours.length]??[101,230,255];
    this.note.parts=[{kind:'head',position:this.note.position,result:null},{kind:'tail',position:this.note.end,result:null}];
    this.renderer?.setHitObjects([this.note]);
    this.dragStarted=null;this.trackedMs=0;this.totalMs=0;this.lastFrame=performance.now();
    if(this.status)this.status.textContent=message;
    if(this.stats)this.stats.textContent=`성공 ${this.hits} · 재도전 ${this.misses} · ${this.note.kind==='slider'?'슬라이더: 누른 채 공을 따라가세요':'일반 노트: 직접 눌러주세요'}`;
  }
  /** @param {boolean} success */
  complete(success) {
    if(success)this.hits++;else this.misses++;
    this.lastEnd=this.note.end;
    this.feedback=createHitFeedback({type:this.note.kind==='slider'?'slider-judged':'circle-judged',judgement:success?'300':'miss',mapTimeMs:performance.now()},this.note,performance.now());
    this.next(success?'성공! 반대쪽 노트로 크게 움직여 보세요.':'슬라이더를 놓쳤어요. 감도를 조절하고 다시 시도하세요.');
  }
  frame() {
    if(!this.running||!this.input)return;
    const now=performance.now();
    for(const transition of this.input.state.drainTransitions()){
      if(transition.phase!=='press'||this.dragStarted!==null)continue;
      const p=transition.playfieldPosition;
      if(Math.hypot(p.x-this.note.position.x,p.y-this.note.position.y)>this.note.radius)continue;
      if(this.note.kind==='circle')this.complete(true);
      else{this.dragStarted=now;this.note.parts[0].result='hit';this.lastFrame=now;if(this.status)this.status.textContent='키나 버튼을 누른 채 움직이는 공을 끝까지 따라가세요.';}
    }
    if(this.dragStarted!==null){
      const delta=Math.max(0,Math.min(now-this.lastFrame,100));
      const ball=practiceSliderPosition(this.note,now-this.dragStarted);
      const p=this.input.playfieldPosition;
      this.note.tracking=this.input.state.isHolding;
      this.totalMs+=delta;
      if(this.input.state.isHolding&&Math.hypot(p.x-ball.x,p.y-ball.y)<=this.note.radius*SLIDER_FOLLOW_RADIUS_MULTIPLIER)this.trackedMs+=delta;
      if(!this.input.state.isHolding)this.complete(false);
      else if(now-this.dragStarted>=1400)this.complete(this.totalMs>0&&this.trackedMs/this.totalMs>=0.75);
    }
    this.lastFrame=now;
    this.draw(now);
    this.raf=requestAnimationFrame(()=>this.frame());
  }
  /** @param {number} now */
  draw(now) {
    const c=this.context,m=this.mapper,n=this.note;
    const time=this.dragStarted===null?Math.min(now-this.bornAt,900):900+now-this.dragStarted;
    this.renderer.setCursor(this.input.playfieldPosition,now);
    this.renderer.render({circles:n.kind==='circle'?[n]:[],sliders:n.kind==='slider'?[n]:[],spinners:[]},time,900);
    if(this.feedback){
      const progress=(now-this.feedback.startTimeMs)/this.feedback.durationMs;
      if(progress>=0&&progress<1){this.renderer.drawHitFeedback(c,{...this.feedback,progress});this.renderer.drawCursor(c);}
    }
  }
  stop() {this.loadGeneration=(this.loadGeneration??0)+1;this.running=false;cancelAnimationFrame(this.raf);this.input?.setActive(false);this.input?.dispose();this.input=null;window.removeEventListener('resize',this.resize);}
}
