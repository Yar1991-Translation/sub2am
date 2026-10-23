import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function findBrowser() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ];
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

const browserPath = findBrowser();
if (!browserPath) {
  console.log('SKIP: Chrome/Edge not found; set CHROME_PATH to run the UI smoke test.');
  process.exit(0);
}

const port = 9200 + Math.floor(Math.random() * 500);
const userDir = mkdtempSync(path.join(os.tmpdir(), 'sub2am-chrome-'));
const distPath = fileURLToPath(new URL('../dist/index.html', import.meta.url));
if (!existsSync(distPath)) {
  console.log('SKIP: dist/index.html not found; run npm run build first.');
  process.exit(0);
}
const pageUrl = pathToFileURL(distPath).href;

const chrome = spawn(browserPath, [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--remote-debugging-port=' + port,
  '--remote-allow-origins=*',
  '--user-data-dir=' + userDir,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--window-size=1440,1250',
  pageUrl
], { stdio: ['ignore', 'ignore', 'pipe'] });

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function getWsUrl() {
  for (let i = 0; i < 80; i++) {
    try {
      const response = await fetch('http://127.0.0.1:' + port + '/json/list');
      const list = await response.json();
      const page = list.find((entry) => entry.type === 'page' && entry.url.includes('index.html'));
      if (page) return page.webSocketDebuggerUrl;
    } catch (e) { /* chrome is still starting */ }
    await sleep(100);
  }
  throw new Error('Chrome DevTools endpoint did not become ready');
}

try {
  const ws = new WebSocket(await getWsUrl());
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });

  let nextId = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const entry = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
      else entry.resolve(message.result);
    }
  };

  function send(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }

  async function evalJs(expression) {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text + ' ' +
        ((result.result && result.result.description) || ''));
    }
    return result.result.value;
  }

  async function clickElement(selector) {
    await evalJs(`(function(){const e=document.querySelector(${JSON.stringify(selector)});if(!e)return false;e.scrollIntoView({block:'center',inline:'center'});return true;})()`);
    await sleep(120);
    const rect = await evalJs(
      `(function(){const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`
    );
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x, y: rect.y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
  }

  await send('Runtime.enable', {});
  await send('Page.enable', {});

  for (let i = 0; i < 60; i++) {
    const rows = await evalJs("document.querySelectorAll('#cueList .cue-row').length");
    if (rows > 0) break;
    await sleep(100);
  }

  assert.equal(await evalJs("document.querySelectorAll('#cueList .cue-row').length"), 3);
  assert.match(await evalJs("document.getElementById('stats').textContent"), /3 条/);
  assert.equal(await evalJs("document.getElementById('generateBtn').disabled"), false);
  assert.match(await evalJs("document.getElementById('sourceInfo').textContent"), /SRT/);
  assert.equal(await evalJs("document.getElementById('lrcModeRow').style.display"), 'none');
  assert.equal(await evalJs("document.getElementById('advanceRow').style.display"), 'none');
  assert.equal(await evalJs("document.getElementById('bgTransparentInput').checked"), false);
  assert.equal(await evalJs("document.getElementById('bgColorInput').disabled"), false);
  assert.equal(await evalJs("document.querySelector('m3e-theme').scheme"), 'dark');
  assert.equal(await evalJs("document.getElementById('themeScope').classList.contains('dark')"), true);
  assert.equal(await evalJs("document.documentElement.classList.contains('dark')"), true);
  assert.match(
    await evalJs("getComputedStyle(document.getElementById('themeScope')).getPropertyValue('--md-sys-color-primary')"),
    /#bec2ff|190\s*[, ]\s*194\s*[, ]\s*255/i
  );
  assert.match(
    await evalJs("getComputedStyle(document.getElementById('themeScope')).getPropertyValue('--md-sys-color-background')"),
    /#131318|19\s*[, ]\s*19\s*[, ]\s*24/i
  );
  assert.equal(await evalJs("document.getElementById('schemeToggle').selected"), false);
  assert.equal(await evalJs("document.getElementById('schemeToggle').getAttribute('aria-label')"), '切换到浅色');

  await evalJs("(function(){document.getElementById('dropzone').click();return 'clicked';})()");
  await sleep(200);
  assert.equal(await evalJs("document.getElementById('dropzone') !== null"), true);

  await clickElement('#loadSampleLrc');
  await sleep(500);
  assert.equal(await evalJs("document.querySelectorAll('#cueList .cue-row').length"), 4);
  assert.match(await evalJs("document.getElementById('stats').textContent"), /LRC/);
  assert.equal(await evalJs("document.getElementById('lastCueRow').style.display"), '');
  assert.equal(await evalJs("document.getElementById('lrcModeRow').style.display"), '');
  assert.equal(await evalJs("document.getElementById('titleInput').value"), '示例歌词');
  assert.equal(
    await evalJs("document.getElementById('sourceInfo').textContent").then((text) => text.includes('示例歌词')),
    true
  );

  await clickElement('#orientationBtns m3e-button-segment[value="portrait"]');
  await sleep(400);
  assert.equal(await evalJs("document.getElementById('widthInput').value"), '1080');
  assert.equal(await evalJs("document.getElementById('heightInput').value"), '1920');
  assert.equal(
    await evalJs("document.getElementById('stage').clientHeight > document.getElementById('stage').clientWidth"),
    true
  );

  await evalJs("(function(){var e=document.getElementById('sizeInput');e.value='0';e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await sleep(300);
  assert.equal(await evalJs("document.getElementById('generateBtn').disabled"), true);
  assert.match(await evalJs("document.getElementById('status').textContent"), /字号/);

  await evalJs("(function(){var e=document.getElementById('sizeInput');e.value='32';e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await sleep(300);
  assert.equal(await evalJs("document.getElementById('generateBtn').disabled"), false);
  assert.doesNotMatch(await evalJs("document.getElementById('status').textContent"), /字号/);

  await evalJs("(function(){var e=document.getElementById('positionSelect');e.value='middle';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await sleep(200);
  assert.equal(await evalJs("document.getElementById('marginInput').disabled"), true);
  await evalJs("(function(){var e=document.getElementById('positionSelect');e.value='top';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await sleep(200);
  assert.equal(await evalJs("document.getElementById('marginInput').disabled"), false);

  const before = await evalJs("document.getElementById('stats').textContent");
  await evalJs("(function(){var e=document.getElementById('lastCueInput');e.value='5';e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await sleep(600);
  const after = await evalJs("document.getElementById('stats').textContent");
  assert.notEqual(before, after);

  await evalJs("(function(){var e=document.getElementById('lastCueInput');e.value='3';e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await sleep(400);

  const gbkBytes = [0x31, 0x0A, 0x30, 0x30, 0x3A, 0x30, 0x30, 0x3A, 0x30, 0x30, 0x2C, 0x30, 0x30, 0x30, 0x20, 0x2D, 0x2D, 0x3E, 0x20, 0x30, 0x30, 0x3A, 0x30, 0x30, 0x3A, 0x30, 0x32, 0x2C, 0x30, 0x30, 0x30, 0x0A, 0xC4, 0xE3, 0xBA, 0xC3, 0xA3, 0xAC, 0xCA, 0xC0, 0xBD, 0xE7, 0xA3, 0xA1, 0x0A];
  await evalJs(
    '(function(){' +
    'var bytes=new Uint8Array(' + JSON.stringify(gbkBytes) + ');' +
    "var file=new File([bytes],'gbk-sub.srt',{type:'text/plain'});" +
    'var dt=new DataTransfer();dt.items.add(file);' +
    "var dz=document.getElementById('dropzone');" +
    "dz.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}));" +
    '})()'
  );
  await sleep(700);
  assert.equal(await evalJs("document.querySelectorAll('#cueList .cue-row').length"), 1);
  assert.match(await evalJs("document.getElementById('sourceInfo').textContent"), /gb18030/);
  assert.equal(await evalJs("document.getElementById('stageText').textContent"), '你好，世界！');
  assert.equal(await evalJs("document.getElementById('titleInput').value"), 'gbk-sub');

  await evalJs("(function(){var e=document.getElementById('encodingSelect');e.value='utf-8';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await sleep(500);
  assert.match(await evalJs("document.getElementById('sourceInfo').textContent"), /解码失败/);

  await evalJs("(function(){var e=document.getElementById('encodingSelect');e.value='gb18030';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await sleep(500);
  assert.equal(await evalJs("document.getElementById('stageText').textContent"), '你好，世界！');

  await evalJs("(function(){var e=document.getElementById('formatSelect');e.value='lrc';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await sleep(400);
  assert.equal(await evalJs("document.querySelectorAll('#cueList .cue-row').length"), 0);
  assert.equal(await evalJs("document.getElementById('generateBtn').disabled"), true);

  await evalJs("(function(){var e=document.getElementById('formatSelect');e.value='auto';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await sleep(400);
  assert.equal(await evalJs("document.querySelectorAll('#cueList .cue-row').length"), 1);

  const percharLrc = '[00:01.000]私[00:02.000]の[00:03.000]居[00:04.000]';
  await evalJs(
    '(function(){' +
    'var file=new File([new TextEncoder().encode(' + JSON.stringify(percharLrc) + ")],'perchar.lrc',{type:'text/plain'});" +
    'var dt=new DataTransfer();dt.items.add(file);' +
    "var dz=document.getElementById('dropzone');" +
    "dz.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}));" +
    '})()'
  );
  await sleep(700);
  assert.equal(await evalJs("document.querySelectorAll('#cueList .cue-row').length"), 3);
  assert.equal(await evalJs("document.querySelectorAll('#cueList .cue-row .cue-text')[0].textContent"), '私');
  assert.equal(await evalJs("document.querySelectorAll('#cueList .cue-row .cue-text')[1].textContent"), 'の');
  assert.equal(await evalJs("document.querySelectorAll('#cueList .cue-row .cue-text')[2].textContent"), '居');
  assert.equal(await evalJs("document.getElementById('lrcModeRow').style.display"), '');
  assert.equal(await evalJs("document.getElementById('lrcModeSelect').value"), 'chars');
  assert.equal(await evalJs("document.getElementById('advanceRow').style.display"), '');
  assert.equal(await evalJs("document.getElementById('generateBtn').disabled"), false);

  await evalJs("document.querySelectorAll('#cueList .cue-row')[2].click()");
  await sleep(250);
  assert.equal(await evalJs("document.getElementById('stageChars').style.display"), 'block');
  assert.equal(await evalJs("document.getElementById('stageText').style.display"), 'none');
  assert.equal(await evalJs("document.querySelectorAll('#stageChars .stage-char').length"), 3);
  const layoutLefts = await evalJs(
    "Array.from(document.querySelectorAll('#stageChars .stage-char')).map(function(s){return s.style.left;})"
  );
  assert.equal(new Set(layoutLefts).size, 3);

  await evalJs("(function(){var e=document.getElementById('advanceInput');e.value='50';e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await sleep(350);
  const compactLefts = await evalJs(
    "Array.from(document.querySelectorAll('#stageChars .stage-char')).map(function(s){return s.style.left;})"
  );
  assert.notEqual(JSON.stringify(layoutLefts), JSON.stringify(compactLefts));
  await evalJs("(function(){var e=document.getElementById('advanceInput');e.value='100';e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await sleep(300);

  assert.equal(await evalJs("document.getElementById('cueSlider').max"), 2);
  assert.equal(await evalJs("document.getElementById('cueSliderThumb').value"), 2);
  await evalJs("(function(){var t=document.getElementById('cueSliderThumb');t.value=0;t.dispatchEvent(new Event('input',{bubbles:true}));var s=document.getElementById('cueSlider');s.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await sleep(300);
  assert.equal(await evalJs("document.querySelector('#cueList .cue-row.active').dataset.index"), '0');
  await evalJs("(function(){var t=document.getElementById('cueSliderThumb');t.value=2;t.dispatchEvent(new Event('input',{bubbles:true}));var s=document.getElementById('cueSlider');s.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await sleep(300);
  assert.equal(await evalJs("document.querySelector('#cueList .cue-row.active').dataset.index"), '2');

  await clickElement('#prevBtn');
  await sleep(300);
  assert.equal(await evalJs("document.querySelector('#cueList .cue-row.active').dataset.index"), '1');
  assert.equal(await evalJs("document.getElementById('cueSliderThumb').value"), 1);
  await clickElement('#nextBtn');
  await sleep(300);
  assert.equal(await evalJs("document.querySelector('#cueList .cue-row.active').dataset.index"), '2');

  await evalJs("(function(){var e=document.getElementById('lrcModeSelect');e.value='karaoke';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await sleep(450);
  assert.equal(await evalJs("document.querySelectorAll('#cueList .cue-row').length"), 3);
  assert.equal(await evalJs("document.querySelectorAll('#cueList .cue-row .cue-text')[0].textContent"), '私');
  assert.equal(await evalJs("document.querySelectorAll('#cueList .cue-row .cue-text')[1].textContent"), '私の');
  assert.equal(await evalJs("document.querySelectorAll('#cueList .cue-row .cue-text')[2].textContent"), '私の居');
  assert.equal(await evalJs("document.getElementById('stageChars').style.display"), 'none');
  assert.equal(await evalJs("document.getElementById('stageText').style.display"), '');
  assert.equal(await evalJs("document.getElementById('advanceRow').style.display"), 'none');

  await evalJs("(function(){var e=document.getElementById('lrcModeSelect');e.value='line';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await sleep(450);
  assert.equal(await evalJs("document.querySelectorAll('#cueList .cue-row').length"), 1);
  assert.equal(await evalJs("document.querySelectorAll('#cueList .cue-row .cue-text')[0].textContent"), '私の居');
  assert.equal(await evalJs("document.getElementById('stageText').textContent"), '私の居');

  await evalJs("(function(){var e=document.getElementById('lrcModeSelect');e.value='chars';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await sleep(450);
  assert.equal(await evalJs("document.querySelectorAll('#cueList .cue-row').length"), 3);
  assert.equal(await evalJs("document.getElementById('advanceRow').style.display"), '');

  assert.equal(await evalJs("document.getElementById('bgTransparentInput').checked"), false);
  assert.equal(await evalJs("document.getElementById('bgColorInput').disabled"), false);
  await evalJs("(function(){var e=document.getElementById('bgTransparentInput');e.checked=true;e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await sleep(300);
  assert.equal(await evalJs("document.getElementById('stage').classList.contains('transparent')"), true);
  assert.equal(await evalJs("document.getElementById('bgColorInput').disabled"), true);
  await evalJs("(function(){var e=document.getElementById('bgTransparentInput');e.checked=false;e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await sleep(300);
  assert.equal(await evalJs("document.getElementById('stage').classList.contains('transparent')"), false);
  assert.equal(await evalJs("document.getElementById('bgColorInput').disabled"), false);

  await clickElement('#helpBtn');
  await sleep(450);
  assert.equal(await evalJs("document.getElementById('helpDialog').open"), true);
  await evalJs("document.getElementById('helpDialog').open = false");
  await sleep(350);
  assert.equal(await evalJs("document.getElementById('helpDialog').open"), false);

  assert.equal(await evalJs("document.getElementById('generateBtn').disabled"), false);
  await clickElement('#generateBtn');
  await sleep(600);
  assert.match(await evalJs("document.getElementById('status').textContent"), /已生成/);

  await clickElement('#schemeToggle');
  await sleep(450);
  assert.equal(await evalJs("document.querySelector('m3e-theme').scheme"), 'light');
  assert.equal(await evalJs("document.getElementById('themeScope').classList.contains('light')"), true);
  assert.equal(await evalJs("document.documentElement.classList.contains('light')"), true);
  assert.match(
    await evalJs("getComputedStyle(document.getElementById('themeScope')).getPropertyValue('--md-sys-color-primary')"),
    /#555992|85\s*[, ]\s*89\s*[, ]\s*146/i
  );
  assert.match(
    await evalJs("getComputedStyle(document.getElementById('themeScope')).getPropertyValue('--md-sys-color-background')"),
    /#fbf8ff|251\s*[, ]\s*248\s*[, ]\s*255/i
  );
  assert.equal(await evalJs("document.getElementById('schemeToggle').selected"), true);
  assert.equal(await evalJs("document.getElementById('schemeToggle').getAttribute('aria-label')"), '切换到深色');
  assert.equal(await evalJs("document.documentElement.style.colorScheme.includes('light')"), true);
  assert.equal(await evalJs("localStorage.getItem('sub2am.scheme')"), 'light');

  await send('Page.reload', { ignoreCache: true });
  await sleep(1600);
  for (let i = 0; i < 40; i++) {
    if (await evalJs("document.querySelectorAll('#cueList .cue-row').length")) break;
    await sleep(100);
  }
  assert.equal(await evalJs("document.querySelector('m3e-theme').scheme"), 'light');
  assert.equal(await evalJs("document.getElementById('themeScope').classList.contains('light')"), true);
  assert.equal(await evalJs("document.getElementById('schemeToggle').selected"), true);
  assert.equal(await evalJs("localStorage.getItem('sub2am.scheme')"), 'light');

  await clickElement('#schemeToggle');
  await sleep(450);
  assert.equal(await evalJs("document.querySelector('m3e-theme').scheme"), 'dark');
  assert.equal(await evalJs("document.getElementById('themeScope').classList.contains('dark')"), true);
  assert.equal(await evalJs("document.getElementById('schemeToggle').selected"), false);
  assert.equal(await evalJs("localStorage.getItem('sub2am.scheme')"), 'dark');

  console.log('UI smoke OK');
  ws.close();
} finally {
  chrome.kill();
  await sleep(300);
  try { rmSync(userDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
}
