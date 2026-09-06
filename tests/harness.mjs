import fs from 'node:fs';
import vm from 'node:vm';

export function loadModel() {
  const raw = {};
  for (const n of ['frameworks', 'controls', 'taxonomy', 'portfolio', 'exposure']) {
    raw[n] = JSON.parse(fs.readFileSync(new URL(`../data/${n}.json`, import.meta.url), 'utf8'));
  }
  const ctx = {};
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(new URL('../docs/engine.js', import.meta.url), 'utf8'), ctx);
  return { model: new ctx.Engine.Model(raw), Engine: ctx.Engine, raw };
}
