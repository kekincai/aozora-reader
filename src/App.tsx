import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { loadCloudState, saveCloudState, useAuth } from './auth'
import { AdminPage } from './AdminPage'
import { FeedbackPage } from './FeedbackPage'
import { GivingReceivingTopicPage, TopicsIndexPage } from './TopicsPage'
import { AnalyticsTracker, AppShell, AuthDialog } from './components/AppShell'
import { SERIAL_ORDER } from './daily/serial'
import { ArticlesPage } from './routes/ArticlesPage'
import { DailyPage } from './routes/DailyPage'
import { LearnPage } from './routes/LearnPage'
import { ReaderPage } from './routes/ReaderPage'
import { RecordPage } from './routes/RecordPage'
import { ShelfPage } from './routes/ShelfPage'
import { TodayPage } from './routes/TodayPage'
import { ReviewPage, WordsPage } from './routes/WordsPage'
import { AppContext, useApp, type SyncStatus } from './state/context'
import { mergeStates, useReaderState } from './state/store'
import './App.css'
import './styles/navigation-pagination.css'
import './styles/daily.css'

function Shell({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>
}

/** Remounts the daily flow for "もう一頁" so it opens on the next page. */
function DailyRoute() {
  const location = useLocation()
  return <DailyPage key={location.key}/>
}

function AdminRoute() {
  const { auth } = useApp()
  return <AdminPage user={auth.user}/>
}

function useCloudSync(auth: ReturnType<typeof useAuth>, state: ReturnType<typeof useReaderState>[0], setState: ReturnType<typeof useReaderState>[1]) {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('local')
  const hydratedUser = useRef<string | null>(null)
  const latest = useRef(state)
  latest.current = state

  useEffect(() => {
    if (!auth.user) { hydratedUser.current = null; setSyncStatus('local'); return }
    if (hydratedUser.current === auth.user.id) return
    let active = true
    const userID = auth.user.id
    void loadCloudState<unknown>().then(({ state: cloud }) => {
      if (!active) return
      const merged = mergeStates(latest.current, cloud, SERIAL_ORDER)
      setState(merged)
      hydratedUser.current = userID
      setSyncStatus('saved')
      void saveCloudState(merged)
    }).catch(() => setSyncStatus('error'))
    return () => { active = false }
  }, [auth.user, setState])

  useEffect(() => {
    if (!auth.user || hydratedUser.current !== auth.user.id) return
    setSyncStatus('saving')
    const timer = window.setTimeout(() => void saveCloudState(state).then(() => setSyncStatus('saved')).catch(() => setSyncStatus('error')), 800)
    return () => window.clearTimeout(timer)
  }, [auth.user, state])

  return syncStatus
}

function App() {
  const [state, setState] = useReaderState()
  const auth = useAuth()
  const syncStatus = useCloudSync(auth, state, setState)
  const [authOpen, setAuthOpen] = useState(false)
  const context = useMemo(() => ({ state, setState, auth, syncStatus, openAuth: () => setAuthOpen(true) }), [state, setState, auth, syncStatus])

  return <AppContext.Provider value={context}>
    <BrowserRouter>
      <AnalyticsTracker/>
      <Routes>
        <Route path="/" element={<Shell><TodayPage/></Shell>}/>
        <Route path="/daily" element={<DailyRoute/>}/>
        <Route path="/shelf" element={<Shell><ShelfPage/></Shell>}/>
        <Route path="/words" element={<Shell><WordsPage/></Shell>}/>
        <Route path="/review" element={<Shell><ReviewPage/></Shell>}/>
        <Route path="/record" element={<Shell><RecordPage/></Shell>}/>
        <Route path="/articles" element={<Shell><ArticlesPage/></Shell>}/>
        <Route path="/learn" element={<Shell><LearnPage/></Shell>}/>
        <Route path="/topics" element={<Shell><TopicsIndexPage/></Shell>}/>
        <Route path="/topics/giving-receiving" element={<Shell><GivingReceivingTopicPage/></Shell>}/>
        <Route path="/read/:id" element={<ReaderPage/>}/>
        <Route path="/feedback" element={<Shell><FeedbackPage/></Shell>}/>
        <Route path="/admin" element={<Shell><AdminRoute/></Shell>}/>
      </Routes>
      {authOpen && <AuthDialog onClose={() => setAuthOpen(false)}/>}
    </BrowserRouter>
  </AppContext.Provider>
}

export default App
