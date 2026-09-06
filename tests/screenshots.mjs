/* Regenerates the README screenshots from the live page so the images can never show a UI that
   no longer exists. node tests/screenshots.mjs [baseUrl] */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://127.0.0.1:8813/';
const DIR = new URL('../docs/screenshots/', import.meta.url);
fs.mkdirSync(DIR, { recursive: true });

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const shot = (name, opts = {}) => page.screenshot({ path: new URL(name, DIR).pathname.replace(/^\//, ''), ...opts });

await page.setViewport({ width: 1420, height: 1180, deviceScaleFactor: 2 });
await page.goto(BASE, { waitUntil: 'networkidle0' });
await page.waitForSelector('.kpi');
await shot('1-control-room.png');

await page.click('.post .row[data-id="EUAIA"]');
await page.evaluate(() => document.querySelector('.two').scrollIntoView());
await shot('2-risk-map.png', { clip: await page.$eval('.two', e => {
  const r = e.getBoundingClientRect();
  return { x: r.x - 6, y: r.y - 6, width: r.width + 12, height: r.height + 12 };
}) });

await page.click('#nav button[data-view="systems"]');
await page.waitForSelector('tbody tr');
await shot('3-inventory.png');

await page.click('tbody tr');
await page.waitForSelector('.card');
await page.evaluate(() => {
  document.querySelectorAll('.ctl .ch')[0].click();
});
await new Promise(r => setTimeout(r, 150));
await shot('4-system-card.png');

await page.click('#nav button[data-view="crosswalk"]');
await page.waitForSelector('.xw');
await shot('5-crosswalk.png');

await page.click('#nav button[data-view="board"]');
await page.waitForSelector('.board');
await shot('6-board-view.png');

await page.click('#nav button[data-view="incidents"]');
await page.waitForSelector('.inc');
await shot('7-incidents.png');

await page.setViewport({ width: 390, height: 1500, deviceScaleFactor: 2 });
await page.click('#nav button[data-view="room"]');
await page.waitForSelector('.kpi');
await shot('8-mobile.png');

await browser.close();
console.log('screenshots written to docs/screenshots/');
