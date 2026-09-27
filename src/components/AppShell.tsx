import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BarChart3, BookMarked, BookOpenText, Cloud, KeyRound, LoaderCircle, LogOut, NotebookTabs, Search, X } from 'lucide-react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { passkeyAvailable } from '../auth'
import { trackEvent } from '../operations'
import { useApp, type AuthState, type SyncStatus } from '../state/context'
import { dueCards, japanDate } from '../state/store'

export type { AuthState }

const navigation = [
  { to: '/', label: '今日', icon: BookOpenText, match: ['/'] },
  { to: '/shelf', label: '本棚', icon: BookMarked, match: ['/shelf', '/articles', '/topics', '/read'] },
  { to: '/words', label: '単語帳', icon: NotebookTabs, match: ['/words', '/review', '/learn'] },
  { to: '/record', label: '記録', icon: BarChart3, match: ['/record', '/feedback', '/admin'] },
]

function isActive(pathname: string, match: string[]) {
  return match.some(path => path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`))
}

function NavItems({ className }: { className: string }) {
  const { pathname } = useLocation()
  const { state } = useApp()
  const due = dueCards(state).length
  const doneToday = Boolean(state.days[japanDate()])
  return <nav className={className} aria-label="主要ナビゲーション">
    {navigation.map(item => <NavLink key={item.to} to={item.to} className={() => isActive(pathname, item.match) ? 'active' : ''} end={item.to === '/'}>
      <item.icon size={19} strokeWidth={1.7}/>
      <span>{item.label}</span>
      {item.to === '/' && !doneToday && <i className="nav-dot" aria-label="今日の一頁がまだです"/>}
      {item.to === '/words' && due > 0 && <b className="nav-count">{due > 99 ? '99+' : due}</b>}
    </NavLink>)}
  </nav>
}

function syncLabel(status: SyncStatus) {
  return status === 'saving' ? '保存しています…' : status === 'error' ? '同期を再試行します' : 'クラウドに保存済み'
}

export function AuthDialog({ onClose }: { onClose: () => void }) {
  const { auth, syncStatus } = useApp()
  const user = auth.user
  const [displayName, setDisplayName] = useState('')
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')
  const action = async (kind: 'register' | 'login' | 'logout') => {
    setWorking(true); setMessage('')
    try {
      if (kind === 'register') await auth.register(displayName)
      if (kind === 'login') await auth.login()
      if (kind === 'logout') await auth.logout()
      if (kind !== 'logout') setMessage('この端末の記録を同期しました。')
      else onClose()
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : '完了できませんでした。') }
    finally { setWorking(false) }
  }
  return <div className="auth-scrim" onClick={onClose}><section className="auth-dialog" role="dialog" aria-modal="true" aria-label="学習記録の同期" onClick={event => event.stopPropagation()}><button className="sheet-close" onClick={onClose} aria-label="閉じる"><X size={20}/></button>
    {user ? <><div className="auth-symbol"><Cloud/></div><h2>{user.displayName}さん</h2><p>読んだ日、連載の続き、単語帳を、このパスキーで同期しています。</p><div className={`sync-state ${syncStatus}`}><i/>{syncLabel(syncStatus)}</div><button className="secondary-button logout-button" onClick={() => void action('logout')} disabled={working}><LogOut size={16}/> この端末からログアウト</button></>
      : <><div className="auth-symbol"><KeyRound/></div><h2>記録を持ち歩く</h2><p>パスワードもメールも不要です。端末の Face ID、Touch ID、Windows Hello などでパスキーを作り、スマートフォンとパソコンで同じ続きから読めます。</p><label className="name-field"><span>呼ばれたい名前</span><input value={displayName} onChange={event => setDisplayName(event.target.value)} maxLength={40} placeholder="例：けい" autoComplete="nickname"/></label><button className="primary-button auth-primary" onClick={() => void action('register')} disabled={working || !displayName.trim() || !passkeyAvailable()}>{working ? <LoaderCircle className="spin" size={17}/> : <KeyRound size={17}/>} 新しく登録する</button><button className="text-button" onClick={() => void action('login')} disabled={working || !passkeyAvailable()}>すでにパスキーを持っている</button><small>生体情報は端末の外へ送信されません。</small></>}
    {message && <p className="auth-message" role="status">{message}</p>}
  </section></div>
}

function Header() {
  const { auth, openAuth } = useApp()
  const user = auth.user
  return <header className="site-header">
    <Link className="brand" to="/" aria-label="青空しおり 今日"><img className="brand-mark" src="/brand-mark.svg" alt=""/><span><strong>青空しおり</strong><small>毎日一頁、名作を読む。</small></span></Link>
    <NavItems className="top-nav"/>
    <div className="header-actions">
      <Link className="icon-button" aria-label="作品を探す" to="/articles"><Search size={18}/></Link>
      <button className="sync-button" onClick={openAuth} aria-label={user ? `${user.displayName}さんの同期` : '記録を同期'}>{user ? <><Cloud size={14}/><span>{user.displayName}</span></> : <><KeyRound size={14}/><span>同期</span></>}</button>
    </div>
  </header>
}

export function AppShell({ children }: { children: ReactNode }) {
  return <div className="app-shell">
    <Header/>
    {children}
    <footer><span>青空文庫の公開作品を、毎日の一頁に。</span><a href="https://www.aozora.gr.jp/" target="_blank" rel="noreferrer">青空文庫について</a></footer>
    <NavItems className="tab-bar"/>
  </div>
}

/** Sends one page view per pathname; query-only filter changes are intentionally excluded. */
export function AnalyticsTracker() {
  const location = useLocation()
  const lastPath = useRef('')
  useEffect(() => {
    if (lastPath.current === location.pathname) return
    lastPath.current = location.pathname
    trackEvent('page_view', { path: location.pathname })
  }, [location.pathname])
  return null
}
