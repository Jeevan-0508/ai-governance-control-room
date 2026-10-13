# AI Governance Control Room architecture

The Control Room is a static browser application. Its model is stored as JSON, its calculation engine runs in JavaScript in the browser, and its two experiences share the same data and view code.

## Runtime shape

```text
data/*.json
  -> docs/*.json (validated deployment copy)
  -> docs/engine.js model and calculation layer
  -> docs/views.js shared rendering helpers
  -> docs/index.html populated demo
  -> docs/live/index.html browser-local operator console
```

The repository root redirects to `docs/`. The populated page reads the published model files and renders portfolio, system, control, framework, exposure, incident, and board views. The live console starts with an empty portfolio and lets a user register systems and evidence in the browser.

## Model layers

- `frameworks.json` defines framework requirements and citations.
- `controls.json` defines controls, evidence kinds, and requirement relationships.
- `taxonomy.json` defines risk classes, tiers, flags, and applicability concepts.
- `portfolio.json` supplies the fictional populated demo.
- `exposure.json` supplies the exposure and incident data used by the demo views.

`scripts/validate_model.py` checks cross-references and synchronises the deployment copies when requested. `tests/assert.mjs` independently recomputes key figures from the raw model and asserts the served page agrees.

## Persistence boundary

The operator console stores its browser-local portfolio in `localStorage` under `aigcr.live.portfolio.v1`. The populated demo stores local evidence-status overrides under `aigcr.overrides.v1`. No server-side persistence, account system, or telemetry client is implemented.
