#!/usr/bin/env python3
"""Recount README figures from data/*.json and report drift.

Never rewrites the README - a hand-written sentence can say things a plain
number can't, so this only checks and reports; a human decides the edit.
validate_model.py checks the model's internal consistency (no dangling ids,
no orphaned requirements); this checks a different thing - whether the
README's own prose still says what the model says.
"""
import io, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
README = os.path.join(ROOT, "README.md")
DATA = os.path.join(ROOT, "data")
findings = []


def check(label, computed, pattern):
    text = open(README, encoding="utf-8").read()
    m = re.search(pattern, text)
    if not m:
        findings.append((label, "not found in README", str(computed)))
        return
    claimed = int(m.group(1).replace(",", ""))
    if claimed != computed:
        findings.append((label, str(claimed), str(computed)))


def report():
    lines = []
    if not findings:
        lines.append("No drift. Every figure in the README matches the data.")
    else:
        lines.append("**%d figure(s) drifted from the data:**" % len(findings))
        lines.append("")
        lines.append("| Figure | README says | Data says |")
        lines.append("|---|---|---|")
        for label, claimed, computed in findings:
            lines.append("| %s | %s | %s |" % (label, claimed, computed))
        lines += ["", "Nothing has been changed. Each row is a decision for you."]
    text = "\n".join(lines) + "\n"
    io.open("findings.md", "w", encoding="utf-8", newline="\n").write(text)
    print(text)


def main():
    fw = json.load(open(os.path.join(DATA, "frameworks.json"), encoding="utf-8"))["frameworks"]
    ctl = json.load(open(os.path.join(DATA, "controls.json"), encoding="utf-8"))["controls"]
    tax = json.load(open(os.path.join(DATA, "taxonomy.json"), encoding="utf-8"))
    pf = json.load(open(os.path.join(DATA, "portfolio.json"), encoding="utf-8"))

    check("frameworks", len(fw), r"\| Frameworks \| (\d+) \|")
    check("requirements", sum(len(f["requirements"]) for f in fw), r"\| Requirements \| (\d+) \|")
    check("controls", len(ctl), r"\| Controls \| (\d+) \|")
    check("evidence artefacts", sum(len(c.get("evidence") or []) for c in ctl),
          r"\| Evidence artefacts \| (\d+) \|")
    check("crosswalk mappings", sum(len(c.get("satisfies") or []) for c in ctl),
          r"\| Crosswalk mappings \| (\d+) \|")
    check("AI use-case classes", len(tax["classes"]), r"\| AI use-case classes \| (\d+) \|")
    check("demo portfolio systems", len(pf["systems"]), r"\| Demo portfolio \| (\d+) systems \|")
    check("demo portfolio evidence records", len(pf["evidence"]), r"([\d,]+) evidence records")
    check("demo portfolio incidents", len(pf["incidents"]), r"([\d,]+) incidents,")
    report()


if __name__ == "__main__":
    main()
