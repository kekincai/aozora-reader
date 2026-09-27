import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, BookOpenText, Check, ChevronRight, LocateFixed, RotateCcw, X } from 'lucide-react'
import { loadWork, readingForToken, type AnnotatedToken, type ReaderWork as Work } from '../catalog'
import { EntryArticles } from '../components/EntryArticles'
import { entryWord, type SelectedEntry } from '../learning'
import { trackEvent } from '../operations'
import { findTopicFocusRange, parseReaderTarget } from '../reader-links'
import { addCard, useApp, useReadingTimer } from '../state/context'

export function ReaderPage() {
  const { state, setState } = useApp()
  const { id = '637' } = useParams(); const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const targetParagraph = parseReaderTarget(searchParams.get('paragraph'))
  const focusForm = searchParams.get('focus') || ''
  const focusText = (searchParams.get('text') || '').slice(0, 40)
  const [work, setWork] = useState<Work | null>(null)
  const [furigana, setFurigana] = useState(true); const [full, setFull] = useState(Boolean(targetParagraph)); const [selected, setSelected] = useState<SelectedEntry | null>(null)
  const [levels, setLevels] = useState({N2:true, N1:true}); const [showGrammar, setShowGrammar] = useState(true)
  const [loadError, setLoadError] = useState('')
  useEffect(() => {
    setWork(null)
    setFull(Boolean(targetParagraph))
    setLoadError('')
    loadWork(id, targetParagraph).then(setWork).catch(cause => setLoadError(cause instanceof Error ? cause.message : '作品を読み込めませんでした。'))
    window.scrollTo(0,0)
  }, [id, targetParagraph])
  useEffect(() => {
    if (!work || !targetParagraph) return
    const frame = window.requestAnimationFrame(() => (document.getElementById('topic-focus') || document.getElementById(`paragraph-${targetParagraph}`))?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    return () => window.cancelAnimationFrame(frame)
  }, [work, targetParagraph, focusText])
  const trackedWork = useRef('')
  useEffect(() => { if (work) { document.title = `${work.title} — 青空しおり`; if (trackedWork.current !== id) { trackedWork.current = id; trackEvent('read_start', { workID:id, label:work.title, path:`/read/${id}` }) } } }, [work, id, setState])
  useReadingTimer(seconds => setState(current => ({ ...current, readingSeconds: current.readingSeconds + seconds })))
  const vocabMap = useMemo(() => new Map(work?.entries.vocabulary.map(entry => [entry.id, entry]) || []), [work])
  const grammarMap = useMemo(() => new Map(work?.entries.grammar.map(entry => [entry.id, entry]) || []), [work])
  const saveWord = () => {
    if (!selected) return
    setState(current => addCard(current, {
      kind: selected.kind, entryId: selected.entry.id, word: entryWord(selected),
      reading: selected.kind === 'vocabulary' ? selected.entry.reading : selected.entry.formation,
      meaning: selected.entry.meaning, level: selected.entry.level, workId: id,
    }))
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
  const shownCharacters = useMemo(() => visibleParagraphs.reduce((sum, paragraph) => sum + paragraph.reduce((size, token) => size + token.text.length, 0), 0), [visibleParagraphs])
  useEffect(() => {
    if (!work || !shownCharacters) return
    // Percent of the whole work read: how far down the shown text, scaled by how much of the work is shown.
    const share = Math.min(1, shownCharacters / Math.max(shownCharacters, work.characterCount || shownCharacters))
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const box = document.querySelector('.reading-text')?.getBoundingClientRect()
        if (!box) return
        const ratio = Math.min(1, Math.max(0, (window.innerHeight - box.top) / Math.max(1, box.height)))
        const percent = Math.round(ratio * share * 100)
        setState(current => percent > (current.progress[id] || 0) ? { ...current, progress: { ...current.progress, [id]: percent } } : current)
      })
    }
    window.addEventListener('scroll', update, { passive: true })
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', update) }
  }, [work, id, shownCharacters, setState])
  if (loadError) return <main className="daily-shell daily-center"><p>{loadError}</p><Link className="daily-button is-accent" to="/shelf">本棚へ戻る</Link></main>
  if (!work) return <div className="reader-loading">本文を分析しています…</div>
  const openToken = (token: AnnotatedToken) => {
    const vocab = token.vocabId ? vocabMap.get(token.vocabId) : undefined
    const grammar = token.grammarIds?.map(key => grammarMap.get(key)).find(Boolean)
    if (vocab && levels[vocab.level]) { setSelected({kind:'vocabulary', entry:vocab}); trackEvent('learning_open', { label:'vocabulary' }) }
    else if (grammar && showGrammar && levels[grammar.level]) { setSelected({kind:'grammar', entry:grammar}); trackEvent('learning_open', { label:'grammar' }) }
  }
  return <div className={`reader-page ${furigana ? '' : 'hide-ruby'}`}>
    <header className="reader-header"><button className="reader-back" onClick={() => navigate(-1)}><ArrowLeft size={19}/><span>戻る</span></button><div className="reader-title"><strong>{work.title}</strong><span>{state.progress[id] || 0}%</span></div><div className="reader-progress"><i style={{width: `${state.progress[id] || 0}%`}}/></div><Link className="icon-button" to="/" aria-label="今日の一頁へ"><BookOpenText size={18}/></Link></header>
    <div className="reader-controls"><button className={furigana ? 'active ruby-control' : ''} onClick={() => setFurigana(!furigana)}>ふりがな</button><button className={levels.N2 ? 'active n2-control' : ''} onClick={() => setLevels(value => ({...value,N2:!value.N2}))}>N2 語彙</button><button className={levels.N1 ? 'active n1-control' : ''} onClick={() => setLevels(value => ({...value,N1:!value.N1}))}>N1 語彙</button><button className={showGrammar ? 'active grammar-control' : ''} onClick={() => setShowGrammar(!showGrammar)}>N2・N1 文法</button></div>
    <main className="reader-layout"><section className="reading-wrap"><div className="reading-meta"><span>{work.genre}</span><h1>{work.title}</h1><p>{work.author}</p></div>
      {targetParagraph && <div className="reader-deep-link-note"><LocateFixed size={15}/><span>{focusForm ? '特集で選んだ用例まで移動しました' : '選んだ言葉が出てくる段落です'}</span></div>}
      <article className="reading-text">{visibleParagraphs.map((paragraph, paragraphIndex) => {
        const ordinal = work.paragraphOrdinals?.[paragraphIndex] || paragraphIndex + 1
        const isTarget = ordinal === targetParagraph
        const focusRange = isTarget ? findTopicFocusRange(paragraph.map(token => token.text).join(''), focusText) : null
        let tokenOffset = 0
        let focusAnchorAssigned = false
        return <p id={`paragraph-${ordinal}`} className={isTarget ? 'target-paragraph' : undefined} data-focus={isTarget ? focusForm : undefined} key={ordinal}>{paragraph.map((token, tokenIndex) => {
        const tokenStart = tokenOffset
        tokenOffset += token.text.length
        const isFocusedToken = Boolean(focusRange && tokenStart < focusRange.end && tokenOffset > focusRange.start)
        const focusID = isFocusedToken && !focusAnchorAssigned ? 'topic-focus' : undefined
        if (focusID) focusAnchorAssigned = true
        const vocab = token.vocabId ? vocabMap.get(token.vocabId) : undefined
        const grammar = token.grammarIds?.map(key => grammarMap.get(key)).find(Boolean)
        const vocabVisible = vocab && levels[vocab.level]
        const grammarVisible = grammar && showGrammar && levels[grammar.level]
        const annotationClasses = [vocabVisible ? `vocab-${vocab.level.toLowerCase()}` : '', grammarVisible ? `grammar-token grammar-${grammar.level.toLowerCase()}` : ''].filter(Boolean)
        const learningClassName = annotationClasses.length ? `learning-token ${annotationClasses.join(' ')}` : ''
        const className = [learningClassName, isFocusedToken ? 'topic-focus-token' : ''].filter(Boolean).join(' ')
        const reading = readingForToken(token)
        const content = reading ? <ruby>{token.text}<rt>{reading}</rt></ruby> : token.text
        return learningClassName ? <button type="button" id={focusID} className={className} key={tokenIndex} onClick={() => openToken(token)}>{content}</button> : <span id={focusID} className={className || undefined} key={tokenIndex}>{content}</span>
      })}{isTarget && <span className="target-paragraph-label"><LocateFixed size={12}/> {focusForm ? '特集の用例' : 'ここに出てきます'}</span>}</p>})}</article>
      <div className="reading-actions"><button className="secondary-button" onClick={() => setFull(!full)}>{full ? '短い表示に戻る' : work.annotatedParagraphs.length < work.paragraphCount ? '収録範囲をすべて表示' : '全文を表示'}</button><a href={work.sourceUrl} target="_blank" rel="noreferrer">青空文庫の原文を見る</a></div>
      <p className="attribution">出典：{work.attribution} · 表記は底本に準拠</p>
    </section><aside className="chapter-learning"><span>この章の学び</span><div><strong>{work.learning?.vocabularyUnique || 0}</strong><small>N2・N1 語彙</small></div><div><strong>{work.learning?.grammarUnique || 0}</strong><small>N2・N1 文法</small></div><Link to="/learn">一覧から探す <ChevronRight size={14}/></Link></aside></main>
    <Link className="mobile-learning-bar" to="/learn"><span>この章：{work.learning?.vocabularyUnique || 0}語彙・{work.learning?.grammarUnique || 0}文法</span><strong>一覧 <ChevronRight size={14}/></strong></Link>
    {selected && <div className="sheet-scrim" onClick={() => setSelected(null)}><section className="word-sheet" onClick={e => e.stopPropagation()}><button className="sheet-close" onClick={() => setSelected(null)} aria-label="閉じる"><X size={20}/></button><div className="sheet-handle"/><div className="word-heading"><div><h2>{selected.kind === 'vocabulary' ? selected.entry.term : selected.entry.pattern}</h2><p>{selected.kind === 'vocabulary' ? `[ ${selected.entry.reading} ]` : selected.entry.formation}</p></div><span>{selected.entry.level} · {selected.kind === 'vocabulary' ? '語彙' : selected.entry.category}</span></div><p className="meaning">{selected.entry.meaning}</p>{selected.kind === 'grammar' && selected.entry.examples[0] && <p className="usage">{selected.entry.examples[0].jp}{selected.entry.examples[0].zh && <><br/><small>{selected.entry.examples[0].zh}</small></>}</p>}<EntryArticles selected={selected} className="appears-in" label="この表現がある作品"/><div className="sheet-actions"><button className="primary-button" onClick={saveWord}>{state.cards[`${selected.kind}:${selected.entry.id}`] ? <><Check size={17}/> 単語帳に入れました</> : <><RotateCcw size={17}/> 単語帳に入れる</>}</button></div></section></div>}
  </div>
}
