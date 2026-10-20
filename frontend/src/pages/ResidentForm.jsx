import { useEffect, useRef, useState } from 'preact/hooks'
import { Capacitor } from '@capacitor/core'
import { submitReport, listMyReports, chatWithBot, analyseImage, transcribeAudio } from '../api'
import { classify } from '../lib/classifier.js'
import { departmentById } from '../data/departments.js'
import { resizeDataUrl, readFileAsDataUrl } from '../lib/image.js'
import { fmtTime, fmtElapsed, fmtDate, fmtFull } from '../lib/format.js'
import { statusLabel, actionLabel, isOpen } from '../lib/reports.js'
import { Header } from '../components/Header'
import { Icon } from '../components/Icon'

const IS_NATIVE = Capacitor.isNativePlatform()
const READY = 'Typically replies instantly'

const initialMessages = () => [
  { role: 'bot', type: 'text', text: "Hi! Send me a photo of the issue, or just describe what you've seen.", ts: Date.now() },
]

// "the bins on my road haven't been collected. Again." → "The bins on my road haven't been collected"
function makeSubject(text) {
  const first = text.split(/(?<=[.!?])\s|\n/)[0].trim().replace(/[.!?]+$/, '')
  const cut = first.length > 80 ? first.slice(0, 80).replace(/\s+\S*$/, '') + '…' : first
  return (cut.charAt(0).toUpperCase() + cut.slice(1)) || 'Report'
}

function geoErrorMessage(e) {
  if (e?.code === 1) return 'Location permission was denied — you can type the street name instead.'
  if (e?.code === 3) return "Couldn't get a GPS fix in time — try again, or type the street name."
  return "Couldn't get your location — you can type the street name instead."
}

export function ResidentForm({ user, onDashboard, onLogout }) {
  const [step, setStep] = useState('home')
  const [myReports, setMyReports] = useState(null)
  const [messages, setMessages] = useState(initialMessages)
  const [input, setInput] = useState('')
  const [location, setLocation] = useState(null)
  const [photo, setPhoto] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [locating, setLocating] = useState(false)
  const [recordingMode, setRecordingMode] = useState(false)
  const [processingRecording, setProcessingRecording] = useState(false)
  const [reviewTranscript, setReviewTranscript] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const [botStatus, setBotStatus] = useState(READY)
  const [typing, setTyping] = useState(false)

  const scrollRef        = useRef(null)
  const fileRef          = useRef(null)
  const cameraRef        = useRef(null)
  const inputRef         = useRef(null)
  const streamRef        = useRef(null)
  const mediaRecorderRef = useRef(null)
  const chunksRef        = useRef([])
  const timerRef         = useRef(null)
  const messagesRef      = useRef(messages)
  // Mirrors of state that handlers need to read synchronously, right after setting
  const locationRef      = useRef(null)
  const photoRef         = useRef(null)
  const suggestedRef     = useRef(false)   // department card already shown this report
  const askedRef         = useRef(new Set()) // guidance prompts already given

  useEffect(() => { messagesRef.current = messages }, [messages])

  const refreshMyReports = async () => {
    if (!user?.email) return
    try { setMyReports(await listMyReports(user.email)) } catch { setMyReports(r => r || []) }
  }
  useEffect(() => { refreshMyReports() }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, typing])

  // Errors clear themselves after a few seconds
  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), 6000)
    return () => clearTimeout(t)
  }, [error])

  // Release the mic if the user navigates away mid-recording
  useEffect(() => () => {
    clearInterval(timerRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
  }, [])

  // ── Conversation helpers ─────────────────────────────────────────

  const pushMsg = (msg) => setMessages(m => [...m, { ts: Date.now(), ...msg }])

  // `text` may be a function, resolved when the message is actually shown,
  // so a prompt like "add a photo" isn't sent if one arrived while "typing"
  const botSay = (text, delay = 700) => {
    setTyping(true)
    setTimeout(() => {
      setTyping(false)
      pushMsg({ role: 'bot', type: 'text', text: typeof text === 'function' ? text() : text })
    }, delay)
  }

  const userTexts = () =>
    messagesRef.current.filter(m => m.role === 'user' && m.type === 'text').map(m => m.text)

  // Steer toward the two things the street teams need most: where, and a photo.
  // Each prompt is only given once per report.
  const guide = () => {
    const asked = askedRef.current
    if (!locationRef.current && !asked.has('location')) {
      asked.add('location')
      return 'Where is this? Tap the pin to share your location, or type the street name.'
    }
    if (!photoRef.current && !asked.has('photo')) {
      asked.add('photo')
      return 'If you can, add a photo — tap the camera. Otherwise hit Submit report when ready.'
    }
    return null
  }

  // Once there's enough text to be confident, show which team it'll go to
  const suggestDepartment = (extraText = '') => {
    if (suggestedRef.current) return false
    const text = [...userTexts(), extraText].join('\n')
    if (!text.trim()) return false
    const c = classify(text, '')
    if (c.confidence < 0.4) return false
    suggestedRef.current = true
    setTyping(true)
    setTimeout(() => {
      setTyping(false)
      pushMsg({ role: 'bot', type: 'classify', department: c.department, confidence: c.confidence })
    }, 600)
    return true
  }

  const answerClassify = (index, correct) => {
    setMessages(m => m.map((x, i) => (i === index ? { ...x, answer: correct ? 'yes' : 'no' } : x)))
    botSay(() => {
      const next = guide()
      if (correct) return next ? `Great. ${next}` : "Great — hit Submit report when you're ready."
      return `No problem — a member of staff will check it and send it to the right team. ${next || 'Add anything else, or hit Submit report.'}`
    })
  }

  // ── Photos ───────────────────────────────────────────────────────

  const addPhoto = async (rawDataUrl, name) => {
    const dataUri = await resizeDataUrl(rawDataUrl)
    if (!dataUri) { setError("That file doesn't look like an image."); return }
    pushMsg({ role: 'user', type: 'image', dataUri, name })
    photoRef.current = dataUri
    setPhoto(dataUri)

    setBotStatus('Looking at your photo…')
    setTyping(true)
    let vision = null
    try { vision = await analyseImage(dataUri) } catch {}
    setTyping(false)
    setBotStatus(READY)

    if (vision) {
      suggestedRef.current = true
      pushMsg({ role: 'bot', type: 'classify', department: vision.department, confidence: vision.confidence })
    } else if (!suggestDepartment()) {
      botSay(() => userTexts().length
        ? (guide() || 'Thanks for the photo. Anything else to add?')
        : 'Thanks — what does the photo show? A few words is enough.')
    }
  }

  const onFile = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    for (const f of files) {
      try { await addPhoto(await readFileAsDataUrl(f), f.name) }
      catch { setError("Couldn't read that file.") }
    }
  }

  const takePhoto = async () => {
    // On the web the hidden <input capture> opens the phone camera directly
    if (!IS_NATIVE) { cameraRef.current?.click(); return }
    try {
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera')
      const shot = await Camera.getPhoto({
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        quality: 85,
      })
      await addPhoto(shot.dataUrl, 'photo.jpg')
    } catch (e) {
      if (!/cancel/i.test(String(e))) setError('Could not open the camera.')
    }
  }

  // ── Voice notes ──────────────────────────────────────────────────

  const startRecording = async () => {
    setError(null)
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError("Voice notes aren't supported in this browser — please type instead.")
      return
    }
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setError('Microphone access was blocked — allow it in your browser settings, or type instead.')
      return
    }
    streamRef.current = stream
    chunksRef.current = []
    setElapsed(0)

    const mr = new MediaRecorder(stream)
    mediaRecorderRef.current = mr
    mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    mr.start()

    setRecordingMode(true)
    timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000)
  }

  const finishRecording = () => {
    clearInterval(timerRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  const stopRecording = async () => {
    const mr = mediaRecorderRef.current
    if (!mr) return
    setProcessingRecording(true)
    await new Promise(res => { mr.onstop = res; try { mr.stop() } catch { res() } })
    finishRecording()

    try {
      const text = await transcribeAudio(new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' }))
      if (text) setReviewTranscript(text)
      else setError("We didn't catch that — try speaking a little closer to the mic.")
    } catch (e) {
      setError(e.message || 'Transcription failed. Check your connection.')
    } finally {
      setProcessingRecording(false)
      setRecordingMode(false)
    }
  }

  const cancelRecording = () => {
    try { mediaRecorderRef.current?.stop() } catch {}
    finishRecording()
    setRecordingMode(false)
    setProcessingRecording(false)
  }

  const confirmTranscript = () => {
    const text = reviewTranscript
    setReviewTranscript(null)
    pushMsg({ role: 'user', type: 'text', text, voice: true })
    if (!suggestDepartment(text)) botSay(() => guide() || "Got it! Anything else to add, or are you ready to submit?")
  }

  // ── Location ─────────────────────────────────────────────────────

  const useMyLocation = async () => {
    if (!navigator.geolocation) { setError('Location is not available on this device.'); return }
    setLocating(true); setError(null)
    setBotStatus('Finding your location…')
    try {
      const pos = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, {
          enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000,
        }))
      const { latitude: lat, longitude: lng } = pos.coords
      let address = `${lat.toFixed(5)}, ${lng.toFixed(5)}`
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
          { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000) })
        const j = await r.json()
        if (j.display_name) address = j.display_name
      } catch { /* keep the raw coordinates — still useful to staff */ }
      const loc = { address, lat, lng }
      locationRef.current = loc
      setLocation(loc)
      pushMsg({ role: 'user', type: 'location', text: address, lat, lng })
      botSay(() => guide() || "Thanks! Anything else to add, or hit Submit report when you're ready.")
    } catch (e) {
      setError(geoErrorMessage(e))
    } finally {
      setLocating(false)
      setBotStatus(READY)
    }
  }

  // ── Text ─────────────────────────────────────────────────────────

  const autoGrow = (el) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  const send = async () => {
    const text = input.trim()
    if (!text) return
    pushMsg({ role: 'user', type: 'text', text })
    setInput('')
    requestAnimationFrame(() => autoGrow(inputRef.current))

    if (suggestDepartment(text)) return
    const prompt = guide()
    if (prompt) { botSay(prompt); return }

    const history = [...userTexts(), text].map(content => ({ role: 'user', content }))
    setTyping(true)
    let reply = null
    try { reply = (await chatWithBot(history))?.reply } catch {}
    setTyping(false)
    pushMsg({ role: 'bot', type: 'text', text: reply || "Got it. Anything else to add? Hit Submit report when you're ready." })
  }

  const submit = async () => {
    const extra = input.trim()
    const texts = [...userTexts(), extra].filter(Boolean)
    if (!texts.length) {
      setError(photoRef.current ? 'Add a few words about what the photo shows first.' : 'Tell me what to report first.')
      inputRef.current?.focus()
      return
    }
    if (extra) {
      pushMsg({ role: 'user', type: 'text', text: extra })
      setInput('')
    }
    setSubmitting(true); setError(null)
    setBotStatus('Submitting…')
    try {
      const loc = locationRef.current
      const r = await submitReport({
        subject: makeSubject(texts[0]),
        description: texts.join('\n'),
        location: loc?.address || null,
        lat: loc?.lat ?? null,
        lng: loc?.lng ?? null,
        photo: photoRef.current,
        reporter: user?.email || null,
      })
      setResult(r)
      setStep('confirmed')
      refreshMyReports()
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setSubmitting(false)
      setBotStatus(READY)
    }
  }

  // ── Navigation ───────────────────────────────────────────────────

  const hasUserContent = messages.some(m => m.role === 'user') || !!input.trim()

  const reset = () => {
    setStep('home')
    setMessages(initialMessages())
    setResult(null)
    setInput('')
    setLocation(null); locationRef.current = null
    setPhoto(null); photoRef.current = null
    suggestedRef.current = false
    askedRef.current = new Set()
    setError(null)
    setBotStatus(READY)
  }

  const discardDraft = () => {
    if (hasUserContent && !confirm('Discard this report?')) return
    reset()
  }

  // File pickers have to be opened from inside the click handler (browsers
  // block deferred clicks), which is why the inputs live outside the steps.
  const startWith = (action) => {
    setStep('chat')
    if (action === 'photo') (IS_NATIVE ? takePhoto() : fileRef.current?.click())
    else if (action === 'voice') startRecording()
    else setTimeout(() => inputRef.current?.focus(), 50)
  }

  const pickers = (
    <>
      <input ref={fileRef} type="file" accept="image/*" multiple onChange={onFile} hidden />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={onFile} hidden />
    </>
  )

  // Pickers come first in a fixed slot so they survive step changes
  return <>{pickers}{renderStep()}</>

  function renderStep() {
  // ── Home ─────────────────────────────────────────────────────────
  if (step === 'home') {
    const open = myReports?.filter(isOpen).length || 0
    return (
      <div class="screen screen--muted">
        <Header subtitle={`Hello, ${user?.name?.split(' ')[0] || 'there'}`}>
          {onDashboard && <button class="header-btn" onClick={onDashboard}>Dashboard</button>}
          <button class="header-btn header-btn--ghost" onClick={onLogout}>Sign out</button>
        </Header>

        <main class="rh-body">
          <section class="rh-banner">
            <div>
              <h1 class="rh-banner-title">Report an issue</h1>
              <p class="rh-banner-sub">Potholes, fly-tipping, broken lights — send a photo, voice note or description.</p>
            </div>
            <button class="btn btn-light" onClick={() => setStep('welcome')}>
              <Icon name="plus" size={18} /> New report
            </button>
          </section>

          <section class="card rh-history" aria-labelledby="my-reports-head">
            <div class="section-head">
              <h2 id="my-reports-head">Your reports</h2>
              {myReports?.length > 0 && <span class="section-meta">{open} open · {myReports.length} total</span>}
            </div>
            {myReports === null ? (
              <div class="rh-empty"><span class="spinner" aria-label="Loading" /></div>
            ) : myReports.length === 0 ? (
              <div class="rh-empty">
                <Icon name="inbox" size={28} />
                <p>No reports yet. When you send one, you can track its progress here.</p>
              </div>
            ) : (
              <ul class="rh-list">
                {myReports.map(r => <MyReportRow key={r.id} r={r} />)}
              </ul>
            )}
          </section>
        </main>

        <footer class="rh-footer">
          <Icon name="phone" size={14} /> Prefer to call? <a href="tel:01895277800">01895 277800</a> (Mon–Fri 9–5)
        </footer>
      </div>
    )
  }

  // ── Welcome (new report input chooser) ───────────────────────────
  if (step === 'welcome') {
    return (
      <div class="screen">
        <Header subtitle="New report" onBack={discardDraft} />
        <main class="welcome-body">
          <h1>How would you like to report it?</h1>
          <p class="welcome-sub">Pick whatever's easiest — you can mix and match in the chat.</p>
          <div class="welcome-options">
            <WelcomeOption primary icon="camera" title="Send a photo" sub="Easiest — we'll figure out the rest" onClick={() => startWith('photo')} />
            <WelcomeOption icon="mic" title="Send a voice note" sub="Just talk — no typing" onClick={() => startWith('voice')} />
            <WelcomeOption icon="pencil" title="Type a description" sub="A sentence or two is plenty" onClick={() => startWith('type')} />
          </div>
        </main>
      </div>
    )
  }

  // ── Confirmed ────────────────────────────────────────────────────
  if (step === 'confirmed' && result) {
    const dept = departmentById(result.classification.department)
    return (
      <div class="screen">
        <Header subtitle="Report sent" />
        <main class="confirm-body">
          <div class="confirm-check" aria-hidden="true"><Icon name="check" size={34} strokeWidth={2.5} /></div>
          <h1 class="confirm-title">Report received</h1>
          <p class="confirm-subtitle">
            A real person on the <strong>{dept.name}</strong> team will look at this within 3 working days.
          </p>
          <div class="confirm-ref-box">
            <div class="eyebrow">Your reference</div>
            <div class="confirm-ref">{result.ref}</div>
            <CopyButton text={result.ref} />
          </div>
          <dl class="confirm-details">
            <div class="confirm-row"><dt>Sent to</dt><dd>{dept.name}</dd></div>
            <div class="confirm-row"><dt>Issue</dt><dd>{result.subject}</dd></div>
            {result.location && <div class="confirm-row"><dt>Location</dt><dd>{result.location}</dd></div>}
            {result.photo && (
              <div class="confirm-row"><dt>Photo</dt><dd><img class="confirm-photo" src={result.photo} alt="Your photo" /></dd></div>
            )}
          </dl>
          <button class="btn btn-primary btn-block" onClick={reset}>Back to my reports</button>
          {onDashboard && <button class="btn-link" onClick={onDashboard}>Go to staff dashboard</button>}
        </main>
      </div>
    )
  }

  // ── Chat ─────────────────────────────────────────────────────────
  return (
    <div class="screen screen--chat">
      <Header subtitle={botStatus} onBack={() => setStep('welcome')} />

      {recordingMode && (
        <RecordingScreen
          elapsed={elapsed}
          processing={processingRecording}
          onStop={stopRecording}
          onCancel={cancelRecording}
        />
      )}
      {reviewTranscript !== null && (
        <ReviewScreen
          text={reviewTranscript}
          onConfirm={confirmTranscript}
          onRetry={() => { setReviewTranscript(null); startRecording() }}
          onCancel={() => setReviewTranscript(null)}
        />
      )}

      <div class="chat-thread" ref={scrollRef} aria-live="polite">
        {messages.map((m, i) => (
          <Bubble key={i} msg={m} onAnswer={(correct) => answerClassify(i, correct)} />
        ))}
        {typing && (
          <div class="typing-dots" aria-label="Typing">
            <span class="typing-dot" /><span class="typing-dot" /><span class="typing-dot" />
          </div>
        )}
      </div>

      {error && (
        <div class="chat-err" role="alert">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss"><Icon name="x" size={16} /></button>
        </div>
      )}

      {hasUserContent && (
        <div class="submit-bar">
          <div class="submit-checklist" aria-label="Report contents">
            <span class={photo ? 'done' : ''}><Icon name={photo ? 'check' : 'camera'} size={13} /> Photo</span>
            <span class={location ? 'done' : ''}><Icon name={location ? 'check' : 'pin'} size={13} /> Location</span>
          </div>
          <button class="btn btn-primary submit-btn" onClick={submit} disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit report'}
          </button>
        </div>
      )}

      <div class="composer">
        <button class="composer-icon" onClick={takePhoto} aria-label="Take a photo" title="Camera">
          <Icon name="camera" />
        </button>
        <button class="composer-icon" onClick={() => fileRef.current?.click()} aria-label="Attach a photo" title="Attach photo">
          <Icon name="clip" />
        </button>
        <button
          class={`composer-icon${locating ? ' is-busy' : ''}${location ? ' is-done' : ''}`}
          onClick={useMyLocation}
          disabled={locating}
          aria-label="Share my location"
          title={locating ? 'Locating…' : 'Share location'}
        >
          <Icon name="pin" />
        </button>
        <textarea
          ref={inputRef}
          class="composer-input"
          rows="1"
          value={input}
          onInput={e => { setInput(e.target.value); autoGrow(e.target) }}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Describe the issue…"
          aria-label="Message"
          enterkeyhint="send"
        />
        {input.trim() ? (
          <button class="composer-icon composer-icon--primary" onClick={send} aria-label="Send">
            <Icon name="send" size={18} />
          </button>
        ) : (
          <button class="composer-icon composer-icon--primary" onClick={startRecording} aria-label="Record a voice note">
            <Icon name="mic" size={18} />
          </button>
        )}
      </div>
    </div>
  )
  }
}

// ── Sub-components ───────────────────────────────────────────────

function WelcomeOption({ icon, title, sub, primary, onClick }) {
  return (
    <button class={`welcome-option${primary ? ' welcome-option--primary' : ''}`} onClick={onClick}>
      <span class="option-icon"><Icon name={icon} size={22} /></span>
      <span class="option-text">
        <strong>{title}</strong>
        <span>{sub}</span>
      </span>
      <Icon name="chevron" size={18} class="option-chevron" />
    </button>
  )
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  if (!navigator.clipboard) return null
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {}
  }
  return (
    <button class="copy-btn" onClick={copy}>
      <Icon name={copied ? 'check' : 'copy'} size={14} /> {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function MyReportRow({ r }) {
  const [open, setOpen] = useState(false)
  const dept = departmentById(r.classification.department)
  return (
    <li class={`my-report${open ? ' is-open' : ''}`}>
      <button class="my-report-summary" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span class="mr-top">
          <span class="mr-ref">{r.ref}</span>
          <span class={`status-pill status-${r.status}`}>{statusLabel(r.status)}</span>
        </span>
        <span class="mr-subject">{r.subject || 'Report'}</span>
        <span class="mr-meta">
          <span class={`cat-chip cat-${r.classification.department}`}>{dept.name}</span>
          <span class="mr-date">{fmtDate(r.submittedAt)}</span>
        </span>
      </button>
      {open && (
        <div class="mr-detail">
          <p class="mr-desc">{r.description}</p>
          {r.location && <p class="mr-loc"><Icon name="pin" size={14} /> {r.location}</p>}
          <ol class="timeline">
            {r.auditLog.filter(e => e.action !== 'classified').map((e, i) => (
              <li key={i}>
                <span class="timeline-what">{actionLabel(e.action)}{e.details && e.action === 'status_changed' ? ` — ${statusLabel(e.details.split('→ ')[1] || '')}` : ''}</span>
                <span class="timeline-when">{fmtFull(e.ts)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </li>
  )
}

function RecordingScreen({ elapsed, processing, onStop, onCancel }) {
  return (
    <div class="recording-screen" role="dialog" aria-label="Recording voice note">
      {!processing && (
        <button class="rec-cancel-btn" onClick={onCancel} aria-label="Cancel recording"><Icon name="x" size={18} /></button>
      )}
      <div class="rec-label">{processing ? 'Transcribing…' : 'Recording'}</div>
      <div class="rec-timer">{processing ? '…' : fmtElapsed(elapsed)}</div>
      <div class="rec-wave" aria-hidden="true">
        {Array.from({ length: 22 }, (_, i) => (
          <div class={`rec-bar${processing ? ' rec-bar--idle' : ''}`} key={i} style={`--i:${i}`} />
        ))}
      </div>
      {processing ? (
        <div class="rec-hint">Turning your voice note into text</div>
      ) : (
        <>
          <button class="rec-stop-btn" onClick={onStop} aria-label="Stop recording">
            <div class="rec-square" />
          </button>
          <div class="rec-hint">Tap the square when you're done</div>
        </>
      )}
    </div>
  )
}

function ReviewScreen({ text, onConfirm, onRetry, onCancel }) {
  return (
    <div class="review-screen" role="dialog" aria-label="Review voice note">
      <Header subtitle="Review your voice note" onBack={onCancel} backLabel="Discard" />
      <div class="review-body">
        <h2 class="review-title">Sound right?</h2>
        <div class="review-transcript">
          <div class="eyebrow">We heard</div>
          <p>{text}</p>
        </div>
        <div class="review-actions">
          <button class="btn btn-primary btn-block" onClick={onConfirm}>Looks right — send</button>
          <button class="btn btn-outline btn-block" onClick={onRetry}>Record again</button>
        </div>
      </div>
    </div>
  )
}

function Bubble({ msg, onAnswer }) {
  const time = fmtTime(msg.ts)
  const ticks = msg.role === 'user' ? ' ✓✓' : ''

  if (msg.type === 'classify') {
    const dept = departmentById(msg.department)
    const pct  = Math.round(msg.confidence * 100)
    return (
      <div class="bubble bot classify-card">
        <div class="eyebrow"><Icon name="sparkle" size={12} /> I think this is for</div>
        <div class="classify-category">{dept.name}</div>
        <div class="classify-desc">{dept.description}</div>
        <div class="meter-row">
          <div class="meter" role="meter" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100" aria-label="Confidence">
            <div class="meter-fill" style={`width:${pct}%`} />
          </div>
          <span class="meter-pct">{pct}%</span>
        </div>
        {msg.answer ? (
          <div class="classify-answer">{msg.answer === 'yes' ? '✓ Confirmed' : 'Staff will double-check'}</div>
        ) : (
          <div class="classify-btns">
            <button class="classify-btn classify-btn--yes" onClick={() => onAnswer(true)}>That's right</button>
            <button class="classify-btn" onClick={() => onAnswer(false)}>Not quite</button>
          </div>
        )}
        <div class="bubble-time">{time}</div>
      </div>
    )
  }

  if (msg.type === 'image') {
    return (
      <div class={`bubble ${msg.role} bubble--media`}>
        <img class="bubble-img" src={msg.dataUri} alt={msg.name || 'Photo'} />
        <div class="bubble-time">{time}{ticks}</div>
      </div>
    )
  }

  if (msg.type === 'location') {
    return (
      <div class={`bubble ${msg.role} bubble--loc`}>
        <div class="loc-card">
          <span class="loc-icon"><Icon name="pin" size={18} /></span>
          <span class="loc-text">{msg.text}</span>
        </div>
        <div class="bubble-time">{time}{ticks}</div>
      </div>
    )
  }

  return (
    <div class={`bubble ${msg.role}`}>
      {msg.voice && <span class="voice-tag"><Icon name="mic" size={12} /> Voice note</span>}
      {msg.text}
      <div class="bubble-time">{time}{ticks}</div>
    </div>
  )
}
