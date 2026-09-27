import { useEffect, useState } from 'react'
import { Check, ChevronDown, Plus, Search, SlidersHorizontal, X } from 'lucide-react'
import { EntryArticles } from '../components/EntryArticles'
import { englishMeaning, loadLearningSummary, meaningOf, type GrammarEntry, type LearningSummary, type SelectedEntry, type VocabularyEntry } from '../learning'
import { addCard, useApp } from '../state/context'

const PAGE_SIZE = 60
const GOJUON = ['あ','い','う','え','お','か','き','く','け','こ','さ','し','す','せ','そ','た','ち','つ','て','と','な','に','ぬ','ね','の','は','ひ','ふ','へ','ほ','ま','み','む','め','も','や','ゆ','よ','ら','り','る','れ','ろ','わ','を','ん','他']
type Tab = 'vocabulary' | 'grammar'
type Entry = VocabularyEntry | GrammarEntry

function EntryRow({ entry, open, onToggle }: { entry: Entry; open: boolean; onToggle: () => void }) {
  const { state, setState } = useApp()
  const selected: SelectedEntry = 'term' in entry ? { kind: 'vocabulary', entry } : { kind: 'grammar', entry }
  const word = 'term' in entry ? entry.term : entry.pattern
  const saved = Boolean(state.cards[`${selected.kind}:${entry.id}`])
  const save = () => setState(current => addCard(current, {
    kind: selected.kind, entryId: entry.id, word,
    reading: 'term' in entry ? entry.reading : entry.formation,
    meaning: meaningOf(entry), level: entry.level,
  }))
  return <li className={`study-row ${open ? 'is-open' : ''}`}>
    <button className="study-row-head" onClick={onToggle} aria-expanded={open}>
      <span className="study-word">{word}{'term' in entry && entry.reading !== entry.term && <small>{entry.reading}</small>}</span>
      <span className={`level-chip ${entry.level === 'N1' ? 'n1' : ''}`}>{entry.level}</span>
      <span className="study-meaning">{meaningOf(entry)}</span>
      <ChevronDown className="study-chevron" size={16}/>
    </button>
    {open && <div className="study-detail">
      {englishMeaning(entry) && <p className="study-formation">{englishMeaning(entry)}</p>}
      {'formation' in entry && <p className="study-formation">{entry.formation}</p>}
      {'examples' in entry && entry.examples[0] && <p className="study-example">{entry.examples[0].jp}{entry.examples[0].zh && <small>{entry.examples[0].zh}</small>}</p>}
      <EntryArticles selected={selected} className="study-articles" label="作品の中で読む"/>
      <button className={`daily-button ${saved ? 'is-quiet' : 'is-accent'} study-save`} onClick={save} disabled={saved}>{saved ? <><Check size={16}/> 単語帳に入れました</> : <><Plus size={16}/> 単語帳に入れる</>}</button>
    </div>}
  </li>
}

export function LearnPage() {
  const [summary, setSummary] = useState<LearningSummary | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [offset, setOffset] = useState(0)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [tab, setTab] = useState<Tab>('vocabulary')
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState<'' | 'N2' | 'N1'>('')
  const [kana, setKana] = useState('')
  const [category, setCategory] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [openID, setOpenID] = useState<string | null>(null)

  useEffect(() => { void loadLearningSummary().then(setSummary).catch(() => setSummary(null)) }, [])
  useEffect(() => { setOffset(0); setOpenID(null) }, [tab, query, level, kana, category])
  useEffect(() => { setKana(''); setCategory('') }, [tab])
  useEffect(() => {
    let active = true
    setStatus('loading')
    const timer = window.setTimeout(() => {
      const url = new URL(`/api/learning/${tab}`, window.location.origin)
      if (query.trim()) url.searchParams.set('q', query.trim())
      if (level) url.searchParams.set('level', level)
      if (tab === 'vocabulary' && kana) url.searchParams.set('kana', kana)
      if (category) url.searchParams.set('category', category)
      url.searchParams.set('limit', String(PAGE_SIZE))
      url.searchParams.set('offset', String(offset))
      void fetch(url).then(response => {
        if (!response.ok) throw new Error('learning database unavailable')
        return response.json() as Promise<{ entries: Entry[]; page: { hasMore: boolean } }>
      }).then(result => {
        if (!active) return
        setEntries(current => offset ? [...current, ...result.entries] : result.entries)
        setHasMore(result.page.hasMore)
        setStatus('ready')
      }).catch(() => { if (active) setStatus('error') })
    }, query ? 250 : 0)
    return () => { active = false; window.clearTimeout(timer) }
  }, [tab, query, level, kana, category, offset])

  const categories = tab === 'vocabulary' ? summary?.vocabularyCategories || [] : summary?.grammarCategories || []
  const activeFilters = Number(Boolean(kana)) + Number(Boolean(category))
  return <main className="page-frame study-page">
    <header className="page-head">
      <span className="page-kicker">単語・文法の索引</span>
      <h1>作品に出てくる言葉を引く</h1>
      <p>N2・N1 の言葉を探して、青空文庫のどの一文に出てくるかを確かめられます。</p>
    </header>

    <label className="study-search"><Search size={18}/>
      <input value={query} onChange={event => setQuery(event.target.value)} placeholder={tab === 'vocabulary' ? '漢字・読み・意味で探す' : '文型・意味で探す'} aria-label="検索"/>
      {query && <button onClick={() => setQuery('')} aria-label="検索を消す"><X size={16}/></button>}
    </label>

    <div className="study-controls">
      <div className="segmented" role="tablist">
        {(['vocabulary', 'grammar'] as Tab[]).map(value => <button key={value} role="tab" aria-selected={tab === value} className={tab === value ? 'is-on' : ''} onClick={() => setTab(value)}>
          {value === 'vocabulary' ? '語彙' : '文法'}<small>{summary ? (value === 'vocabulary' ? summary.vocabulary : summary.grammar).toLocaleString() : ''}</small>
        </button>)}
      </div>
      <div className="segmented is-small">
        {(['', 'N2', 'N1'] as const).map(value => <button key={value || 'all'} className={level === value ? 'is-on' : ''} onClick={() => setLevel(value)}>{value || 'すべて'}</button>)}
      </div>
      <button className={`study-filter-toggle ${filtersOpen || activeFilters ? 'is-on' : ''}`} onClick={() => setFiltersOpen(value => !value)} aria-expanded={filtersOpen}>
        <SlidersHorizontal size={15}/> 絞り込み{activeFilters > 0 && <b>{activeFilters}</b>}
      </button>
    </div>

    {filtersOpen && <div className="study-filters">
      {tab === 'vocabulary' && <div className="study-kana" aria-label="五十音">
        {GOJUON.map(item => <button key={item} className={kana === item ? 'is-on' : ''} onClick={() => setKana(kana === item ? '' : item)}>{item}</button>)}
      </div>}
      <div className="study-categories">
        {categories.map(item => <button key={item} className={category === item ? 'is-on' : ''} onClick={() => setCategory(category === item ? '' : item)}>{item}</button>)}
      </div>
      {activeFilters > 0 && <button className="text-link" onClick={() => { setKana(''); setCategory('') }}>絞り込みを外す</button>}
    </div>}

    <ul className="study-list">{entries.map(entry => <EntryRow key={entry.id} entry={entry} open={openID === entry.id} onToggle={() => setOpenID(openID === entry.id ? null : entry.id)}/>)}</ul>

    {status === 'loading' && <p className="study-status">読み込んでいます…</p>}
    {status === 'error' && <p className="study-status">語彙データベースに接続できません。少し時間をおいて、もう一度お試しください。</p>}
    {status === 'ready' && !entries.length && <p className="study-status">見つかりませんでした。言葉を短くするか、絞り込みを外してみてください。</p>}
    {hasMore && status === 'ready' && <button className="daily-button is-quiet learn-more" onClick={() => setOffset(entries.length)}>もっと見る</button>}
    <p className="study-notice">JLPT は公式の語彙・文法リストを公開していないため、N2・N1 は学習資料にもとづく目安です。語彙の中国語訳は JMdict（© EDRDG）をもとにした Tomoshi 辞書データ（© Y1Z, CC BY-SA 4.0）の機械翻訳で、人の校閲前のものを含みます。</p>
  </main>
}
