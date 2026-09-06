/* Renderers. Every view is a pure function of the model plus the UI state; all interaction goes
   through data-act attributes handled by app.js, so nothing here holds state. */
(function (root) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pct(x) { return Math.round(x * 100) + '%'; }
  function eur(n) {
    if (n >= 1e9) return '\u20ac' + (n / 1e9).toFixed(2) + 'bn';
    if (n >= 1e6) return '\u20ac' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '\u20ac' + Math.round(n / 1e3) + 'k';
    return '\u20ac' + Math.round(n);
  }
  function num(n) { return n.toLocaleString('en-GB'); }
  function band(score) { return score >= 0.85 ? 1 : score >= 0.65 ? 2 : score >= 0.4 ? 3 : 4; }
  function bar(score) {
    return '<span class="mini"><i class="f' + band(score) + '" style="width:' +
      Math.max(2, Math.round(score * 100)) + '%"></i></span>';
  }
  function tierTag(m, sys) {
    var t = m.tierById[m.tierOf(sys)];
    return '<span class="tag t' + t.rank + '">' + esc(t.label) + '</span>';
  }
  var SEV = { critical: 4, high: 3, medium: 2, low: 1, none: 0 };
  function sevTag(s) { return '<span class="tag t' + SEV[s] + '">' + s + '</span>'; }
  function kpi(k, v, s, cls) {
    return '<div class="kpi ' + cls + '"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) +
      '</div><div class="s">' + esc(s) + '</div></div>';
  }
  function fact(k, v) {
    return '<div class="fact"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + '</div></div>';
  }
  function sel(name, all, opts, cur) {
    return '<select data-act="filter" data-name="' + name + '"><option value="">' + esc(all) + '</option>' +
      opts.map(function (o) {
        return '<option value="' + esc(o) + '"' + (cur === o ? ' selected' : '') + '>' + esc(o) + '</option>';
      }).join('') + '</select>';
  }

  /* ---------- control room ---------- */
  function room(m, st) {
    var k = m.kpis();
    var gaps = m.allGaps().slice(0, 14);
    var rem = m.remediation().slice(0, 6);
    var h = [];

    h.push('<h2 class="sec">Portfolio <em>' + k.systems + ' active AI systems, ' +
      num(k.evidenceRecords) + ' evidence records, recomputed live</em></h2>');
    h.push('<div class="kpis">');
    h.push(kpi('AI systems', k.systems, k.retired + ' retired, ' + k.registered + ' registered', ''));
    h.push(kpi('High risk or banned', (k.tiers.high || 0) + (k.tiers.prohibited || 0),
      (k.tiers.prohibited || 0) + ' prohibited practice, ' + (k.tiers.high || 0) + ' Annex III', 'bad'));
    h.push(kpi('Control coverage', pct(k.coverage), 'evidence-weighted, all applicable controls',
      k.coverage >= 0.65 ? 'good' : 'warn'));
    h.push(kpi('Open gaps', k.openGaps, k.criticalGaps + ' critical, ' + k.partialGaps + ' partial', 'warn'));
    h.push(kpi('Exposure reference', eur(k.exposure), 'modelled upper bound, not a forecast', 'bad'));
    h.push(kpi('Live incidents', k.openIncidents, k.reportableIncidents + ' meet a reporting threshold',
      k.openIncidents ? 'warn' : 'good'));
    h.push('</div>');

    h.push('<div class="two" style="margin-top:12px">');
    h.push('<div class="panel"><h2 class="sec" style="margin-top:0">Risk map ' +
      '<em>likelihood of an ungoverned failure against impact if it happens</em></h2>' + heatmap(m, st) + '</div>');
    h.push('<div class="panel"><h2 class="sec" style="margin-top:0">Framework posture ' +
      '<em>click a framework for its weakest requirements</em></h2>' + posture(m, st) + '</div>');
    h.push('</div>');

    h.push('<h2 class="sec">Critical findings <em>statutory obligations with little or no evidence on a high-risk system</em></h2>');
    h.push('<div class="panel"><table><thead><tr><th>System</th><th>Control</th><th>Requirements</th>' +
      '<th class="num">Evidence</th><th>State</th></tr></thead><tbody>');
    gaps.forEach(function (g) {
      var s = m.systemById[g.system];
      h.push('<tr class="click" data-act="system" data-id="' + g.system + '"><td>' + esc(s.name) +
        '<div class="sub">' + g.system + ' &middot; ' + esc(s.business_unit) + ' &middot; ' +
        esc(m.tierById[m.tierOf(s)].label) + '</div></td>' +
        '<td>' + esc(g.name) + '<div class="sub">' + g.control + ' &middot; ' + esc(g.owner) + '</div></td>' +
        '<td>' + g.requirements.slice(0, 3).map(function (r) {
          return '<span class="tag i">' + esc(m.fwOfReq[r] + ' ' + m.reqById[r].ref) + '</span>';
        }).join(' ') + (g.requirements.length > 3 ? ' <span class="sub">+' + (g.requirements.length - 3) + '</span>' : '') + '</td>' +
        '<td class="num">' + bar(g.coverage) + pct(g.coverage) + '</td>' +
        '<td>' + sevTag(g.severity) + '</td></tr>');
    });
    h.push('</tbody></table></div>');

    h.push('<h2 class="sec">Remediation queue <em>ranked by modelled exposure removed if the evidence were completed, not by framework order</em></h2>');
    h.push('<div class="panel"><table><thead><tr><th>#</th><th>Control</th><th>Owner</th>' +
      '<th class="num">Systems</th><th class="num">Artefacts to produce</th><th class="num">Exposure removed</th></tr></thead><tbody>');
    rem.forEach(function (r, i) {
      h.push('<tr class="click" data-act="control" data-id="' + r.control + '"><td class="num">' + (i + 1) + '</td>' +
        '<td>' + esc(r.name) + '<div class="sub">' + r.control + '</div></td><td>' + esc(r.owner) + '</td>' +
        '<td class="num">' + r.systems.length + '</td><td class="num">' + r.artefacts + '</td>' +
        '<td class="num">' + eur(r.exposure) + '</td></tr>');
    });
    h.push('</tbody></table></div>');
    return h.join('');
  }

  function heatmap(m, st) {
    var cells = m.heatmap();
    var h = ['<div class="hm">'];
    for (var l = 4; l >= 1; l--) {
      h.push('<div class="ax">' + ['', 'low', 'med', 'high', 'v high'][l] + '</div>');
      for (var i = 1; i <= 4; i++) {
        var ids = cells[l + ':' + i] || [];
        var rank = Math.min(4, Math.round((l + i) / 2));
        h.push('<button class="cell ' + (ids.length ? 'r' + rank : 'empty') + '" ' +
          (ids.length ? 'data-act="cell" data-id="' + l + ':' + i + '"' : 'disabled') + '>' +
          '<div class="n">' + (ids.length || '') + '</div><div class="ids">' + ids.join(' ') + '</div></button>');
      }
    }
    h.push('<div class="ax"></div>');
    ['low', 'med', 'high', 'severe'].forEach(function (t) { h.push('<div class="ax">' + t + '</div>'); });
    h.push('</div><div class="axl">impact if it fails &rarr;</div>');
    h.push('<p class="sub" style="margin-top:10px">Vertical axis is the likelihood that a governance ' +
      'failure goes uncaught, banded from the evidence behind that system\'s preventive and detective ' +
      'controls. It is not a probability of harm. Click a cell to filter the inventory.</p>');
    return h.join('');
  }

  function posture(m, st) {
    var h = ['<div class="post">'];
    m.frameworks.forEach(function (fw) {
      var p = m.frameworkPosture(fw.id);
      var open = st.openFramework === fw.id;
      h.push('<div class="row" data-act="framework" data-id="' + fw.id + '">' +
        '<div class="top"><div class="nm">' + esc(fw.name) +
        '<small>' + fw.requirements.length + ' requirements &middot; ' + p.pairs + ' system checks</small></div>' +
        '<div class="pc" style="color:var(--l' + band(p.score) + ')">' + pct(p.score) + '</div></div>' +
        '<div class="track"><div class="fill f' + band(p.score) + '" style="width:' +
        Math.max(1, Math.round(p.score * 100)) + '%"></div></div>');
      if (open) {
        h.push('<div class="why">' + p.weakest.slice(0, 6).map(function (w) {
          var r = m.reqById[w.requirement];
          return esc(r.ref) + ' ' + esc(r.title) + ' &mdash; ' + pct(w.score) + ' across ' + w.systems + ' systems';
        }).join('<br>') + '</div>');
      } else {
        var w0 = p.weakest[0];
        h.push('<div class="why">weakest: ' + esc(m.reqById[w0.requirement].ref) + ' ' +
          esc(m.reqById[w0.requirement].title) + ' at ' + pct(w0.score) + '</div>');
      }
      h.push('</div>');
    });
    var voluntary = m.penaltyClasses.filter(function (p) { return p.id === 'voluntary'; })[0];
    h.push('</div><p class="sub" style="margin-top:12px">' + esc(voluntary.cite) + '</p>');
    return h.join('');
  }

  /* ---------- inventory ---------- */
  function systems(m, st) {
    if (st.system) return card(m, st);
    var f = st.filters;
    var list = m.systems.filter(function (s) {
      if (f.bu && s.business_unit !== f.bu) return false;
      if (f.tier && m.tierOf(s) !== f.tier) return false;
      if (f.lifecycle && s.lifecycle !== f.lifecycle) return false;
      if (st.cell) {
        var p = st.cell.split(':');
        if (m.likelihood(s).band !== +p[0] || m.impact(s).band !== +p[1]) return false;
      }
      if (f.q) {
        var hay = (s.name + ' ' + s.business_unit + ' ' + s.owner + ' ' + s.model + ' ' + s.id +
          ' ' + m.classById[s['class']].name).toLowerCase();
        if (hay.indexOf(f.q.toLowerCase()) < 0) return false;
      }
      return true;
    });
    var bus = {}; m.systems.forEach(function (s) { bus[s.business_unit] = 1; });
    var h = [];
    h.push('<h2 class="sec">AI system inventory <em>' + list.length + ' of ' + m.systems.length +
      ' shown &middot; click a row for the system card and its evidence trail</em></h2>');
    h.push('<div class="filters">' +
      sel('bu', 'All business units', Object.keys(bus).sort(), f.bu) +
      sel('tier', 'All tiers', m.tiers.map(function (t) { return t.id; }), f.tier) +
      sel('lifecycle', 'All lifecycle stages', ['production', 'pilot', 'development', 'decommissioning', 'retired'], f.lifecycle) +
      '<input data-act="q" placeholder="Search name, owner, model\u2026" value="' + esc(f.q || '') + '">' +
      (st.cell ? '<button class="ghost" data-act="clearcell">risk cell L' + esc(st.cell.split(':')[0]) +
        ' / I' + esc(st.cell.split(':')[1]) + ' \u00d7</button>' : '') +
      '<button class="ghost right" data-act="reset">Reset filters</button></div>');
    h.push('<div class="panel"><table><thead><tr><th>System</th><th>Class</th><th>Tier</th><th>Role</th>' +
      '<th class="num">Coverage</th><th class="num">Gaps</th><th class="num">Exposure</th><th>Risk cell</th>' +
      '</tr></thead><tbody>');
    list.sort(function (a, b) { return m.exposure(b).total - m.exposure(a).total; }).forEach(function (s) {
      var cov = m.systemCoverage(s), g = m.gaps(s);
      var open = g.filter(function (x) { return x.state === 'open'; }).length;
      var crit = g.filter(function (x) { return x.severity === 'critical'; }).length;
      h.push('<tr class="click" data-act="system" data-id="' + s.id + '">' +
        '<td>' + esc(s.name) + '<div class="sub">' + s.id + ' &middot; ' + esc(s.business_unit) + ' &middot; ' +
        esc(s.lifecycle) + '</div></td>' +
        '<td>' + esc(m.classById[s['class']].name) + '<div class="sub">' + s['class'] + '</div></td>' +
        '<td>' + tierTag(m, s) + '</td><td class="mono">' + esc(s.role) + '</td>' +
        '<td class="num">' + bar(cov) + pct(cov) + '</td>' +
        '<td class="num">' + open + (crit ? ' <span class="tag t4">' + crit + ' crit</span>' : '') + '</td>' +
        '<td class="num">' + eur(m.exposure(s).total) + '</td>' +
        '<td class="mono">L' + m.likelihood(s).band + ' / I' + m.impact(s).band + '</td></tr>');
    });
    h.push('</tbody></table></div>');
    return h.join('');
  }

  /* ---------- system card ---------- */
  function card(m, st) {
    var s = m.systemById[st.system];
    var cls = m.classById[s['class']];
    var cov = m.systemCoverage(s), ex = m.exposure(s), li = m.likelihood(s), im = m.impact(s);
    var gaps = {}; m.gaps(s).forEach(function (g) { gaps[g.control] = g; });
    var incs = m.incidents.filter(function (i) { return i.system === s.id; });
    var h = [];
    h.push('<div class="filters"><button class="ghost" data-act="back">&larr; Inventory</button>' +
      '<button class="ghost right" data-act="export-system">Export system report (.md)</button></div>');
    h.push('<div class="panel card"><div class="head"><div style="flex:1;min-width:240px">' +
      '<h3>' + esc(s.name) + '</h3><div class="sub">' + s.id + ' &middot; ' + esc(cls.name) +
      ' (' + s['class'] + ') &middot; ' + esc(s.business_unit) + '</div></div>' +
      tierTag(m, s) + '<span class="tag i">' + esc(s.role) + '</span>' +
      '<span class="tag">' + esc(s.lifecycle) + '</span></div>');

    h.push('<div class="basis"><b>Why this tier.</b> ' + esc(cls.basis) + ' &mdash; a real classification is ' +
      'evidenced through control C-04 rather than assumed from the use case.</div>');

    h.push('<div class="facts">' +
      fact('Accountable owner', s.owner) + fact('Model', s.model) + fact('Hosting', s.hosting) +
      fact('Geography', s.geography.join(', ')) +
      fact('People affected / year', s.people_affected_per_year ? num(s.people_affected_per_year) : 'none directly') +
      fact('Registered', s.registered) +
      fact('Control coverage', pct(cov) + ' of ' + Object.keys(gaps).length + ' applicable controls') +
      fact('Risk cell', 'L' + li.band + ' / I' + im.band + ' \u2014 ' + im.reasons.join(', ')) +
      '</div>');

    h.push('<div class="reqs">' + s.flags.map(function (f) {
      var lbl = m.flags.filter(function (x) { return x.id === f; })[0];
      return '<span class="tag p">' + esc(lbl ? lbl.label : f) + '</span>';
    }).join('') + '</div>');

    h.push('<h2 class="sec">Exposure reference <em>statutory ceilings scaled by the unmet share of each class</em></h2>');
    h.push('<table><thead><tr><th>Penalty class</th><th class="num">Ceiling</th><th class="num">Requirements</th>' +
      '<th class="num">Unmet</th><th class="num">Modelled</th></tr></thead><tbody>');
    Object.keys(ex.byClass).forEach(function (pid) {
      var b = ex.byClass[pid];
      h.push('<tr><td>' + esc(b.label) + '</td><td class="num">' + (b.ceiling ? eur(b.ceiling) : 'none') +
        '</td><td class="num">' + b.requirements + '</td><td class="num">' + pct(b.unmet_share) +
        '</td><td class="num">' + eur(b.amount) + '</td></tr>');
    });
    h.push('<tr><td><b>Total</b></td><td colspan="3"></td><td class="num"><b>' + eur(ex.total) +
      '</b></td></tr></tbody></table>');

    h.push('<h2 class="sec">Inherent risks of this use case <em>from the taxonomy, before any control</em></h2><ul>');
    cls.risks.forEach(function (r) { h.push('<li style="font-size:13.5px;color:var(--dim)">' + esc(r) + '</li>'); });
    h.push('</ul>');

    if (incs.length) {
      h.push('<h2 class="sec">Incidents on this system</h2>');
      incs.forEach(function (i) { h.push(incident(m, i, true)); });
    }

    h.push('<h2 class="sec">Evidence trail <em>change any artefact status and every number on this page recomputes</em></h2>');
    var order = { critical: 0, high: 1, medium: 2, low: 3, none: 4 };
    Object.keys(gaps).sort(function (a, b) {
      return order[gaps[a].severity] - order[gaps[b].severity] || gaps[a].coverage - gaps[b].coverage;
    }).forEach(function (cid) {
      var g = gaps[cid], ctl = m.controlById[cid], open = st.openControls[cid];
      var rec = (m.evidence[s.id] || {})[cid] || {};
      h.push('<div class="ctl"><div class="ch" data-act="toggle-control" data-id="' + cid + '">' +
        '<span class="tag ' + (g.state === 'met' ? 't1' : g.severity === 'critical' ? 't4' : g.severity === 'high' ? 't3' : 't2') +
        '">' + (g.state === 'met' ? 'met' : g.state) + '</span>' +
        '<span class="cn">' + esc(ctl.name) + '<div class="sub">' + cid + ' &middot; ' + esc(ctl.type) +
        ' &middot; ' + esc(ctl.owner) + ' &middot; carries ' + g.requirements.length + ' applicable requirements' +
        (g.statutory ? ' &middot; statutory, ceiling ' + eur(g.ceiling) : ' &middot; voluntary') + '</div></span>' +
        '<span class="mono" style="font-size:12px">' + bar(g.coverage) + pct(g.coverage) + '</span>' +
        '<span class="mono" style="color:var(--faint)">' + (open ? '\u2212' : '+') + '</span></div>');
      if (open) {
        h.push('<div class="cb"><p class="sub" style="margin:0 0 10px">' + esc(ctl.objective) + '</p>');
        ctl.evidence.forEach(function (a) {
          var r = rec[a.id] || {}, cur = r.status || 'missing';
          h.push('<div class="art"><span class="an">' + esc(a.name) +
            '<div class="sub">' + esc(a.kind) + (r.asserted ? ' &middot; asserted ' + esc(r.asserted) : '') +
            (r.edited ? ' <span class="edited">EDITED</span>' : '') + '</div></span>' +
            '<span class="tri">' +
            ['present', 'partial', 'missing'].map(function (v) {
              var c = v === 'present' ? 'pr' : v === 'partial' ? 'pa' : 'mi';
              return '<button class="' + c + '" data-act="set-evidence" data-id="' + cid + '" ' +
                'data-art="' + a.id + '" data-val="' + v + '" aria-pressed="' + (cur === v) + '">' +
                v.slice(0, 4).toUpperCase() + '</button>';
            }).join('') + '</span></div>');
        });
        h.push('<div class="reqs">' + g.requirements.map(function (rid) {
          var r = m.reqById[rid];
          return '<span class="tag i" title="' + esc(r.summary) + '">' + esc(m.fwOfReq[rid]) + ' ' +
            esc(r.ref) + ' ' + esc(r.title) + '</span>';
        }).join('') + '</div></div>');
      }
      h.push('</div>');
    });
    h.push('</div>');
    return h.join('');
  }

  /* ---------- crosswalk ---------- */
  function crosswalk(m, st) {
    var h = [];
    var active = m.activeSystems();
    h.push('<h2 class="sec">Regulatory crosswalk <em>one control, many obligations &mdash; do the work once and map it</em></h2>');
    h.push('<p class="demo" style="border-left-color:var(--accent)">Each row is a control and each column shows ' +
      'the requirement of that framework the same control satisfies. <b>' + m.controls.length +
      ' controls carry ' + Object.keys(m.reqById).length + ' requirements across ' + m.frameworks.length +
      ' frameworks</b>, which is the argument for running one control set instead of four programmes. ' +
      'Click a row for the requirement text and the evidence it needs.</p>');
    h.push('<div class="panel xw"><table><thead><tr><th>Control</th>' +
      m.frameworks.map(function (f) { return '<th class="c">' + esc(f.name) + '</th>'; }).join('') +
      '<th class="num">Leverage</th><th class="num">Coverage</th></tr></thead><tbody>');
    m.controls.forEach(function (c) {
      var covs = active.filter(function (s) { return m.applicableControls(s).indexOf(c.id) >= 0; })
        .map(function (s) { return m.controlCoverage(s.id, c.id).score; });
      var cov = Engine.mean(covs);
      var open = st.openControls[c.id];
      h.push('<tr class="click" data-act="toggle-control" data-id="' + c.id + '"><td>' + esc(c.name) +
        '<div class="sub">' + c.id + ' &middot; ' + esc(c.owner) + ' &middot; ' + esc(c.type) + '</div></td>');
      m.frameworks.forEach(function (f) {
        var rs = c.satisfies.filter(function (r) { return m.fwOfReq[r] === f.id; });
        h.push('<td class="c ' + (rs.length ? 'g' : 'z') + '">' + (rs.length
          ? rs.map(function (r) { return esc(m.reqById[r].ref); }).join('<br>') : '\u2014') + '</td>');
      });
      h.push('<td class="num">' + c.satisfies.length + '</td><td class="num">' + bar(cov) + pct(cov) + '</td></tr>');
      if (open) {
        h.push('<tr><td colspan="' + (m.frameworks.length + 3) + '" style="background:var(--panel3)">' +
          '<p class="sub" style="margin:0 0 9px">' + esc(c.objective) + '</p>' +
          '<div class="reqs">' + c.satisfies.map(function (r) {
            return '<span class="tag i" title="' + esc(m.reqById[r].summary) + '">' + esc(m.fwOfReq[r]) + ' ' +
              esc(m.reqById[r].ref) + ' &mdash; ' + esc(m.reqById[r].title) + '</span>';
          }).join('') + '</div>' +
          '<p class="sub" style="margin:10px 0 0"><b>Evidence required:</b> ' +
          c.evidence.map(function (a) { return esc(a.name); }).join(' &middot; ') + '</p>' +
          '<p class="sub" style="margin:6px 0 0">Applies to ' + covs.length + ' of ' + active.length +
          ' active systems, derived from the requirements above &mdash; applicability is never stored on the control.</p>' +
          '</td></tr>');
      }
    });
    h.push('</tbody></table></div>');

    h.push('<h2 class="sec">Weakest requirements across the portfolio <em>where the same evidence gap surfaces in more than one regime</em></h2>');
    h.push('<div class="panel"><table><thead><tr><th>Requirement</th><th>Framework</th><th>Controls behind it</th>' +
      '<th class="num">Systems</th><th class="num">Coverage</th><th>Ceiling</th></tr></thead><tbody>');
    var rows = [];
    m.frameworks.forEach(function (f) {
      m.frameworkPosture(f.id).weakest.forEach(function (w) { rows.push({ fw: f, w: w }); });
    });
    rows.sort(function (a, b) { return a.w.score - b.w.score; }).slice(0, 18).forEach(function (row) {
      var r = m.reqById[row.w.requirement], p = m.penaltyOfReq[r.id];
      h.push('<tr><td>' + esc(r.ref) + ' ' + esc(r.title) + '<div class="sub">' + esc(r.summary) + '</div></td>' +
        '<td>' + esc(row.fw.name) + '</td><td class="mono" style="font-size:11.5px">' +
        (m.controlsForReq[r.id] || []).join(' ') + '</td><td class="num">' + row.w.systems + '</td>' +
        '<td class="num">' + bar(row.w.score) + pct(row.w.score) + '</td>' +
        '<td>' + (p.ceiling_eur ? '<span class="tag t3">' + eur(p.ceiling_eur) + '</span>'
          : '<span class="tag">voluntary</span>') + '</td></tr>');
    });
    h.push('</tbody></table></div>');
    return h.join('');
  }

  /* ---------- incidents ---------- */
  function incident(m, i, compact) {
    var s = m.systemById[i.system];
    var sev = { critical: 't4', high: 't4', medium: 't3', low: 't2' }[i.severity];
    return '<div class="inc"><div class="ih"><span class="tag ' + sev + '">' + esc(i.severity) + '</span>' +
      '<h4>' + esc(i.title) + '</h4><span class="tag ' + (i.status === 'closed' ? 't1' : 'i') + '">' +
      esc(i.status.replace(/_/g, ' ')) + '</span>' +
      (i.reportable ? '<span class="tag t4">reportable</span>' : '') + '</div>' +
      '<p>' + esc(i.detail) + '</p>' +
      '<div class="meta"><span>id <b>' + esc(i.id) + '</b></span>' +
      (compact ? '' : '<span>system <b>' + esc(s.name) + '</b></span>') +
      '<span>detected <b>' + esc(i.detected) + '</b></span>' +
      '<span>affected <b>' + num(i.affected) + '</b></span>' +
      '<span>root cause <b>' + esc(i.root_cause) + '</b></span></div>' +
      '<div class="reqs">' + i.requirements.map(function (r) {
        return '<span class="tag i" title="' + esc(m.reqById[r].summary) + '">' + esc(m.fwOfReq[r]) + ' ' +
          esc(m.reqById[r].ref) + '</span>';
      }).join('') + i.controls.map(function (c) {
        return '<span class="tag p">' + esc(c) + ' ' + esc(m.controlById[c].name) + '</span>';
      }).join('') + '</div></div>';
  }

  function incidents(m, st) {
    var h = ['<h2 class="sec">AI incident register <em>' +
      m.incidents.filter(function (i) { return i.status !== 'closed'; }).length + ' open &middot; ' +
      m.incidents.filter(function (i) { return i.reportable; }).length +
      ' meet a reporting threshold under AI Act Art. 73</em></h2>'];
    h.push('<p class="demo" style="border-left-color:var(--l4)">An incident is only governance evidence if it ' +
      'closes the loop. Each entry links the event to the requirements it engages and to the controls that ' +
      'should have caught it, so the register drives the control set instead of just recording damage.</p>');
    m.incidents.slice().sort(function (a, b) { return b.detected.localeCompare(a.detected); })
      .forEach(function (i) { h.push(incident(m, i, false)); });
    h.push('<h2 class="sec">What the register says about the control set <em>the control that should have caught it, and how well evidenced it actually is</em></h2>');
    h.push('<div class="panel"><table><thead><tr><th>Control</th><th class="num">Incidents</th>' +
      '<th class="num">Portfolio coverage</th></tr></thead><tbody>');
    var byCtl = {};
    m.incidents.forEach(function (i) { i.controls.forEach(function (c) { byCtl[c] = (byCtl[c] || 0) + 1; }); });
    var active = m.activeSystems();
    Object.keys(byCtl).sort(function (a, b) { return byCtl[b] - byCtl[a]; }).forEach(function (c) {
      var covs = active.filter(function (s) { return m.applicableControls(s).indexOf(c) >= 0; })
        .map(function (s) { return m.controlCoverage(s.id, c).score; });
      h.push('<tr><td>' + c + ' ' + esc(m.controlById[c].name) + '</td><td class="num">' + byCtl[c] +
        '</td><td class="num">' + bar(Engine.mean(covs)) + pct(Engine.mean(covs)) + '</td></tr>');
    });
    h.push('</tbody></table></div>');
    return h.join('');
  }

  /* ---------- board view ---------- */
  function board(m, st) {
    var k = m.kpis(), hist = m.history();
    var first = hist[0], last = hist[hist.length - 1];
    var delta = last.exposure - first.exposure;
    var rem = m.remediation().slice(0, 3);
    var crit = {};
    m.allGaps().forEach(function (g) {
      if (g.severity === 'critical') crit[g.control] = (crit[g.control] || 0) + 1;
    });
    var top = Object.keys(crit).sort(function (a, b) { return crit[b] - crit[a]; }).slice(0, 3);
    var unowned = m.activeSystems().filter(function (s) {
      return m.tierRank(s) >= 3 && m.controlCoverage(s.id, 'C-04').score < 0.5;
    }).length;
    var maxc = Math.max.apply(null, hist.map(function (p) { return p.coverage; }));
    var h = [];
    h.push('<div class="filters noprint"><button class="ghost" data-act="print">Print / save as PDF</button>' +
      '<button class="ghost" data-act="export-board">Export board pack (.md)</button>' +
      '<button class="ghost right" data-act="export-json">Export full assessment (.json)</button></div>');
    h.push('<div class="board"><h3>AI governance &mdash; ' + esc(m.portfolio.organisation) + '</h3>' +
      '<p class="asof">Position as at ' + esc(m.portfolio.as_of) +
      ' &middot; prepared for the risk committee &middot; synthetic demonstration data</p>');
    h.push('<div class="big">' +
      '<div><div class="v">' + k.systems + '</div><div class="k">AI systems in use</div></div>' +
      '<div><div class="v" style="color:var(--l4)">' + ((k.tiers.high || 0) + (k.tiers.prohibited || 0)) +
      '</div><div class="k">High risk or banned</div></div>' +
      '<div><div class="v" style="color:var(--l3)">' + k.criticalGaps + '</div><div class="k">Critical gaps</div></div>' +
      '<div><div class="v">' + pct(k.coverage) + '</div><div class="k">Control coverage</div></div>' +
      '<div><div class="v" style="color:var(--l4)">' + eur(k.exposure) + '</div><div class="k">Exposure reference</div></div>' +
      '</div>');

    h.push('<p class="bl"><b>Position.</b> ' + k.systems + ' AI systems are in use across the group. ' +
      ((k.tiers.high || 0) + (k.tiers.prohibited || 0)) + ' sit in tiers that carry binding obligations' +
      (k.tiers.prohibited ? ', and ' + k.tiers.prohibited + ' is a practice the AI Act prohibits outright, ' +
        'which no amount of control work makes lawful' : '') + '. Documented evidence exists for ' +
      pct(k.coverage) + ' of the applicable control set. The gap is not spread evenly: the privacy programme ' +
      'carries ' + pct(m.frameworkPosture('GDPR').score) + ', while AI-Act-specific duties stand at ' +
      pct(m.frameworkPosture('EUAIA').score) + ' because they are newer and largely unowned.</p>');

    h.push('<p class="bl"><b>Direction.</b> The exposure reference has moved from ' + eur(first.exposure) +
      ' in ' + esc(first.month) + ' to ' + eur(last.exposure) + ' in ' + esc(last.month) + ', a ' +
      Math.abs(Math.round(delta / first.exposure * 100)) + '% ' + (delta < 0 ? 'reduction' : 'increase') +
      ', on the back of ' + num(m.portfolio.evidence.filter(function (e) { return e.status !== 'missing'; }).length) +
      ' artefacts now asserted. Open gaps fell from ' + first.openGaps + ' to ' + last.openGaps +
      '. On this trajectory the remaining gap closes in outline, not in the tiers that matter most.</p>');

    h.push('<div class="trendrow"><div><div class="spark">' + hist.map(function (p) {
      return '<i style="height:' + Math.round(p.coverage / maxc * 100) + '%" title="' + p.month + ' ' +
        pct(p.coverage) + '"></i>';
    }).join('') + '</div><div class="k" style="font:700 9.5px var(--mono);letter-spacing:.13em;color:var(--faint);margin-top:8px">' +
      'CONTROL COVERAGE ' + esc(first.month) + ' \u2192 ' + esc(last.month) + ', RISING</div></div>');
    h.push('<div><div class="spark">' + hist.map(function (p) {
      return '<i style="height:' + Math.round(p.exposure / first.exposure * 100) +
        '%;background:var(--l4)" title="' + p.month + ' ' + eur(p.exposure) + '"></i>';
    }).join('') + '</div><div class="k" style="font:700 9.5px var(--mono);letter-spacing:.13em;color:var(--faint);margin-top:8px">' +
      'EXPOSURE REFERENCE, FALLING</div></div></div>');

    h.push('<h2 class="sec">Top exposures <em>the control gaps that recur on the most high-risk systems</em></h2>');
    h.push('<table><thead><tr><th>#</th><th>Where the evidence is missing</th><th>Owner</th>' +
      '<th class="num">High-risk systems affected</th></tr></thead><tbody>');
    top.forEach(function (c, i) {
      h.push('<tr><td class="num">0' + (i + 1) + '</td><td>' + esc(m.controlById[c].name) +
        '<div class="sub">' + c + '</div></td><td>' + esc(m.controlById[c].owner) +
        '</td><td class="num">' + crit[c] + '</td></tr>');
    });
    h.push('</tbody></table>');

    h.push('<h2 class="sec">Asks of the committee</h2><ol style="font-size:13.5px;color:var(--dim);max-width:74ch">');
    h.push('<li>Accept or reject the residual risk on the ' + ((k.tiers.high || 0) + (k.tiers.prohibited || 0)) +
      ' systems in binding tiers. ' + unowned + ' of them still have no evidenced classification, which means ' +
      'their obligation set is an assumption rather than a finding.</li>');
    if (k.tiers.prohibited) {
      h.push('<li>Confirm decommissioning of the prohibited-practice deployment, deletion of the data it produced, ' +
        'and the notification already made to the works council and the DPO.</li>');
    }
    h.push('<li>Fund the top three remediation items, ranked by exposure removed rather than by framework: ' +
      rem.map(function (r) {
        return esc(r.name) + ' (' + r.systems.length + ' systems, ' + eur(r.exposure) + ')';
      }).join('; ') + '.</li>');
    h.push('<li>Agree that no AI system enters production without an evidenced classification and impact ' +
      'assessment, which turns the inventory into a control instead of a report.</li></ol>');
    h.push('<p class="sub" style="margin-top:20px">Exposure is a modelled upper bound against statutory ceilings ' +
      '(AI Act Art. 99, GDPR Art. 83) scaled by unmet obligations. It is a prioritisation aid, not a forecast of ' +
      'any fine, and nothing here is legal advice.</p></div>');
    return h.join('');
  }

  /* ---------- method ---------- */
  function method(m, st) {
    var k = m.kpis();
    var pairs = m.frameworks.map(function (f) { return m.frameworkPosture(f.id).pairs; })
      .reduce(function (a, b) { return a + b; }, 0);
    var h = ['<div class="panel method">'];
    h.push('<h2 class="sec" style="margin-top:0">What this is</h2>');
    h.push('<p>A control room for an AI governance programme. It holds an inventory of AI systems, derives which ' +
      'obligations each one attracts across four frameworks, tracks the evidence behind every control, and ' +
      'reports the result as risk, gaps and exposure. It runs entirely in the browser against published JSON: ' +
      'no server, no account, no telemetry.</p>');

    h.push('<h3>What it does not do</h3>');
    h.push('<p>It does not tell you whether you are compliant and it does not estimate a probability of harm or ' +
      'of a fine. Compliance is a legal conclusion about a specific system. This measures something narrower and ' +
      'checkable: <b>does documented evidence exist for the controls that carry each obligation</b>. That is the ' +
      'question an auditor, a certification body or a market surveillance authority opens with.</p>');

    h.push('<h3>The maths</h3>');
    h.push('<table><thead><tr><th>Quantity</th><th>Definition</th></tr></thead><tbody>' +
      '<tr><td>Evidence weight</td><td><code>present = 1</code>, <code>partial = 0.5</code>, ' +
      '<code>missing = 0</code>. A control with no record at all counts as zero, never as not applicable.</td></tr>' +
      '<tr><td>Control coverage</td><td>Mean evidence weight across that control\u2019s required artefacts.</td></tr>' +
      '<tr><td>Requirement coverage</td><td>Mean coverage of the applicable controls that satisfy it \u2014 a ' +
      'requirement is only as strong as the evidence standing behind it.</td></tr>' +
      '<tr><td>Framework posture</td><td>Mean requirement coverage over every applicable (system, requirement) ' +
      'pair. ' + k.systems + ' active systems produce ' + num(pairs) + ' such pairs.</td></tr>' +
      '<tr><td>Applicability</td><td>A requirement applies when every clause present in its <code>applies</code> ' +
      'block holds: role in <code>roles</code>, tier in <code>tiers</code>, and at least one <code>conditions</code> ' +
      'flag set on the system. A control applies when at least one requirement it satisfies applies \u2014 so the ' +
      'crosswalk is the single source of truth and applicability is never hand-maintained.</td></tr>' +
      '<tr><td>Likelihood band 1-4</td><td>From coverage of the applicable preventive and detective controls: ' +
      '&ge;0.85 \u2192 1, &ge;0.65 \u2192 2, &ge;0.4 \u2192 3, else 4. It bands the chance a governance failure ' +
      'goes uncaught, not the chance of harm.</td></tr>' +
      '<tr><td>Impact band 1-4</td><td>Tier rank (minimal 1 \u2026 prohibited 4), +1 if the system decides about ' +
      'people, +1 if it reaches over 100,000 people a year, capped at 4.</td></tr>' +
      '<tr><td>Exposure reference</td><td>Per system and penalty class: statutory ceiling \u00d7 unmet share of ' +
      'that class\u2019s applicable requirements, summed. Voluntary frameworks carry a ceiling of zero on purpose, ' +
      'which separates gaps with statutory teeth from posture gaps.</td></tr>' +
      '<tr><td>Trend</td><td>Replayed from the assertion date on each evidence record, so the history is read out ' +
      'of the data rather than invented.</td></tr>' +
      '<tr><td>Remediation order</td><td>Exposure removed if that one control were fully evidenced, recomputed per ' +
      'system and summed \u2014 the queue is ranked by effect, not by framework order.</td></tr>' +
      '</tbody></table>');

    h.push('<h3>Sources</h3><ul>');
    m.frameworks.forEach(function (f) {
      h.push('<li><b>' + esc(f.name) + '</b> \u2014 ' + esc(f.citation) + ' <a href="' + esc(f.url) +
        '" target="_blank" rel="noopener">source</a>. ' + f.requirements.length + ' requirements modelled.</li>');
    });
    h.push('</ul><p>Requirement summaries are plain-language paraphrases for operational use, not legal text. ' +
      'Ceilings: ' + m.penaltyClasses.filter(function (p) { return p.ceiling_eur; })
        .map(function (p) { return esc(p.cite); }).join('; ') + '.</p>');
    h.push('<p>' + esc(m.exposureMeta.note) + '</p>');
    h.push('<h3>The demonstration portfolio</h3><p>' + esc(m.portfolio.note) + ' Seed <code>' +
      esc(m.portfolio.seed) + '</code>; regenerate with <code>python scripts/seed_portfolio.py</code>. ' +
      'Any artefact status you change is held in this browser only.</p>');
    h.push('</div>');
    return h.join('');
  }

  root.Views = { room: room, systems: systems, crosswalk: crosswalk, incidents: incidents,
                 board: board, method: method, incident: incident,
                 esc: esc, pct: pct, eur: eur, num: num, bar: bar, band: band };
})(typeof window !== 'undefined' ? window : globalThis);
