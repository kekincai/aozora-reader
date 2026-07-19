import { useEffect, useMemo, useRef, useState } from 'react'
import { BrowserRouter, Link, NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Bookmark, BookOpen, Check, ChevronRight, Clock3, Cloud, KeyRound, Library, LoaderCircle, LogOut, Menu, RotateCcw, Search, Sparkles, X } from 'lucide-react'
import { loadCloudState, passkeyAvailable, saveCloudState, useAuth, type CloudUser } from './auth'
import './App.css'

type WorkSummary = { id: string; title: string; author: string; level: string; genre: string; minutes: number; summary: string; sourceUrl: string; attribution: string; paragraphCount: number }
type Work = WorkSummary & { paragraphs: string[] }
type SavedWord = { word: string; reading: string; meaning: string; level: string; savedAt: number }
type ReaderState = { progress: Record<string, number>; words: SavedWord[]; minutes: number }

const initialState: ReaderState = { progress: { '92': 42 }, words: [], minutes: 0 }
const vocabulary: Record<string, Omit<SavedWord, 'savedAt'>> = {
  暮らす: { word: '暮らす', reading: 'くらす', meaning: '生活；度日。日々を送る。', level: 'N2推定' },
  真っ白: { word: '真っ白', reading: 'まっしろ', meaning: '完全に白い様子。', level: 'N2' },
  おっかなびっくり: { word: 'おっかなびっくり', reading: 'おっかなびっくり', meaning: 'こわがりながら、慎重に。', level: 'N1' },
}

function useReaderState() {
  const [state, setState] = useState<ReaderState>(() => {
    try { return JSON.parse(localStorage.getItem('aozora-reader-state') || '') } catch { return initialState }
  })
  useEffect(() => localStorage.setItem('aozora-reader-state', JSON.stringify(state)), [state])
  return [state, setState] as const
}

type AuthState = ReturnType<typeof useAuth>

function Header({ user, syncStatus, auth }: { user: CloudUser | null; syncStatus: string; auth: AuthState }) {
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
    <Link className="brand" to="/" aria-label="青空しおり ホーム"><span className="brand-mark">青</span><span>青空しおり</span></Link>
    <button className="icon-button mobile-only" onClick={() => setOpen(!open)} aria-label="メニュー"><Menu size={20} /></button>
    <nav className={open ? 'nav open' : 'nav'} onClick={() => setOpen(false)}>
      <NavLink to="/">読む</NavLink><NavLink to="/review">復習</NavLink><NavLink to="/record">記録</NavLink>
      <button className="mobile-sync-button" onClick={() => setAuthOpen(true)}><KeyRound size={14}/>{user ? user.displayName : '記録を同期'}</button>
    </nav>
    <div className="header-actions"><button className="icon-button" aria-label="検索"><Search size={18}/></button><button className="google-button" onClick={() => setAuthOpen(true)}>{user ? <><Cloud size={14}/> {user.displayName}</> : <><KeyRound size={14}/> 無料で同期</>}</button></div>
    {authOpen && <div className="auth-scrim" onClick={() => setAuthOpen(false)}><section className="auth-dialog" role="dialog" aria-modal="true" aria-label="学習記録の同期" onClick={event => event.stopPropagation()}><button className="sheet-close" onClick={() => setAuthOpen(false)} aria-label="閉じる"><X size={20}/></button>
      {user ? <><div className="auth-symbol"><Cloud/></div><h2>{user.displayName}さん</h2><p>読書の進み具合と復習語彙を、このパスキーで安全に同期しています。</p><div className={`sync-state ${syncStatus}`}><i/>{syncStatus === 'saving' ? '保存しています…' : syncStatus === 'error' ? '同期を再試行します' : 'クラウドに保存済み'}</div><button className="secondary-button logout-button" onClick={() => void action('logout')} disabled={working}><LogOut size={16}/> この端末からログアウト</button></> : <><div className="auth-symbol"><KeyRound/></div><h2>記録を持ち歩く</h2><p>パスワードもメールも不要です。端末の Face ID、Touch ID、Windows Hello などでパスキーを作ります。</p><label className="name-field"><span>呼ばれたい名前</span><input value={displayName} onChange={event => setDisplayName(event.target.value)} maxLength={40} placeholder="例：けい" autoComplete="nickname"/></label><button className="primary-button auth-primary" onClick={() => void action('register')} disabled={working || !displayName.trim() || !passkeyAvailable()}>{working ? <LoaderCircle className="spin" size={17}/> : <KeyRound size={17}/>} 新しく登録する</button><button className="text-button" onClick={() => void action('login')} disabled={working || !passkeyAvailable()}>すでにパスキーを持っている</button><small>生体情報は端末の外へ送信されません。Google ログインは後から追加できます。</small></>}
      {message && <p className="auth-message" role="status">{message}</p>}
    </section></div>}
  </header>
}

function Layout({ children, user, syncStatus, auth }: { children: React.ReactNode; user: CloudUser | null; syncStatus: string; auth: AuthState }) {
  return <div className="app-shell"><Header user={user} syncStatus={syncStatus} auth={auth}/>{children}<footer><span>青空文庫の公開作品を、学びやすい読書体験へ。</span><a href="https://www.aozora.gr.jp/" target="_blank" rel="noreferrer">青空文庫について</a></footer></div>
}

function Home({ state, user, syncStatus, auth }: { state: ReaderState; user: CloudUser | null; syncStatus: string; auth: AuthState }) {
  const [works, setWorks] = useState<WorkSummary[]>([])
  const [filter, setFilter] = useState('すべて')
  useEffect(() => { fetch('/corpus/manifest.json').then(r => r.json()).then(d => setWorks(d.works)) }, [])
  const visible = works.filter(w => filter === 'すべて' || (filter === 'N2核心' ? w.level === 'N2' : filter === 'N2→N1' ? w.level !== 'N2' : w.genre.includes(filter)))
  const featured = works.find(w => w.id === '637')
  return <Layout user={user} syncStatus={syncStatus} auth={auth}><main>
    <section className="hero-section">
      <div className="hero-copy"><div className="eyebrow"><Sparkles size={15}/> 今日の一篇</div><h1>手袋を買いに</h1><p className="author">新美 南吉</p><p className="hero-summary">雪の夜、子狐は初めて人間の町へ。<br/>やさしさと怖さが同居する、冬の短篇。</p><div className="meta-line"><span>N2 ウォームアップ</span><span>約8分</span><span>新字新仮名</span></div><Link className="primary-button" to="/read/637">読みはじめる <ChevronRight size={17}/></Link></div>
      <div className="hero-art" aria-hidden="true"><div className="moon"/><div className="branch branch-one"/><div className="branch branch-two"/><span className="snow s1">·</span><span className="snow s2">·</span><span className="snow s3">·</span></div>
      <aside className="today-panel"><div><span className="panel-label">読みかけ</span><strong>蜘蛛の糸</strong><div className="progress"><i style={{width: `${state.progress['92'] || 0}%`}}/></div><small>{state.progress['92'] || 0}%</small></div><div className="rule"/><div><span className="panel-label">今日の復習</span><strong>{Math.max(18, state.words.length)}語・3文法</strong><Link to="/review">はじめる <ChevronRight size={14}/></Link></div></aside>
    </section>
    <section className="library-section"><div className="section-heading"><div><span className="kicker">DISCOVER</span><h2>今の自分に合う一篇</h2></div><p>N2を中心に、少し背伸びするN1まで。<br/>短く読める順に選びました。</p></div>
      <div className="filters">{['すべて','N2核心','N2→N1','短篇','童話','随筆'].map(item => <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div>
      <div className="work-list">{visible.map((w, index) => <Link className="work-row" to={`/read/${w.id}`} key={w.id}><span className="work-index">{String(index + 1).padStart(2,'0')}</span><div className="work-main"><div className="work-tags"><span>{w.level}</span><span>{w.genre}</span></div><h3>{w.title}</h3><p>{w.author}</p></div><p className="work-summary">{w.summary}</p><span className="work-time"><Clock3 size={15}/>{w.minutes}分</span><ChevronRight className="row-arrow" size={19}/></Link>)}</div>
      {!works.length && <div className="loading">作品を選んでいます…</div>}
    </section>
    {featured && <section className="source-note"><Library size={20}/><div><strong>作品の出典を明記しています</strong><p>公開作品だけを収録し、原文と青空文庫へのリンクを各作品に表示します。</p></div></section>}
  </main></Layout>
}

const opening = [
  <>寒い冬が北方から、<ruby>狐<rt>きつね</rt></ruby>の親子の<ruby>棲<rt>す</rt></ruby>んでいる森へもやって来ました。</>,
  <>或朝、洞穴から子供の狐が出ようとしましたが、「あっ」と叫んで眼を<ruby>抑<rt>おさ</rt></ruby>えながら母さん狐のところへころげて来ました。</>,
  <>「母ちゃん、眼に何か刺さった、ぬいて頂戴早く早く」と言いました。</>,
  <>母さん狐がびっくりして、あわてふためきながら、眼をおさえている子供の手を恐る恐るとりのけて見ましたが、何も刺さってはいませんでした。</>,
  <>子狐は雪の上で、母さんと静かに<span className="vocab" data-word="暮らす">暮らす</span>日々を思いました。</>,
]

function Reader({ state, setState }: { state: ReaderState; setState: React.Dispatch<React.SetStateAction<ReaderState>> }) {
  const { id = '637' } = useParams(); const navigate = useNavigate()
  const [work, setWork] = useState<Work | null>(null); const [furigana, setFurigana] = useState(true); const [full, setFull] = useState(false); const [selected, setSelected] = useState<SavedWord | null>(null)
  useEffect(() => { fetch(`/corpus/works/${id}.json`).then(r => r.json()).then(setWork); window.scrollTo(0,0) }, [id])
  useEffect(() => { if (work) setState(s => ({...s, progress: {...s.progress, [id]: Math.max(s.progress[id] || 0, 18)}})) }, [work, id, setState])
  const saveWord = () => { if (!selected) return; setState(s => ({...s, words: s.words.some(w => w.word === selected.word) ? s.words : [...s.words, selected]})) }
  const body = useMemo(() => work?.paragraphs.join('') || '', [work])
  if (!work) return <div className="reader-loading">本文をひらいています…</div>
  return <div className={`reader-page ${furigana ? '' : 'hide-ruby'}`}>
    <header className="reader-header"><button className="reader-back" onClick={() => navigate(-1)}><ArrowLeft size={19}/><span>戻る</span></button><div className="reader-title"><strong>{work.title}</strong><span>{state.progress[id] || 18}%</span></div><div className="reader-progress"><i style={{width: `${state.progress[id] || 18}%`}}/></div><button className="icon-button"><Menu size={19}/></button></header>
    <div className="reader-controls"><button className={furigana ? 'active' : ''} onClick={() => setFurigana(!furigana)}>ふりがな</button><button className="active">{work.level}+</button><button onClick={() => alert('この公開版では、作品を読みやすい節ごとに順次追加します。')}>章一覧</button></div>
    <main className="reading-wrap"><div className="reading-meta"><span>{work.genre}</span><h1>{work.title}</h1><p>{work.author}</p></div>
      <article className="reading-text" onClick={(e) => { const el = (e.target as HTMLElement).closest<HTMLElement>('[data-word]'); if (el) { const v = vocabulary[el.dataset.word || '']; if(v) setSelected({...v, savedAt: Date.now()}) } }}>
        {id === '637' ? opening.map((p,i) => <p key={i}>{p}</p>) : <div dangerouslySetInnerHTML={{__html: full ? body : body.slice(0, 3200)}}/>}
      </article>
      <div className="reading-actions"><button className="secondary-button" onClick={() => setFull(!full)}>{full ? '学習片に戻る' : '本章全文を表示'}</button><a href={work.sourceUrl} target="_blank" rel="noreferrer">青空文庫の原文を見る</a></div>
      <p className="attribution">出典：{work.attribution} · 表記は底本に準拠</p>
    </main>
    {selected && <div className="sheet-scrim" onClick={() => setSelected(null)}><section className="word-sheet" onClick={e => e.stopPropagation()}><button className="sheet-close" onClick={() => setSelected(null)}><X size={20}/></button><div className="sheet-handle"/><div className="word-heading"><div><h2>{selected.word}</h2><p>[ {selected.reading} ]</p></div><span>{selected.level}</span></div><p className="meaning">{selected.meaning}</p><p className="usage">文脈では、ある場所で日々の生活を続けるという意味です。</p><div className="sheet-actions"><button className="primary-button" onClick={saveWord}>{state.words.some(w => w.word === selected.word) ? <><Check size={17}/> 追加済み</> : <><RotateCcw size={17}/> 復習に追加</>}</button><button className="icon-button bookmark"><Bookmark size={20}/></button></div></section></div>}
  </div>
}

function Review({ state, user, syncStatus, auth }: { state: ReaderState; user: CloudUser | null; syncStatus: string; auth: AuthState }) {
  const defaults = Object.values(vocabulary).map(v => ({...v, savedAt: 0})); const cards = state.words.length ? state.words : defaults; const [index, setIndex] = useState(0); const [show, setShow] = useState(false); const card = cards[index % cards.length]
  return <Layout user={user} syncStatus={syncStatus} auth={auth}><main className="simple-page"><span className="kicker">REVIEW</span><h1>今日の復習</h1><p className="page-lead">読書中に拾った言葉を、忘れる少し前にもう一度。</p><div className="review-card"><span>{index + 1} / {cards.length}</span><h2>{card.word}</h2><p className="reading">{card.reading}</p>{show ? <><div className="answer-rule"/><p className="answer">{card.meaning}</p><div className="rating"><button onClick={() => {setIndex(index+1);setShow(false)}}>もう一度</button><button onClick={() => {setIndex(index+1);setShow(false)}}>むずかしい</button><button onClick={() => {setIndex(index+1);setShow(false)}}>わかった</button></div></> : <button className="primary-button" onClick={() => setShow(true)}>答えを見る</button>}</div><p className="micro-copy">{user ? '復習記録はクラウドにも保存されます。' : '登録なしでも、この端末に学習記録を保存します。'}</p></main></Layout>
}

function RecordPage({ state, user, syncStatus, auth }: { state: ReaderState; user: CloudUser | null; syncStatus: string; auth: AuthState }) {
  return <Layout user={user} syncStatus={syncStatus} auth={auth}><main className="simple-page record-page"><span className="kicker">YOUR RECORD</span><h1>読書の記録</h1><p className="page-lead">速さより、続けた日と出会った言葉を大切に。</p><div className="stats"><div><strong>{Object.keys(state.progress).length}</strong><span>読んだ作品</span></div><div><strong>{state.words.length}</strong><span>集めた言葉</span></div><div><strong>{Math.max(8, state.minutes)}</strong><span>読書時間（分）</span></div></div><section className="record-note"><BookOpen/><div><h2>{user ? `${user.displayName}さんの記録` : '次の一篇'}</h2><p>{user ? 'この記録はパスキーで保護され、別の対応端末からも続けられます。' : '短い作品を一つ読み切ると、ここに読書の流れが育っていきます。'}</p><Link to="/">作品を選ぶ</Link></div></section></main></Layout>
}

function App() {
  const [state, setState] = useReaderState()
  const auth = useAuth()
  const [syncStatus, setSyncStatus] = useState('local')
  const hydratedUser = useRef<string | null>(null)

  useEffect(() => {
    if (!auth.user || hydratedUser.current === auth.user.id) return
    let active = true
    void loadCloudState<ReaderState>().then(({ state: cloud }) => {
      if (!active) return
      const merged = cloud ? {
        progress: Object.fromEntries(Array.from(new Set([...Object.keys(state.progress), ...Object.keys(cloud.progress)])).map(id => [id, Math.max(state.progress[id] || 0, cloud.progress[id] || 0)])),
        words: [...state.words, ...cloud.words].filter((word, index, words) => words.findIndex(item => item.word === word.word) === index),
        minutes: Math.max(state.minutes, cloud.minutes),
      } : state
      setState(merged)
      hydratedUser.current = auth.user?.id || null
      setSyncStatus('saved')
      void saveCloudState(merged)
    }).catch(() => setSyncStatus('error'))
    return () => { active = false }
  }, [auth.user, setState, state])

  useEffect(() => {
    if (!auth.user || hydratedUser.current !== auth.user.id) return
    setSyncStatus('saving')
    const timer = window.setTimeout(() => void saveCloudState(state).then(() => setSyncStatus('saved')).catch(() => setSyncStatus('error')), 800)
    return () => window.clearTimeout(timer)
  }, [auth.user, state])

  useEffect(() => { if (!auth.user) { hydratedUser.current = null; setSyncStatus('local') } }, [auth.user])

  const common = { user: auth.user, syncStatus, auth }
  return <BrowserRouter><Routes><Route path="/" element={<Home state={state} {...common}/>}/><Route path="/read/:id" element={<Reader state={state} setState={setState}/>}/><Route path="/review" element={<Review state={state} {...common}/>}/><Route path="/record" element={<RecordPage state={state} {...common}/>}/></Routes></BrowserRouter>
}

export default App
