#!/usr/bin/env python3
"""Build the demo AI system portfolio.

The portfolio is synthetic. The systems, owners and incidents are invented for a fictional
group, and the evidence status of each artefact is derived deterministically from a hash of
the system and artefact id against that system's governance maturity. Same input, same output,
every run - so the numbers on the dashboard can be recomputed and checked by anyone.

    python scripts/seed_portfolio.py            # write data/portfolio.json
    python scripts/seed_portfolio.py --check    # fail if the committed file is stale
"""
import argparse
import hashlib
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
SEED = "meridian-group-2026-09-06"

# name, taxonomy class, business unit, owner, role, model, hosting, geography,
# lifecycle stage, people affected per year, maturity 0-100, extra flags
SYSTEMS = [
    ("Recruitment Screening Assistant", "AI-001", "People", "Head of Talent Acquisition", "deployer",
     "Vendor model (SaaS)", "EU (Ireland)", ["DE", "FR", "PL"], "production", 41000, 34, ["third_party_model"]),
    ("Warehouse Shift Allocation Engine", "AI-001", "Operations", "Director, Network Operations", "provider",
     "In-house gradient boosting", "Self-hosted (EU)", ["DE", "CZ"], "production", 8600, 52, []),
    ("Driver Performance Scoring", "AI-001", "Logistics", "Head of Transport Ops", "provider",
     "In-house gradient boosting", "Self-hosted (EU)", ["DE", "NL", "PL"], "production", 12400, 41, []),
    ("Consumer Credit Decision Model", "AI-002", "Retail Finance", "Chief Credit Officer", "provider",
     "In-house logistic + GBM ensemble", "Self-hosted (EU)", ["DE", "AT"], "production", 260000, 63, []),
    ("Buy-Now-Pay-Later Limit Setter", "AI-002", "Retail Finance", "Head of Consumer Lending", "deployer",
     "Vendor model (API)", "Vendor (US)", ["DE", "ES", "IT"], "production", 90000, 38,
     ["third_party_model", "third_country_transfer"]),
    ("Depot Access Face Matching", "AI-003", "Security", "Group Head of Physical Security", "deployer",
     "Vendor model (on-prem)", "Self-hosted (EU)", ["DE"], "pilot", 3200, 29, ["third_party_model"]),
    ("Interview Engagement Analytics", "AI-004", "People", "Head of Talent Acquisition", "deployer",
     "Vendor model (SaaS)", "Vendor (US)", ["DE"], "decommissioning", 1500, 22,
     ["third_party_model", "third_country_transfer"]),
    ("Partner Reliability Index", "AI-005", "Procurement", "Head of Supplier Management", "provider",
     "In-house scoring", "Self-hosted (EU)", ["EU-wide"], "retired", 0, 31, []),
    ("Customer Service Assistant", "AI-006", "Customer Care", "Director, Customer Experience", "deployer",
     "Frontier LLM (API)", "Vendor (US, EU inference)", ["DE", "FR", "ES", "IT", "NL"], "production", 1900000, 57,
     ["third_party_model"]),
    ("Internal HR Policy Assistant", "AI-006", "People", "HR Operations Manager", "deployer",
     "Frontier LLM (API)", "Vendor (EU inference)", ["EU-wide"], "production", 24000, 48, ["third_party_model"]),
    ("Carrier Onboarding Chat Agent", "AI-006", "Logistics", "Head of Carrier Management", "deployer",
     "Frontier LLM (API)", "Vendor (EU inference)", ["DE", "PL", "RO"], "pilot", 7400, 33, ["third_party_model"]),
    ("Campaign Copy Generator", "AI-007", "Marketing", "Head of Brand", "deployer",
     "Frontier LLM (API)", "Vendor (US)", ["EU-wide"], "production", 0, 44,
     ["third_party_model", "third_country_transfer"]),
    ("Product Imagery Synthesiser", "AI-007", "Marketing", "Creative Director", "deployer",
     "Diffusion model (SaaS)", "Vendor (US)", ["EU-wide"], "production", 0, 36, ["third_party_model"]),
    ("Spokesperson Voice Clone", "AI-007", "Marketing", "Head of Brand", "deployer",
     "Vendor voice model", "Vendor (US)", ["DE"], "pilot", 0, 25, ["third_party_model"]),
    ("Health Insurance Pricing Model", "AI-008", "Insurance", "Chief Actuary", "provider",
     "In-house GLM + GBM", "Self-hosted (EU)", ["DE"], "production", 410000, 68, []),
    ("Claims Triage Engine", "AI-008", "Insurance", "Head of Claims", "provider",
     "In-house classifier", "Self-hosted (EU)", ["DE", "AT"], "production", 155000, 55, []),
    ("Apprenticeship Admission Ranker", "AI-009", "People", "Head of Early Careers", "deployer",
     "Vendor model (SaaS)", "EU (Ireland)", ["DE"], "development", 5600, 27, ["third_party_model"]),
    ("Forklift Collision Avoidance", "AI-010", "Operations", "Head of Site Safety", "deployer",
     "OEM embedded model", "On device", ["DE", "CZ", "PL"], "production", 4100, 61, ["third_party_model"]),
    ("Cold Chain Failure Predictor", "AI-010", "Logistics", "Head of Cold Chain", "provider",
     "In-house time series", "Self-hosted (EU)", ["DE", "NL"], "production", 0, 49, []),
    ("Depot Energy Load Balancer", "AI-011", "Facilities", "Head of Energy", "deployer",
     "Vendor optimiser", "Vendor (EU)", ["DE"], "production", 0, 43, ["third_party_model"]),
    ("Yard Traffic Flow Controller", "AI-011", "Operations", "Head of Yard Operations", "provider",
     "In-house optimiser", "Self-hosted (EU)", ["DE", "PL"], "pilot", 0, 35, []),
    ("Payment Fraud Scoring", "AI-013", "Retail Finance", "Head of Financial Crime", "provider",
     "In-house GBM", "Self-hosted (EU)", ["EU-wide"], "production", 2400000, 71, []),
    ("Carrier Fraud Risk Engine", "AI-013", "Logistics", "Head of Transport Risk", "provider",
     "In-house GBM + rules", "Self-hosted (EU)", ["DE", "PL", "RO", "TR"], "production", 18000, 66, []),
    ("Claims Abuse Detection", "AI-013", "Insurance", "Head of Claims Integrity", "provider",
     "In-house classifier", "Self-hosted (EU)", ["DE", "AT"], "production", 62000, 54, []),
    ("Contract Clause Extractor", "AI-014", "Legal", "Head of Commercial Legal", "deployer",
     "Frontier LLM (API)", "Vendor (EU inference)", ["EU-wide"], "production", 0, 58, ["third_party_model"]),
    ("Engineering Code Assistant", "AI-014", "Technology", "VP Engineering", "deployer",
     "Vendor code model", "Vendor (US)", ["EU-wide"], "production", 0, 51,
     ["third_party_model", "third_country_transfer"]),
    ("Invoice Data Capture", "AI-014", "Finance", "Head of Accounts Payable", "deployer",
     "Vendor OCR + LLM", "Vendor (EU)", ["EU-wide"], "production", 0, 64, ["third_party_model"]),
]

INCIDENTS = [
    {"id": "AI-2026-011", "system": "SYS-01", "severity": "high", "detected": "2026-08-14",
     "title": "Screening model down-ranked candidates with employment gaps",
     "affected": 1240, "status": "under_investigation", "root_cause": "Training data imbalance",
     "reportable": True, "requirements": ["EUAIA-73", "EUAIA-10", "GDPR-22"],
     "controls": ["C-11", "C-15", "C-21"],
     "detail": "A recruiter escalation, not a monitoring alert, surfaced the pattern. The correlation with parental leave was found on review of 90 days of decision logs."},
    {"id": "AI-2026-014", "system": "SYS-09", "severity": "high", "detected": "2026-08-27",
     "title": "Retrieval returned another customer's order data in a chat reply",
     "affected": 3, "status": "contained", "root_cause": "Tenant filter missing on a retrieval index",
     "reportable": False, "requirements": ["GDPR-32", "GDPR-5", "EUAIA-15"],
     "controls": ["C-14", "C-18"],
     "detail": "Guardrails caught none of it; a customer reported the disclosure. Index rebuilt with tenant scoping and a regression test added."},
    {"id": "AI-2026-015", "system": "SYS-05", "severity": "medium", "detected": "2026-08-30",
     "title": "Limit-setting model drifted beyond declared accuracy band",
     "affected": 8700, "status": "remediation", "root_cause": "Population shift after a new market launch",
     "reportable": False, "requirements": ["EUAIA-15", "EUAIA-72"],
     "controls": ["C-17", "C-24"],
     "detail": "Drift was visible in vendor telemetry for six weeks before anyone reviewed it. No internal monitoring threshold existed."},
    {"id": "AI-2026-016", "system": "SYS-07", "severity": "critical", "detected": "2026-09-01",
     "title": "Emotion analytics used in live interviews before legal sign-off",
     "affected": 210, "status": "escalated", "root_cause": "Vendor feature enabled by default after an upgrade",
     "reportable": True, "requirements": ["EUAIA-5", "GDPR-9", "GDPR-35"],
     "controls": ["C-03", "C-26", "C-01"],
     "detail": "A prohibited practice ran for eleven days. Feature disabled, data deleted, works council and DPO notified, deployment now in decommissioning."},
    {"id": "AI-2026-017", "system": "SYS-23", "severity": "medium", "detected": "2026-09-03",
     "title": "Carrier blocked by fraud score with no contestation route",
     "affected": 1, "status": "closed", "root_cause": "Score reused as an onboarding gate without a review step",
     "reportable": False, "requirements": ["EUAIA-86", "GDPR-22"],
     "controls": ["C-21", "C-15"],
     "detail": "A legitimate haulier lost nine days of loads. The detection model had been wired into an access decision, which is the reuse that lifts the tier."},
    {"id": "AI-2026-018", "system": "SYS-14", "severity": "medium", "detected": "2026-09-04",
     "title": "Synthetic spokesperson audio published without marking",
     "affected": 0, "status": "remediation", "root_cause": "No provenance metadata in the publishing pipeline",
     "reportable": False, "requirements": ["EUAIA-50"],
     "controls": ["C-20", "C-19"],
     "detail": "Two regional radio spots went out unmarked. Pulled and re-cut; marking check added to the publishing gate."},
]

STATUS_MONTHS = ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"]


def roll(*parts, mod=100):
    h = hashlib.sha256((SEED + "|" + "|".join(str(p) for p in parts)).encode()).hexdigest()
    return int(h[:12], 16) % mod


def requirement_applies(req, role, tier, flags):
    """The applicability rule. Every clause present must hold; conditions match on any flag.

    The browser engine in docs/app.js implements the same rule, and tests/assert.mjs checks the
    two agree by comparing the evidence records seeded here against what the app derives.
    """
    a = req.get("applies", {})
    if a.get("roles") and role not in a["roles"]:
        return False
    if a.get("tiers") and tier not in a["tiers"]:
        return False
    if a.get("conditions") and not (set(a["conditions"]) & set(flags)):
        return False
    return True


# A real organisation is not equally mature across frameworks: the privacy programme predates
# the AI Act by years, so GDPR-linked evidence usually exists while AI-Act-specific artefacts do
# not. The offset encodes that so the posture bars carry that story instead of being flat.
PROGRAMME_OFFSET = {"gdpr_backed": 17, "ai_act_specific": -13, "voluntary_only": -5}


def control_offset(control, framework_of):
    fws = {framework_of[r] for r in control["satisfies"]}
    if "GDPR" in fws:
        return PROGRAMME_OFFSET["gdpr_backed"]
    if "EUAIA" in fws:
        return PROGRAMME_OFFSET["ai_act_specific"]
    return PROGRAMME_OFFSET["voluntary_only"]


def load(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def build():
    tax = load("taxonomy.json")
    controls = load("controls.json")
    classes = {c["id"]: c for c in tax["classes"]}
    frameworks = load("frameworks.json")
    reqs = {r["id"]: r for fw in frameworks["frameworks"] for r in fw["requirements"]}
    framework_of = {r["id"]: fw["id"] for fw in frameworks["frameworks"] for r in fw["requirements"]}
    for c in controls["controls"]:
        for rid in c["satisfies"]:
            if rid not in reqs:
                sys.exit(f"{c['id']} satisfies unknown requirement {rid}")

    systems, evidence = [], []
    for i, row in enumerate(SYSTEMS, start=1):
        (name, cls, bu, owner, role, model, hosting, geo, stage, people, maturity, extra) = row
        sid = f"SYS-{i:02d}"
        flags = sorted(set(classes[cls]["implies_flags"]) | set(extra))
        systems.append({
            "id": sid, "name": name, "class": cls, "business_unit": bu, "owner": owner,
            "role": role, "model": model, "hosting": hosting, "geography": geo,
            "lifecycle": stage, "people_affected_per_year": people, "flags": flags,
            "registered": f"2026-0{1 + i % 6}-{1 + (i * 3) % 27:02d}",
        })
        tier = classes[cls]["tier"]
        # evidence status per artefact of every applicable control, gated by system maturity
        for ctl in controls["controls"]:
            if not any(requirement_applies(reqs[r], role, tier, flags) for r in ctl["satisfies"]):
                continue
            threshold = maturity + control_offset(ctl, framework_of)
            for art in ctl["evidence"]:
                r = roll(sid, art["id"])
                if r < threshold - 12:
                    status = "present"
                elif r < threshold + 14:
                    status = "partial"
                else:
                    status = "missing"
                rec = {"system": sid, "control": ctl["id"], "artefact": art["id"], "status": status}
                if status != "missing":
                    rec["asserted"] = STATUS_MONTHS[roll(sid, art["id"], "m", mod=len(STATUS_MONTHS))] + "-01"
                evidence.append(rec)

    ids = {s["id"] for s in systems}
    for inc in INCIDENTS:
        if inc["system"] not in ids:
            sys.exit(f"incident {inc['id']} references unknown system {inc['system']}")

    return {
        "schema_version": "1.0",
        "generated_by": "scripts/seed_portfolio.py",
        "seed": SEED,
        "synthetic": True,
        "note": "Fictional group. No real organisation, person or incident is described. Evidence status is "
                "derived from a hash of the system and artefact id against that system's maturity value, so "
                "the portfolio is reproducible but carries no real-world meaning.",
        "organisation": "Meridian Group",
        "as_of": "2026-09-06",
        "systems": systems,
        "evidence": evidence,
        "incidents": INCIDENTS,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    out = build()
    target = DATA / "portfolio.json"
    text = json.dumps(out, indent=1, ensure_ascii=False) + "\n"
    if args.check:
        if not target.exists() or target.read_text(encoding="utf-8") != text:
            sys.exit("data/portfolio.json is stale - run python scripts/seed_portfolio.py")
        print("portfolio.json is current")
        return
    target.write_text(text, encoding="utf-8")
    ev = out["evidence"]
    counts = {s: sum(1 for e in ev if e["status"] == s) for s in ("present", "partial", "missing")}
    print(f"{len(out['systems'])} systems, {len(ev)} evidence records {counts}, {len(out['incidents'])} incidents")


if __name__ == "__main__":
    main()
