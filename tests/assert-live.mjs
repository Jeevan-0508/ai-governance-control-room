/* Headless assertions for the operator console at docs/live/. The console is the version a person
   actually uses, so the test drives it the way a person would: boot, register a system, check the
   obligations it derives, record evidence, reload to prove it persisted, then delete.

   node tests/assert-live.mjs [baseUrl]   default http://127.0.0.1:8813/ */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const BASE = (process.argv[2] || 'http://127.0.0.1:8813/') + 'live/';
let pass = 0;
const fails = [];
const ok = (c, l) => { if (c) pass++; else fails.push(l); };
const eq = (a, b, l) => ok(a === b, `${l} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`);

const raw = {};
for (const n of ['frameworks', 'controls', 'taxonomy', 'exposure']) {
  raw[n] = JSON.parse(fs.readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
}
const reqs = {};
for (const f of raw.frameworks.frameworks) for (const r of f.requirements) reqs[r.id] = r;
const classes = Object.fromEntries(raw.taxonomy.classes.map(c => [c.id, c]));
const applies = (r, role, tier, flags) => {
  const a = r.applies || {};
  if (a.roles && !a.roles.includes(role)) return false;
  if (a.tiers && !a.tiers.includes(tier)) return false;
  if (a.conditions && !a.conditions.some(c => flags.includes(c))) return false;
  return true;
};

const bootUp = async () => {
  /* the log is written in the same tick the skip listeners are bound, so this is the
     earliest moment a keypress can be honoured */
  await page.waitForFunction(() => (document.querySelector('#bootlog') || {}).textContent);
  await page.keyboard.press('Enter');
  await page.waitForSelector('#shell:not(.hidden)', { timeout: 15000 });
  await page.waitForFunction(() => document.querySelector('#boot') === null, { timeout: 5000 });
};

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.setViewport({ width: 1420, height: 1000 });

/* ---- 1. boot sequence ---- */
await page.goto(BASE, { waitUntil: 'networkidle0' });
await page.waitForSelector('#bootlog');
const bootText = await page.$eval('#bootlog', e => e.textContent);
ok(bootText.includes('AI RISK CONTROL ROOM'), 'boot banner names the instrument');
const totalReqs = raw.frameworks.frameworks.reduce((a, f) => a + f.requirements.length, 0);
ok(await page.evaluate(async (n) => {
  for (let i = 0; i < 60; i++) {
    if (document.querySelector('#bootlog').textContent.includes(n + ' requirements')) return true;
    await new Promise(r => setTimeout(r, 100));
  }
  return false;
}, totalReqs), 'boot readout reports the real requirement count from the data files');
await page.waitForSelector('#shell:not(.hidden)', { timeout: 15000 });
await page.waitForFunction(() => document.querySelector('#boot') === null, { timeout: 5000 })
  .catch(() => {});
ok(await page.$('#boot') === null, 'boot overlay is removed once the console is up');

/* ---- 2. empty state ---- */
await page.evaluate(() => localStorage.removeItem('aigcr.live.portfolio.v1'));
await page.reload({ waitUntil: 'networkidle0' });
await bootUp();
await page.waitForSelector('.empty');
ok((await page.$eval('.empty', e => e.textContent)).includes('inventory is empty'),
  'an empty console explains itself instead of showing zeros');
ok(await page.$('button[data-act="new-system"]') !== null, 'the empty state offers the register button');

/* ---- 3. register a system, and check what it derives ---- */
await page.click('.empty button[data-act="new-system"]');
await page.waitForSelector('#dlg');
await page.type('input[name="name"]', 'Warehouse CV Screener');
await page.select('select[name="class"]', 'AI-001');
await page.select('select[name="role"]', 'deployer');
await new Promise(r => setTimeout(r, 120));
const derived = await page.$eval('#preview', e => e.textContent);
ok(derived.includes('High risk'), 'the preview derives the high-risk tier from the use case');
ok(derived.includes('Annex III(4)'), 'the preview cites the legal basis for that tier');
const flags = await page.$$eval('[name="flag"]:checked', els => els.map(e => e.value));
eq(JSON.stringify(flags.sort()), JSON.stringify([...classes['AI-001'].implies_flags].sort()),
  'condition flags are pre-ticked from the use-case class');
const expectedReqs = Object.values(reqs).filter(r => applies(r, 'deployer', 'high', flags)).length;
ok(derived.includes(expectedReqs + ' requirements'),
  `the preview requirement count matches an independent recomputation (${expectedReqs})`);
await page.click('button[data-act="save-system"]');
await page.waitForSelector('.card');
eq(await page.$eval('.card h3', e => e.textContent), 'Warehouse CV Screener', 'the system card opens on save');
ok((await page.$eval('.card', e => e.textContent)).includes('0%'), 'a new system starts at zero evidence');
const gapTags = await page.$$eval('.ctl .tag', els => els.map(e => e.textContent));
ok(gapTags.every(t => t !== 'met'), 'nothing is marked met before any evidence is recorded');

/* ---- 4. record evidence, and watch it propagate ---- */
await page.click('.ctl .ch');
await page.waitForSelector('.art');
await page.click('.art .tri button.pr');
await page.waitForSelector('.card');
const covText = await page.$$eval('.fact', els => {
  const f = els.find(e => e.querySelector('.k').textContent.includes('Control coverage'));
  return f.querySelector('.v').textContent;
});
ok(parseFloat(covText) > 0, 'recording one artefact lifts coverage above zero');
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('aigcr.live.portfolio.v1')));
eq(stored.evidence.length, 1, 'the evidence record is persisted');
eq(stored.evidence[0].status, 'present', 'the persisted record carries the status');
ok(!!stored.evidence[0].asserted, 'the persisted record is dated, so it can be replayed as a trend');
eq(stored.systems.length, 1, 'the system is persisted');

/* ---- 5. survives a reload ---- */
await page.reload({ waitUntil: 'networkidle0' });
await bootUp();
await page.waitForSelector('#shell:not(.hidden)');
await page.waitForSelector('.kpi');
const kpi = await page.$$eval('.kpi .v', els => els.map(e => e.textContent));
eq(kpi[0], '1', 'the control room counts the restored system');
ok(await page.$eval('#org', e => e.textContent).then(t => t.includes('1 system registered')),
  'the header reports the restored inventory');

/* ---- 6. the derived views work on a one-system portfolio ---- */
for (const view of ['systems', 'crosswalk', 'board', 'method']) {
  await page.click(`#nav button[data-view="${view}"]`);
  await new Promise(r => setTimeout(r, 150));
  ok(await page.$eval('#view', e => e.textContent.length) > 200, `${view} view renders with one system`);
  ok(await page.$('#err[hidden]') !== null, `${view} view renders without an error banner`);
}
await page.click('#nav button[data-view="board"]');
await page.waitForSelector('.board');
ok((await page.$eval('.board', e => e.textContent)).includes('not a forecast'),
  'the board pack still carries the disclaimer in the console');

/* ---- 7. export and delete ---- */
const exported = await page.evaluate(() => {
  const p = JSON.parse(localStorage.getItem('aigcr.live.portfolio.v1'));
  return { synthetic: p.synthetic, org: p.organisation, systems: p.systems.length };
});
eq(exported.synthetic, false, 'an operator inventory is not flagged synthetic');
eq(exported.systems, 1, 'export payload holds the system');
await page.click('#nav button[data-view="systems"]');
await page.waitForSelector('tbody tr');
await page.click('tbody tr');
await page.waitForSelector('.card');
page.on('dialog', async d => { await d.accept(); });
await page.click('button[data-act="delete-system"]');
await page.waitForSelector('.empty');
eq((await page.evaluate(() => JSON.parse(localStorage.getItem('aigcr.live.portfolio.v1')))).systems.length, 0,
  'deleting a system clears it and its evidence from storage');

/* ---- 8. the example organisation loads and stays editable ---- */
await page.click('.empty button[data-act="load-example"]');
await page.waitForSelector('.kpi');
const loaded = await page.$$eval('.kpi .v', els => els[0].textContent);
eq(loaded, '26', 'the example organisation loads into the console as an editable inventory');
ok((await page.$eval('#org', e => e.textContent)).includes('editable'),
  'the loaded example is labelled editable so it is not mistaken for the read-only demo');

/* ---- 9. mobile ---- */
for (const w of [360, 390]) {
  await page.setViewport({ width: w, height: 800 });
  await page.click('#nav button[data-view="room"]');
  await page.waitForSelector('.kpi');
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(overflow <= 1, `console has no horizontal overflow at ${w}px (got ${overflow}px)`);
}

eq(errors.length, 0, 'no console errors: ' + errors.slice(0, 3).join(' | '));
await browser.close();
console.log(`${pass} passed, ${fails.length} failed`);
for (const f of fails) console.log('  FAIL ' + f);
process.exit(fails.length ? 1 : 0);
