import puppeteer from 'puppeteer-core';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.env.APP_URL || 'http://127.0.0.1:5173/';
const MIDI = fileURLToPath(new URL('../../fixtures/demo.mid', import.meta.url));
const XML = fileURLToPath(new URL('../../fixtures/demo.musicxml', import.meta.url));
const SHOT = path.join(os.tmpdir(), 'piano-box-transform.png');

const results = [];
function log(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ' | ' + detail : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
await sleep(600);

// --- 1. 导入 MusicXML ---
await (await page.$('#fileInput')).uploadFile(XML);
await sleep(1000);
const name = await page.$eval('#songName', (e) => e.textContent);
const bpm = await page.$eval('#statBpm', (e) => e.textContent);
const evs = await page.$eval('#statEvents', (e) => +e.textContent);
log('导入 MusicXML 成功', name === 'MusicXML Demo' && bpm === '90' && evs === 4, `name=${name} bpm=${bpm} events=${evs}`);

const bannerTxt = await page.$eval('#statusBanner', e => e.hidden ? '' : e.textContent);
log('提示来源为 MusicXML', bannerTxt.includes('MusicXML'), bannerTxt);

// 记录原始音符名（时间线第一个音符）
const note0 = await page.$eval('.tl-row .tl-note', e => e.textContent.trim());
log('时间线显示音符', note0.length > 0, `note="${note0}"`);

// --- 2. 全曲移调 +12 半音 ---
await page.$eval('#transposeSlider', el => { el.value = '12'; el.dispatchEvent(new Event('input', { bubbles: true })); });
await sleep(400);
const transposeVal = await page.$eval('#transposeValue', e => e.textContent);
const note0T = await page.$eval('.tl-row .tl-note', e => e.textContent.trim());
log('移调 +12 半音滑块生效', transposeVal.includes('+12'), `val=${transposeVal}`);
log('移调后音名变化', note0T !== note0, `"${note0}" -> "${note0T}"`);
const badge = await page.$eval('#transformBadge', e => e.textContent);
log('变换徽标变为已应用', badge.includes('已应用'), badge);

// --- 3. 时值 + 力度 ---
await page.$eval('#durationSlider', el => { el.value = '200'; el.dispatchEvent(new Event('input', { bubbles: true })); });
await page.$eval('#velocitySlider', el => { el.value = '50'; el.dispatchEvent(new Event('input', { bubbles: true })); });
await sleep(400);
const durVal = await page.$eval('#durationValue', e => e.textContent);
const velVal = await page.$eval('#velocityValue', e => e.textContent);
log('时值/力度滑块生效', durVal.includes('2.00') && velVal.includes('0.50'), `dur=${durVal} vel=${velVal}`);

// --- 4. 重置 ---
await page.click('#resetTransform');
await sleep(400);
const note0R = await page.$eval('.tl-row .tl-note', e => e.textContent.trim());
const badgeR = await page.$eval('#transformBadge', e => e.textContent);
log('重置恢复原始音名', note0R === note0, `"${note0R}" vs "${note0}"`);
log('重置后徽标为原始', badgeR === '原始', badgeR);

// --- 5. 选中事件范围 ---
await page.click('.tl-row[data-index="0"]');
await page.$eval('input[name="transformScope"][value="selected"]', el => { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); });
await sleep(300);
const tag = await page.$eval('#transformScopeTag', e => e.textContent);
log('选中事件范围显示', tag.includes('1'), tag);
const before0 = await page.$eval('.tl-row[data-index="0"] .tl-note', e => e.textContent.trim());
const before1 = await page.$eval('.tl-row[data-index="1"] .tl-note', e => e.textContent.trim());
await page.$eval('#transposeSlider', el => { el.value = '7'; el.dispatchEvent(new Event('input', { bubbles: true })); });
await sleep(400);
const after0 = await page.$eval('.tl-row[data-index="0"] .tl-note', e => e.textContent.trim());
const after1 = await page.$eval('.tl-row[data-index="1"] .tl-note', e => e.textContent.trim());
log('仅选中事件被移调', after0 !== before0 && after1 === before1, `ev0 "${before0}"->"${after0}", ev1 "${before1}"->"${after1}"`);

// --- 6. 变换后仍可演奏（引擎复用） ---
await page.click('#nextBtn');
await sleep(400);
const cur = await page.$eval('#eventCurrent', e => +e.textContent);
log('变换后仍可推进演奏', cur === 1, `current=${cur}`);

// --- 7. 再导入 MIDI 确认双格式共存 ---
await (await page.$('#fileInput')).uploadFile(MIDI);
await sleep(900);
const name2 = await page.$eval('#songName', e => e.textContent);
const bpm2 = await page.$eval('#statBpm', e => e.textContent);
log('再导入 MIDI 正常', name2 === 'demo' && bpm2 === '120', `name=${name2} bpm=${bpm2}`);

log('无控制台错误', errs.length === 0, errs.slice(0, 2).join(' || '));

await page.screenshot({ path: SHOT, fullPage: true });
console.log('截图：' + SHOT);
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n==== ${results.length - failed.length}/${results.length} PASS ====`);
if (failed.length) { console.log('FAILED:', failed.map((f) => f.name).join('; ')); process.exit(1); }
