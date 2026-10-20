// Tier-1 rule-based classifier. Reads RULES from data/rules.js, scores
// each department by summed keyword weights present in the report's
// (subject + description), returns the winning department with a
// confidence score in [0, 1].
//
// Same algorithm as backend/app/classifier.py — keep the two in sync.
//
// Confidence:
//   raw     = winning score
//   margin  = winning score − second-place score
//   conf    = clamp((raw + margin) / 10, 0, 1)
//
// 0 hits anywhere → returns 'general' with confidence = 0 (the
// human-review queue).
import { RULES } from '../data/rules.js'

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Compiled once. Whole-word match with an optional plural, so "bin"
// hits "bins" but not "cabinet", and "rent" doesn't fire on "parent".
const PATTERNS = Object.entries(RULES).map(([dept, byWeight]) => [
  dept,
  Object.entries(byWeight).flatMap(([weight, keywords]) =>
    keywords.map(kw => ({ weight: Number(weight), kw, re: new RegExp(`\\b${escapeRe(kw)}(?:s|es)?\\b`) }))),
])

export function classify(subject, description) {
  const haystack = `${subject || ''}\n${description || ''}`.toLowerCase()

  const scores = {}
  const hits = {}  // which keywords matched, strongest first, for the reasoning string
  for (const [dept, patterns] of PATTERNS) {
    const matched = patterns.filter(p => p.re.test(haystack))
    if (matched.length) {
      scores[dept] = matched.reduce((sum, p) => sum + p.weight, 0)
      hits[dept] = matched.sort((a, b) => b.weight - a.weight)
    }
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1])
  if (!ranked.length) {
    return {
      department: 'general',
      confidence: 0,
      reasoning: 'No keyword matches — routed to general queue for human review.',
      engine: 'rules',
      hits: [],
      strongHits: [],
    }
  }

  const [winner, top] = ranked[0]
  const second = ranked[1]?.[1] || 0
  const confidence = Math.min(1, Math.max(0, (top + top - second) / 10))

  return {
    department: winner,
    confidence: Number(confidence.toFixed(2)),
    reasoning: `Matched: ${hits[winner].slice(0, 4).map(p => `“${p.kw}”`).join(', ')}`,
    engine: 'rules',
    hits: hits[winner].map(p => p.kw),
    strongHits: hits[winner].filter(p => p.weight >= 2).map(p => p.kw),
  }
}
