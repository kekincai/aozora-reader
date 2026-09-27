import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Clock3, Search } from 'lucide-react'
import { searchWorks, type WorkSummary } from '../catalog'
import { Pagination } from '../components/Pagination'
import { trackEvent } from '../operations'

export function ArticlesPage() {
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState('')
  const [genre, setGenre] = useState('')
  const [length, setLength] = useState('20000')
  const [sort, setSort] = useState<'shortest'|'title'|'newest'>('shortest')
  const [works, setWorks] = useState<WorkSummary[]>([])
  const [offset, setOffset] = useState(0)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true)
      void searchWorks({ query, level, genre, maxCharacters: Number(length), sort, offset, limit: 30 })
        .then(result => { setWorks(result.works); setTotal(result.page.total); setMessage(''); if (query.trim()) trackEvent('search', { value: result.works.length, path: '/articles' }) })
        .catch(() => setMessage('作品数据库に接続できません。しばらくしてからもう一度お試しください。'))
        .finally(() => setLoading(false))
    }, query ? 250 : 0)
    return () => window.clearTimeout(timer)
  }, [query, level, genre, length, sort, offset])
  const changeFilter = (action: () => void) => { setOffset(0); action() }
  const currentPage = Math.floor(offset / 30) + 1
  const totalPages = Math.max(1, Math.ceil(total / 30))
  return <main className="articles-page">
    <section className="catalog-intro"><span className="kicker">AOZORA CATALOG</span><h1>文章を探す</h1><p>青空文庫の公開作品を、題名・作者・長さ・学習レベルから探せます。</p></section>
    <section className="article-search-panel">
      <label className="article-query"><Search size={19}/><input value={query} onChange={event => changeFilter(() => setQuery(event.target.value))} placeholder="題名・作者・読みで検索"/></label>
      <div className="article-filters"><label><span>難易度</span><select value={level} onChange={event => changeFilter(() => setLevel(event.target.value))}><option value="">すべて</option><option>N2</option><option value="N2+">N2→N1</option><option>N1</option><option value="N1+">N1以上</option></select></label><label><span>種類</span><select value={genre} onChange={event => changeFilter(() => setGenre(event.target.value))}><option value="">すべて</option><option>短篇</option><option>童話</option><option>随筆</option><option>幻想</option></select></label><label><span>長さ</span><select value={length} onChange={event => changeFilter(() => setLength(event.target.value))}><option value="5000">約10分以内</option><option value="10000">約20分以内</option><option value="20000">短め</option><option value="2000000">制限なし</option></select></label><label><span>並び順</span><select value={sort} onChange={event => changeFilter(() => setSort(event.target.value as typeof sort))}><option value="shortest">短い順</option><option value="title">五十音順</option><option value="newest">更新順</option></select></label></div>
      <div className="catalog-result-meta"><strong>{total ? `${offset + 1}–${offset + works.length}` : '0'} 件目</strong><span>{total.toLocaleString()}作品から検索</span></div>
      <div className="work-list">{works.map((work, index) => <Link className="work-row" to={`/read/${work.id}`} key={work.id}><span className="work-index">{String(offset + index + 1).padStart(2,'0')}</span><div className="work-main"><div className="work-tags"><span>{work.level}</span><span>{work.genre}</span></div><h3>{work.title}</h3><p>{work.author}</p></div><p className="work-summary">{work.summary || `${work.characterCount?.toLocaleString() || '—'}字の青空文庫作品`}</p><span className="work-time"><Clock3 size={15}/>{work.minutes}分</span><ChevronRight className="row-arrow" size={19}/></Link>)}</div>
      {loading && <div className="loading">作品を探しています…</div>}{message && <p className="catalog-error">{message}</p>}
      <Pagination page={currentPage} totalPages={totalPages} totalItems={total} label="文章检索分页" onPageChange={page => { setOffset((page - 1) * 30); window.scrollTo({ top: 250, behavior: 'smooth' }) }}/>
    </section>
  </main>
}
