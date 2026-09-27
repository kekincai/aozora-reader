import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, BookMarked, BookOpenText, LoaderCircle } from 'lucide-react'
import type { WorkSummary } from '../catalog'
import { AnnotatedText, MarksLegend, type TokenSelection } from '../components/AnnotatedText'
import { WordSheet } from '../components/WordSheet'
import { PACE_CHARACTERS } from '../daily/serial'
import { entryWord, loadWorkWindow, meaningOf, type GrammarEntry, type SerialWork, type VocabularyEntry } from '../learning'
import { trackEvent } from '../operations'
import { parseReaderTarget } from '../reader-links'
import { addCard, startSerial, useApp, useReadingTimer } from '../state/context'

const WINDOW = 60

/** Back to where the reader came from inside the site, or to the shelf when opened from a link. */
function useBack() {
  const navigate = useNavigate()
  const location = useLocation()
  return () => (location.key !== 'default' ? navigate(-1) : navigate('/shelf'))
}

export function ReaderPage() {
  const { id = '637' } = useParams()
  const [searchParams] = useSearchParams()
  const target = parseReaderTarget(searchParams.get('paragraph'))
  const focusText = (searchParams.get('text') || '').slice(0, 40)
  const focusForm = searchParams.get('focus') || ''
  const { state, setState } = useApp()
  const back = useBack()

  const [work, setWork] = useState<WorkSummary & { serialOk?: boolean } | null>(null)
  const [paragraphs, setParagraphs] = useState<SerialWork['paragraphs']>([])
  const [vocabulary, setVocabulary] = useState(new Map<string, VocabularyEntry>())
  const [grammar, setGrammar] = useState(new Map<string, GrammarEntry>())
  const [nextFrom, setNextFrom] = useState<number | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [marks, setMarks] = useState(true)
  const [selection, setSelection] = useState<TokenSelection | null>(null)
  const startedAt = target ? Math.max(1, target - 20) : 1

  const addWindow = (window: Awaited<ReturnType<typeof loadWorkWindow>>, replace: boolean) => {
    setWork(window.work)
    setParagraphs(current => replace ? window.paragraphs : [...current, ...window.paragraphs])
    setVocabulary(current => new Map([...(replace ? [] : current), ...window.entries.vocabulary.map(entry => [entry.id, entry] as const)]))
    setGrammar(current => new Map([...(replace ? [] : current), ...window.entries.grammar.map(entry => [entry.id, entry] as const)]))
    setNextFrom(window.nextFrom)
  }

  useEffect(() => {
    let active = true
    setWork(null); setParagraphs([]); setError(''); setSelection(null)
    loadWorkWindow(id, startedAt, WINDOW)
      .then(window => { if (active) addWindow(window, true) })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : '作品を読み込めませんでした。') })
    window.scrollTo(0, 0)
    return () => { active = false }
  }, [id, startedAt])

  const loadMore = () => {
    if (!nextFrom || loadingMore) return
    setLoadingMore(true)
    loadWorkWindow(id, nextFrom, WINDOW).then(window => addWindow(window, false)).catch(() => setError('続きを読み込めませんでした。')).finally(() => setLoadingMore(false))
  }

  // Deep links scroll to the highlighted words once the text is on screen.
  useEffect(() => {
    if (!work || !target) return
    const frame = requestAnimationFrame(() => (document.getElementById('topic-focus') || document.getElementById(`paragraph-${target}`))?.scrollIntoView({ block: 'center' }))
    return () => cancelAnimationFrame(frame)
  }, [work, target])

  const tracked = useRef('')
  useEffect(() => {
    if (!work || tracked.current === id) return
    tracked.current = id
    document.title = `${work.title} — 青空しおり`
    trackEvent('read_start', { workID: id, label: work.title, path: `/read/${id}` })
  }, [work, id])
  useReadingTimer(seconds => setState(current => ({ ...current, readingSeconds: current.readingSeconds + seconds })))

  // Progress is the furthest paragraph that has scrolled past the middle of the screen.
  const [furthest, setFurthest] = useState(0)
  useEffect(() => {
    if (!work) return
    const observer = new IntersectionObserver(entries => {
      const passed = entries.filter(entry => entry.isIntersecting).map(entry => Number(entry.target.id.replace('paragraph-', '')))
      if (passed.length) setFurthest(current => Math.max(current, ...passed))
    }, { rootMargin: '0px 0px -50% 0px' })
    document.querySelectorAll('.daily-text p[id^="paragraph-"]').forEach(element => observer.observe(element))
    return () => observer.disconnect()
  }, [work, paragraphs])
  const percent = work?.paragraphCount ? Math.min(100, Math.round(100 * furthest / work.paragraphCount)) : 0
  useEffect(() => {
    if (percent) setState(current => percent > (current.progress[id] || 0) ? { ...current, progress: { ...current.progress, [id]: percent } } : current)
  }, [percent, id, setState])

  const days = useMemo(() => Math.max(1, Math.round((work?.characterCount || 0) / (PACE_CHARACTERS[state.pace] * 1.3))), [work, state.pace])
  const isSerial = state.serial?.workId === id
  const saved = selection ? Boolean(state.cards[`${selection.selected.kind}:${selection.selected.entry.id}`]) : false
  const save = () => {
    if (!selection) return
    const { selected, context, ordinal } = selection
    setState(current => addCard(current, {
      kind: selected.kind, entryId: selected.entry.id, word: entryWord(selected),
      reading: selected.kind === 'vocabulary' ? selected.entry.reading : selected.entry.formation,
      meaning: meaningOf(selected.entry), level: selected.entry.level, context, workId: id, ordinal,
    }))
  }

  const header = <header className="daily-bar">
    <button className="daily-close" onClick={back} aria-label="戻る"><ArrowLeft size={20}/></button>
    <span className="daily-title">{work?.title || '　'}<small>{work?.author}</small></span>
    <span className="daily-time">{percent ? `${percent}%` : ''}</span>
    <i className="daily-progress" style={{ transform: `scaleX(${percent / 100})` }} aria-hidden="true"/>
  </header>

  if (error && !work) return <div className="daily-shell">{header}<main className="daily-center"><p>{error}</p><Link className="daily-button is-accent" to="/shelf">本棚へ戻る</Link></main></div>
  if (!work) return <div className="daily-shell">{header}<main className="daily-center"><p className="serial-loading">本文をひらいています…</p></main></div>

  return <div className="daily-shell">
    {header}
    <main className="daily-reading reader-full">
      <section className="reader-intro">
        <span className="page-kicker">{work.genre}{work.level !== '未分類' && ` · ${work.level}`}</span>
        <h1>{work.title}</h1>
        <p className="reader-author">{work.author}</p>
        <p className="reader-meta">{(work.characterCount || 0).toLocaleString()}字 · 一日{state.pace}分で約{days}日</p>
        {isSerial
          ? <Link className="daily-button is-accent" to="/daily"><BookOpenText size={16}/> 今日の一頁で続きを読む</Link>
          : work.serialOk && <button className="daily-button is-quiet" onClick={() => setState(current => startSerial(current, work))}><BookMarked size={16}/> この本を毎日の連載にする</button>}
        {startedAt > 1 && <Link className="text-link reader-from-start" to={`/read/${id}`}>冒頭から読む</Link>}
      </section>

      <MarksLegend marks={marks} onToggle={() => setMarks(value => !value)}/>
      <div className={marks ? undefined : 'marks-hidden'}>
        <AnnotatedText paragraphs={paragraphs} vocabulary={vocabulary} grammar={grammar} furigana activeKey={selection ? `${selection.selected.kind}:${selection.selected.entry.id}` : undefined}
          target={target ? { ordinal: target, text: focusText, label: focusForm ? '特集の用例' : 'ここに出てきます' } : null}
          onSelect={next => { setSelection(next); trackEvent('learning_open', { label: next.selected.kind, path: `/read/${id}` }) }}/>
      </div>

      {nextFrom
        ? <button className="daily-button is-quiet reader-more" onClick={loadMore} disabled={loadingMore}>{loadingMore ? <><LoaderCircle className="spin" size={16}/> 読み込んでいます…</> : <>続きを読む <ArrowRight size={16}/></>}</button>
        : <p className="reader-end">おわり</p>}
      {error && <p className="study-status">{error}</p>}
      <p className="daily-source">出典：<a href={work.sourceUrl} target="_blank" rel="noreferrer">青空文庫「{work.title}」</a> · 表記は底本に準拠</p>

      {selection && <WordSheet selected={selection.selected} context={selection.context} saved={saved} onSave={save} onClose={() => setSelection(null)} showArticles/>}
    </main>
  </div>
}
