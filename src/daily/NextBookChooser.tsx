import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BookOpenText } from 'lucide-react'
import { loadSerialCandidates, type SerialCandidate } from '../catalog'
import { startSerial, useApp } from '../state/context'
import { PACE_CHARACTERS } from './serial'

/** Three next books near the reader's level; choosing one makes it the daily serial. */
export function NextBookChooser({ after, title = '次の一冊を選ぶ', note }: { after: string | null; title?: string; note?: string }) {
  const { state, setState } = useApp()
  const [works, setWorks] = useState<SerialCandidate[] | null>(null)
  const [error, setError] = useState(false)
  const exclude = [...state.finished, ...(state.serial ? [state.serial.workId] : [])]
  const excludeKey = exclude.join(',')
  useEffect(() => {
    let active = true
    setError(false)
    loadSerialCandidates(after, excludeKey ? excludeKey.split(',') : [])
      .then(result => { if (active) setWorks(result) })
      .catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [after, excludeKey])
  const choose = (work: SerialCandidate) => setState(current => startSerial(current, work))
  return <section className="next-books">
    <h2>{title}</h2>
    {note && <p className="next-books-note">{note}</p>}
    {error && <p className="next-books-note">候補を読み込めませんでした。少し時間をおいて、もう一度お試しください。</p>}
    {!works && !error && <p className="next-books-note">あなたに合う本を探しています…</p>}
    <div className="next-books-list">{works?.map(work => {
      // Pages close at the end of a paragraph past the budget, so a page holds about 1.3 budgets.
      const days = Math.max(1, Math.round((work.characterCount || 0) / (PACE_CHARACTERS[state.pace] * 1.3)))
      return <article key={work.id} className="next-book">
        <span className={`level-chip ${work.level === 'N1' || work.level === 'N1+' ? 'n1' : ''}`}>{work.level}</span>
        <h3>{work.title}</h3>
        <p className="next-book-author">{work.author}</p>
        <p className="next-book-meta">{work.genre} · 一日{state.pace}分で約{days}日</p>
        <div className="next-book-actions">
          <button className="daily-button is-accent" onClick={() => choose(work)}><BookOpenText size={16}/> この本を連載にする</button>
          <Link to={`/read/${work.id}`} className="next-book-peek">試し読み <ArrowRight size={14}/></Link>
        </div>
      </article>
    })}</div>
  </section>
}
