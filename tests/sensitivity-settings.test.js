import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LocalRepository, normalizeSettings } from '../src/storage/localRepository.js';
import { InputManager } from '../src/input/inputManager.js';

test('mouse sensitivity defaults to 1.00 and accepts only the 1–1.5 range', () => {
 assert.equal(normalizeSettings({}).mouseSensitivity,1);
 for (const value of [1,1.15,1.27,1.5]) assert.equal(normalizeSettings({mouseSensitivity:value}).mouseSensitivity,value);
 for (const value of [0.99,1.51,NaN,Infinity,'1.4']) assert.equal(normalizeSettings({mouseSensitivity:value}).mouseSensitivity,1);
});
test('selected sensitivity survives settings reload and preserves other options', () => {
 const values=new Map();
 const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 const repo=new LocalRepository(storage);
 repo.saveSettings({...repo.loadSettings(),mouseSensitivity:1.37,musicVolume:0.4});
 const restored=new LocalRepository(storage).loadSettings();
 assert.equal(restored.mouseSensitivity,1.37);
 assert.equal(restored.musicVolume,0.4);
});
test('input movement follows each selected sensitivity including both limits', () => {
 for (const sensitivity of [1,1.15,1.5]) {
  const input=new InputManager({clock:{getMapTimeMs:()=>0,eventTimestampToMapTime:t=>({mapTimeMs:t,fallback:false})},mapper:{screenToPlayfield:p=>p},requestPause:()=>{},sensitivity});
  input.setActive(true);
  input.handlePointerMove({clientX:100,clientY:100,timeStamp:0});
  input.handlePointerMove({clientX:120,clientY:100,timeStamp:1});
  assert.equal(input.playfieldPosition.x,100+20*sensitivity);
 }
});
