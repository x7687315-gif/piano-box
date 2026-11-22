import puppeteer from 'puppeteer-core';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const APP_URL = process.env.APP_URL || 'http://127.0.0.1:5173/';
const MIDI = fileURLToPath(new URL('../../fixtures/demo.mid', import.meta.url));
const SHOT = path.join(os.tmpdir(), 'piano-box-guide-pedal.png');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const log = (n, ok, d = '') => { results.push({ n, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} | ${n}${d ? ' | ' + d : ''}`); };

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const pg = await b.newPage();
await pg.setViewport({ width: 1400, height: 1000 });
const errs = [];
pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
pg.on('pageerror', (e) => errs.push('ERR ' + e.message));
await pg.goto(APP_URL, { waitUntil: 'networkidle0', timeout: 30000 });
await pg.evaluate(() => localStorage.removeItem('pianobox-tip-seen'));
await pg.reload({ waitUntil: 'networkidle0' });
await sleep(500);

// 导入
await (await pg.$('#fileInput')).uploadFile(MIDI);
await sleep(1000);

// --- 新手引导 ---
const tipShown = await pg.$eval('#beginnerTip', e => !e.hidden);
log('首次导入显示新手引导卡片', tipShown);
const hintKeysBefore = await pg.$$eval('.key.hint', els => els.length);
const nextUpBefore = await pg.$$eval('.tl-row.next-up', els => els.length);
log('未开播时高亮"下一步"音符（描边）', hintKeysBefore > 0, `hintKeys=${hintKeysBefore}`);
log('时间线标记下一步行', nextUpBefore === 1, `nextUp=${nextUpBefore}`);

await pg.click('#tipClose');
await sleep(200);
const tipHidden = await pg.$eval('#beginnerTip', e => e.hidden);
const seen = await pg.evaluate(() => localStorage.getItem('pianobox-tip-seen'));
log('关闭引导并记住', tipHidden && seen === '1', `hidden=${tipHidden} seen=${seen}`);

// 手动推进，验证 hint 跟随
await pg.click('#nextBtn'); // 解锁音频 + 推进到 ev0
await sleep(500);
const activeKeys = await pg.$$eval('.key.active', els => els.length);
const hintKeysAfter = await pg.$$eval('.key.hint', els => els.length);
log('当前音实心高亮', activeKeys > 0, `active=${activeKeys}`);
log('下一音描边提示跟随', hintKeysAfter > 0, `hint=${hintKeysAfter}`);

// --- 三踏板 ---
const pedalBtns = await pg.$$eval('.pedal-btn', els => els.length);
log('三个踏板按钮存在', pedalBtns === 3, `count=${pedalBtns}`);

// 点击踏板按钮（按住）
await pg.evaluate(() => {
  const btn = document.getElementById('pedalSustain');
  btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
});
await sleep(150);
const sustainDown = await pg.$eval('#pedalSustain', e => e.classList.contains('down'));
log('点击延音踏板变按下态', sustainDown);
await pg.evaluate(() => {
  const btn = document.getElementById('pedalSustain');
  btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
});
await sleep(150);
const sustainUp = await pg.$eval('#pedalSustain', e => !e.classList.contains('down'));
log('松开延音踏板复位', sustainUp);

// F1/F2/F3 键盘映射
for (const [code, id] of [['F1', 'pedalSoft'], ['F2', 'pedalSostenuto'], ['F3', 'pedalSustain']]) {
  await pg.keyboard.down(code);
  await sleep(120);
  const down = await pg.$eval('#' + id, e => e.classList.contains('down'));
  await pg.keyboard.up(code);
  await sleep(120);
  const up = await pg.$eval('#' + id, e => !e.classList.contains('down'));
  log(`${code} 映射踏板并正常抬起`, down && up, `down=${down} up=${up}`);
}

// 音乐盒任意键推进不被 F 键干扰（F 键用于踏板）
const curBefore = await pg.$eval('#eventCurrent', e => +e.textContent);
await pg.keyboard.press('KeyM');
await sleep(300);
const curAfter = await pg.$eval('#eventCurrent', e => +e.textContent);
log('普通键仍推进乐曲（F键不误触发）', curAfter === curBefore + 1, `${curBefore}->${curAfter}`);

log('无控制台错误', errs.length === 0, errs.slice(0, 2).join(' || '));
await pg.screenshot({ path: SHOT, fullPage: true });
await b.close();
const failed = results.filter(r => !r.ok);
console.log(`\n==== ${results.length - failed.length}/${results.length} PASS ====`);
if (failed.length) { console.log('FAILED:', failed.map(f => f.n).join('; ')); process.exit(1); }
