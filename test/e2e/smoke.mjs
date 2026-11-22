/**
 * 端到端冒烟测试（可选运行）：用本机 Chrome + puppeteer-core 驱动真实浏览器。
 *
 * 前置：
 *   1. 先 `npm run dev` 启动服务（默认 127.0.0.1:5173）
 *   2. 临时安装测试依赖（不写入项目 package.json，避免污染运行依赖）：
 *      npm install --no-save puppeteer-core
 *   3. 运行：node test/e2e/smoke.mjs
 *
 * 可用环境变量覆盖：
 *   CHROME_PATH  Chrome 可执行文件；APP_URL  应用地址。
 */
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const APP_URL = process.env.APP_URL || 'http://127.0.0.1:5173/';
const MIDI = fileURLToPath(new URL('../../fixtures/demo.mid', import.meta.url));

const results = [];
function log(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ' | ' + detail : ''}`);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + e.message));

await page.goto(APP_URL, { waitUntil: 'networkidle0', timeout: 30000 });
await new Promise((r) => setTimeout(r, 800));
log('页面加载并渲染', (await page.title()).includes('piano-box'));

await (await page.$('#fileInput')).uploadFile(MIDI);
await new Promise((r) => setTimeout(r, 1000));
const name = await page.$eval('#songName', (e) => e.textContent);
const events = await page.$eval('#statEvents', (e) => +e.textContent);
log('导入真实 MIDI 并解析', name === 'demo' && events > 0, `events=${events}`);

await page.click('#nextBtn');
await new Promise((r) => setTimeout(r, 500));
log('点击按钮推进事件', (await page.$eval('#eventCurrent', (e) => +e.textContent)) === 1);

await page.keyboard.press('KeyA');
await new Promise((r) => setTimeout(r, 300));
log('任意键推进事件', (await page.$eval('#eventCurrent', (e) => +e.textContent)) === 2);

const before = await page.$eval('#eventCurrent', (e) => +e.textContent);
await page.keyboard.down('KeyX');
await new Promise((r) => setTimeout(r, 800));
await page.keyboard.up('KeyX');
await new Promise((r) => setTimeout(r, 200));
const after = await page.$eval('#eventCurrent', (e) => +e.textContent);
log('长按不重复触发', after === before + 1, `${before}->${after}`);

log('琴键高亮生效', (await page.$$eval('.key.active', (e) => e.length)) > 0);

await page.click('.mode-btn[data-mode="auto"]');
await new Promise((r) => setTimeout(r, 300));
await page.click('#playBtn');
await new Promise((r) => setTimeout(r, 1500));
log('自动播放推进', (await page.$eval('#eventCurrent', (e) => +e.textContent)) >= 1);

await page.click('#pauseBtn');
await new Promise((r) => setTimeout(r, 200));
const atPause = await page.$eval('#eventCurrent', (e) => +e.textContent);
await new Promise((r) => setTimeout(r, 800));
log('暂停生效', (await page.$eval('#eventCurrent', (e) => +e.textContent)) === atPause);

await page.click('#resumeBtn');
await new Promise((r) => setTimeout(r, 1200));
log('继续生效', (await page.$eval('#eventCurrent', (e) => +e.textContent)) > atPause);

await page.click('#stopBtn');
await new Promise((r) => setTimeout(r, 300));
log('停止复位', (await page.$eval('#eventCurrent', (e) => +e.textContent)) === 0);

log('无控制台错误', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' || '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n==== ${results.length - failed.length}/${results.length} PASS ====`);
if (failed.length) process.exit(1);
