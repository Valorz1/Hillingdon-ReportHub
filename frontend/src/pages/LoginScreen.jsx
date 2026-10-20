import { useState } from 'preact/hooks'
import { loginUser } from '../api'
import { Header } from '../components/Header'
import { Icon } from '../components/Icon'

const DEMO_ACCOUNTS = [
  { role: 'resident', label: 'Resident', email: 'fakeemail@gmail.com',     password: 'password', blurb: 'Report an issue' },
  { role: 'staff',    label: 'Staff',    email: 'admin@hillingdon.gov.uk', password: 'admin',    blurb: 'Triage dashboard' },
]

export function LoginScreen({ onLogin, notice }) {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState(null)
  const [loading,  setLoading]  = useState(false)

  const signIn = async (em, pw) => {
    setError(null)
    if (!em.trim()) { setError('Enter your email.'); return }
    if (!pw)        { setError('Enter your password.'); return }
    setLoading(true)
    try {
      onLogin(await loginUser(em, pw))
    } catch (err) {
      setError(err.message || 'Sign in failed.')
      setLoading(false)
    }
  }

  const useDemo = (acct) => {
    setEmail(acct.email)
    setPassword(acct.password)
    signIn(acct.email, acct.password)
  }

  return (
    <div class="screen screen--tinted">
      <Header subtitle="Sign in to continue" />

      <main class="login-body">
        <div class="login-hero">
          <h1>Spotted a problem in Hillingdon?</h1>
          <p>Potholes, fly-tipping, broken streetlights — snap a photo and we'll get it to the right team.</p>
        </div>

        <div class="card login-card">
          <h2 class="login-title">Sign in</h2>

          {notice && <div class="notice" role="status">{notice}</div>}

          <form class="login-form" onSubmit={(e) => { e.preventDefault(); signIn(email, password) }}>
            <label class="field">
              <span class="field-label">Email address</span>
              <input
                class="input"
                type="email"
                value={email}
                onInput={e => setEmail(e.target.value)}
                autocomplete="username"
                inputmode="email"
                autofocus
              />
            </label>
            <label class="field">
              <span class="field-label">Password</span>
              <input
                class="input"
                type="password"
                value={password}
                onInput={e => setPassword(e.target.value)}
                autocomplete="current-password"
              />
            </label>
            {error && <div class="form-error" role="alert">{error}</div>}
            <button type="submit" class="btn btn-primary btn-block" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <section class="demo-accounts" aria-label="Demo accounts">
          <div class="demo-accounts-head">Try a demo account</div>
          <div class="demo-accounts-grid">
            {DEMO_ACCOUNTS.map(a => (
              <button key={a.role} class="demo-account" onClick={() => useDemo(a)} disabled={loading}>
                <span class={`demo-role demo-role--${a.role}`}>{a.label}</span>
                <span class="demo-blurb">{a.blurb}</span>
                <span class="demo-email">{a.email}</span>
              </button>
            ))}
          </div>
        </section>

        <a class="apk-link" href="/downloads/app-debug.apk" download>
          <Icon name="download" size={16} />
          Download the Android app
        </a>
      </main>
    </div>
  )
}
