import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Search, Sparkles } from 'lucide-react'
import { loadWorks, type WorkSummary } from '../catalog'
import { SERIAL_ORDER, startingPosition } from '../daily/serial'
import { useApp } from '../state/context'

const SPINE_COLORS = ['#2f5a4d', '#7d4a3a', '#8a6a2c', '#3f5670', '#5c3f5e', '#4d6b5a', '#8b3b2e', '#2f3d4e', '#5a4b33', '#39535a']

export function ShelfPage() {
  const { state } = useApp()
  const [works, setWorks] = useState<WorkSummary[]>([])
  useEffect(() => { void loadWorks().then(setWorks).catch(() => setWorks([])) }, [])
  const byId = new Map(works.map(work => [work.id, work]))
  const current = (state.serial || startingPosition(state.finished))?.workId
  const status = (id: string) => state.finished.includes(id) ? 'finished' : id === current ? 'reading' : 'next'
  return <main className="shelf-page page-frame">
    <header className="page-head">
      <span className="page-kicker">本棚</span>
      <h1>N2 から N1 への十冊</h1>
      <p>毎日の一頁は、この順番で連載されます。一冊読み終えるごとに、背表紙が棚に並びます。</p>
    </header>
    <div className="shelf" aria-label="本棚">
      {SERIAL_ORDER.map((id, index) => {
        const work = byId.get(id)
        const kind = status(id)
        return <Link key={id} to={`/read/${id}`} className={`spine is-${kind}`} style={{ '--spine': SPINE_COLORS[index], '--height': `${120 + ((work?.minutes || 10) % 7) * 7}px` } as React.CSSProperties} title={work?.title}>
          <span>{work?.title || '　'}</span>{kind === 'reading' && <i aria-label="連載中"/>}
        </Link>
      })}
    </div>
    <p className="shelf-caption">読了 {state.finished.length} 冊 · 点線はこれから並ぶ本</p>

    <ol className="serial-list">{SERIAL_ORDER.map((id, index) => {
      const work = byId.get(id)
      const kind = status(id)
      return <li key={id} className={`is-${kind}`}>
        <span className="serial-list-no">{index + 1}</span>
        <div><Link to={`/read/${id}`}><strong>{work?.title || '…'}</strong></Link><small>{work?.author} · {work?.level} · 約{work?.minutes}分</small></div>
        <span className="serial-list-state">{kind === 'finished' ? '読了' : kind === 'reading' ? '連載中' : 'これから'}</span>
      </li>
    })}</ol>

    <div className="shelf-more">
      <Link className="today-tile" to="/articles"><Search size={18}/><div><strong>17,831作品から探す</strong><span>題名・作者・長さ・レベルで絞り込み</span></div><ArrowRight size={16}/></Link>
      <Link className="today-tile" to="/topics"><Sparkles size={18}/><div><strong>特集</strong><span>授受動詞を青空文庫の原文で読む</span></div><ArrowRight size={16}/></Link>
    </div>
  </main>
}
