import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BarChart3, BookOpenText, Cloud, GraduationCap, KeyRound, LibraryBig, LoaderCircle, LogOut, Menu, MessageCircle, RotateCcw, Search, ShieldCheck, Sparkles, X } from 'lucide-react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { passkeyAvailable, useAuth, type CloudUser } from '../auth'
import { trackEvent } from '../operations'

export type AuthState = ReturnType<typeof useAuth>

const primaryNavigation = [
  { to: '/', label: '読む', hint: '今日の一篇', icon: BookOpenText, end: true },
  { to: '/articles', label: '文章', hint: '作品を探す', icon: LibraryBig },
  { to: '/learn', label: '学ぶ', hint: '語彙と文法', icon: GraduationCap },
  { to: '/topics', label: '特集', hint: '深く読む', icon: Sparkles },
  { to: '/review', label: '復習', hint: '覚え直す', icon: RotateCcw },
  { to: '/record', label: '記録', hint: '学びの歩み', icon: BarChart3 },
]

function Header({ user, syncStatus, auth }: { user: CloudUser | null; syncStatus: string; auth: AuthState }) {
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
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
      else setAuthOpen(false)
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : '完了できませんでした。') }
    finally { setWorking(false) }
  }
  return <header className="site-header">
    <Link className="brand" to="/" aria-label="青空しおり ホーム"><img className="brand-mark" src="/brand-mark.svg" alt=""/><span><strong>青空しおり</strong><small>読むことから、学ぶ。</small></span></Link>
    <button className="icon-button mobile-only" onClick={() => setOpen(!open)} aria-label="メニュー"><Menu size={20}/></button>
    <nav className={open ? 'nav open' : 'nav'} onClick={() => setOpen(false)} aria-label="主要导航">
      {primaryNavigation.map(item => <NavLink key={item.to} to={item.to} end={item.end}><item.icon size={17}/><span>{item.label}<small>{item.hint}</small></span></NavLink>)}
      <NavLink to={{pathname:'/feedback',search:`?from=${encodeURIComponent(location.pathname)}`}}><MessageCircle size={17}/><span>ご意見<small>声を届ける</small></span></NavLink>
      {user?.isAdmin && <NavLink to="/admin"><ShieldCheck size={17}/><span>管理<small>運営を見る</small></span></NavLink>}
      <button className="mobile-sync-button" onClick={() => setAuthOpen(true)}><KeyRound size={14}/>{user ? user.displayName : '記録を同期'}</button>
    </nav>
    <div className="header-actions"><Link className="icon-button" aria-label="文章を検索" to="/articles"><Search size={18}/></Link><button className="google-button" onClick={() => setAuthOpen(true)}>{user ? <><Cloud size={14}/> {user.displayName}</> : <><KeyRound size={14}/> 無料で同期</>}</button></div>
    {authOpen && <div className="auth-scrim" onClick={() => setAuthOpen(false)}><section className="auth-dialog" role="dialog" aria-modal="true" aria-label="学習記録の同期" onClick={event => event.stopPropagation()}><button className="sheet-close" onClick={() => setAuthOpen(false)} aria-label="閉じる"><X size={20}/></button>
      {user ? <><div className="auth-symbol"><Cloud/></div><h2>{user.displayName}さん</h2><p>読書の進み具合と復習語彙を、このパスキーで安全に同期しています。</p><div className={`sync-state ${syncStatus}`}><i/>{syncStatus === 'saving' ? '保存しています…' : syncStatus === 'error' ? '同期を再試行します' : 'クラウドに保存済み'}</div><button className="secondary-button logout-button" onClick={() => void action('logout')} disabled={working}><LogOut size={16}/> この端末からログアウト</button></> : <><div className="auth-symbol"><KeyRound/></div><h2>記録を持ち歩く</h2><p>パスワードもメールも不要です。端末の Face ID、Touch ID、Windows Hello などでパスキーを作ります。</p><label className="name-field"><span>呼ばれたい名前</span><input value={displayName} onChange={event => setDisplayName(event.target.value)} maxLength={40} placeholder="例：けい" autoComplete="nickname"/></label><button className="primary-button auth-primary" onClick={() => void action('register')} disabled={working || !displayName.trim() || !passkeyAvailable()}>{working ? <LoaderCircle className="spin" size={17}/> : <KeyRound size={17}/>} 新しく登録する</button><button className="text-button" onClick={() => void action('login')} disabled={working || !passkeyAvailable()}>すでにパスキーを持っている</button><small>生体情報は端末の外へ送信されません。Google ログインは後から追加できます。</small></>}
      {message && <p className="auth-message" role="status">{message}</p>}
    </section></div>}
  </header>
}

export function AppShell({ children, user, syncStatus, auth }: { children: ReactNode; user: CloudUser | null; syncStatus: string; auth: AuthState }) {
  return <div className="app-shell"><Header user={user} syncStatus={syncStatus} auth={auth}/>{children}<footer><span>青空文庫の公開作品を、学びやすい読書体験へ。</span><a href="https://www.aozora.gr.jp/" target="_blank" rel="noreferrer">青空文庫について</a></footer></div>
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
