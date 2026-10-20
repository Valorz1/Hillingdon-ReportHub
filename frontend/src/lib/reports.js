// Report helpers shared by the resident and staff views.
import { classify } from './classifier.js'

export const STATUSES = [
  { id: 'new',         label: 'New' },
  { id: 'in-progress', label: 'In progress' },
  { id: 'resolved',    label: 'Resolved' },
  { id: 'closed',      label: 'Closed' },
]
export const statusLabel = (id) => STATUSES.find(s => s.id === id)?.label || id
export const isOpen = (r) => r.status === 'new' || r.status === 'in-progress'

// ── Duplicate detection ─────────────────────────────────────────────
// Two open reports are treated as the same issue when they're about the
// same thing (same department AND at least one shared strong keyword, so a
// pothole and a fly-tip on the same street stay separate) and they're
// within DUPE_RADIUS_M of each other (if both have GPS), or share the same
// first line of address (if they don't).
const DUPE_RADIUS_M = 150
const DUPE_WINDOW_MS = 14 * 24 * 3600 * 1000

function distanceM(a, b) {
  const R = 6_371_000
  const rad = (d) => d * Math.PI / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

const placeKey = (loc) => (loc || '').split(',')[0].trim().toLowerCase()

// "fly-tipping" / "fly tipped" → "flytipp", "potholes" → "pothole"
const stem = (kw) => kw.replace(/[\s-]/g, '').replace(/(ing|ed|es|s)$/, '')
const topicCache = new Map()
function topics(r) {
  if (!topicCache.has(r.id)) {
    topicCache.set(r.id, new Set(classify(r.subject, r.description).strongHits.map(stem)))
  }
  return topicCache.get(r.id)
}
const shareTopic = (a, b) => [...topics(a)].some(t => topics(b).has(t))
const hasCoords = (r) => r.lat != null && r.lng != null

function sameIssue(a, b) {
  if (a.classification.department !== b.classification.department) return false
  if (a.classification.department === 'general') return false
  if (Math.abs(new Date(a.submittedAt) - new Date(b.submittedAt)) > DUPE_WINDOW_MS) return false
  if (!shareTopic(a, b)) return false
  if (hasCoords(a) && hasCoords(b)) return distanceM(a, b) <= DUPE_RADIUS_M
  const ka = placeKey(a.location)
  return ka !== '' && ka === placeKey(b.location)
}

// → Map<reportId, Report[]> of likely duplicates for each open report
export function findDuplicates(reports) {
  const open = reports.filter(isOpen)
  const out = new Map()
  for (let i = 0; i < open.length; i++) {
    for (let j = i + 1; j < open.length; j++) {
      if (sameIssue(open[i], open[j])) {
        if (!out.has(open[i].id)) out.set(open[i].id, [])
        if (!out.has(open[j].id)) out.set(open[j].id, [])
        out.get(open[i].id).push(open[j])
        out.get(open[j].id).push(open[i])
      }
    }
  }
  return out
}

// ── Priority ────────────────────────────────────────────────────────
// Flags reports that mention an immediate risk to people, so they float
// to the top of the triage queue regardless of department.
const URGENT_TERMS = [
  'safeguarding', 'child protection', 'at risk', 'vulnerable', 'fallen tree',
  'blocking the road', 'blocking the pavement', 'injured', 'injury', 'dangerous',
  'unsafe', 'gas leak', 'flooding', 'exposed wire', 'swerving', 'walking in the road',
  'no heating',
]

export function urgencyOf(r) {
  const text = `${r.subject} ${r.description}`.toLowerCase()
  const hit = URGENT_TERMS.find(t => text.includes(t))
  return hit ? { urgent: true, reason: hit } : { urgent: false, reason: null }
}

// Low-confidence auto-routing that a person should double-check
export const needsReview = (r) =>
  r.classification.department === 'general' || r.classification.confidence < 0.5

const ACTION_LABELS = {
  submitted: 'Report submitted',
  classified: 'Auto-classified',
  reassigned: 'Reassigned',
  status_changed: 'Status changed',
}
export const actionLabel = (a) => ACTION_LABELS[a] || a
