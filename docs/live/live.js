/* Operator console. Same engine, same views, but the portfolio is yours: it starts empty, lives in
   localStorage, and every number is derived from what you enter. The boot sequence reports the real
   contents of the loaded model files, so it is a status readout rather than decoration. */
(function () {
  'use strict';

  var KEY = 'aigcr.live.portfolio.v1';
  var model = null, raw = null;
  var state = {
    view: 'room', system: null, cell: null, openFramework: null, openControls: {},
    filters: { bu: '', tier: '', lifecycle: '', q: '' }, dialog: null
  };

  function $(s) { return document.querySelector(s); }
  function esc(s) { return Views.esc(s); }
  function today() { return new Date().toISOString().slice(0, 10); }

  /* ---------- storage ---------- */
  function blank() {
    return {
      schema_version: '1.0', organisation: 'My organisation', as_of: today(),
      synthetic: false, note: 'Inventory entered by the operator in the live console.',
      systems: [], evidence: [], incidents: []
    };
  }
  function load() {
    try {
      var p = JSON.parse(localStorage.getItem(KEY));
      if (p && Array.isArray(p.systems)) return p;
    } catch (e) { /* fall through to a blank inventory */ }
    return blank();
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(portfolio)); }
    catch (e) { warn('This browser refused to save your inventory (private mode?). Export to JSON to keep it.'); }
  }
  var portfolio = load();

  function rebuild() {
    portfolio.as_of = today();
    model = new Engine.Model({
      frameworks: raw.frameworks, controls: raw.controls, taxonomy: raw.taxonomy,
      exposure: raw.exposure, portfolio: portfolio
    });
  }

  function warn(msg) { var e = $('#err'); e.hidden = false; e.textContent = msg; }

  /* ---------- boot sequence ---------- */
  function boot(lines, done) {
    var log = $('#bootlog'), i = 0, out = '';
    var skip = function () { finish(); };
    function finish() {
      document.removeEventListener('keydown', skip);
      $('#boot').removeEventListener('click', skip);
      clearTimeout(timer);
      $('#boot').classList.add('out');
      $('#shell').classList.remove('hidden');
      setTimeout(function () { var b = $('#boot'); if (b) b.remove(); }, 520);
      done();
    }
    document.addEventListener('keydown', skip);
    $('#boot').addEventListener('click', skip);
    var timer;
    (function step() {
      if (i >= lines.length) { timer = setTimeout(finish, 620); return; }
      out += lines[i] + '\n';
      log.innerHTML = out + '<span class="cur">&nbsp;</span>';
      timer = setTimeout(step, lines[i] === '' ? 90 : (i < 2 ? 340 : 190));
      i++;
    })();
  }

  function bootLines() {
    var reqs = raw.frameworks.frameworks.reduce(function (a, f) { return a + f.requirements.length; }, 0);
    var arts = raw.controls.controls.reduce(function (a, c) { return a + c.evidence.length; }, 0);
    var maps = raw.controls.controls.reduce(function (a, c) { return a + c.satisfies.length; }, 0);
    var pad = function (label, dots) { return label + ' ' + new Array(Math.max(2, dots - label.length)).join('.'); };
    return [
      '<b>JK / AI RISK CONTROL ROOM</b>  <i>operator console v1.0</i>',
      '<i>' + new Date().toUTCString() + '</i>',
      '',
      '[<u>ok</u>] ' + pad('regulatory model', 34) + ' ' + raw.frameworks.frameworks.length +
        ' frameworks, ' + reqs + ' requirements',
      '[<u>ok</u>] ' + pad('control library', 34) + ' ' + raw.controls.controls.length +
        ' controls, ' + arts + ' evidence artefacts',
      '[<u>ok</u>] ' + pad('regulatory crosswalk', 34) + ' ' + maps + ' mappings resolved',
      '[<u>ok</u>] ' + pad('use-case taxonomy', 34) + ' ' + raw.taxonomy.classes.length +
        ' classes, ' + raw.taxonomy.flags.length + ' condition flags',
      '[<u>ok</u>] ' + pad('penalty model', 34) + ' ' + raw.exposure.penalty_classes.length +
        ' classes, ceilings from Art. 99 / Art. 83',
      '[<u>ok</u>] ' + pad('applicability engine', 34) + ' derived, not stored',
      '[<u>ok</u>] ' + pad('local inventory', 34) + ' ' + portfolio.systems.length +
        ' system' + (portfolio.systems.length === 1 ? '' : 's') + ' restored from this browser',
      '',
      portfolio.systems.length
        ? '<b>CONTROL ROOM ONLINE</b>  <i>' + portfolio.systems.length + ' systems under assessment</i>'
        : '<b>CONTROL ROOM ONLINE</b>  <i>inventory empty - register your first AI system</i>'
    ];
  }

  /* ---------- toolbar ---------- */
  function toolbar() {
    var k = model.kpis();
    var h = [];
    if (state.system) {
      h.push('<button class="ghost" data-act="back">&larr; Inventory</button>');
      h.push('<button class="act" data-act="edit-system">Edit this system</button>');
      h.push('<button class="danger" data-act="delete-system">Delete</button>');
      h.push('<span class="pill right">' + esc(model.systemById[state.system].name) + '</span>');
    } else {
      h.push('<button class="act" data-act="new-system">+ Register an AI system</button>');
      h.push('<button class="ghost" data-act="org">Rename organisation</button>');
      h.push('<button class="ghost" data-act="export-portfolio">Export inventory (.json)</button>');
      h.push('<button class="ghost" data-act="import-portfolio">Import</button>');
      if (!portfolio.systems.length) {
        h.push('<button class="ghost" data-act="load-example">Load the example organisation</button>');
      } else {
        h.push('<button class="danger" data-act="clear-all">Clear inventory</button>');
      }
      h.push('<span class="pill right"><b>' + k.systems + '</b> active &middot; <b>' +
        Views.pct(k.coverage) + '</b> coverage &middot; <b>' + k.openGaps + '</b> open gaps</span>');
    }
    return h.join('');
  }

  /* ---------- register / edit form ---------- */
  function form(sys) {
    var cls = sys ? model.classById[sys['class']] : raw.taxonomy.classes[0];
    var flags = sys ? sys.flags : cls.implies_flags;
    var f = function (label, name, value, type, note) {
      return '<div class="field"><label>' + esc(label) + '</label><input name="' + name +
        '" type="' + (type || 'text') + '" value="' + esc(value == null ? '' : value) + '">' +
        (note ? '<span class="note">' + esc(note) + '</span>' : '') + '</div>';
    };
    var opts = function (name, label, list, cur, note) {
      return '<div class="field"><label>' + esc(label) + '</label><select name="' + name + '">' +
        list.map(function (o) {
          return '<option value="' + esc(o.v) + '"' + (o.v === cur ? ' selected' : '') + '>' +
            esc(o.l) + '</option>';
        }).join('') + '</select>' + (note ? '<span class="note">' + esc(note) + '</span>' : '') + '</div>';
    };
    var h = ['<div class="dlg" id="dlg"><h3>' + (sys ? 'Edit ' + esc(sys.name) : 'Register an AI system') + '</h3>'];
    h.push('<p class="lead">Describe what the system does. The obligations, tier, risk banding and ' +
      'exposure are then derived &mdash; you never pick them yourself.</p>');
    h.push('<div class="form">');
    h.push('<div class="field wide"><label>What is it called</label><input name="name" value="' +
      esc(sys ? sys.name : '') + '" placeholder="e.g. Recruitment screening assistant"></div>');
    h.push(opts('class', 'What does it do', raw.taxonomy.classes.map(function (c) {
      return { v: c.id, l: c.name + '  (' + model.tierById[c.tier].label.toLowerCase() + ')' };
    }), cls.id, 'This choice drives the legal tier and the whole obligation set.'));
    h.push(opts('role', 'Your role', [
      { v: 'deployer', l: 'Deployer - we use a system someone else built' },
      { v: 'provider', l: 'Provider - we built it, or we put our name on it' }
    ], sys ? sys.role : 'deployer', 'Providers carry the build-side duties; deployers carry use-side duties.'));
    h.push(opts('lifecycle', 'Lifecycle stage', ['production', 'pilot', 'development', 'decommissioning', 'retired']
      .map(function (v) { return { v: v, l: v }; }), sys ? sys.lifecycle : 'production',
      'Retired systems drop out of the posture figures.'));
    h.push(f('Business unit', 'business_unit', sys ? sys.business_unit : '', 'text'));
    h.push(f('Accountable owner', 'owner', sys ? sys.owner : '', 'text', 'A person or a role, not a team inbox.'));
    h.push(f('Model', 'model', sys ? sys.model : '', 'text', 'e.g. vendor LLM via API, in-house gradient boosting'));
    h.push(f('Hosting', 'hosting', sys ? sys.hosting : '', 'text', 'e.g. self-hosted EU, vendor US'));
    h.push(f('Geography', 'geography', sys ? sys.geography.join(', ') : '', 'text', 'Comma separated'));
    h.push(f('People affected per year', 'people', sys ? sys.people_affected_per_year : 0, 'number',
      'Drives the impact band above 100,000.'));
    h.push('</div>');
    h.push('<div class="field wide" style="margin-top:14px"><label>Facts about the processing</label>' +
      '<span class="note" style="margin-bottom:7px">Pre-ticked from the use case. Each one switches ' +
      'requirements on, so correct them for your system.</span><div class="flagbox">' +
      raw.taxonomy.flags.map(function (fl) {
        return '<label><input type="checkbox" name="flag" value="' + fl.id + '"' +
          (flags.indexOf(fl.id) >= 0 ? ' checked' : '') + '>' + esc(fl.label) + '</label>';
      }).join('') + '</div></div>');
    h.push('<div class="derived" id="preview"></div>');
    h.push('<div class="dlgbar"><button class="act" data-act="save-system"' +
      (sys ? ' data-id="' + sys.id + '"' : '') + '>' + (sys ? 'Save changes' : 'Register system') +
      '</button><button class="ghost" data-act="cancel">Cancel</button></div></div>');
    return h.join('');
  }

  /* Live preview of what the entered facts imply, before anything is saved. */
  function preview() {
    var el = $('#preview');
    if (!el) return;
    var d = readForm();
    var probe = {
      id: '__probe', name: d.name || 'this system', 'class': d['class'], role: d.role,
      flags: d.flags, lifecycle: d.lifecycle, people_affected_per_year: d.people,
      business_unit: d.business_unit, owner: d.owner, model: d.model, hosting: d.hosting,
      geography: d.geography
    };
    var cls = model.classById[d['class']];
    var reqs = model.applicableRequirements(probe);
    var ctls = model.applicableControls(probe);
    var arts = ctls.reduce(function (a, c) { return a + model.controlById[c].evidence.length; }, 0);
    var byFw = {};
    reqs.forEach(function (r) { byFw[model.fwOfReq[r]] = (byFw[model.fwOfReq[r]] || 0) + 1; });
    el.innerHTML = '<b>' + esc(model.tierById[cls.tier].label) + '.</b> ' + esc(cls.basis) +
      '<br><br>On these facts it attracts <b>' + reqs.length + ' requirements</b> (' +
      Object.keys(byFw).map(function (k) { return byFw[k] + ' ' + k; }).join(', ') +
      ') carried by <b>' + ctls.length + ' controls</b>, needing <b>' + arts +
      ' evidence artefacts</b>. Impact band <b>' + model.impact(probe).band + '</b> because ' +
      esc(model.impact(probe).reasons.join(', ')) + '.';
  }

  function readForm() {
    var g = function (n) { var el = document.querySelector('[name="' + n + '"]'); return el ? el.value.trim() : ''; };
    return {
      name: g('name'), 'class': g('class'), role: g('role'), lifecycle: g('lifecycle'),
      business_unit: g('business_unit') || 'Unassigned', owner: g('owner') || 'Unassigned',
      model: g('model') || 'Not recorded', hosting: g('hosting') || 'Not recorded',
      geography: g('geography') ? g('geography').split(',').map(function (s) { return s.trim(); })
        .filter(Boolean) : ['Not recorded'],
      people: Math.max(0, parseInt(g('people'), 10) || 0),
      flags: Array.prototype.map.call(document.querySelectorAll('[name="flag"]:checked'),
        function (c) { return c.value; })
    };
  }

  function nextId() {
    var n = 0;
    portfolio.systems.forEach(function (s) {
      var m = /^SYS-(\d+)$/.exec(s.id);
      if (m) n = Math.max(n, +m[1]);
    });
    return 'SYS-' + String(n + 1).padStart(2, '0');
  }

  /* ---------- actions ---------- */
  var ACTIONS = {
    'new-system': function () { state.dialog = 'new'; state.system = null; },
    'edit-system': function () { state.dialog = 'edit'; },
    cancel: function () { state.dialog = null; },
    'save-system': function (el) {
      var d = readForm();
      if (!d.name) { warn('Give the system a name before registering it.'); return; }
      $('#err').hidden = true;
      if (el.dataset.id) {
        var s = model.systemById[el.dataset.id];
        var i = portfolio.systems.indexOf(s);
        portfolio.systems[i] = Object.assign({}, s, {
          name: d.name, 'class': d['class'], role: d.role, lifecycle: d.lifecycle,
          business_unit: d.business_unit, owner: d.owner, model: d.model, hosting: d.hosting,
          geography: d.geography, people_affected_per_year: d.people, flags: d.flags
        });
        state.system = el.dataset.id;
      } else {
        var id = nextId();
        portfolio.systems.push({
          id: id, name: d.name, 'class': d['class'], role: d.role, lifecycle: d.lifecycle,
          business_unit: d.business_unit, owner: d.owner, model: d.model, hosting: d.hosting,
          geography: d.geography, people_affected_per_year: d.people, flags: d.flags,
          registered: today()
        });
        state.system = id;
        state.view = 'systems';
      }
      state.dialog = null;
      save(); rebuild();
    },
    'delete-system': function () {
      var s = model.systemById[state.system];
      if (!window.confirm('Remove ' + s.name + ' and its evidence records from your inventory?')) return;
      portfolio.systems = portfolio.systems.filter(function (x) { return x.id !== s.id; });
      portfolio.evidence = portfolio.evidence.filter(function (e) { return e.system !== s.id; });
      portfolio.incidents = portfolio.incidents.filter(function (i) { return i.system !== s.id; });
      state.system = null; state.dialog = null;
      save(); rebuild();
    },
    'set-evidence': function (el) {
      var sid = state.system, cid = el.dataset.id, aid = el.dataset.art, val = el.dataset.val;
      var rec = portfolio.evidence.filter(function (e) {
        return e.system === sid && e.control === cid && e.artefact === aid;
      })[0];
      if (!rec) {
        rec = { system: sid, control: cid, artefact: aid };
        portfolio.evidence.push(rec);
      }
      rec.status = val;
      if (val === 'missing') delete rec.asserted;
      else rec.asserted = today();
      save(); rebuild();
    },
    org: function () {
      var name = window.prompt('Organisation name for the reports', portfolio.organisation);
      if (name === null) return;
      portfolio.organisation = name.trim() || 'My organisation';
      save(); rebuild();
    },
    'clear-all': function () {
      if (!window.confirm('Clear the whole inventory? Export it first if you want to keep it.')) return;
      portfolio = blank();
      state.system = null; state.dialog = null;
      save(); rebuild();
    },
    'load-example': function () {
      fetch('../portfolio.json').then(function (r) { return r.json(); }).then(function (p) {
        portfolio = p;
        portfolio.organisation = p.organisation + ' (example, editable)';
        state.system = null; state.view = 'room';
        save(); rebuild(); render();
      }).catch(function (e) { warn('Could not load the example portfolio: ' + e.message); });
    },
    'export-portfolio': function () {
      download((portfolio.organisation.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'inventory') +
        '-ai-inventory.json', JSON.stringify(portfolio, null, 1), 'application/json');
    },
    'import-portfolio': function () {
      var inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = '.json,application/json';
      inp.onchange = function () {
        var file = inp.files[0];
        if (!file) return;
        var fr = new FileReader();
        fr.onload = function () {
          try {
            var p = JSON.parse(fr.result);
            if (!Array.isArray(p.systems)) throw new Error('no systems array in that file');
            p.evidence = p.evidence || [];
            p.incidents = p.incidents || [];
            portfolio = p;
            state.system = null; state.view = 'room';
            $('#err').hidden = true;
            save(); rebuild(); render();
          } catch (e) { warn('That file is not an inventory export: ' + e.message); }
        };
        fr.readAsText(file);
      };
      inp.click();
    },
    system: function (el) { state.system = el.dataset.id; state.view = 'systems'; state.openControls = {}; window.scrollTo(0, 0); },
    back: function () { state.system = null; state.dialog = null; state.openControls = {}; },
    cell: function (el) { state.cell = el.dataset.id; state.view = 'systems'; state.system = null; },
    clearcell: function () { state.cell = null; },
    reset: function () { state.filters = { bu: '', tier: '', lifecycle: '', q: '' }; state.cell = null; },
    framework: function (el) {
      state.openFramework = state.openFramework === el.dataset.id ? null : el.dataset.id;
    },
    control: function (el) {
      state.view = 'crosswalk'; state.system = null;
      state.openControls = {}; state.openControls[el.dataset.id] = true;
    },
    'toggle-control': function (el) {
      state.openControls[el.dataset.id] = !state.openControls[el.dataset.id];
    },
    print: function () { window.print(); },
    'export-board': function () {
      download('ai-governance-board-pack-' + today() + '.md', Report.boardPack(model));
    },
    'export-system': function () {
      download(state.system + '-ai-governance-report.md', Report.systemReport(model, state.system));
    },
    'export-json': function () {
      download('ai-governance-assessment-' + today() + '.json', Report.assessmentJson(model),
        'application/json');
    }
  };

  function download(name, text, type) {
    var blob = new Blob([text], { type: type || 'text/markdown;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  function emptyState() {
    return '<div class="empty"><h3>Your inventory is empty</h3>' +
      '<p>Register the first AI system your organisation uses. You describe what it does and who it ' +
      'affects; the console derives the legal tier, the obligations across all four frameworks, the ' +
      'controls that carry them and the evidence each one needs.</p>' +
      '<p>Nothing leaves this browser. Export to JSON at any time.</p>' +
      '<div class="bar"><button class="act" data-act="new-system">+ Register an AI system</button>' +
      '<button class="ghost" data-act="load-example">Load the example organisation instead</button></div></div>';
  }

  function render() {
    $('#toolbar').innerHTML = toolbar();
    $('#dialog').innerHTML = state.dialog ? form(state.dialog === 'edit' ? model.systemById[state.system] : null) : '';
    if (state.dialog) preview();
    var host = $('#view');
    if (!portfolio.systems.length && state.view !== 'crosswalk' && state.view !== 'method') {
      host.innerHTML = emptyState();
    } else {
      try {
        host.innerHTML = Views[state.view](model, state);
      } catch (err) {
        warn('Render failed in the ' + state.view + ' view: ' + err.message);
        throw err;
      }
    }
    Array.prototype.forEach.call(document.querySelectorAll('#nav button'), function (b) {
      b.classList.toggle('on', b.dataset.view === state.view);
    });
    $('#org').textContent = portfolio.organisation + ' \u00b7 ' + portfolio.systems.length +
      ' system' + (portfolio.systems.length === 1 ? '' : 's') + ' registered \u00b7 held in this browser';
    $('#counts').textContent = model.frameworks.length + ' frameworks, ' +
      Object.keys(model.reqById).length + ' requirements, ' + model.controls.length + ' controls, ' +
      portfolio.evidence.length + ' evidence records entered';
  }

  function wire() {
    $('#nav').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-view]');
      if (!b) return;
      state.view = b.dataset.view;
      state.system = null; state.dialog = null;
      render();
    });
    document.body.addEventListener('click', function (e) {
      var el = e.target.closest('[data-act]');
      if (!el) return;
      var act = el.dataset.act;
      if (act === 'filter' || act === 'q' || !ACTIONS[act]) return;
      e.preventDefault();
      e.stopPropagation();
      ACTIONS[act](el);
      render();
    });
    document.body.addEventListener('change', function (e) {
      var fl = e.target.closest('[name="flag"], [name="class"], [name="role"], [name="lifecycle"]');
      if (fl) {
        if (fl.name === 'class' && state.dialog === 'new') {
          var cls = model.classById[fl.value];
          Array.prototype.forEach.call(document.querySelectorAll('[name="flag"]'), function (c) {
            c.checked = cls.implies_flags.indexOf(c.value) >= 0;
          });
        }
        preview();
        return;
      }
      var el = e.target.closest('[data-act="filter"]');
      if (!el) return;
      state.filters[el.dataset.name] = el.value;
      render();
    });
    document.body.addEventListener('input', function (e) {
      if (e.target.closest('#dlg')) { preview(); return; }
      var el = e.target.closest('[data-act="q"]');
      if (!el) return;
      state.filters.q = el.value;
      var pos = el.selectionStart;
      render();
      var again = document.querySelector('[data-act="q"]');
      if (again) { again.focus(); again.setSelectionRange(pos, pos); }
    });
  }

  var files = ['frameworks', 'controls', 'taxonomy', 'exposure'];
  Promise.all(files.map(function (f) {
    return fetch('../' + f + '.json').then(function (r) {
      if (!r.ok) throw new Error(f + '.json returned ' + r.status);
      return r.json();
    });
  })).then(function (parts) {
    raw = {};
    files.forEach(function (f, i) { raw[f] = parts[i]; });
    rebuild();
    wire();
    boot(bootLines(), render);
  }).catch(function (err) {
    var b = $('#boot');
    if (b) b.remove();
    $('#shell').classList.remove('hidden');
    warn('Could not load the regulatory model: ' + err.message +
      '. If you opened this from disk, serve the folder over HTTP instead - browsers block fetch on file:// URLs.');
  });
})();
