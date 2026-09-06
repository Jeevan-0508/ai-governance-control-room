/* Bootstrap, routing and the only mutable state in the app: which view is open, the inventory
   filters, and any evidence status the user has overridden. Overrides live in localStorage so an
   edited assessment survives a reload, and they are always reversible. */
(function () {
  'use strict';

  var KEY = 'aigcr.overrides.v1';
  var state = {
    view: 'room', system: null, cell: null, openFramework: null, openControls: {},
    filters: { bu: '', tier: '', lifecycle: '', q: '' }
  };
  var model = null;

  function $(sel) { return document.querySelector(sel); }

  function loadOverrides() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; }
  }
  function saveOverrides(o) {
    try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* private mode: session only */ }
  }
  var overrides = loadOverrides();

  function applyOverrides() {
    Object.keys(overrides).forEach(function (k) {
      var p = k.split('|');
      var sys = model.evidence[p[0]] = model.evidence[p[0]] || {};
      var ctl = sys[p[1]] = sys[p[1]] || {};
      var rec = ctl[p[2]] = ctl[p[2]] || { system: p[0], control: p[1], artefact: p[2] };
      rec.status = overrides[k];
      rec.edited = true;
    });
  }

  function fail(msg) {
    var e = $('#err');
    e.hidden = false;
    e.textContent = msg;
  }

  function render() {
    var host = $('#view');
    try {
      host.innerHTML = Views[state.view](model, state);
    } catch (err) {
      fail('Render failed in the ' + state.view + ' view: ' + err.message);
      throw err;
    }
    Array.prototype.forEach.call(document.querySelectorAll('#nav button'), function (b) {
      b.classList.toggle('on', b.dataset.view === state.view);
    });
    var edits = Object.keys(overrides).length;
    $('#counts').textContent = model.systems.length + ' systems, ' + model.controls.length + ' controls, ' +
      Object.keys(model.reqById).length + ' requirements, ' + model.frameworks.length + ' frameworks, ' +
      model.portfolio.evidence.length.toLocaleString('en-GB') + ' evidence records' +
      (edits ? ' \u00b7 ' + edits + ' edited in this browser' : '');
    if (edits && !$('#resetEdits')) {
      var p = document.createElement('p');
      p.innerHTML = '<button class="ghost" id="resetEdits" data-act="clear-edits">Clear my ' + edits +
        ' evidence edits</button>';
      $('footer').insertBefore(p, $('footer').firstChild);
    } else if (edits && $('#resetEdits')) {
      $('#resetEdits').textContent = 'Clear my ' + edits + ' evidence edits';
    }
  }

  function download(name, text, type) {
    var blob = new Blob([text], { type: type || 'text/markdown;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  var ACTIONS = {
    system: function (el) { state.system = el.dataset.id; state.view = 'systems'; state.openControls = {}; window.scrollTo(0, 0); },
    back: function () { state.system = null; state.openControls = {}; },
    cell: function (el) { state.cell = el.dataset.id; state.view = 'systems'; state.system = null; },
    clearcell: function () { state.cell = null; },
    reset: function () { state.filters = { bu: '', tier: '', lifecycle: '', q: '' }; state.cell = null; },
    framework: function (el) {
      state.openFramework = state.openFramework === el.dataset.id ? null : el.dataset.id;
    },
    control: function (el) {
      state.view = 'crosswalk';
      state.openControls = {};
      state.openControls[el.dataset.id] = true;
    },
    'toggle-control': function (el) {
      var id = el.dataset.id;
      state.openControls[id] = !state.openControls[id];
    },
    'set-evidence': function (el) {
      var key = state.system + '|' + el.dataset.id + '|' + el.dataset.art;
      overrides[key] = el.dataset.val;
      saveOverrides(overrides);
      applyOverrides();
    },
    'clear-edits': function () {
      overrides = {};
      saveOverrides(overrides);
      location.reload();
    },
    print: function () { window.print(); },
    'export-board': function () {
      download('ai-governance-board-pack-' + model.portfolio.as_of + '.md', Report.boardPack(model));
    },
    'export-system': function () {
      download(state.system + '-ai-governance-report.md', Report.systemReport(model, state.system));
    },
    'export-json': function () {
      download('ai-governance-assessment-' + model.portfolio.as_of + '.json',
        Report.assessmentJson(model), 'application/json');
    }
  };

  function wire() {
    $('#nav').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-view]');
      if (!b) return;
      state.view = b.dataset.view;
      state.system = null;
      render();
    });
    document.body.addEventListener('click', function (e) {
      var el = e.target.closest('[data-act]');
      if (!el) return;
      var act = el.dataset.act;
      if (act === 'filter' || act === 'q') return;
      if (!ACTIONS[act]) return;
      e.preventDefault();
      e.stopPropagation();
      ACTIONS[act](el);
      render();
    });
    document.body.addEventListener('change', function (e) {
      var el = e.target.closest('[data-act="filter"]');
      if (!el) return;
      state.filters[el.dataset.name] = el.value;
      render();
    });
    document.body.addEventListener('input', function (e) {
      var el = e.target.closest('[data-act="q"]');
      if (!el) return;
      state.filters.q = el.value;
      var pos = el.selectionStart;
      render();
      var again = document.querySelector('[data-act="q"]');
      if (again) { again.focus(); again.setSelectionRange(pos, pos); }
    });
  }

  function boot() {
    var files = ['frameworks', 'controls', 'taxonomy', 'portfolio', 'exposure'];
    Promise.all(files.map(function (f) {
      return fetch(f + '.json').then(function (r) {
        if (!r.ok) throw new Error(f + '.json returned ' + r.status);
        return r.json();
      });
    })).then(function (parts) {
      var raw = {};
      files.forEach(function (f, i) { raw[f] = parts[i]; });
      model = new Engine.Model(raw);
      applyOverrides();
      $('#org').textContent = model.portfolio.organisation + ' \u00b7 position as at ' +
        model.portfolio.as_of + ' \u00b7 ' + model.frameworks.map(function (f) { return f.name; }).join(' / ');
      wire();
      render();
    }).catch(function (err) {
      fail('Could not load the model: ' + err.message +
        '. If you opened this file directly from disk, serve the folder over HTTP instead ' +
        '(python -m http.server) - browsers block fetch on file:// URLs.');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
