import { useEffect, useState } from 'preact/hooks'
import { Router, Route, Switch, Redirect, useLocation } from 'wouter'
import { session, SESSION_EXPIRED_EVENT } from './api'
import { LoginScreen }    from './pages/LoginScreen'
import { ResidentForm }   from './pages/ResidentForm'
import { StaffDashboard } from './pages/StaffDashboard'

const homeFor = (user) => (user.role === 'admin' ? '/dashboard' : '/report')

function AppRoutes() {
  const [user, setUser] = useState(session.load)
  const [notice, setNotice] = useState(null)
  const [, navigate] = useLocation()

  const login = (u) => {
    setUser(u)
    setNotice(null)
    session.save(u)
    navigate(homeFor(u), { replace: true })
  }

  const logout = () => {
    setUser(null)
    session.clear()
    navigate('/', { replace: true })
  }

  // Any 401 from the API (expired/invalid token) drops back to sign-in
  useEffect(() => {
    const onExpired = () => {
      logout()
      setNotice('Your session has expired — please sign in again.')
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired)
  }, [])

  return (
    <Switch>
      <Route path="/">
        {user ? <Redirect to={homeFor(user)} /> : <LoginScreen onLogin={login} notice={notice} />}
      </Route>

      <Route path="/report">
        {user
          ? <ResidentForm
              user={user}
              onDashboard={user.role === 'admin' ? () => navigate('/dashboard') : null}
              onLogout={logout}
            />
          : <Redirect to="/" />
        }
      </Route>

      <Route path="/dashboard">
        {user?.role === 'admin'
          ? <StaffDashboard
              user={user}
              onLogReport={() => navigate('/report')}
              onLogout={logout}
            />
          : <Redirect to="/" />
        }
      </Route>

      <Route>
        <Redirect to="/" />
      </Route>
    </Switch>
  )
}

export function App() {
  return (
    <Router>
      <AppRoutes />
    </Router>
  )
}
