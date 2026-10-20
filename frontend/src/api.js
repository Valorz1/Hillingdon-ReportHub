// API wrapper with a mock fallback. With VITE_USE_BACKEND=true every call
// goes to the FastAPI backend; otherwise reports live in localStorage and
// are classified in the browser by the JS port of the rules engine, so the
// whole app can be demoed with `npm run dev` and nothing else. Both paths
// return the same shapes, so call sites don't care which is active.
import { classify } from './lib/classifier.js'
import { SEED_REPORTS } from './data/seed-reports.js'
import { MOCK_USERS } from './data/mock-users.js'

export const USE_BACKEND = import.meta.env.VITE_USE_BACKEND === 'true'

// In Capacitor WebView, relative URLs resolve to capacitor://localhost, not
// the server. VITE_API_BASE lets the app build point at the real host.
const IS_APP = typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform()
const API_BASE = IS_APP ? (import.meta.env.VITE_API_BASE || '') : ''

// ── Storage (private mode / blocked storage throws on access) ──────
const store = {
  get(key) { try { return localStorage.getItem(key) } catch { return null } },
  set(key, v) { try { localStorage.setItem(key, v); return true } catch { return false } },
  del(key) { try { localStorage.removeItem(key) } catch {} },
}

const TOKEN_KEY = 'hil_token'
const SESSION_KEY = 'hil_session'
export const SESSION_EXPIRED_EVENT = 'hil:session-expired'

export const session = {
  load() {
    // With a real backend a cached user is useless without its token
    if (USE_BACKEND && !store.get(TOKEN_KEY)) return null
    try { return JSON.parse(store.get(SESSION_KEY)) } catch { return null }
  },
  save(user) { store.set(SESSION_KEY, JSON.stringify(user)) },
  clear() { store.del(SESSION_KEY); store.del(TOKEN_KEY) },
}

// ── Real backend path ──────────────────────────────────────────────
export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status }
}

async function errorMessage(res) {
  try {
    const { detail } = await res.json()
    // FastAPI validation errors come back as a list of {msg, loc}
    if (Array.isArray(detail)) return detail.map(d => d.msg).join('; ')
    if (detail) return String(detail)
  } catch {}
  return `${res.status} ${res.statusText || 'Request failed'}`
}

async function realFetch(path, { body, headers, ...opts } = {}) {
  const token = store.get(TOKEN_KEY)
  const isJson = body != null && !(body instanceof FormData)
  let res
  try {
    res = await fetch(API_BASE + path, {
      ...opts,
      body: isJson ? JSON.stringify(body) : body,
      headers: {
        ...(isJson ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    })
  } catch {
    throw new ApiError("Can't reach the server — check your connection.", 0)
  }
  if (res.status === 401 && token) window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
  if (!res.ok) throw new ApiError(await errorMessage(res), res.status)
  const ct = res.headers.get('content-type') || ''
  return ct.includes('application/json') ? res.json() : res.text()
}

// ── Mock backend (localStorage + JS classifier) ────────────────────
const STORAGE_KEY = 'triage.reports.v2'
const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function makeRef(date) {
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  let code = ''
  for (let i = 0; i < 5; i++) code += REF_ALPHABET[Math.floor(Math.random() * REF_ALPHABET.length)]
  return `HIL-${dd}-${mm}-${code}`
}

function cryptoId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'r-' + Math.random().toString(36).slice(2, 10)
}

function loadMockReports() {
  try {
    const raw = store.get(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  // First load — seed, spaced out over the last ~17 hours
  const now = Date.now()
  const seeded = SEED_REPORTS.map((r, i) =>
    buildReport(r, now - (SEED_REPORTS.length - i) * 37 * 60_000))
  store.set(STORAGE_KEY, JSON.stringify(seeded))
  return seeded
}

function saveMockReports(reports) {
  if (store.set(STORAGE_KEY, JSON.stringify(reports))) return
  // Over the ~5 MB quota: photos are the bulk of it, so drop all but the newest
  const newest = reports.reduce((a, b) => (a.submittedAt > b.submittedAt ? a : b), reports[0])
  const slim = reports.map(r => (r === newest ? r : { ...r, photo: null, hasPhoto: false }))
  if (!store.set(STORAGE_KEY, JSON.stringify(slim))) {
    throw new Error('Browser storage is full — clear site data to keep using demo mode.')
  }
}

function buildReport(input, ts = Date.now(), actor = null) {
  const c = classify(input.subject, input.description)
  // Low-confidence fallback: send to the general queue for a human to route
  const dept = c.confidence >= 0.4 ? c.department : 'general'
  const iso = new Date(ts).toISOString()
  return {
    id: cryptoId(),
    ref: makeRef(new Date(ts)),
    subject: input.subject,
    description: input.description,
    location: input.location || null,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    photo: input.photo || null,
    hasPhoto: !!input.photo,
    reporter: input.reporter || null,
    submittedAt: iso,
    classification: {
      department: dept,
      confidence: c.confidence,
      reasoning: c.reasoning,
      engine: c.engine,
    },
    status: input.status || 'new',
    reassignedFrom: null,
    auditLog: [
      { ts: iso, action: 'submitted', actor: actor || input.reporter || null },
      { ts: iso, action: 'classified', actor: 'system', details: `${c.engine} → ${dept} (${c.confidence})` },
      // seeded demo reports that start part-way through their lifecycle
      ...(input.status && input.status !== 'new'
        ? [{ ts: new Date(ts + 25 * 60_000).toISOString(), action: 'status_changed', actor: 'admin@hillingdon.gov.uk', details: `new → ${input.status}` }]
        : []),
    ],
  }
}

const newestFirst = (a, b) => b.submittedAt.localeCompare(a.submittedAt)
const withoutPhoto = (r) => ({ ...r, photo: null })
const currentEmail = () => session.load()?.email || null

function updateMock(id, fn) {
  const reports = loadMockReports()
  const r = reports.find(x => x.id === id)
  if (!r) throw new Error('Report not found')
  fn(r)
  saveMockReports(reports)
  return withoutPhoto(r)
}

// ── Public API ─────────────────────────────────────────────────────

export async function loginUser(email, password) {
  if (USE_BACKEND) {
    const data = await realFetch('/api/auth/login', { method: 'POST', body: { email, password } })
    store.set(TOKEN_KEY, data.token)
    return data.user
  }
  const em   = email.trim().toLowerCase()
  const user = MOCK_USERS.find(u => u.email === em && u.password === password)
  if (!user) throw new Error('Invalid email or password')
  const { password: _, ...safe } = user
  return safe
}

// Lists never include the photo itself (only `hasPhoto`); use getReport for that.
export async function listReports({ department } = {}) {
  if (USE_BACKEND) {
    const q = department ? `?dept=${encodeURIComponent(department)}` : ''
    return realFetch(`/api/reports${q}`)
  }
  let reports = loadMockReports()
  if (department) reports = reports.filter(r => r.classification.department === department)
  return reports.sort(newestFirst).map(withoutPhoto)
}

export async function listMyReports(email) {
  if (USE_BACKEND) {
    return realFetch(`/api/reports?reporter=${encodeURIComponent(email)}`)
  }
  return loadMockReports().filter(r => r.reporter === email).sort(newestFirst).map(withoutPhoto)
}

export async function getReport(id) {
  if (USE_BACKEND) return realFetch(`/api/reports/${encodeURIComponent(id)}`)
  const r = loadMockReports().find(x => x.id === id)
  if (!r) throw new Error('Report not found')
  return r
}

export async function submitReport({ subject, description, location, lat, lng, photo, reporter }) {
  const payload = { subject, description, location, lat, lng, photo, reporter }
  if (USE_BACKEND) {
    return realFetch('/api/reports', { method: 'POST', body: payload })
  }
  const reports = loadMockReports()
  const r = buildReport(payload, Date.now(), currentEmail())
  reports.push(r)
  saveMockReports(reports)
  return r
}

export async function updateReportStatus(id, status) {
  if (USE_BACKEND) {
    return realFetch(`/api/reports/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: { status } })
  }
  return updateMock(id, r => {
    if (r.status === status) return
    r.auditLog.push({ ts: new Date().toISOString(), action: 'status_changed', actor: currentEmail(), details: `${r.status} → ${status}` })
    r.status = status
  })
}

export async function reassignReport(id, newDepartment, reason = 'Manual reassignment') {
  if (USE_BACKEND) {
    return realFetch(`/api/reports/${encodeURIComponent(id)}/reassign`, {
      method: 'PUT',
      body: { department: newDepartment, reason },
    })
  }
  return updateMock(id, r => {
    const previous = r.classification.department
    if (previous === newDepartment) return
    r.reassignedFrom = previous
    r.classification.department = newDepartment
    r.auditLog.push({ ts: new Date().toISOString(), action: 'reassigned', actor: currentEmail(), details: `${previous} → ${newDepartment} (${reason})` })
  })
}

export async function clearMockReports() {
  store.del(STORAGE_KEY)
}

// ── AI endpoints (backend only) ────────────────────────────────────

export async function chatWithBot(messages) {
  if (!USE_BACKEND) return null
  return realFetch('/api/chat', { method: 'POST', body: { messages } })
}

// Resolves to null when image analysis isn't available, rather than throwing.
// After the first 503 we stop asking, so later photos don't re-upload for nothing.
let visionAvailable = USE_BACKEND
export async function analyseImage(dataUrl) {
  if (!visionAvailable) return null
  try {
    return await realFetch('/api/analyse-image', { method: 'POST', body: { dataUrl } })
  } catch (e) {
    if (e.status === 503) { visionAvailable = false; return null }
    throw e
  }
}

export async function transcribeAudio(blob) {
  if (!USE_BACKEND) {
    throw new Error("Voice notes need the live server — please type your description instead.")
  }
  const form = new FormData()
  const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm'
  form.append('audio', blob, `recording.${ext}`)
  const { text } = await realFetch('/api/transcribe', { method: 'POST', body: form })
  return text
}
