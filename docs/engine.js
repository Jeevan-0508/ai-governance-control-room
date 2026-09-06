/* AI Risk Control Room - assessment engine.
   Pure functions over the loaded model. No DOM, no state, no randomness: every number the
   dashboard shows is derived here from the data files and can be recomputed independently.

   Evidence weight: present 1, partial 0.5, missing 0.
   Applicability: a requirement applies to a system when every clause present in its `applies`
   block holds - role in roles, tier in tiers, and at least one condition flag on the system.
   A control applies when at least one requirement it satisfies applies. */
(function (root) {
  'use strict';

  var WEIGHT = { present: 1, partial: 0.5, missing: 0 };
  var ACTIVE = ['production', 'pilot', 'development', 'decommissioning'];

  function mean(xs) { return xs.length ? xs.reduce(function (a, b) { return a + b; }, 0) / xs.length : 0; }

  function Model(raw) {
    this.frameworks = raw.frameworks.frameworks;
    this.controls = raw.controls.controls;
    this.evidenceKinds = raw.controls.evidence_kinds;
    this.tiers = raw.taxonomy.tiers;
    this.flags = raw.taxonomy.flags;
    this.classes = raw.taxonomy.classes;
    this.penaltyClasses = raw.exposure.penalty_classes;
    this.exposureMeta = raw.exposure;
    this.portfolio = raw.portfolio;
    this.systems = raw.portfolio.systems;
    this.incidents = raw.portfolio.incidents;

    var self = this;
    this.reqById = {};
    this.fwOfReq = {};
    this.frameworks.forEach(function (fw) {
      fw.requirements.forEach(function (r) { self.reqById[r.id] = r; self.fwOfReq[r.id] = fw.id; });
    });
    this.controlById = {}; this.controls.forEach(function (c) { self.controlById[c.id] = c; });
    this.classById = {}; this.classes.forEach(function (c) { self.classById[c.id] = c; });
    this.tierById = {}; this.tiers.forEach(function (t) { self.tierById[t.id] = t; });
    this.systemById = {}; this.systems.forEach(function (s) { self.systemById[s.id] = s; });
    this.penaltyOfReq = {};
    this.penaltyClasses.forEach(function (p) {
      p.requirements.forEach(function (r) { self.penaltyOfReq[r] = p; });
    });
    this.controlsForReq = {};
    this.controls.forEach(function (c) {
      c.satisfies.forEach(function (r) {
        (self.controlsForReq[r] = self.controlsForReq[r] || []).push(c.id);
      });
    });
    // evidence indexed as system -> control -> artefact -> status
    this.evidence = {};
    raw.portfolio.evidence.forEach(function (e) {
      var s = self.evidence[e.system] = self.evidence[e.system] || {};
      var c = s[e.control] = s[e.control] || {};
      c[e.artefact] = e;
    });
    this._cache = {};
  }

  Model.prototype.tierOf = function (sys) { return this.classById[sys['class']].tier; };
  Model.prototype.tierRank = function (sys) { return this.tierById[this.tierOf(sys)].rank; };
  Model.prototype.activeSystems = function () {
    return this.systems.filter(function (s) { return ACTIVE.indexOf(s.lifecycle) >= 0; });
  };

  Model.prototype.requirementApplies = function (req, sys) {
    var a = req.applies || {};
    if (a.roles && a.roles.indexOf(sys.role) < 0) return false;
    if (a.tiers && a.tiers.indexOf(this.tierOf(sys)) < 0) return false;
    if (a.conditions && !a.conditions.some(function (c) { return sys.flags.indexOf(c) >= 0; })) return false;
    return true;
  };

  Model.prototype.applicableRequirements = function (sys) {
    var self = this, key = 'req:' + sys.id;
    if (this._cache[key]) return this._cache[key];
    var out = Object.keys(this.reqById).filter(function (id) {
      return self.requirementApplies(self.reqById[id], sys);
    });
    return (this._cache[key] = out);
  };

  Model.prototype.applicableControls = function (sys) {
    var self = this, key = 'ctl:' + sys.id;
    if (this._cache[key]) return this._cache[key];
    var live = {};
    this.applicableRequirements(sys).forEach(function (r) { live[r] = true; });
    var out = this.controls.filter(function (c) {
      return c.satisfies.some(function (r) { return live[r]; });
    }).map(function (c) { return c.id; });
    return (this._cache[key] = out);
  };

  /* Coverage of one control for one system: mean evidence weight over its artefacts.
     A control with no evidence record at all counts as zero, never as not applicable. */
  Model.prototype.controlCoverage = function (sysId, controlId) {
    var ctl = this.controlById[controlId];
    var rec = (this.evidence[sysId] || {})[controlId] || {};
    var counts = { present: 0, partial: 0, missing: 0 };
    var asAt = this._asAt;
    var weights = ctl.evidence.map(function (a) {
      var r = rec[a.id];
      var st = (r && r.status) || 'missing';
      // as-at replay: evidence only counts from the date it was asserted
      if (asAt && r && r.asserted && r.asserted.slice(0, 7) > asAt) st = 'missing';
      counts[st]++;
      return WEIGHT[st];
    });
    return { control: controlId, score: mean(weights), counts: counts, artefacts: ctl.evidence.length };
  };

  Model.prototype.systemCoverage = function (sys) {
    var self = this;
    return mean(this.applicableControls(sys).map(function (c) {
      return self.controlCoverage(sys.id, c).score;
    }));
  };

  /* Coverage of one requirement for one system: mean coverage of the applicable controls that
     satisfy it. Requirements are satisfied by evidence, so a requirement is only as strong as
     the weakest-evidenced control standing behind it. */
  Model.prototype.requirementCoverage = function (sys, reqId) {
    var self = this;
    var live = this.applicableControls(sys);
    var ctls = (this.controlsForReq[reqId] || []).filter(function (c) { return live.indexOf(c) >= 0; });
    if (!ctls.length) return null;
    return mean(ctls.map(function (c) { return self.controlCoverage(sys.id, c).score; }));
  };

  Model.prototype.frameworkPosture = function (fwId, systems) {
    var self = this, scores = [], reqScores = {};
    (systems || this.activeSystems()).forEach(function (sys) {
      self.applicableRequirements(sys).forEach(function (rid) {
        if (self.fwOfReq[rid] !== fwId) return;
        var c = self.requirementCoverage(sys, rid);
        if (c === null) return;
        scores.push(c);
        (reqScores[rid] = reqScores[rid] || []).push(c);
      });
    });
    var weakest = Object.keys(reqScores).map(function (rid) {
      return { requirement: rid, score: mean(reqScores[rid]), systems: reqScores[rid].length };
    }).sort(function (a, b) { return a.score - b.score; });
    return { framework: fwId, score: mean(scores), pairs: scores.length, weakest: weakest };
  };

  /* Likelihood of a governance failure going undetected or unmitigated, banded from the
     evidence behind the preventive and detective controls. It is not a probability. */
  Model.prototype.likelihood = function (sys) {
    var self = this;
    var pd = this.applicableControls(sys).filter(function (c) {
      return self.controlById[c].type !== 'corrective';
    });
    var cov = mean(pd.map(function (c) { return self.controlCoverage(sys.id, c).score; }));
    var band = cov >= 0.85 ? 1 : cov >= 0.65 ? 2 : cov >= 0.4 ? 3 : 4;
    return { band: band, coverage: cov };
  };

  /* Impact if it fails, from the regulatory tier and the reach of the system. */
  Model.prototype.impact = function (sys) {
    var band = this.tierRank(sys);
    var reasons = ['tier ' + this.tierOf(sys)];
    if (sys.flags.indexOf('automated_decision') >= 0) { band += 1; reasons.push('decides about people'); }
    if (sys.people_affected_per_year >= 100000) { band += 1; reasons.push('reach over 100k people/year'); }
    return { band: Math.min(4, band), reasons: reasons };
  };

  Model.prototype.exposure = function (sys) {
    var self = this, byClass = {}, total = 0;
    var grouped = {};
    this.applicableRequirements(sys).forEach(function (rid) {
      var p = self.penaltyOfReq[rid];
      if (!p) return;
      (grouped[p.id] = grouped[p.id] || []).push(rid);
    });
    Object.keys(grouped).forEach(function (pid) {
      var p = self.penaltyClasses.filter(function (x) { return x.id === pid; })[0];
      var unmet = grouped[pid].map(function (rid) {
        var c = self.requirementCoverage(sys, rid);
        return c === null ? 1 : 1 - c;
      });
      var share = mean(unmet);
      var amount = p.ceiling_eur * share;
      byClass[pid] = { label: p.label, ceiling: p.ceiling_eur, unmet_share: share, amount: amount,
                       requirements: grouped[pid].length };
      total += amount;
    });
    return { total: total, byClass: byClass };
  };

  /* An open gap is an applicable control whose evidence is incomplete. Severity is driven by
     how little evidence exists and by whether the requirements behind it are statutory. */
  Model.prototype.gaps = function (sys) {
    var self = this;
    return this.applicableControls(sys).map(function (cid) {
      var cov = self.controlCoverage(sys.id, cid);
      var ctl = self.controlById[cid];
      var reqs = ctl.satisfies.filter(function (r) {
        return self.applicableRequirements(sys).indexOf(r) >= 0;
      });
      var ceiling = Math.max.apply(null, [0].concat(reqs.map(function (r) {
        var p = self.penaltyOfReq[r];
        return p ? p.ceiling_eur : 0;
      })));
      var statutory = ceiling > 0;
      var state = cov.score >= 1 ? 'met' : cov.score >= 0.5 ? 'partial' : 'open';
      var severity = state === 'met' ? 'none'
        : (statutory && self.tierRank(sys) >= 3 && state === 'open') ? 'critical'
        : (statutory && state === 'open') ? 'high'
        : state === 'open' ? 'medium' : 'low';
      return { system: sys.id, control: cid, name: ctl.name, type: ctl.type, owner: ctl.owner,
               coverage: cov.score, counts: cov.counts, state: state, severity: severity,
               statutory: statutory, ceiling: ceiling, requirements: reqs };
    });
  };

  Model.prototype.allGaps = function (systems) {
    var self = this, out = [];
    (systems || this.activeSystems()).forEach(function (s) {
      self.gaps(s).forEach(function (g) { if (g.state !== 'met') out.push(g); });
    });
    var order = { critical: 0, high: 1, medium: 2, low: 3 };
    return out.sort(function (a, b) {
      return order[a.severity] - order[b.severity] || a.coverage - b.coverage;
    });
  };

  Model.prototype.heatmap = function (systems) {
    var self = this, cells = {};
    (systems || this.activeSystems()).forEach(function (s) {
      var k = self.likelihood(s).band + ':' + self.impact(s).band;
      (cells[k] = cells[k] || []).push(s.id);
    });
    return cells;
  };

  /* Remediation order: the control whose completion removes the most modelled exposure per
     system it touches, so the plan is ranked by effect rather than by framework order. */
  Model.prototype.remediation = function (systems) {
    var self = this, byControl = {};
    var scope = systems || this.activeSystems();
    scope.forEach(function (s) {
      var exposureNow = self.exposure(s).total;
      self.gaps(s).forEach(function (g) {
        if (g.state === 'met') return;
        var b = byControl[g.control] = byControl[g.control] || {
          control: g.control, name: g.name, owner: g.owner, systems: [], exposure: 0,
          artefacts: 0, severities: { critical: 0, high: 0, medium: 0, low: 0 }
        };
        b.systems.push(s.id);
        b.severities[g.severity]++;
        b.artefacts += g.counts.missing + g.counts.partial;
        b.exposure += self.exposureIfClosed(s, g.control, exposureNow);
      });
    });
    return Object.keys(byControl).map(function (k) { return byControl[k]; })
      .sort(function (a, b) { return b.exposure - a.exposure || b.systems.length - a.systems.length; });
  };

  /* Exposure removed if one control's evidence were completed for one system. */
  Model.prototype.exposureIfClosed = function (sys, controlId, exposureNow) {
    var self = this;
    var real = this.controlCoverage;
    this.controlCoverage = function (sid, cid) {
      if (sid === sys.id && cid === controlId) {
        var ctl = self.controlById[cid];
        return { control: cid, score: 1, counts: { present: ctl.evidence.length, partial: 0, missing: 0 },
                 artefacts: ctl.evidence.length };
      }
      return real.call(self, sid, cid);
    };
    var after = this.exposure(sys).total;
    this.controlCoverage = real;
    return Math.max(0, (exposureNow === undefined ? this.exposure(sys).total : exposureNow) - after);
  };

  /* Trend replayed from the assertion dates already in the evidence records - the history is
     read out of the data, not invented. Returns one point per month plus the current position. */
  Model.prototype.history = function () {
    var self = this;
    var months = {};
    this.portfolio.evidence.forEach(function (e) { if (e.asserted) months[e.asserted.slice(0, 7)] = true; });
    var keys = Object.keys(months).sort();
    var active = this.activeSystems();
    var out = keys.map(function (mo) {
      self._asAt = mo;
      var point = {
        month: mo,
        coverage: mean(active.map(function (s) { return self.systemCoverage(s); })),
        exposure: active.reduce(function (a, s) { return a + self.exposure(s).total; }, 0),
        openGaps: self.allGaps(active).filter(function (g) { return g.state === 'open'; }).length
      };
      self._asAt = null;
      return point;
    });
    return out;
  };

  Model.prototype.kpis = function () {
    var self = this;
    var active = this.activeSystems();
    var gaps = this.allGaps(active);
    var exposure = active.reduce(function (a, s) { return a + self.exposure(s).total; }, 0);
    var tiers = {};
    active.forEach(function (s) { var t = self.tierOf(s); tiers[t] = (tiers[t] || 0) + 1; });
    return {
      systems: active.length,
      registered: this.systems.length,
      retired: this.systems.length - active.length,
      tiers: tiers,
      openGaps: gaps.filter(function (g) { return g.state === 'open'; }).length,
      criticalGaps: gaps.filter(function (g) { return g.severity === 'critical'; }).length,
      partialGaps: gaps.filter(function (g) { return g.state === 'partial'; }).length,
      coverage: mean(active.map(function (s) { return self.systemCoverage(s); })),
      exposure: exposure,
      openIncidents: this.incidents.filter(function (i) { return i.status !== 'closed'; }).length,
      reportableIncidents: this.incidents.filter(function (i) { return i.reportable; }).length,
      evidenceRecords: this.portfolio.evidence.length
    };
  };

  root.Engine = { Model: Model, WEIGHT: WEIGHT, ACTIVE: ACTIVE, mean: mean };
})(typeof window !== 'undefined' ? window : globalThis);
