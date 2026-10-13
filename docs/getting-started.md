# Getting started

## Run the static site

From the repository root:

```bash
python3 -m http.server 4173
```

Open `http://localhost:4173/` for the populated demo or `http://localhost:4173/docs/live/` for the operator console. A static server is required because the pages load JSON with `fetch()`.

## Explore the demo

1. Open the populated control room.
2. Move from the portfolio KPIs to the risk map and system cards.
3. Open the crosswalk to compare framework requirements and evidence.
4. Use the board view to inspect the summary intended for leadership discussion.

## Try the operator console

1. Open `/docs/live/`.
2. Register an AI system and its role, class, tier, and flags.
3. Add evidence statuses to the controls that apply.
4. Review the recalculated coverage and exposure in the browser.

Operator-console edits are saved in that browser only and are not sent to a server.
