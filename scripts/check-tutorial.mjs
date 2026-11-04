// Run against npm run dev. Set CHROME_PATH and APNAGALI_TEST_URL when needed.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const pause = ms => new Promise(r => setTimeout(r, ms));
const profile = resolve(`node_modules/.tmp/tutorial-browser-${process.pid}`);
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
  const contexts=[];
  let tutorialContext;
  ws.onmessage = event => {
    const data=JSON.parse(event.data);
    if (data.id) {
      const job = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) job.reject(new Error(JSON.stringify(data.error)));
      else job.resolve(data.result);
    }
    if(data.method==='Runtime.executionContextCreated') contexts.push(data.params.context);
    if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.exception?.description ?? data.params.exceptionDetails.text);
  };
  const send = (method,params={}) => new Promise((resolve,reject) => { const requestId=++id; pending.set(requestId,{resolve,reject}); ws.send(JSON.stringify({id:requestId,method,params})); });
  const evaluate = async (expression, contextId) => {
    const result=await send('Runtime.evaluate',{expression, contextId, returnByValue:true, awaitPromise:true,userGesture:true});
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



  const waitFor = async (fn, label, timeout=20000) => { const start=Date.now(); while(Date.now()-start<timeout) { if(await fn())return; await pause(150); } console.log('DIAGNOSTIC',await child(`JSON.stringify({lesson:document.querySelector('[data-tutorial-lesson]')?.dataset.tutorialLesson,focus:document.activeElement?.tagName,hasFocus:document.hasFocus(),view:window.__apna?.viewState,frame:window.__apna?.three.frameloop,time:window.__apna?.sim.time,mode:window.__apna?.game.getState().mode,rot:window.__apna?.three.camera.rotation.toArray(),lock:document.pointerLockElement?.tagName,combat:window.__apna&&{active:__apna.combat.active,driving:__apna.combat.driving,intro:__apna.combat.run.intro,cooldown:__apna.combat.player.cooldown,swing:__apna.combat.player.swing}})`)); throw new Error('Timed out: '+label); };
  const child = code => evaluate(code,tutorialContext);
  await evaluate(`__apna.city.getState().setPieces([{id:'original-house',type:'house',gx:20,gz:20,rot:0,floors:2,facade:'brick',roof:'slate'}])`);
  await pause(1200);
  const original = await evaluate(`JSON.stringify(__apna.city.getState().pieces)`);
  await evaluate(`document.querySelector('[aria-label="Help: replay tutorial"]').click()`);
  await waitFor(async()=>{
    const frames=await send('Page.getFrameTree');
    const frame=frames.frameTree.childFrames?.find(f=>f.frame.url.includes('practice=1'));
    const ctx=frame && contexts.find(c=>c.auxData?.frameId===frame.frame.id&&c.auxData.isDefault);
    if(ctx) {tutorialContext=ctx.id;return await child('!!document.querySelector("[data-tutorial-lesson]")');}return false;
  },'practice iframe ready',45000);
  const storage=()=>evaluate(`JSON.stringify(Object.fromEntries(Object.keys(localStorage).sort().filter(k=>!k.includes('tutorial')).map(k=>[k,localStorage.getItem(k)])))`);
  await pause(1000);
  const beforeStorage=await storage();
  const frozen=await evaluate('__apna.sim.time');
  const lesson=()=>child(`document.querySelector('[data-tutorial-lesson]')?.dataset.tutorialLesson`);
  const advance = async expected => {
    await waitFor(()=>child(`!!document.querySelector('[aria-label="Next lesson"]:not(:disabled)')`),'lesson done: '+await lesson());
    await child(`document.querySelector('[aria-label="Next lesson"]').click()`);
    await waitFor(async()=>await lesson()===expected,'lesson '+expected);
    await pause(1000);
    console.log('Lesson:',expected);
  };
  const press = async(code,key,ms=500)=>{
    await send('Input.dispatchKeyEvent',{type:'keyDown',code,key});await pause(ms);
    await send('Input.dispatchKeyEvent',{type:'keyUp',code,key});
  };
  assert.equal(await lesson(),'welcome');
  await advance('camera');
  await child(`document.querySelector('canvas').focus()`);
  console.log('CAMERA BEFORE',await child(`JSON.stringify({view:__apna.viewState,focus:document.hasFocus(),parent:parent.document.activeElement?.tagName})`));
  await press('KeyW','w',1800);
  console.log('CAMERA AFTER',await child(`JSON.stringify(__apna.viewState)`));
  await advance('road');
  assert.equal(await child(`document.querySelector('[aria-label="Next lesson"]').disabled`),true,'steps cannot be skipped with Next');
  const clickTarget=async(x,z)=>{
    const p=await child(`(()=>{const s=__apna.three;const p=s.camera.position.clone().set(${x},0,${z}).project(s.camera);return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};})()`);
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',...p});
    await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p});
    await pause(500);
  };
  await clickTarget(3,9);
  await advance('house');
  await clickTarget(9,9);
  await advance('walk');
  console.log('Walk before:',await child(`JSON.stringify({pos:__apna.three.camera.position.toArray(),view:__apna.viewState,yaw:__apna.three.camera.rotation.y,alive:__apna.combat.player.alive,intro:__apna.combat.run.intro})`));
  await child(`document.querySelector('canvas').requestPointerLock()`);
  await child(`document.dispatchEvent(new MouseEvent('mousemove',{movementX:140,movementY:0,bubbles:true}))`);
  await press('KeyW','w',1800);
  console.log('Walk after:',await child(`JSON.stringify({pos:__apna.three.camera.position.toArray(),view:__apna.viewState,yaw:__apna.three.camera.rotation.y})`));
  await advance('enter');
  await child(`document.querySelector('canvas').focus()`);
  await press('KeyE','e',40);
  await advance('drive');
  await press('KeyW','w',3000);
  await advance('exit');
  await press('KeyE','e',40);
  await advance('survival');
  await waitFor(()=>child(`!!Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Begin day'))`),'survival intro');
  await child(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Begin day')).click()`);
  await advance('crouch');
  await child(`document.querySelector('canvas').focus()`);
  await press('KeyC','c',300);
  await advance('torch');
  await press('KeyL','l',40);
  await advance('attack');
  await child(`document.querySelector('canvas').requestPointerLock()`);
  await child(`window.dispatchEvent(new MouseEvent('mousedown',{button:0,bubbles:true}))`);
  await pause(900);
  await child(`window.dispatchEvent(new MouseEvent('mouseup',{button:0,bubbles:true}))`);
  await advance('hide');
  await child(`document.querySelector('canvas').focus()`);
  await press('KeyE','e',40);
  await advance('leave');
  await press('KeyE','e',40);
  await advance('finish');
  assert.equal(await evaluate('__apna.sim.time'),frozen,'main world must stay paused');
  assert.equal(await evaluate(`JSON.stringify(__apna.city.getState().pieces)`),original,'main city must stay unchanged');
  assert.equal(await storage(),beforeStorage,'practice must not write saved worlds, money, settings or city progress');
  await waitFor(()=>child(`!!document.querySelector('[aria-label="Finish tutorial"]:not(:disabled)')`),'finish enabled');
  await child(`document.querySelector('[aria-label="Finish tutorial"]').click()`);
  await waitFor(()=>evaluate(`!document.querySelector('iframe[title="Practice city tutorial"]')`),'tutorial exit');
  assert.equal(await evaluate(`localStorage.getItem('apnagali.tutorial.v1.guest')`),'1');
  console.log('PASS: all 15 interactive lessons, real building input, walking, driving, survival, shelter, completion');
  console.log('PASS: main game paused, original city unchanged, no practice writes to player storage');
  await evaluate(`document.querySelector('[aria-label="Help: replay tutorial"]').click()`);
  await waitFor(()=>evaluate(`!!document.querySelector('iframe[title="Practice city tutorial"]')`),'Help replay');
  console.log('PASS: top-bar Help reopens practice');
  assert.deepEqual(errors,[],'no browser runtime exceptions');
} finally { ws?.close(); chrome.kill(); }
