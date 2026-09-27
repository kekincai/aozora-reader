import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookMarked, BookOpenText, Check, Search, X } from 'lucide-react'
import { searchWorks, type WorkSearch, type WorkSummary } from '../catalog'
import { Pagination } from '../components/Pagination'
import { PACE_CHARACTERS } from '../daily/serial'
import { trackEvent } from '../operations'
import { startSerial, useApp } from '../state/context'

const PAGE_SIZE = 30
const LEVELS = ['', 'N2', 'N2+', 'N1', 'N1+'] as const
const LENGTHS = [['', 'すべて'], ['2500', '〜10分'], ['7000', '〜30分'], ['14000', '〜1時間']] as const
const KINDS = ['', '小説', '童話・児童', '随筆'] as const
const SORTS = [['easiest', 'やさしい順'], ['shortest', '短い順'], ['title', '五十音順'], ['newest', '新着順']] as const

function Chips<T extends string>({ label, options, value, onChange }: { label: string; options: readonly (readonly [T, string])[]; value: T; onChange: (value: T) => void }) {
  return <div className="catalog-chips" role="group" aria-label={label}>
    <span>{label}</span>
    {options.map(([option, text]) => <button key={option || 'all'} className={value === option ? 'is-on' : ''} aria-pressed={value === option} onClick={() => onChange(option)}>{text}</button>)}
  </div>
}

export function ArticlesPage() {
  const { state, setState } = useApp()
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState<typeof LEVELS[number]>('')
  const [length, setLength] = useState<typeof LENGTHS[number][0]>('')
  const [kind, setKind] = useState<typeof KINDS[number]>('')
  const [sort, setSort] = useState<NonNullable<WorkSearch['sort']>>('easiest')
  const [works, setWorks] = useState<WorkSummary[]>([])
  const [offset, setOffset] = useState(0)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => { setOffset(0) }, [query, level, length, kind, sort])
  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => {
      setLoading(true)
      void searchWorks({ query, level, kind, maxCharacters: length ? Number(length) : undefined, sort, offset, limit: PAGE_SIZE })
        .then(result => {
          if (!active) return
          setWorks(result.works); setTotal(result.page.total); setMessage('')
          if (query.trim()) trackEvent('search', { value: result.works.length, path: '/articles' })
        })
        .catch(() => { if (active) setMessage('作品データベースに接続できません。しばらくしてからもう一度お試しください。') })
        .finally(() => { if (active) setLoading(false) })
    }, query ? 250 : 0)
    return () => { active = false; window.clearTimeout(timer) }
  }, [query, level, length, kind, sort, offset])

  const days = (characters = 0) => Math.max(1, Math.round(characters / (PACE_CHARACTERS[state.pace] * 1.3)))
  return <main className="page-frame catalog-page">
    <header className="page-head">
      <span className="page-kicker">作品を探す</span>
      <h1>青空文庫から、次の一冊を</h1>
      <p>やさしい順に並べています。気に入った作品は、そのまま毎日の連載にできます。</p>
    </header>

    <label className="study-search"><Search size={18}/>
      <input value={query} onChange={event => setQuery(event.target.value)} placeholder="題名・作者・読みで探す" aria-label="作品を検索"/>
      {query && <button onClick={() => setQuery('')} aria-label="検索を消す"><X size={16}/></button>}
    </label>

    <div className="catalog-filters">
      <Chips label="レベル" options={LEVELS.map(value => [value, value || 'すべて'] as const)} value={level} onChange={setLevel}/>
      <Chips label="長さ" options={LENGTHS} value={length} onChange={setLength}/>
      <Chips label="種類" options={KINDS.map(value => [value, value || 'すべて'] as const)} value={kind} onChange={setKind}/>
      <Chips label="並び" options={SORTS} value={sort} onChange={setSort}/>
    </div>

    <p className="catalog-count" aria-live="polite">{loading ? '探しています…' : `${total.toLocaleString()}作品`}</p>
    {message && <p className="study-status">{message}</p>}

    <ul className="catalog-list">{works.map(work => {
      const reading = state.serial?.workId === work.id
      return <li key={work.id} className="catalog-row">
        <Link className="catalog-main" to={`/read/${work.id}`}>
          <strong>{work.title}</strong>
          <span className="catalog-author">{work.author}</span>
          <span className="catalog-meta">
            {work.level !== '未分類' && <span className={`level-chip ${work.level.startsWith('N1') ? 'n1' : ''}`}>{work.level}</span>}
            <span>{work.genre}</span>
            <span>{(work.characterCount || 0).toLocaleString()}字 · 一日{state.pace}分で約{days(work.characterCount)}日</span>
          </span>
        </Link>
        <div className="catalog-actions">
          <Link className="catalog-read" to={`/read/${work.id}`} aria-label={`${work.title}を読む`}><BookOpenText size={16}/><span>読む</span></Link>
          {work.serialOk && (reading
            ? <span className="catalog-serial is-on"><Check size={15}/>連載中</span>
            : <button className="catalog-serial" onClick={() => setState(current => startSerial(current, work))}><BookMarked size={15}/>連載にする</button>)}
        </div>
      </li>
    })}</ul>

    {!loading && !works.length && !message && <p className="study-status">見つかりませんでした。条件をゆるめてみてください。</p>}
    <Pagination page={Math.floor(offset / PAGE_SIZE) + 1} totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))} totalItems={total} label="作品一覧のページ" onPageChange={page => { setOffset((page - 1) * PAGE_SIZE); window.scrollTo({ top: 0, behavior: 'smooth' }) }}/>
  </main>
}
