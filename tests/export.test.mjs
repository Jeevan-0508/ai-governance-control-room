import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadModel } from './harness.mjs';
const context = vm.createContext({});
vm.runInContext(readFileSync(new URL('../docs/report.js', import.meta.url), 'utf8'), context);
test('governance export keeps synthetic portfolio and curated source labels', () => {
  const { model } = loadModel();
  const report = JSON.parse(context.Report.assessmentJson(model));
  assert.equal(report.schema_version, 'ai-governance-assessment.v1');
  assert.equal(report.data_class, 'synthetic_fixture');
  assert.equal(report.legal_status, 'not_determined');
  assert.ok(report.framework_sources.every((f) => f.source_url.startsWith('https://') && f.text_kind === 'curated_interpretation'));
  const ids = new Set(report.framework_sources.flatMap((f) => f.requirements.map((r) => r.id)));
  for (const system of report.systems) for (const id of system.applicable_requirements) assert.ok(ids.has(id));
  model.portfolio.synthetic = false;
  assert.equal(JSON.parse(context.Report.assessmentJson(model)).data_class, 'operator_self_report');
});
