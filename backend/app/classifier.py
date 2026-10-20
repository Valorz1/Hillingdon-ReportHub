import re

# Mirror of frontend/src/data/rules.js — keep the two in sync.
RULES: dict[str, dict[int, list[str]]] = {
    "housing": {
        3: ["housing officer", "council house", "tenancy", "eviction", "right to buy"],
        2: ["leak", "boiler", "heating", "damp", "mould", "repair", "landlord", "tenant", "rent", "flat", "maisonette"],
        1: ["kitchen", "bathroom", "window", "door", "roof"],
    },
    "streets": {
        3: ["fly-tipping", "fly tipping", "fly-tipped", "missed bin", "pothole", "rubbish dumped"],
        2: ["bin", "rubbish", "waste", "litter", "street cleaning", "pavement", "kerb", "graffiti", "dog mess", "fallen tree", "streetlight", "street light"],
        1: ["road", "street", "path", "broken", "junction"],
    },
    "parking": {
        3: ["parking permit", "pcn", "parking fine", "parking ticket", "cpz", "controlled parking zone"],
        2: ["parking", "parked", "double yellow", "yellow lines", "enforcement", "tow"],
        1: ["car", "vehicle", "driveway"],
    },
    "environment": {
        3: ["noise complaint", "pest control", "air quality", "rats infestation"],
        2: ["noise", "loud music", "barking", "pollution", "smell", "odour", "rats", "mice", "pigeons", "pests", "fumes"],
        1: ["neighbour", "late night", "smoke"],
    },
    "planning": {
        3: ["planning application", "planning permission", "building control", "listed building", "conservation area"],
        2: ["planning", "extension", "development", "construction", "permitted development"],
        1: ["build", "building"],
    },
    "council-tax": {
        3: ["council tax", "single person discount", "council tax bill"],
        2: ["tax bill", "tax exemption", "tax band", "arrears", "direct debit", "rebate"],
        1: ["bill", "payment", "invoice"],
    },
    "antisocial": {
        3: ["anti-social behaviour", "antisocial behaviour", "asb", "harassment", "intimidation"],
        2: ["threat", "shouting", "aggressive", "drug dealing", "gang", "vandalism"],
        1: ["fight", "argument", "scared"],
    },
    "social-services": {
        3: ["safeguarding", "child protection", "adult social care", "child at risk", "vulnerable adult"],
        2: ["care home", "foster", "social worker", "mental health", "elderly", "disability", "carer"],
        1: ["child", "family", "support"],
    },
}

DEPARTMENTS = set(RULES) | {"general"}

# Whole-word match with an optional plural, so "bin" hits "bins" but not
# "cabinet", and "rent" doesn't fire on "parent" or "current".
_PATTERNS: dict[str, list[tuple[int, str, re.Pattern]]] = {
    dept: [
        (weight, kw, re.compile(rf"\b{re.escape(kw)}(?:s|es)?\b"))
        for weight, keywords in by_weight.items()
        for kw in keywords
    ]
    for dept, by_weight in RULES.items()
}


def classify(subject: str, description: str) -> dict:
    haystack = f"{subject or ''}\n{description or ''}".lower()

    scores: dict[str, int] = {}
    hits: dict[str, list[str]] = {}

    for dept, patterns in _PATTERNS.items():
        matched = [(w, kw) for w, kw, rx in patterns if rx.search(haystack)]
        if matched:
            scores[dept] = sum(w for w, _ in matched)
            hits[dept] = [kw for _, kw in sorted(matched, key=lambda m: -m[0])]

    if not scores:
        return {
            "department": "general",
            "confidence": 0.0,
            "reasoning": "No keyword matches — routed to general queue for human review.",
            "engine": "rules",
        }

    ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    winner, top = ranked[0]
    second = ranked[1][1] if len(ranked) > 1 else 0
    margin = top - second
    confidence = round(min(1.0, max(0.0, (top + margin) / 10)), 2)

    matched_kws = hits[winner][:4]
    reasoning = f"Matched: {', '.join(repr(k) for k in matched_kws)}"

    return {
        "department": winner if confidence >= 0.4 else "general",
        "confidence": confidence,
        "reasoning": reasoning,
        "engine": "rules",
    }
