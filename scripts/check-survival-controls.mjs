// Run against npm run dev. Set CHROME_PATH and APNAGALI_TEST_URL when needed.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const pause = ms => new Promise(r => setTimeout(r, ms));
const profile = resolve(`node_modules/.tmp/survival-browser-${process.pid}`);
const executable = process.env.CHROME_PATH ?? ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(existsSync);
assert.ok(executable, 'Set CHROME_PATH to a Chrome/Chromium executable');
await mkdir(profile, { recursive: true });
const chrome = spawn(executable, ['--headless=new', '--no-sandbox', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=9333', '--remote-allow-origins=*', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let ws;
try {
  let tabs;
  for (let i=0; i<30; i++) { try { tabs = await (await fetch('http://127.0.0.1:9333/json')).json(); break; } catch { await pause(300); } }
  if (!tabs) throw new Error('Chrome debugging endpoint did not start');
  ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r,j) => { ws.onopen=r; ws.onerror=j; });
  let id=0;
  const pending = new Map();
  const errors=[];
  ws.onmessage = event => {
    const data=JSON.parse(event.data);
    if (data.id) {
      const job = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) job.reject(new Error(JSON.stringify(data.error)));
      else job.resolve(data.result);
    }
    if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.exception?.description ?? data.params.exceptionDetails.text);
  };
  const send = (method,params={}) => new Promise((resolve,reject) => { const requestId=++id; pending.set(requestId,{resolve,reject}); ws.send(JSON.stringify({id:requestId,method,params})); });
  const evaluate = async expression => {
    const result=await send('Runtime.evaluate',{expression, returnByValue:true, awaitPromise:true,userGesture:true});
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  await send('Page.bringToFront');
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('apnagali.tutorial.v1.guest','1');localStorage.setItem('apnagali.graphics.v1',JSON.stringify({preset:'low',shadows:false,textureQuality:'low',population:'off',adaptive:false}));`});
  await send('Page.navigate',{url:process.env.APNAGALI_TEST_URL ?? 'http://127.0.0.1:5173/'});
  for (let i=0;i<45;i++) { if (await evaluate('!!window.__apna')) break; await pause(1000); }
  if (!await evaluate('!!window.__apna')) throw new Error('Game did not initialize');
  console.log('Boot:',await evaluate(`JSON.stringify({touch:matchMedia('(pointer: coarse)').matches,canvas:!!document.querySelector('canvas'),graphics:__apna.game.getState().graphics})`));
  for(let i=0;i<20;i++) { if(await evaluate(`!!Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim().toLowerCase()==='start')`)) break; await pause(1000); }
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim().toLowerCase()==='start')?.click()`);
  await pause(2000);


  const state = () => evaluate(`({intro:__apna.combat.run.intro,active:__apna.combat.active,alive:__apna.combat.player.alive,pos:__apna.three.camera.position.toArray(),rot:__apna.three.camera.rotation.toArray(),locked:document.pointerLockElement===__apna.three.gl.domElement,focused:document.activeElement===__apna.three.gl.domElement})`);
  const key = (type,code,keyText) => send('Input.dispatchKeyEvent',{type,code,key:keyText});
  const distance = (a,b) => Math.hypot(a.pos[0]-b.pos[0],a.pos[2]-b.pos[2]);
  await evaluate(`__apna.game.getState().setMode('roam'); __apna.game.getState().setRoamSubMode('survival');`);
  await pause(1200);
  assert.equal((await state()).intro,true);
  // Holding W across Begin must work without releasing/repressing it.
  await key('keyDown','KeyW','w');
  await pause(300);
  const intro = await state();
  const began = await evaluate(`(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Begin day'));b?.click();return !!b;})()`);
  assert.ok(began,'survival Begin button is reachable');
  await pause(1000);
  const started = await state();
  await key('keyUp','KeyW','w');
  assert.equal(started.intro,false);
  assert.equal(started.locked,true,'Begin captures the actual rendering canvas');
  assert.equal(started.focused,true,'Begin returns keyboard focus to the game');
  assert.ok(distance(intro,started)>0.3,'W held across Begin moves the player');
  console.log('PASS: survival Begin, canvas focus/capture, held movement across intro');
  for (const [code,text] of [['KeyW','w'],['KeyA','a'],['KeyS','s'],['KeyD','d']]) {
    await pause(150);
    const before=await state();
    await key('keyDown',code,text);
    await pause(550);
    await key('keyUp',code,text);
    const after=await state();
    assert.ok(distance(before,after)>0.3,`${code} must move the player`);
  }
  const beforeLook=await state();
  await evaluate(`document.dispatchEvent(new MouseEvent('mousemove',{movementX:100,movementY:20,bubbles:true}))`);
  const afterLook=await state();
  assert.ok(Math.abs(afterLook.rot[1]-beforeLook.rot[1])>0.1,'captured mouse changes yaw');
  assert.ok(Math.abs(afterLook.rot[0]-beforeLook.rot[0])>0.01,'captured mouse changes pitch');
  console.log('PASS: all WASD directions and captured mouse yaw/pitch');
  await key('keyDown','KeyW','w');
  await pause(200);
  await evaluate(`window.dispatchEvent(new Event('blur'))`);
  await pause(350);
  const stopped=await state();
  await pause(600);
  assert.ok(distance(stopped,await state())<0.1,'blur clears held movement without needing keyup');
  await key('keyUp','KeyW','w');
  await key('keyDown','KeyW','w');
  await key('keyDown','ArrowUp','ArrowUp');
  await key('keyUp','KeyW','w');
  const alias=await state();
  await pause(550);
  assert.ok(distance(alias,await state())>0.3,'releasing W must not cancel held ArrowUp');
  await key('keyUp','ArrowUp','ArrowUp');
  console.log('PASS: focus-loss reset and simultaneous movement-key aliases');
  await evaluate(`__apna.combat.retry()`);
  await pause(500);
  assert.equal((await state()).intro,true);
  await key('keyDown','Enter','Enter');
  await key('keyUp','Enter','Enter');
  await pause(300);
  assert.equal((await state()).intro,false,'Enter dismisses retry intro');
  assert.equal((await state()).locked,true,'Enter recaptures the canvas');
  assert.equal(await evaluate(`__apna.combat.toasts.filter(t=>t.text.startsWith('Day 1.')).length`),1,'one Enter must start the run once');
  assert.deepEqual(errors,[],'no browser runtime exceptions');
  console.log('PASS: retry/Enter start is idempotent, mouse capture recovers, no runtime exceptions');
} finally { ws?.close(); chrome.kill(); }
