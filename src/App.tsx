import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
import { NotFoundPage } from './routes/NotFoundPage'
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
  // Adopts server-merged state only when it adds something, so saving does not loop.
  const adopt = useCallback((incoming: unknown) => {
    const merged = mergeStates(latest.current, incoming, SERIAL_ORDER)
    if (JSON.stringify(merged) !== JSON.stringify(latest.current)) setState(merged)
  }, [setState])

  useEffect(() => {
    if (!auth.user) { hydratedUser.current = null; setSyncStatus('local'); return }
    const userID = auth.user.id
    let active = true
    const pull = () => void loadCloudState<unknown>().then(({ state: cloud }) => {
      if (!active) return
      adopt(cloud)
      if (hydratedUser.current !== userID) {
        hydratedUser.current = userID
        void saveCloudState(latest.current).then(result => { if (active && result.state) adopt(result.state) })
      }
      setSyncStatus('saved')
    }).catch(() => { if (active) setSyncStatus('error') })
    if (hydratedUser.current !== userID) pull()
    // A tab left open on another device catches up when it comes back into view.
    const onVisible = () => { if (document.visibilityState === 'visible') pull() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { active = false; document.removeEventListener('visibilitychange', onVisible) }
  }, [auth.user, adopt])

  useEffect(() => {
    if (!auth.user || hydratedUser.current !== auth.user.id) return
    setSyncStatus('saving')
    const timer = window.setTimeout(() => void saveCloudState(state)
      .then(result => { if (result.state) adopt(result.state); setSyncStatus('saved') })
      .catch(() => setSyncStatus('error')), 800)
    return () => window.clearTimeout(timer)
  }, [auth.user, state, adopt])

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
        <Route path="*" element={<Shell><NotFoundPage/></Shell>}/>
      </Routes>
      {authOpen && <AuthDialog onClose={() => setAuthOpen(false)}/>}
    </BrowserRouter>
  </AppContext.Provider>
}

export default App
