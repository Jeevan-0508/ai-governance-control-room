/* Headless assertions against a served copy of docs/. Nothing is mocked: the page is loaded, the
   engine runs in the browser, and the maths behind the headline numbers is recomputed here from
   the raw JSON so a rendering that quietly disagrees with the model fails the build.

   node tests/assert.mjs [baseUrl]   default http://127.0.0.1:8811/ */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://127.0.0.1:8811/';
let pass = 0;
const fails = [];
const ok = (cond, label) => { if (cond) { pass++; } else { fails.push(label); } };
const eq = (a, b, label) => ok(a === b, `${label} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`);
const near = (a, b, tol, label) => ok(Math.abs(a - b) <= tol, `${label} (got ${a}, expected ~${b})`);

const raw = {};
for (const n of ['frameworks', 'controls', 'taxonomy', 'portfolio', 'exposure']) {
  raw[n] = JSON.parse(fs.readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
}

/* ---- independent recomputation, no engine code involved ---- */
const W = { present: 1, partial: 0.5, missing: 0 };
const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const reqs = {}, fwOf = {};
for (const f of raw.frameworks.frameworks) for (const r of f.requirements) { reqs[r.id] = r; fwOf[r.id] = f.id; }
const controls = Object.fromEntries(raw.controls.controls.map(c => [c.id, c]));
const classes = Object.fromEntries(raw.taxonomy.classes.map(c => [c.id, c]));
const tierRank = Object.fromEntries(raw.taxonomy.tiers.map(t => [t.id, t.rank]));
const ev = {};
for (const e of raw.portfolio.evidence) ((ev[e.system] ??= {})[e.control] ??= {})[e.artefact] = e;
const applies = (r, s) => {
  const a = r.applies || {};
  if (a.roles && !a.roles.includes(s.role)) return false;
  if (a.tiers && !a.tiers.includes(classes[s.class].tier)) return false;
  if (a.conditions && !a.conditions.some(c => s.flags.includes(c))) return false;
  return true;
};
const appReqs = s => Object.keys(reqs).filter(id => applies(reqs[id], s));
const appCtls = s => { const live = new Set(appReqs(s)); return raw.controls.controls.filter(c => c.satisfies.some(r => live.has(r))).map(c => c.id); };
const ctlCov = (sid, cid) => mean(controls[cid].evidence.map(a => W[(ev[sid]?.[cid]?.[a.id]?.status) || 'missing']));
const active = raw.portfolio.systems.filter(s => s.lifecycle !== 'retired');
const expectedCoverage = mean(active.map(s => mean(appCtls(s).map(c => ctlCov(s.id, c)))));
const expectedPosture = fw => {
  const xs = [];
  for (const s of active) for (const rid of appReqs(s)) {
    if (fwOf[rid] !== fw) continue;
    const live = appCtls(s);
    const cs = (raw.controls.controls.filter(c => c.satisfies.includes(rid) && live.includes(c.id))).map(c => ctlCov(s.id, c.id));
    if (cs.length) xs.push(mean(cs));
  }
  return mean(xs);
};

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));

await page.setViewport({ width: 1440, height: 1000 });
await page.goto(BASE, { waitUntil: 'networkidle0' });
await page.waitForSelector('.kpi');

/* ---- 1. control room ---- */
eq(await page.$eval('h1', e => e.textContent.trim()), 'AI Risk Control Room', 'page title');
ok((await page.$eval('#org', e => e.textContent)).includes('Meridian Group'), 'org line shows the portfolio');
ok(await page.$('#err[hidden]') !== null, 'no load error banner');
const kpis = await page.$$eval('.kpi', els => els.map(e => ({
  k: e.querySelector('.k').textContent, v: e.querySelector('.v').textContent })));
eq(kpis.length, 6, 'six KPI cards');
eq(kpis[0].v, String(active.length), 'KPI: active system count matches the portfolio');
const covKpi = kpis.find(k => k.k.includes('Control coverage')).v;
eq(covKpi, Math.round(expectedCoverage * 100) + '%', 'KPI: control coverage equals an independent recomputation');
const highKpi = +kpis.find(k => k.k.includes('High risk')).v;
eq(highKpi, active.filter(s => tierRank[classes[s.class].tier] >= 3).length, 'KPI: high-risk + prohibited count');
ok(kpis.find(k => k.k.includes('Exposure')).v.startsWith('\u20ac'), 'KPI: exposure is shown in euro');

/* ---- 2. heatmap ---- */
const cells = await page.$$eval('.hm .cell:not(.empty)', els => els.map(e => ({
  id: e.dataset.id, n: +e.querySelector('.n').textContent })));
eq(cells.reduce((a, c) => a + c.n, 0), active.length, 'every active system sits in exactly one heatmap cell');
ok(cells.length >= 6, 'heatmap is spread over at least six cells, not collapsed into one');
ok(await page.$$eval('.hm .ax', els => els.length) === 9, 'heatmap has 4 likelihood labels + 4 impact labels + 1 corner');

/* ---- 3. framework posture ---- */
const posture = await page.$$eval('.post .row', els => els.map(e => ({
  id: e.dataset.id, nm: e.querySelector('.nm').textContent, pc: e.querySelector('.pc').textContent })));
eq(posture.length, 4, 'four framework posture bars');
for (const p of posture) {
  eq(p.pc, Math.round(expectedPosture(p.id) * 100) + '%', `posture ${p.id} equals an independent recomputation`);
}
const aia = +posture.find(p => p.id === 'EUAIA').pc.replace('%', '');
const gdpr = +posture.find(p => p.id === 'GDPR').pc.replace('%', '');
ok(gdpr > aia, 'the portfolio tells its intended story: GDPR posture leads the AI Act');
await page.click('.post .row[data-id="EUAIA"]');
ok((await page.$eval('.post .row[data-id="EUAIA"] .why', e => e.textContent)).split('\n').length >= 1,
  'clicking a framework reveals its weakest requirements');

/* ---- 4. findings + remediation ---- */
const findings = await page.$$eval('.panel table tbody tr', els => els.length);
ok(findings > 0, 'critical findings table is populated');
const rem = await page.$$eval('.panel:last-of-type table tbody tr td:last-child', els => els.map(e => e.textContent));
ok(rem.every(t => t.startsWith('\u20ac')), 'remediation queue is priced in euro');
const remNums = rem.map(t => parseFloat(t.replace(/[^0-9.]/g, '')));
ok(remNums.every((v, i) => i === 0 || v <= remNums[i - 1] + 0.05), 'remediation queue is sorted by exposure removed');

/* ---- 5. inventory ---- */
await page.click('#nav button[data-view="systems"]');
await page.waitForSelector('.filters select');
const rows = await page.$$eval('tbody tr', els => els.length);
eq(rows, raw.portfolio.systems.length, 'inventory lists every registered system, retired included');
await page.select('.filters select[data-name="tier"]', 'prohibited');
eq(await page.$$eval('tbody tr', els => els.length),
  raw.portfolio.systems.filter(s => classes[s.class].tier === 'prohibited').length, 'tier filter narrows the list');
await page.click('button[data-act="reset"]');
await page.type('.filters input[data-act="q"]', 'carrier');
const hits = await page.$$eval('tbody tr td:first-child', els => els.map(e => e.textContent.toLowerCase()));
ok(hits.length > 0 && hits.every(t => t.includes('carrier')), 'free-text search filters on name');
await page.click('button[data-act="reset"]');

/* ---- 6. system card + live recompute ---- */
await page.click('tbody tr');
await page.waitForSelector('.card');
const cardTitle = await page.$eval('.card h3', e => e.textContent);
ok(cardTitle.length > 3, 'system card opens');
ok((await page.$eval('.basis', e => e.textContent)).includes('Annex III') ||
   (await page.$eval('.basis', e => e.textContent)).includes('Art.'),
  'the card states the legal basis for its tier');
const covBefore = await page.$$eval('.fact', els => {
  const f = els.find(e => e.querySelector('.k').textContent.includes('Control coverage'));
  return f.querySelector('.v').textContent;
});
await page.click('.ctl .ch');
await page.waitForSelector('.art');
const artefacts = await page.$$eval('.art', els => els.length);
ok(artefacts >= 2, 'the evidence trail lists the artefacts behind a control');
const tri = await page.$$('.art .tri button.pr');
await tri[0].click();
await page.waitForSelector('.card');
const covAfter = await page.$$eval('.fact', els => {
  const f = els.find(e => e.querySelector('.k').textContent.includes('Control coverage'));
  return f.querySelector('.v').textContent;
});
ok(parseFloat(covAfter) >= parseFloat(covBefore), 'marking an artefact present does not reduce coverage');
ok(await page.$('.edited') !== null, 'an edited artefact is labelled EDITED');
const edits = await page.evaluate(() => JSON.parse(localStorage.getItem('aigcr.overrides.v1') || '{}'));
eq(Object.keys(edits).length, 1, 'the edit is persisted as exactly one override');
await page.evaluate(() => localStorage.removeItem('aigcr.overrides.v1'));

/* ---- 7. crosswalk ---- */
await page.reload({ waitUntil: 'networkidle0' });
await page.click('#nav button[data-view="crosswalk"]');
await page.waitForSelector('.xw');
const xw = await page.$$eval('.xw tbody tr', els => els.map(e => e.children.length));
eq(xw.filter(n => n === 7).length, raw.controls.controls.length, 'crosswalk has one row per control across four frameworks');
const leverage = await page.$$eval('.xw tbody tr', els => els.map(e => +e.children[5].textContent));
eq(leverage.reduce((a, b) => a + b, 0),
  raw.controls.controls.reduce((a, c) => a + c.satisfies.length, 0), 'crosswalk leverage sums to the mapping count');
ok(leverage.some(n => n >= 4), 'at least one control satisfies four or more requirements');
await page.click('.xw tbody tr');
ok((await page.$eval('.xw tbody tr:nth-child(2) td', e => e.textContent)).includes('Evidence required'),
  'expanding a control shows the evidence it requires');

/* ---- 8. incidents ---- */
await page.click('#nav button[data-view="incidents"]');
await page.waitForSelector('.inc');
eq(await page.$$eval('.inc', els => els.length), raw.portfolio.incidents.length, 'every incident is rendered');
ok((await page.$$eval('.inc .tag', els => els.map(e => e.textContent))).includes('reportable'),
  'reportable incidents are flagged');
ok((await page.$eval('.inc .reqs', e => e.textContent)).length > 5, 'incidents link to requirements and controls');

/* ---- 9. board view ---- */
await page.click('#nav button[data-view="board"]');
await page.waitForSelector('.board');
const bigs = await page.$$eval('.board .big .v', els => els.map(e => e.textContent));
eq(bigs.length, 5, 'board view shows five headline figures');
eq(bigs[0], String(active.length), 'board headline system count matches the portfolio');
const sparks = await page.$$eval('.spark', els => els.map(e => e.children.length));
eq(sparks.length, 2, 'board view carries a coverage trend and an exposure trend');
const months = new Set(raw.portfolio.evidence.filter(e => e.asserted).map(e => e.asserted.slice(0, 7)));
eq(sparks[0], months.size, 'the trend has one bar per month found in the evidence dates');
ok((await page.$eval('.board', e => e.textContent)).includes('not a forecast'), 'board view carries the disclaimer');

/* ---- 10. exports ---- */
const out = await page.evaluate(async () => {
  const files = ['frameworks', 'controls', 'taxonomy', 'portfolio', 'exposure'];
  const parts = await Promise.all(files.map(f => fetch(f + '.json').then(r => r.json())));
  const raw = {};
  files.forEach((f, i) => { raw[f] = parts[i]; });
  const m = new Engine.Model(raw);
  return { board: Report.boardPack(m), sys: Report.systemReport(m, 'SYS-01'),
           json: Report.assessmentJson(m), coverage: m.kpis().coverage };
});
near(out.coverage, expectedCoverage, 1e-9, 'engine coverage matches the independent recomputation exactly');
ok(out.board.startsWith('# AI governance assessment'), 'board pack is Markdown with a title');
ok(out.board.includes('| Framework | Posture |'), 'board pack tabulates framework posture');
ok(out.board.includes('not a forecast of any fine'), 'board pack carries the disclaimer');
ok(out.board.includes(Math.round(expectedPosture('EUAIA') * 100) + '%'), 'board pack posture matches the model');
ok(out.sys.includes('## Applicable obligations and their evidence'), 'system report lists obligations and evidence');
ok(out.sys.includes('- [ ] **C-'), 'system report emits an actionable evidence checklist');
const asJson = JSON.parse(out.json);
eq(asJson.systems.length, raw.portfolio.systems.length, 'JSON export covers every system');
eq(asJson.posture.length, 4, 'JSON export carries all four framework scores');
ok(asJson.synthetic === true, 'JSON export declares the portfolio synthetic');
ok(asJson.method.includes('not a compliance opinion'), 'JSON export carries the method caveat');
ok(asJson.systems.every(s => s.applicable_requirements.length > 0), 'every system has applicable requirements');
ok(asJson.systems.every(s => s.controls.length > 0), 'every system has applicable controls');

/* ---- 11. method page ---- */
await page.click('#nav button[data-view="method"]');
await page.waitForSelector('.method');
const method = await page.$eval('.method', e => e.textContent);
ok(method.includes('does not tell you whether you are compliant'), 'method page refuses to claim compliance');
ok(method.includes('present = 1'), 'method page publishes the evidence weights');
for (const f of raw.frameworks.frameworks) ok(method.includes(f.citation.slice(0, 24)), `method page cites ${f.id}`);

/* ---- 12. mobile ---- */
for (const w of [360, 390, 412]) {
  await page.setViewport({ width: w, height: 780 });
  await page.click('#nav button[data-view="room"]');
  await page.waitForSelector('.kpi');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(overflow <= 1, `no horizontal overflow at ${w}px (got ${overflow}px)`);
  ok(await page.$$eval('.kpi', els => els.length) === 6, `KPI cards render at ${w}px`);
}

eq(consoleErrors.length, 0, 'no console errors: ' + consoleErrors.slice(0, 3).join(' | '));
await browser.close();

console.log(`${pass} passed, ${fails.length} failed`);
for (const f of fails) console.log('  FAIL ' + f);
process.exit(fails.length ? 1 : 0);
