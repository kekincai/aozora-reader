import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ListFilter, Search } from 'lucide-react'
import { loadLearningSummary, type GrammarEntry, type LearningSummary, type VocabularyEntry } from '../learning'

const PAGE_SIZE = 120
const NOTICE = 'JLPT公式は完全な語彙・文法リストを公開していません。N1/N2は公開学習資料に基づく参考分類です。'
type Entry = VocabularyEntry | GrammarEntry

export function LearnPage() {
  const [summary, setSummary] = useState<LearningSummary | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [offset, setOffset] = useState(0)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [tab, setTab] = useState<'vocabulary'|'grammar'>('vocabulary')
  const [query, setQuery] = useState(''); const [level, setLevel] = useState<'すべて'|'N2'|'N1'>('すべて')
  const [kana, setKana] = useState('すべて'); const [category, setCategory] = useState('すべて'); const [vocabCategory, setVocabCategory] = useState('すべて'); const [corpusOnly, setCorpusOnly] = useState(true)
  useEffect(() => { void loadLearningSummary().then(setSummary).catch(() => setSummary(null)) }, [])
  // Any filter change starts again from the first page.
  useEffect(() => { setOffset(0) }, [tab, query, level, kana, category, vocabCategory, corpusOnly])
  useEffect(() => {
    let active = true
    setStatus('loading')
    const timer = window.setTimeout(() => {
      const url = new URL(`/api/learning/${tab}`, window.location.origin)
      if (query.trim()) url.searchParams.set('q', query.trim())
      if (level !== 'すべて') url.searchParams.set('level', level)
      if (tab === 'vocabulary' && kana !== 'すべて') url.searchParams.set('kana', kana)
      const selectedCategory = tab === 'vocabulary' ? vocabCategory : category
      if (selectedCategory !== 'すべて') url.searchParams.set('category', selectedCategory)
      url.searchParams.set('corpusOnly', String(corpusOnly))
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
    }, query ? 220 : 0)
    return () => { active = false; window.clearTimeout(timer) }
  }, [tab, query, level, kana, category, vocabCategory, corpusOnly, offset])
  const categories = summary?.grammarCategories || []
  const vocabularyCategories = summary?.vocabularyCategories || []
  const gojuon = ['あ','い','う','え','お','か','き','く','け','こ','さ','し','す','せ','そ','た','ち','つ','て','と','な','に','ぬ','ね','の','は','ひ','ふ','へ','ほ','ま','み','む','め','も','や','ゆ','よ','ら','り','る','れ','ろ','わ','を','ん']
  const visibleEntries = entries
  useEffect(() => { setQuery(''); setLevel('すべて') }, [tab])
  return <main className="learn-page">
    <section className="learn-intro"><div><span className="kicker">N2 · N1 STUDY MAP</span><h1>文章から、ことばを学ぶ。</h1><p>N2を固めてからN1へ。品詞と文法の働きごとに進み、実際の作品で使い方を確かめます。</p></div><div className="learn-totals"><strong>{summary ? summary.vocabulary.toLocaleString() : '—'}<small>語彙</small></strong><strong>{summary ? summary.grammar.toLocaleString() : '—'}<small>文法</small></strong></div></section>
    <section className="learn-workspace">
      <div className="study-path"><div><span>01</span><strong>N2 核心語彙</strong><small>名词・动词・形容词</small></div><div><span>02</span><strong>N2 文法機能</strong><small>条件・原因・对比</small></div><div><span>03</span><strong>N1への橋渡し</strong><small>书面语・抽象表达</small></div><div><span>04</span><strong>作品で定着</strong><small>检索・阅读・复习</small></div></div>
      <div className="learn-tabs" role="tablist"><button className={tab === 'vocabulary' ? 'active' : ''} onClick={() => setTab('vocabulary')}>語彙<span>五十音順</span></button><button className={tab === 'grammar' ? 'active' : ''} onClick={() => setTab('grammar')}>文法<span>働き別</span></button></div>
      <div className="learn-search"><Search size={18}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder={tab === 'vocabulary' ? '漢字・読み・意味で検索' : '文型・意味・接続で検索'}/><label><input type="checkbox" checked={corpusOnly} onChange={event => setCorpusOnly(event.target.checked)}/> 収録作品にある項目</label></div>
      <div className="learn-filter-row"><ListFilter size={16}/><div className="level-switch">{['すべて','N2','N1'].map(item => <button key={item} className={level === item ? 'active' : ''} onClick={() => setLevel(item as typeof level)}>{item}</button>)}</div>{tab === 'vocabulary' ? <select value={vocabCategory} onChange={event => setVocabCategory(event.target.value)}><option>すべて</option>{vocabularyCategories.map(item => <option key={item}>{item}</option>)}</select> : <select value={category} onChange={event => setCategory(event.target.value)}><option>すべて</option>{categories.map(item => <option key={item}>{item}</option>)}</select>}</div>
      {tab === 'vocabulary' && <div className="gojuon-filter" aria-label="五十音索引"><button className={kana === 'すべて' ? 'active' : ''} onClick={() => setKana('すべて')}>全</button>{gojuon.map(item => <button key={item} className={kana === item ? 'active' : ''} onClick={() => setKana(item)}>{item}</button>)}<button className={kana === '他' ? 'active' : ''} onClick={() => setKana('他')}>他</button></div>}
      <div className="result-heading"><strong>{status === 'error' ? '読み込めませんでした' : `${visibleEntries.length.toLocaleString()}項目${hasMore ? '以上' : ''}`}</strong><span>JLPT参考分類 · 公式リストではありません</span></div>
      <div className="learning-list">{visibleEntries.map(entry => 'term' in entry ? <article className="learning-row" key={entry.id}><div className={`level-stamp ${entry.level.toLowerCase()}`}>{entry.level}</div><div className="entry-word"><h2>{entry.term}</h2><p>{entry.reading} · {entry.category || '其他'}</p></div><p className="entry-meaning">{entry.meaning}<small>{entry.meaningLanguage === 'en' && '英文原释义 · 中文化予定'}</small></p><div className="article-links">{entry.articles?.length ? entry.articles.slice(0,3).map(article => <Link key={article.id} to={`/read/${article.id}`}>{article.title}<span>{article.count}回</span></Link>) : <span>収録作品では未登場</span>}</div></article> : <article className="learning-row grammar-row" key={entry.id}><div className={`level-stamp ${entry.level.toLowerCase()}`}>{entry.level}</div><div className="entry-word"><h2>{entry.pattern}</h2><p>{entry.category}</p></div><div className="entry-meaning"><strong>{entry.meaning}</strong><small>{entry.formation}</small>{entry.meaningLanguage === 'en' && <small>英文原释义 · 中文化予定</small>}</div><div className="article-links">{entry.articles?.length ? entry.articles.slice(0,3).map(article => <Link key={article.id} to={`/read/${article.id}`}>{article.title}<span>{article.count}回</span></Link>) : <span>収録作品では未登場</span>}</div></article>)}</div>
      {status === 'loading' && <p className="result-limit">読み込んでいます…</p>}
      {status === 'error' && <p className="result-limit">語彙データベースに接続できません。少し時間をおいて、もう一度お試しください。</p>}
      {hasMore && status === 'ready' && <button className="daily-button is-quiet learn-more" onClick={() => setOffset(visibleEntries.length)}>さらに{PAGE_SIZE}項目を表示</button>}
      <p className="dataset-notice">{NOTICE}</p>
    </section>
  </main>
}
