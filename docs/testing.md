# Testing and validation

## Model integrity

```bash
python3 scripts/validate_model.py
```

This checks framework, control, taxonomy, portfolio, and exposure cross-references. Use `--sync` only when intentionally refreshing the deployment copies in `docs/` from `data/`.

## Browser assertions

With the static site served, run:

```bash
node tests/assert.mjs http://127.0.0.1:4173/docs/
node tests/assert-live.mjs http://127.0.0.1:4173/docs/live/
```

The assertions load the real pages, recompute key figures from the model, check for browser errors, and exercise the operator-console workflow. They require the repository's Puppeteer test dependency to be installed in the local environment.

## Screenshot integrity

`tests/screenshots.mjs` is intended to regenerate the README captures from the served page so the screenshots remain tied to the current UI rather than a hand-edited mock.
