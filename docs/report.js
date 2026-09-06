/* Exports. Markdown for people, JSON for machines. Both are generated from the same engine the
   screen uses, so a report can never disagree with the dashboard it was taken from. */
(function (root) {
  'use strict';

  function pc(x) { return Math.round(x * 100) + '%'; }
  function eu(n) {
    if (n >= 1e6) return 'EUR ' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return 'EUR ' + Math.round(n / 1e3) + 'k';
    return 'EUR ' + Math.round(n);
  }
  function head(m) {
    return ['# AI governance assessment', '', '**Organisation:** ' + m.portfolio.organisation +
      ' (synthetic demonstration portfolio)', '**Position as at:** ' + m.portfolio.as_of,
      '**Generated:** ' + new Date().toISOString().slice(0, 10) + ' by the AI Risk Control Room',
      '**Frameworks:** ' + m.frameworks.map(function (f) { return f.name; }).join(', '), ''].join('\n');
  }
  var DISCLAIMER = ['---', '', 'Coverage figures measure whether documented evidence exists for the controls that ' +
    'carry each obligation. They are not a compliance opinion and not a probability of harm. The exposure ' +
    'reference is a modelled upper bound against statutory ceilings (AI Act Art. 99, GDPR Art. 83) scaled by ' +
    'unmet obligations - it is a prioritisation aid, not a forecast of any fine. Nothing here is legal advice.', ''].join('\n');

  function boardPack(m) {
    var k = m.kpis(), hist = m.history(), first = hist[0], last = hist[hist.length - 1];
    var out = [head(m), '## Position', '',
      '| Measure | Value |', '| --- | --- |',
      '| AI systems in use | ' + k.systems + ' (' + k.retired + ' retired) |',
      '| High risk or prohibited | ' + ((k.tiers.high || 0) + (k.tiers.prohibited || 0)) + ' |',
      '| Control coverage | ' + pc(k.coverage) + ' |',
      '| Open gaps | ' + k.openGaps + ' (' + k.criticalGaps + ' critical) |',
      '| Exposure reference | ' + eu(k.exposure) + ' |',
      '| Open incidents | ' + k.openIncidents + ' (' + k.reportableIncidents + ' reportable) |', ''];

    out.push('## Framework posture', '', '| Framework | Posture | Weakest requirement |', '| --- | --- | --- |');
    m.frameworks.forEach(function (f) {
      var p = m.frameworkPosture(f.id), w = p.weakest[0];
      out.push('| ' + f.name + ' | ' + pc(p.score) + ' | ' + m.reqById[w.requirement].ref + ' ' +
        m.reqById[w.requirement].title + ' at ' + pc(w.score) + ' |');
    });

    out.push('', '## Direction', '', '| Month | Control coverage | Open gaps | Exposure reference |',
      '| --- | --- | --- | --- |');
    hist.forEach(function (p) {
      out.push('| ' + p.month + ' | ' + pc(p.coverage) + ' | ' + p.openGaps + ' | ' + eu(p.exposure) + ' |');
    });
    out.push('', 'Replayed from the assertion date on each evidence record: ' + pc(first.coverage) + ' to ' +
      pc(last.coverage) + ' coverage, ' + eu(first.exposure) + ' to ' + eu(last.exposure) + ' exposure.', '');

    out.push('## Remediation queue', '', 'Ranked by modelled exposure removed if the evidence were completed.', '',
      '| # | Control | Owner | Systems | Artefacts | Exposure removed |', '| --- | --- | --- | --- | --- | --- |');
    m.remediation().slice(0, 10).forEach(function (r, i) {
      out.push('| ' + (i + 1) + ' | ' + r.control + ' ' + r.name + ' | ' + r.owner + ' | ' + r.systems.length +
        ' | ' + r.artefacts + ' | ' + eu(r.exposure) + ' |');
    });

    out.push('', '## Systems in binding tiers', '', '| System | Class | Tier | Coverage | Critical gaps | Exposure |',
      '| --- | --- | --- | --- | --- | --- |');
    m.activeSystems().filter(function (s) { return m.tierRank(s) >= 3; })
      .sort(function (a, b) { return m.exposure(b).total - m.exposure(a).total; })
      .forEach(function (s) {
        var crit = m.gaps(s).filter(function (g) { return g.severity === 'critical'; }).length;
        out.push('| ' + s.name + ' (' + s.id + ') | ' + m.classById[s['class']].name + ' | ' +
          m.tierById[m.tierOf(s)].label + ' | ' + pc(m.systemCoverage(s)) + ' | ' + crit + ' | ' +
          eu(m.exposure(s).total) + ' |');
      });

    out.push('', '## Open incidents', '');
    m.incidents.filter(function (i) { return i.status !== 'closed'; }).forEach(function (i) {
      out.push('- **' + i.id + '** (' + i.severity + (i.reportable ? ', reportable' : '') + ') ' + i.title +
        ' - ' + m.systemById[i.system].name + ', detected ' + i.detected + ', root cause: ' + i.root_cause + '.');
    });
    out.push('', DISCLAIMER);
    return out.join('\n');
  }

  function systemReport(m, sysId) {
    var s = m.systemById[sysId], cls = m.classById[s['class']];
    var ex = m.exposure(s), li = m.likelihood(s), im = m.impact(s);
    var out = [head(m), '## ' + s.name + ' (' + s.id + ')', '',
      '| Field | Value |', '| --- | --- |',
      '| Use-case class | ' + cls.name + ' (' + cls.id + ') |',
      '| Regulatory tier | ' + m.tierById[cls.tier].label + ' |',
      '| Basis | ' + cls.basis + ' |',
      '| Role | ' + s.role + ' |',
      '| Business unit | ' + s.business_unit + ' |',
      '| Accountable owner | ' + s.owner + ' |',
      '| Model | ' + s.model + ' |',
      '| Hosting | ' + s.hosting + ' |',
      '| Geography | ' + s.geography.join(', ') + ' |',
      '| Lifecycle | ' + s.lifecycle + ' |',
      '| People affected per year | ' + (s.people_affected_per_year || 0) + ' |',
      '| Control coverage | ' + pc(m.systemCoverage(s)) + ' |',
      '| Risk cell | likelihood ' + li.band + ' / impact ' + im.band + ' (' + im.reasons.join(', ') + ') |',
      '| Exposure reference | ' + eu(ex.total) + ' |', '',
      '## Inherent risks of this use case', ''];
    cls.risks.forEach(function (r) { out.push('- ' + r); });

    out.push('', '## Applicable obligations and their evidence', '',
      '| Control | Type | Owner | Requirements carried | Evidence | State |',
      '| --- | --- | --- | --- | --- | --- |');
    m.gaps(s).sort(function (a, b) { return a.coverage - b.coverage; }).forEach(function (g) {
      out.push('| ' + g.control + ' ' + g.name + ' | ' + g.type + ' | ' + g.owner + ' | ' +
        g.requirements.map(function (r) { return m.fwOfReq[r] + ' ' + m.reqById[r].ref; }).join(', ') + ' | ' +
        g.counts.present + ' present, ' + g.counts.partial + ' partial, ' + g.counts.missing + ' missing | ' +
        (g.state === 'met' ? 'met' : g.state + ' (' + g.severity + ') ') + ' |');
    });

    out.push('', '## Evidence still to produce', '');
    m.gaps(s).forEach(function (g) {
      if (g.state === 'met') return;
      var rec = (m.evidence[s.id] || {})[g.control] || {};
      m.controlById[g.control].evidence.forEach(function (a) {
        var status = (rec[a.id] && rec[a.id].status) || 'missing';
        if (status === 'present') return;
        out.push('- [ ] **' + g.control + '** ' + a.name + ' (' + a.kind + ', currently ' + status +
          ', owner ' + g.owner + ')');
      });
    });

    out.push('', '## Exposure breakdown', '', '| Penalty class | Ceiling | Requirements | Unmet | Modelled |',
      '| --- | --- | --- | --- | --- |');
    Object.keys(ex.byClass).forEach(function (pid) {
      var b = ex.byClass[pid];
      out.push('| ' + b.label + ' | ' + (b.ceiling ? eu(b.ceiling) : 'none') + ' | ' + b.requirements + ' | ' +
        pc(b.unmet_share) + ' | ' + eu(b.amount) + ' |');
    });
    var incs = m.incidents.filter(function (i) { return i.system === s.id; });
    if (incs.length) {
      out.push('', '## Incidents', '');
      incs.forEach(function (i) {
        out.push('- **' + i.id + '** (' + i.severity + ') ' + i.title + ' - detected ' + i.detected +
          ', ' + i.affected + ' affected, root cause: ' + i.root_cause + '. Engages ' +
          i.requirements.join(', ') + '.');
      });
    }
    out.push('', DISCLAIMER);
    return out.join('\n');
  }

  function assessmentJson(m) {
    return JSON.stringify({
      generated: new Date().toISOString(),
      generator: 'AI Risk Control Room',
      organisation: m.portfolio.organisation,
      as_of: m.portfolio.as_of,
      synthetic: !!m.portfolio.synthetic,
      method: 'Coverage is evidence-weighted (present 1, partial 0.5, missing 0). Exposure is a modelled ' +
        'upper bound against statutory ceilings scaled by unmet obligations. This is not a compliance opinion.',
      kpis: m.kpis(),
      posture: m.frameworks.map(function (f) {
        var p = m.frameworkPosture(f.id);
        return { framework: f.id, name: f.name, score: p.score, checks: p.pairs,
                 weakest: p.weakest.slice(0, 8) };
      }),
      history: m.history(),
      systems: m.systems.map(function (s) {
        return {
          id: s.id, name: s.name, class: s['class'], tier: m.tierOf(s), role: s.role,
          business_unit: s.business_unit, owner: s.owner, lifecycle: s.lifecycle, flags: s.flags,
          coverage: m.systemCoverage(s), likelihood: m.likelihood(s).band, impact: m.impact(s).band,
          exposure: m.exposure(s),
          applicable_requirements: m.applicableRequirements(s),
          controls: m.gaps(s).map(function (g) {
            return { control: g.control, coverage: g.coverage, state: g.state, severity: g.severity,
                     counts: g.counts, requirements: g.requirements };
          })
        };
      }),
      remediation: m.remediation(),
      incidents: m.incidents
    }, null, 1);
  }

  root.Report = { boardPack: boardPack, systemReport: systemReport, assessmentJson: assessmentJson };
})(typeof window !== 'undefined' ? window : globalThis);
