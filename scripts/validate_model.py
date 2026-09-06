#!/usr/bin/env python3
"""Integrity checks for the control model, and the site copy sync.

Nothing in the browser can fix a broken model, so every cross-reference is checked here and the
same script runs in CI. It refuses dangling ids, requirements no control carries, requirements in
more than one penalty class, evidence for a control that does not apply to that system, and a
docs/ copy that has drifted from data/.

    python scripts/validate_model.py           # check only
    python scripts/validate_model.py --sync     # check, then refresh the docs/ copies
"""
import argparse
import json
import pathlib
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
DOCS = ROOT / "docs"
FILES = ["frameworks", "controls", "taxonomy", "portfolio", "exposure"]

errors = []


def bad(msg):
    errors.append(msg)


def load(name):
    return json.loads((DATA / f"{name}.json").read_text(encoding="utf-8"))


def requirement_applies(req, role, tier, flags):
    a = req.get("applies", {})
    if a.get("roles") and role not in a["roles"]:
        return False
    if a.get("tiers") and tier not in a["tiers"]:
        return False
    if a.get("conditions") and not (set(a["conditions"]) & set(flags)):
        return False
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sync", action="store_true")
    args = ap.parse_args()

    fw, ctl, tax, pf, exp = (load(n) for n in FILES)

    reqs, fw_of = {}, {}
    for f in fw["frameworks"]:
        for r in f["requirements"]:
            if r["id"] in reqs:
                bad(f"duplicate requirement id {r['id']}")
            reqs[r["id"]] = r
            fw_of[r["id"]] = f["id"]
        for key in ("citation", "url"):
            if not f.get(key):
                bad(f"framework {f['id']} has no {key}")

    tiers = {t["id"] for t in tax["tiers"]}
    flags = {x["id"] for x in tax["flags"]}
    classes = {c["id"]: c for c in tax["classes"]}

    for r in reqs.values():
        a = r.get("applies", {})
        for t in a.get("tiers", []):
            if t not in tiers:
                bad(f"{r['id']} applies to unknown tier {t}")
        for c in a.get("conditions", []):
            if c not in flags:
                bad(f"{r['id']} applies on unknown condition flag {c}")
        for role in a.get("roles", []):
            if role not in ("provider", "deployer"):
                bad(f"{r['id']} applies to unknown role {role}")

    kinds = {k["id"] for k in ctl["evidence_kinds"]}
    controls = {c["id"]: c for c in ctl["controls"]}
    carried = set()
    art_ids = set()
    for c in ctl["controls"]:
        if not c["evidence"]:
            bad(f"{c['id']} requires no evidence, so its coverage can never be measured")
        if c["type"] not in ("preventive", "detective", "corrective"):
            bad(f"{c['id']} has unknown type {c['type']}")
        for r in c["satisfies"]:
            if r not in reqs:
                bad(f"{c['id']} satisfies unknown requirement {r}")
            carried.add(r)
        for a in c["evidence"]:
            if a["kind"] not in kinds:
                bad(f"{a['id']} has unknown evidence kind {a['kind']}")
            if a["id"] in art_ids:
                bad(f"duplicate artefact id {a['id']}")
            art_ids.add(a["id"])

    for r in reqs:
        if r not in carried:
            bad(f"requirement {r} is carried by no control, so it can never be evidenced")

    seen = {}
    for p in exp["penalty_classes"]:
        for r in p["requirements"]:
            if r not in reqs:
                bad(f"penalty class {p['id']} references unknown requirement {r}")
            if r in seen:
                bad(f"requirement {r} is in two penalty classes: {seen[r]} and {p['id']}")
            seen[r] = p["id"]
    for r in reqs:
        if r not in seen:
            bad(f"requirement {r} has no penalty class, so it cannot be priced or excluded")

    for c in tax["classes"]:
        if c["tier"] not in tiers:
            bad(f"class {c['id']} has unknown tier {c['tier']}")
        for f in c["implies_flags"]:
            if f not in flags:
                bad(f"class {c['id']} implies unknown flag {f}")
        if not c.get("basis"):
            bad(f"class {c['id']} has no stated basis for its tier")

    systems = {s["id"]: s for s in pf["systems"]}
    for s in pf["systems"]:
        if s["class"] not in classes:
            bad(f"{s['id']} has unknown class {s['class']}")
        if s["role"] not in ("provider", "deployer"):
            bad(f"{s['id']} has unknown role {s['role']}")
        for f in s["flags"]:
            if f not in flags:
                bad(f"{s['id']} carries unknown flag {f}")

    # evidence must exist for exactly the applicable controls, no more and no less
    for s in pf["systems"]:
        tier = classes[s["class"]]["tier"]
        applicable = {
            c["id"] for c in ctl["controls"]
            if any(requirement_applies(reqs[r], s["role"], tier, s["flags"]) for r in c["satisfies"])
        }
        recorded = {e["control"] for e in pf["evidence"] if e["system"] == s["id"]}
        for extra in sorted(recorded - applicable):
            bad(f"{s['id']} has evidence for {extra}, which does not apply to it")
        for missing in sorted(applicable - recorded):
            bad(f"{s['id']} has no evidence records for applicable control {missing}")

    for e in pf["evidence"]:
        if e["system"] not in systems:
            bad(f"evidence references unknown system {e['system']}")
        elif e["control"] not in controls:
            bad(f"evidence references unknown control {e['control']}")
        elif e["artefact"] not in {a["id"] for a in controls[e["control"]]["evidence"]}:
            bad(f"evidence artefact {e['artefact']} does not belong to {e['control']}")
        if e["status"] not in ("present", "partial", "missing"):
            bad(f"evidence status {e['status']} is not present, partial or missing")
        if e["status"] != "missing" and not e.get("asserted"):
            bad(f"{e['system']}/{e['artefact']} is {e['status']} with no assertion date, so it cannot be replayed")

    for i in pf["incidents"]:
        if i["system"] not in systems:
            bad(f"incident {i['id']} references unknown system {i['system']}")
        for r in i["requirements"]:
            if r not in reqs:
                bad(f"incident {i['id']} references unknown requirement {r}")
        for c in i["controls"]:
            if c not in controls:
                bad(f"incident {i['id']} references unknown control {c}")

    if args.sync:
        for n in FILES:
            shutil.copyfile(DATA / f"{n}.json", DOCS / f"{n}.json")
    else:
        for n in FILES:
            a = (DATA / f"{n}.json").read_text(encoding="utf-8")
            b = (DOCS / f"{n}.json").read_text(encoding="utf-8") if (DOCS / f"{n}.json").exists() else ""
            if a != b:
                bad(f"docs/{n}.json is out of sync with data/ - run python scripts/validate_model.py --sync")

    if errors:
        print(f"{len(errors)} problem(s):", file=sys.stderr)
        for e in errors[:40]:
            print("  -", e, file=sys.stderr)
        sys.exit(1)

    print(f"model ok: {len(fw['frameworks'])} frameworks, {len(reqs)} requirements, "
          f"{len(controls)} controls, {len(art_ids)} evidence artefacts, {len(tax['classes'])} use-case classes, "
          f"{len(systems)} systems, {len(pf['evidence'])} evidence records, {len(pf['incidents'])} incidents"
          + (" (docs/ synced)" if args.sync else " (docs/ in sync)"))


if __name__ == "__main__":
    main()
