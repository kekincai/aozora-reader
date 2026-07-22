import { useEffect, useMemo, useRef, useState } from 'react'
import { BrowserRouter, Link, NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Bookmark, BookOpen, Check, ChevronRight, Clock3, Cloud, KeyRound, Library, ListFilter, LoaderCircle, LogOut, Menu, RotateCcw, Search, Sparkles, X } from 'lucide-react'
import { loadCloudState, passkeyAvailable, saveCloudState, useAuth, type CloudUser } from './auth'
import { loadTodayWork, loadWork, loadWorks, searchWorks, type AnnotatedToken, type ReaderWork as Work, type WorkSummary } from './catalog'
import './App.css'

type SavedWord = { word: string; reading: string; meaning: string; level: string; savedAt: number }
type ReaderState = { progress: Record<string, number>; words: SavedWord[]; minutes: number }
type ArticleRef = { id: string; title: string; author: string; count: number }
type VocabularyEntry = { id: string; term: string; reading: string; meaning: string; meaningLanguage?: string; level: 'N1'|'N2'; kanaRow: string; kanaKey?: string; category?: string; annotationSafe?: boolean; articles: ArticleRef[] }
type GrammarEntry = { id: string; title: string; pattern: string; meaning: string; meaningLanguage?: string; formation: string; level: 'N1'|'N2'; category: string; examples: {jp:string;zh?:string}[]; articles: ArticleRef[] }
type LearningIndex = { notice: string; vocabulary: VocabularyEntry[]; grammar: GrammarEntry[] }
type SelectedEntry = { kind: 'vocabulary'; entry: VocabularyEntry } | { kind: 'grammar'; entry: GrammarEntry }

const initialState: ReaderState = { progress: { '92': 42 }, words: [], minutes: 0 }
const fallbackCards: SavedWord[] = [
  { word: '暮らす', reading: 'くらす', meaning: 'to live; to get along', level: 'N2', savedAt: 0 },
  { word: 'おっかなびっくり', reading: 'おっかなびっくり', meaning: 'nervously; timidly', level: 'N1', savedAt: 0 },
]

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
      <NavLink to="/">読む</NavLink><NavLink to="/articles">文章</NavLink><NavLink to="/learn">学ぶ</NavLink><NavLink to="/review">復習</NavLink><NavLink to="/record">記録</NavLink>
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
  const [query, setQuery] = useState('')
  const [loadError, setLoadError] = useState('')
  const [today, setToday] = useState<WorkSummary | null>(null)
  useEffect(() => {
    const timer = window.setTimeout(() => void loadWorks(query).then(next => { setWorks(next); setLoadError('') }).catch(() => setLoadError('Mini PCの作品一覧に接続できません。')), query ? 250 : 0)
    return () => window.clearTimeout(timer)
  }, [query])
  useEffect(() => { void loadTodayWork().then(result => setToday(result.work)).catch(() => setToday(null)) }, [])
  const visible = works.filter(w => query || filter === 'すべて' || (filter === 'N2核心' ? w.level === 'N2' : filter === 'N2→N1' ? w.level !== 'N2' && w.level !== '未分類' : w.genre.includes(filter)))
  const featured = today || works.find(w => w.id === '637')
  return <Layout user={user} syncStatus={syncStatus} auth={auth}><main>
    <section className="hero-section">
      <div className="hero-copy"><div className="eyebrow"><Sparkles size={15}/> 今日の一篇</div><h1>{featured?.title || '手袋を買いに'}</h1><p className="author">{featured?.author || '新美 南吉'}</p><p className="hero-summary">{featured?.summary || '雪の夜、子狐は初めて人間の町へ。やさしさと怖さが同居する、冬の短篇。'}</p><div className="meta-line"><span>{featured?.level || 'N2'} ウォームアップ</span><span>約{featured?.minutes || 8}分</span><span>{featured?.genre || '童話'}</span></div><Link className="primary-button" to={`/read/${featured?.id || '637'}`}>読みはじめる <ChevronRight size={17}/></Link></div>
      <div className="hero-art" aria-hidden="true"><div className="moon"/><div className="branch branch-one"/><div className="branch branch-two"/><span className="snow s1">·</span><span className="snow s2">·</span><span className="snow s3">·</span></div>
      <aside className="today-panel"><div><span className="panel-label">読みかけ</span><strong>蜘蛛の糸</strong><div className="progress"><i style={{width: `${state.progress['92'] || 0}%`}}/></div><small>{state.progress['92'] || 0}%</small></div><div className="rule"/><div><span className="panel-label">今日の復習</span><strong>{Math.max(18, state.words.length)}語・3文法</strong><Link to="/review">はじめる <ChevronRight size={14}/></Link></div></aside>
    </section>
    <section className="library-section"><div className="section-heading"><div><span className="kicker">DISCOVER</span><h2>今の自分に合う一篇</h2></div><p>N2を中心に、少し背伸びするN1まで。<br/>短く読める順に選びました。</p></div>
      <div className="catalog-tools"><div className="filters">{['すべて','N2核心','N2→N1','短篇','童話','随筆'].map(item => <button key={item} className={filter === item ? 'active' : ''} onClick={() => { setFilter(item); setQuery('') }}>{item}</button>)}</div><label className="catalog-search"><Search size={15}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="全17,831作品から題名・作者を検索"/></label></div>
      <div className="work-list">{visible.map((w, index) => <Link className="work-row" to={`/read/${w.id}`} key={w.id}><span className="work-index">{String(index + 1).padStart(2,'0')}</span><div className="work-main"><div className="work-tags"><span>{w.level}</span><span>{w.genre}</span></div><h3>{w.title}</h3><p>{w.author}</p></div><p className="work-summary">{w.summary}{w.learning && <small>{w.learning.vocabularyUnique}語彙 · {w.learning.grammarUnique}文法</small>}</p><span className="work-time"><Clock3 size={15}/>{w.minutes}分</span><ChevronRight className="row-arrow" size={19}/></Link>)}</div>
      {!works.length && <div className="loading">作品を選んでいます…</div>}
      {loadError && <p className="catalog-error">{loadError}</p>}
    </section>
    {featured && <section className="source-note"><Library size={20}/><div><strong>作品の出典を明記しています</strong><p>公開作品だけを収録し、原文と青空文庫へのリンクを各作品に表示します。</p></div></section>}
  </main></Layout>
}

function ArticlesPage({ user, syncStatus, auth }: { user: CloudUser | null; syncStatus: string; auth: AuthState }) {
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState('')
  const [genre, setGenre] = useState('')
  const [length, setLength] = useState('20000')
  const [sort, setSort] = useState<'shortest'|'title'|'newest'>('shortest')
  const [works, setWorks] = useState<WorkSummary[]>([])
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true)
      void searchWorks({ query, level, genre, maxCharacters: Number(length), sort, offset, limit: 30 })
        .then(result => { setWorks(result.works); setHasMore(result.page.hasMore); setMessage('') })
        .catch(() => setMessage('作品数据库に接続できません。しばらくしてからもう一度お試しください。'))
        .finally(() => setLoading(false))
    }, query ? 250 : 0)
    return () => window.clearTimeout(timer)
  }, [query, level, genre, length, sort, offset])
  const changeFilter = (action: () => void) => { setOffset(0); action() }
  return <Layout user={user} syncStatus={syncStatus} auth={auth}><main className="articles-page">
    <section className="catalog-intro"><span className="kicker">AOZORA CATALOG</span><h1>文章を探す</h1><p>青空文庫の公開作品を、題名・作者・長さ・学習レベルから探せます。</p></section>
    <section className="article-search-panel">
      <label className="article-query"><Search size={19}/><input value={query} onChange={event => changeFilter(() => setQuery(event.target.value))} placeholder="題名・作者・読みで検索"/></label>
      <div className="article-filters"><label><span>難易度</span><select value={level} onChange={event => changeFilter(() => setLevel(event.target.value))}><option value="">すべて</option><option>N2</option><option value="N2+">N2→N1</option><option>N1</option></select></label><label><span>種類</span><select value={genre} onChange={event => changeFilter(() => setGenre(event.target.value))}><option value="">すべて</option><option>短篇</option><option>童話</option><option>随筆</option><option>幻想</option></select></label><label><span>長さ</span><select value={length} onChange={event => changeFilter(() => setLength(event.target.value))}><option value="5000">約10分以内</option><option value="10000">約20分以内</option><option value="20000">短め</option><option value="2000000">制限なし</option></select></label><label><span>並び順</span><select value={sort} onChange={event => changeFilter(() => setSort(event.target.value as typeof sort))}><option value="shortest">短い順</option><option value="title">五十音順</option><option value="newest">更新順</option></select></label></div>
      <div className="catalog-result-meta"><strong>{offset + 1}–{offset + works.length}</strong><span>全17,831作品のデータベースから検索</span></div>
      <div className="work-list">{works.map((work, index) => <Link className="work-row" to={`/read/${work.id}`} key={work.id}><span className="work-index">{String(offset + index + 1).padStart(2,'0')}</span><div className="work-main"><div className="work-tags"><span>{work.level}</span><span>{work.genre}</span></div><h3>{work.title}</h3><p>{work.author}</p></div><p className="work-summary">{work.summary || `${work.characterCount?.toLocaleString() || '—'}字の青空文庫作品`}</p><span className="work-time"><Clock3 size={15}/>{work.minutes}分</span><ChevronRight className="row-arrow" size={19}/></Link>)}</div>
      {loading && <div className="loading">作品を探しています…</div>}{message && <p className="catalog-error">{message}</p>}
      <div className="catalog-pagination"><button disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 30))}>前へ</button><span>{Math.floor(offset / 30) + 1}ページ</span><button disabled={!hasMore} onClick={() => setOffset(offset + 30)}>次へ</button></div>
    </section>
  </main></Layout>
}

function Reader({ state, setState }: { state: ReaderState; setState: React.Dispatch<React.SetStateAction<ReaderState>> }) {
  const { id = '637' } = useParams(); const navigate = useNavigate()
  const [work, setWork] = useState<Work | null>(null); const [learning, setLearning] = useState<LearningIndex | null>(null)
  const [furigana, setFurigana] = useState(true); const [full, setFull] = useState(false); const [selected, setSelected] = useState<SelectedEntry | null>(null)
  const [levels, setLevels] = useState({N2:true, N1:true}); const [showGrammar, setShowGrammar] = useState(true)
  useEffect(() => { Promise.all([loadWork(id), fetch('/learning/index.json').then(r => r.json())]).then(([nextWork, nextLearning]) => { setWork(nextWork); setLearning(nextLearning) }); window.scrollTo(0,0) }, [id])
  useEffect(() => { if (work) setState(s => ({...s, progress: {...s.progress, [id]: Math.max(s.progress[id] || 0, 18)}})) }, [work, id, setState])
  const vocabMap = useMemo(() => new Map(learning?.vocabulary.map(entry => [entry.id, entry]) || []), [learning])
  const grammarMap = useMemo(() => new Map(learning?.grammar.map(entry => [entry.id, entry]) || []), [learning])
  const saveWord = () => {
    if (!selected) return
    const item = selected.kind === 'vocabulary'
      ? { word: selected.entry.term, reading: selected.entry.reading, meaning: selected.entry.meaning, level: selected.entry.level, savedAt: Date.now() }
      : { word: selected.entry.pattern, reading: '文法', meaning: selected.entry.meaning, level: selected.entry.level, savedAt: Date.now() }
    setState(s => ({...s, words: s.words.some(w => w.word === item.word) ? s.words : [...s.words, item]}))
  }
  const visibleParagraphs = useMemo(() => {
    if (!work) return []
    if (full) return work.annotatedParagraphs
    let remaining = 3100
    return work.annotatedParagraphs.map(paragraph => {
      if (remaining <= 0) return []
      const result = []
      for (const token of paragraph) { if (remaining <= 0) break; result.push(token); remaining -= token.text.length }
      return result
    }).filter(paragraph => paragraph.length)
  }, [work, full])
  if (!work || !learning) return <div className="reader-loading">本文を分析しています…</div>
  const openToken = (token: AnnotatedToken) => {
    const vocab = token.vocabId ? vocabMap.get(token.vocabId) : undefined
    const grammar = token.grammarIds?.map(key => grammarMap.get(key)).find(Boolean)
    if (vocab && levels[vocab.level]) setSelected({kind:'vocabulary', entry:vocab})
    else if (grammar && showGrammar && levels[grammar.level]) setSelected({kind:'grammar', entry:grammar})
  }
  return <div className={`reader-page ${furigana ? '' : 'hide-ruby'}`}>
    <header className="reader-header"><button className="reader-back" onClick={() => navigate(-1)}><ArrowLeft size={19}/><span>戻る</span></button><div className="reader-title"><strong>{work.title}</strong><span>{state.progress[id] || 18}%</span></div><div className="reader-progress"><i style={{width: `${state.progress[id] || 18}%`}}/></div><button className="icon-button"><Menu size={19}/></button></header>
    <div className="reader-controls"><button className={furigana ? 'active ruby-control' : ''} onClick={() => setFurigana(!furigana)}>ふりがな</button><button className={levels.N2 ? 'active n2-control' : ''} onClick={() => setLevels(value => ({...value,N2:!value.N2}))}>N2 語彙</button><button className={levels.N1 ? 'active n1-control' : ''} onClick={() => setLevels(value => ({...value,N1:!value.N1}))}>N1 語彙</button><button className={showGrammar ? 'active grammar-control' : ''} onClick={() => setShowGrammar(!showGrammar)}>N2・N1 文法</button></div>
    <main className="reader-layout"><section className="reading-wrap"><div className="reading-meta"><span>{work.genre}</span><h1>{work.title}</h1><p>{work.author}</p></div>
      <article className="reading-text">{visibleParagraphs.map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph.map((token, tokenIndex) => {
        const vocab = token.vocabId ? vocabMap.get(token.vocabId) : undefined
        const grammar = token.grammarIds?.map(key => grammarMap.get(key)).find(Boolean)
        const vocabVisible = vocab && levels[vocab.level]
        const grammarVisible = grammar && showGrammar && levels[grammar.level]
        const annotationClasses = [vocabVisible ? `vocab-${vocab.level.toLowerCase()}` : '', grammarVisible ? `grammar-token grammar-${grammar.level.toLowerCase()}` : ''].filter(Boolean)
        const className = annotationClasses.length ? `learning-token ${annotationClasses.join(' ')}` : ''
        const content = token.reading ? <ruby>{token.text}<rt>{token.reading}</rt></ruby> : token.text
        return className ? <button type="button" className={className} key={tokenIndex} onClick={() => openToken(token)}>{content}</button> : <span key={tokenIndex}>{content}</span>
      })}</p>)}</article>
      <div className="reading-actions"><button className="secondary-button" onClick={() => setFull(!full)}>{full ? '短い表示に戻る' : work.annotatedParagraphs.length < work.paragraphCount ? '収録範囲をすべて表示' : '全文を表示'}</button><a href={work.sourceUrl} target="_blank" rel="noreferrer">青空文庫の原文を見る</a></div>
      <p className="attribution">出典：{work.attribution} · 表記は底本に準拠</p>
    </section><aside className="chapter-learning"><span>この章の学び</span><div><strong>{work.learning?.vocabularyUnique || 0}</strong><small>N2・N1 語彙</small></div><div><strong>{work.learning?.grammarUnique || 0}</strong><small>N2・N1 文法</small></div><Link to="/learn">一覧から探す <ChevronRight size={14}/></Link></aside></main>
    <Link className="mobile-learning-bar" to="/learn"><span>この章：{work.learning?.vocabularyUnique || 0}語彙・{work.learning?.grammarUnique || 0}文法</span><strong>一覧 <ChevronRight size={14}/></strong></Link>
    {selected && <div className="sheet-scrim" onClick={() => setSelected(null)}><section className="word-sheet" onClick={e => e.stopPropagation()}><button className="sheet-close" onClick={() => setSelected(null)} aria-label="閉じる"><X size={20}/></button><div className="sheet-handle"/><div className="word-heading"><div><h2>{selected.kind === 'vocabulary' ? selected.entry.term : selected.entry.pattern}</h2><p>{selected.kind === 'vocabulary' ? `[ ${selected.entry.reading} ]` : selected.entry.formation}</p></div><span>{selected.entry.level} · {selected.kind === 'vocabulary' ? '語彙' : selected.entry.category}</span></div><p className="meaning">{selected.entry.meaning}</p>{selected.kind === 'grammar' && selected.entry.examples[0] && <p className="usage">{selected.entry.examples[0].jp}{selected.entry.examples[0].zh && <><br/><small>{selected.entry.examples[0].zh}</small></>}</p>}<div className="appears-in"><span>この表現がある作品</span>{selected.entry.articles.slice(0,3).map(article => <Link key={article.id} to={`/read/${article.id}`}>{article.title} · {article.count}回</Link>)}</div><div className="sheet-actions"><button className="primary-button" onClick={saveWord}>{state.words.some(w => w.word === (selected.kind === 'vocabulary' ? selected.entry.term : selected.entry.pattern)) ? <><Check size={17}/> 追加済み</> : <><RotateCcw size={17}/> 復習に追加</>}</button><button className="icon-button bookmark"><Bookmark size={20}/></button></div></section></div>}
  </div>
}

function LearnPage({ user, syncStatus, auth }: { user: CloudUser | null; syncStatus: string; auth: AuthState }) {
  const [index, setIndex] = useState<LearningIndex | null>(null)
  const [databaseEntries, setDatabaseEntries] = useState<Array<VocabularyEntry | GrammarEntry> | null>(null)
  const [tab, setTab] = useState<'vocabulary'|'grammar'>('vocabulary')
  const [query, setQuery] = useState(''); const [level, setLevel] = useState<'すべて'|'N2'|'N1'>('すべて')
  const [kana, setKana] = useState('すべて'); const [category, setCategory] = useState('すべて'); const [vocabCategory, setVocabCategory] = useState('すべて'); const [corpusOnly, setCorpusOnly] = useState(true)
  useEffect(() => { fetch('/learning/index.json').then(response => response.json()).then(setIndex) }, [])
  useEffect(() => {
    setDatabaseEntries(null)
    const timer = window.setTimeout(() => {
      const url = new URL(`/api/learning/${tab}`, window.location.origin)
      if (query.trim()) url.searchParams.set('q', query.trim())
      if (level !== 'すべて') url.searchParams.set('level', level)
      if (tab === 'vocabulary' && kana !== 'すべて') url.searchParams.set('kana', kana)
      const selectedCategory = tab === 'vocabulary' ? vocabCategory : category
      if (selectedCategory !== 'すべて') url.searchParams.set('category', selectedCategory)
      url.searchParams.set('corpusOnly', String(corpusOnly))
      url.searchParams.set('limit', '220')
      void fetch(url).then(response => {
        if (!response.ok) throw new Error('learning database unavailable')
        return response.json() as Promise<{ entries: Array<VocabularyEntry | GrammarEntry> }>
      }).then(result => setDatabaseEntries(result.entries)).catch(() => setDatabaseEntries(null))
    }, query ? 220 : 0)
    return () => window.clearTimeout(timer)
  }, [tab, query, level, kana, category, vocabCategory, corpusOnly])
  const categories = useMemo(() => Array.from(new Set(index?.grammar.map(entry => entry.category) || [])).sort(), [index])
  const vocabularyCategories = useMemo(() => Array.from(new Set(index?.vocabulary.map(entry => entry.category).filter(Boolean) || [])).sort(), [index])
  const gojuon = ['あ','い','う','え','お','か','き','く','け','こ','さ','し','す','せ','そ','た','ち','つ','て','と','な','に','ぬ','ね','の','は','ひ','ふ','へ','ほ','ま','み','む','め','も','や','ゆ','よ','ら','り','る','れ','ろ','わ','を','ん']
  const entries = useMemo(() => {
    if (!index) return []
    const normalized = query.trim().toLowerCase()
    if (tab === 'vocabulary') return index.vocabulary.filter(entry =>
      (level === 'すべて' || entry.level === level) && (kana === 'すべて' || (entry.kanaKey || entry.kanaRow) === kana) && (vocabCategory === 'すべて' || entry.category === vocabCategory) && (!corpusOnly || entry.articles.length) &&
      (!normalized || `${entry.term} ${entry.reading} ${entry.meaning}`.toLowerCase().includes(normalized)))
    return index.grammar.filter(entry =>
      (level === 'すべて' || entry.level === level) && (category === 'すべて' || entry.category === category) && (!corpusOnly || entry.articles.length) &&
      (!normalized || `${entry.pattern} ${entry.title} ${entry.meaning} ${entry.formation}`.toLowerCase().includes(normalized)))
  }, [index, tab, query, level, kana, category, vocabCategory, corpusOnly])
  const visibleEntries = databaseEntries ?? entries
  useEffect(() => { setQuery(''); setLevel('すべて') }, [tab])
  return <Layout user={user} syncStatus={syncStatus} auth={auth}><main className="learn-page">
    <section className="learn-intro"><div><span className="kicker">N2 · N1 STUDY MAP</span><h1>文章から、ことばを学ぶ。</h1><p>N2を固めてからN1へ。品詞と文法の働きごとに進み、実際の作品で使い方を確かめます。</p></div><div className="learn-totals"><strong>{index ? index.vocabulary.length.toLocaleString() : '—'}<small>語彙</small></strong><strong>{index ? index.grammar.length.toLocaleString() : '—'}<small>文法</small></strong></div></section>
    <section className="learn-workspace">
      <div className="study-path"><div><span>01</span><strong>N2 核心語彙</strong><small>名词・动词・形容词</small></div><div><span>02</span><strong>N2 文法機能</strong><small>条件・原因・对比</small></div><div><span>03</span><strong>N1への橋渡し</strong><small>书面语・抽象表达</small></div><div><span>04</span><strong>作品で定着</strong><small>检索・阅读・复习</small></div></div>
      <div className="learn-tabs" role="tablist"><button className={tab === 'vocabulary' ? 'active' : ''} onClick={() => setTab('vocabulary')}>語彙<span>五十音順</span></button><button className={tab === 'grammar' ? 'active' : ''} onClick={() => setTab('grammar')}>文法<span>働き別</span></button></div>
      <div className="learn-search"><Search size={18}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder={tab === 'vocabulary' ? '漢字・読み・意味で検索' : '文型・意味・接続で検索'}/><label><input type="checkbox" checked={corpusOnly} onChange={event => setCorpusOnly(event.target.checked)}/> 収録作品にある項目</label></div>
      <div className="learn-filter-row"><ListFilter size={16}/><div className="level-switch">{['すべて','N2','N1'].map(item => <button key={item} className={level === item ? 'active' : ''} onClick={() => setLevel(item as typeof level)}>{item}</button>)}</div>{tab === 'vocabulary' ? <select value={vocabCategory} onChange={event => setVocabCategory(event.target.value)}><option>すべて</option>{vocabularyCategories.map(item => <option key={item}>{item}</option>)}</select> : <select value={category} onChange={event => setCategory(event.target.value)}><option>すべて</option>{categories.map(item => <option key={item}>{item}</option>)}</select>}</div>
      {tab === 'vocabulary' && <div className="gojuon-filter" aria-label="五十音索引"><button className={kana === 'すべて' ? 'active' : ''} onClick={() => setKana('すべて')}>全</button>{gojuon.map(item => <button key={item} className={kana === item ? 'active' : ''} onClick={() => setKana(item)}>{item}</button>)}<button className={kana === '他' ? 'active' : ''} onClick={() => setKana('他')}>他</button></div>}
      <div className="result-heading"><strong>{visibleEntries.length.toLocaleString()}項目{databaseEntries && ' · DB'}</strong><span>JLPT参考分類 · 公式リストではありません</span></div>
      <div className="learning-list">{visibleEntries.slice(0, 220).map(entry => 'term' in entry ? <article className="learning-row" key={entry.id}><div className={`level-stamp ${entry.level.toLowerCase()}`}>{entry.level}</div><div className="entry-word"><h2>{entry.term}</h2><p>{entry.reading} · {entry.category || '其他'}</p></div><p className="entry-meaning">{entry.meaning}<small>{entry.meaningLanguage === 'en' && '英文原释义 · 中文化予定'}</small></p><div className="article-links">{entry.articles.length ? entry.articles.slice(0,3).map(article => <Link key={article.id} to={`/read/${article.id}`}>{article.title}<span>{article.count}回</span></Link>) : <span>収録作品では未登場</span>}</div></article> : <article className="learning-row grammar-row" key={entry.id}><div className={`level-stamp ${entry.level.toLowerCase()}`}>{entry.level}</div><div className="entry-word"><h2>{entry.pattern}</h2><p>{entry.category}</p></div><div className="entry-meaning"><strong>{entry.meaning}</strong><small>{entry.formation}</small>{entry.meaningLanguage === 'en' && <small>英文原释义 · 中文化予定</small>}</div><div className="article-links">{entry.articles.length ? entry.articles.slice(0,3).map(article => <Link key={article.id} to={`/read/${article.id}`}>{article.title}<span>{article.count}回</span></Link>) : <span>収録作品では未登場</span>}</div></article>)}</div>
      {!databaseEntries && entries.length > 220 && <p className="result-limit">最初の220項目を表示中。検索または分類で絞り込めます。</p>}
      {index && <p className="dataset-notice">{index.notice}</p>}
    </section>
  </main></Layout>
}

function Review({ state, user, syncStatus, auth }: { state: ReaderState; user: CloudUser | null; syncStatus: string; auth: AuthState }) {
  const cards = state.words.length ? state.words : fallbackCards; const [index, setIndex] = useState(0); const [show, setShow] = useState(false); const card = cards[index % cards.length]
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
  return <BrowserRouter><Routes><Route path="/" element={<Home state={state} {...common}/>}/><Route path="/articles" element={<ArticlesPage {...common}/>}/><Route path="/learn" element={<LearnPage {...common}/>}/><Route path="/read/:id" element={<Reader state={state} setState={setState}/>}/><Route path="/review" element={<Review state={state} {...common}/>}/><Route path="/record" element={<RecordPage state={state} {...common}/>}/></Routes></BrowserRouter>
}

export default App
