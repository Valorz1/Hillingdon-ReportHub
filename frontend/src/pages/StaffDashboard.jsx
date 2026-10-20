import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { listReports, getReport, reassignReport, updateReportStatus } from '../api'
import { DEPARTMENTS, departmentById } from '../data/departments.js'
import { fmtShort, fmtFull, fmtLongDate, fmtAgo, shortPlace } from '../lib/format.js'
import { STATUSES, statusLabel, isOpen, findDuplicates, urgencyOf, needsReview, actionLabel } from '../lib/reports.js'
import { Header } from '../components/Header'
import { Icon } from '../components/Icon'

const POLL_MS = 5000

const VIEWS = [
  { id: 'open',     label: 'Open',         match: isOpen },
  { id: 'review',   label: 'Needs review', match: (r) => isOpen(r) && needsReview(r) },
  { id: 'resolved', label: 'Done',         match: (r) => !isOpen(r) },
  { id: 'all',      label: 'All',          match: () => true },
]

export function StaffDashboard({ user, onLogReport, onLogout }) {
  const [reports,    setReports]    = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [error,      setError]      = useState(null)
  const [mobileView, setMobileView] = useState('list') // 'list' | 'detail'
  const [view,       setView]       = useState('open')
  const [dept,       setDept]       = useState('')
  const [query,      setQuery]      = useState('')
  const lastJson = useRef('')

  const load = async () => {
    try {
      const all = await listReports()
      // Skip the re-render when nothing changed, which is most polls
      const json = JSON.stringify(all)
      if (json !== lastJson.current) {
        lastJson.current = json
        setReports(all)
      }
      setError(null)
    } catch (e) { setError(e.message || String(e)) }
  }

  // Poll while the tab is visible; catch up immediately when it comes back
  useEffect(() => {
    load()
    const t = setInterval(() => { if (!document.hidden) load() }, POLL_MS)
    const onVis = () => { if (!document.hidden) load() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis) }
  }, [])

  const dupes = useMemo(() => findDuplicates(reports || []), [reports])

  const visible = useMemo(() => {
    if (!reports) return []
    const match = VIEWS.find(v => v.id === view).match
    const q = query.trim().toLowerCase()
    return reports
      .filter(r => match(r))
      .filter(r => !dept || r.classification.department === dept)
      .filter(r => !q || [r.ref, r.subject, r.description, r.location, r.reporter]
        .some(f => f && f.toLowerCase().includes(q)))
      // Urgent open reports float to the top; otherwise newest first (API order)
      .sort((a, b) => (isOpen(b) && urgencyOf(b).urgent) - (isOpen(a) && urgencyOf(a).urgent))
  }, [reports, view, dept, query])

  const counts = useMemo(() => {
    const rs = reports || []
    const today = new Date().toDateString()
    return {
      new:      rs.filter(r => r.status === 'new').length,
      progress: rs.filter(r => r.status === 'in-progress').length,
      review:   rs.filter(r => isOpen(r) && needsReview(r)).length,
      doneToday: rs.filter(r => !isOpen(r) && r.auditLog.some(e =>
        e.action === 'status_changed' && new Date(e.ts).toDateString() === today)).length,
      views: Object.fromEntries(VIEWS.map(v => [v.id, rs.filter(v.match).length])),
    }
  }, [reports])

  // Keep a selection on desktop; fall back to the first visible report
  const selected = reports?.find(r => r.id === selectedId) || visible[0] || null

  const selectReport = (id) => {
    setSelectedId(id)
    setMobileView('detail')
  }

  const applyUpdate = (updated) => {
    setReports(rs => rs.map(r => (r.id === updated.id ? updated : r)))
    lastJson.current = ''
  }

  const onReassign = async (id, newDept) => {
    if (!newDept) return
    try { applyUpdate(await reassignReport(id, newDept)) } catch (e) { setError(e.message || String(e)) }
  }

  const onStatus = async (id, status) => {
    try { applyUpdate(await updateReportStatus(id, status)) } catch (e) { setError(e.message || String(e)) }
  }

  return (
    <div class="triage-page">
      <Header subtitle={<>Staff dashboard<span class="hide-sm">{user?.name ? ` · ${user.name}` : ''}</span></>}>
        {onLogReport && (
          <button class="header-btn" onClick={onLogReport}>
            <Icon name="plus" size={16} /><span class="hide-sm">Log a report</span>
          </button>
        )}
        {onLogout && <button class="header-btn header-btn--ghost" onClick={onLogout}>Sign out</button>}
      </Header>

      <div class="triage-topbar">
        <div>
          <h1>Triage inbox</h1>
          <p class="triage-meta">{fmtLongDate(new Date())}</p>
        </div>
        <div class="stat-tiles">
          <StatTile label="New" value={counts.new} tone="blue" />
          <StatTile label="In progress" value={counts.progress} tone="amber" />
          <StatTile label="Needs review" value={counts.review} tone="red" />
          <StatTile label="Closed today" value={counts.doneToday} tone="green" />
        </div>
      </div>

      {error && (
        <div class="banner-error" role="alert">
          <Icon name="alert" size={16} /> {error}
        </div>
      )}

      <div class={`triage-layout is-${mobileView}`}>
        <aside class="triage-list" aria-label="Reports">
          <div class="triage-filters">
            <div class="search">
              <Icon name="search" size={16} />
              <input
                type="search"
                placeholder="Search ref, street, keyword…"
                value={query}
                onInput={e => setQuery(e.target.value)}
                aria-label="Search reports"
              />
            </div>
            <select class="select" value={dept} onChange={e => setDept(e.target.value)} aria-label="Filter by department">
              <option value="">All departments</option>
              {DEPARTMENTS.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <div class="tabs" role="tablist">
              {VIEWS.map(v => (
                <button
                  key={v.id}
                  role="tab"
                  aria-selected={view === v.id}
                  class={`tab${view === v.id ? ' is-active' : ''}`}
                  onClick={() => setView(v.id)}
                >
                  {v.label} <span class="tab-count">{counts.views[v.id]}</span>
                </button>
              ))}
            </div>
          </div>

          <div class="triage-list-scroll">
            {reports === null ? (
              <div class="list-empty"><span class="spinner" aria-label="Loading" /></div>
            ) : visible.length === 0 ? (
              <div class="list-empty">
                <Icon name="inbox" size={28} />
                <p>{query || dept ? 'No reports match these filters.' : 'Nothing here — inbox zero.'}</p>
              </div>
            ) : visible.map(r => (
              <ReportListItem
                key={r.id}
                r={r}
                dupeCount={dupes.get(r.id)?.length || 0}
                active={selected?.id === r.id}
                onClick={() => selectReport(r.id)}
              />
            ))}
          </div>
        </aside>

        <section class="triage-detail" aria-label="Report detail">
          {selected
            ? <ReportDetail
                key={selected.id}
                r={selected}
                duplicates={dupes.get(selected.id) || []}
                onSelect={selectReport}
                onReassign={onReassign}
                onStatus={onStatus}
                onBack={() => setMobileView('list')}
              />
            : <div class="triage-empty">{reports === null ? '' : 'Select a report to review'}</div>
          }
        </section>
      </div>
    </div>
  )
}

function StatTile({ label, value, tone }) {
  return (
    <div class={`stat-tile stat-tile--${tone}`}>
      <span class="stat-value">{value}</span>
      <span class="stat-label">{label}</span>
    </div>
  )
}

function ReportListItem({ r, active, dupeCount, onClick }) {
  const dept = departmentById(r.classification.department)
  const { urgent } = urgencyOf(r)
  return (
    <button class={`report-list-item${active ? ' is-active' : ''}`} onClick={onClick} aria-current={active}>
      <span class={`rli-dot status-dot-${r.status}`} title={statusLabel(r.status)} />
      <span class="rli-content">
        <span class="rli-top">
          <span class={`cat-chip cat-${r.classification.department}`}>{dept.name}</span>
          {urgent && isOpen(r) && <span class="flag flag--urgent">Urgent</span>}
          {dupeCount > 0 && <span class="flag flag--dupe">+{dupeCount} nearby</span>}
          <span class="rli-time">{fmtShort(r.submittedAt)}</span>
        </span>
        <span class="rli-subject">{r.subject || 'Report'}</span>
        <span class="rli-sub">
          {r.hasPhoto && <Icon name="image" size={12} />}
          {shortPlace(r.location) || 'No location given'}
        </span>
      </span>
    </button>
  )
}

// Photos aren't in the list payload — fetch them on demand, once per report
const photoCache = new Map()

function usePhoto(r) {
  const [photo, setPhoto] = useState(() => photoCache.get(r.id) || null)
  useEffect(() => {
    if (!r.hasPhoto || photoCache.has(r.id)) return
    let live = true
    getReport(r.id).then(full => {
      photoCache.set(r.id, full.photo)
      if (live) setPhoto(full.photo)
    }).catch(() => {})
    return () => { live = false }
  }, [r.id, r.hasPhoto])
  return photo
}

function mapEmbedUrl(lat, lng) {
  const dLat = 0.0025, dLng = 0.004
  const bbox = [lng - dLng, lat - dLat, lng + dLng, lat + dLat].map(n => n.toFixed(5)).join(',')
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`
}

function ReportDetail({ r, duplicates, onSelect, onReassign, onStatus, onBack }) {
  const selectRef = useRef(null)
  const photo = usePhoto(r)
  const c     = r.classification
  const pct   = Math.round(c.confidence * 100)
  const dept  = departmentById(c.department)
  const urg   = urgencyOf(r)
  const hasMap = r.lat != null && r.lng != null

  return (
    <article class="report-detail">
      <div class="rd-inner">
        <button class="rd-back-btn" onClick={onBack}><Icon name="back" size={16} /> All reports</button>

        <div class="rd-head">
          <div>
            <div class="rd-ref">{r.ref}</div>
            <h2 class="rd-title">{r.subject}</h2>
            <div class="rd-sub">
              {r.location && <><Icon name="pin" size={13} /> {shortPlace(r.location)} · </>}
              {fmtAgo(r.submittedAt)}
            </div>
          </div>
          <span class={`status-pill status-${r.status}`}>{statusLabel(r.status)}</span>
        </div>

        {urg.urgent && isOpen(r) && (
          <div class="callout callout--urgent">
            <Icon name="alert" size={16} />
            <span>Possible risk to people — mentions “{urg.reason}”. Consider prioritising.</span>
          </div>
        )}

        {(photo || r.hasPhoto || hasMap) && (
          <div class={`rd-media${(r.hasPhoto && hasMap) ? '' : ' rd-media--single'}`}>
            {r.hasPhoto && (
              photo
                ? <a href={photo} target="_blank" rel="noopener" class="rd-photo"><img src={photo} alt={`Photo for ${r.ref}`} /></a>
                : <div class="rd-photo rd-photo--loading"><span class="spinner" /></div>
            )}
            {hasMap && (
              <div class="rd-map">
                <iframe title={`Map of ${r.ref}`} src={mapEmbedUrl(r.lat, r.lng)} loading="lazy" />
                <a class="rd-map-link" href={`https://www.openstreetmap.org/?mlat=${r.lat}&mlon=${r.lng}#map=18/${r.lat}/${r.lng}`} target="_blank" rel="noopener">
                  Open map <Icon name="external" size={12} />
                </a>
              </div>
            )}
          </div>
        )}

        <div class="ai-card">
          <div class="ai-card-head">
            <span class="ai-badge"><Icon name="sparkle" size={13} /> Auto-classified</span>
            {r.reassignedFrom && <span class="ai-note">Reassigned from {departmentById(r.reassignedFrom).name}</span>}
          </div>
          <div class="ai-dept">{dept.name}</div>
          <div class="meter-row">
            <span class="meter-label">Confidence</span>
            <div class="meter" role="meter" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100" aria-label="Classifier confidence">
              <div class={`meter-fill${pct < 50 ? ' meter-fill--low' : ''}`} style={`width:${pct}%`} />
            </div>
            <span class="meter-pct">{pct}%</span>
          </div>
          <p class="ai-reason">{c.reasoning}</p>
          {needsReview(r) && <p class="ai-review">Low confidence — please check the department before actioning.</p>}
          <button class="link-btn" onClick={() => selectRef.current?.focus()}>Override classification →</button>
        </div>

        {duplicates.length > 0 && (
          <div class="callout callout--dupe">
            <div class="callout-head">
              <Icon name="alert" size={16} />
              <span>{duplicates.length} other open {duplicates.length === 1 ? 'report' : 'reports'} nearby — likely the same issue</span>
            </div>
            <ul class="dupe-list">
              {duplicates.map(d => (
                <li key={d.id}>
                  <button class="dupe-link" onClick={() => onSelect(d.id)}>
                    <span class="mono">{d.ref}</span> {d.subject} <span class="muted">· {fmtShort(d.submittedAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div class="quote-card">
          <div class="eyebrow">Resident's description</div>
          <p>{r.description}</p>
        </div>

        <dl class="rd-meta-grid">
          <div><dt>Reporter</dt><dd>{r.reporter || 'Not given'}</dd></div>
          <div><dt>Submitted</dt><dd>{fmtFull(r.submittedAt)}</dd></div>
          <div class="span-2"><dt>Location</dt><dd>{r.location || 'Not given'}</dd></div>
          <div><dt>Department</dt><dd>{dept.name}</dd></div>
          <div><dt>Target</dt><dd>3 working days</dd></div>
        </dl>

        <div class="rd-actions">
          <StatusActions status={r.status} onChange={(s) => onStatus(r.id, s)} />
          <select
            ref={selectRef}
            class="select select--action"
            onChange={e => { onReassign(r.id, e.target.value); e.target.value = '' }}
            value=""
            aria-label="Reassign to department"
          >
            <option value="">Reassign to…</option>
            {DEPARTMENTS.filter(d => d.id !== c.department).map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      </div>

      <details class="audit">
        <summary>Activity ({r.auditLog.length})</summary>
        <ol class="timeline">
          {[...r.auditLog].reverse().map((e, i) => (
            <li key={i}>
              <span class="timeline-what">
                <strong>{actionLabel(e.action)}</strong>
                {e.details && <> — {e.details}</>}
                {e.actor && e.actor !== 'system' && <span class="muted"> · {e.actor}</span>}
              </span>
              <span class="timeline-when">{fmtFull(e.ts)}</span>
            </li>
          ))}
        </ol>
      </details>
    </article>
  )
}

function StatusActions({ status, onChange }) {
  const next = {
    'new':         [['in-progress', 'Start work', 'primary'], ['closed', 'Close', '']],
    'in-progress': [['resolved', 'Mark resolved', 'primary'], ['new', 'Back to new', '']],
    'resolved':    [['in-progress', 'Reopen', '']],
    'closed':      [['new', 'Reopen', '']],
  }[status] || STATUSES.filter(s => s.id !== status).map(s => [s.id, s.label, ''])

  return (
    <div class="status-actions">
      {next.map(([id, label, kind]) => (
        <button key={id} class={`btn btn-sm ${kind === 'primary' ? 'btn-primary' : 'btn-outline'}`} onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </div>
  )
}
