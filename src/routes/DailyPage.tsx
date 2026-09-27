import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Copy, X } from 'lucide-react'
import { AnnotatedText, type TokenSelection } from '../components/AnnotatedText'
import { WordSheet } from '../components/WordSheet'
import { advance, buildQuiz, firstSentence, pageAt, pickQuote, sentences, startingPosition, type QuizQuestion, type QuizSource } from '../daily/serial'
import { formatJapaneseDate } from '../daily/dates'
import { StreakStrip } from '../daily/StreakStrip'
import { pageText, readingMinutes, useSerialPage } from '../daily/useSerialPage'
import { entryForToken, entryWord, type LearningIndex } from '../learning'
import { trackEvent } from '../operations'
import { addCard, useApp, useReadingTimer } from '../state/context'
import { japanDate, Rating, reviewCard, streakSummary, type ReaderState, type SerialPosition } from '../state/store'

type Phase = 'read' | 'quiz' | 'done'
type Outcome = { correct: number; total: number; quote: string | null; nextLine: string | null; finishedTitle: string | null }

function quizSources(paragraphs: ReturnType<typeof pageText>, learning: LearningIndex): QuizSource[] {
  const vocabulary = new Map(learning.vocabulary.map(entry => [entry.id, entry]))
  const grammar = new Map(learning.grammar.map(entry => [entry.id, entry]))
  return paragraphs.flatMap(paragraph => {
    const text = paragraph.tokens.map(token => token.text).join('')
    return paragraph.tokens.flatMap(token => {
      const selected = entryForToken(token, vocabulary, grammar)
      if (!selected) return []
      const context = sentences(text).find(sentence => sentence.includes(token.text)) || text
      return [{ id: `${selected.kind}:${selected.entry.id}`, surface: token.text, word: entryWord(selected), answer: selected.entry.meaning, context, level: selected.entry.level, kind: selected.kind }]
    })
  })
}

function highlight(context: string, surface: string) {
  const index = context.indexOf(surface)
  if (index < 0) return context
  return <>{context.slice(0, index)}<mark>{surface}</mark>{context.slice(index + surface.length)}</>
}

export function DailyPage() {
  const { state, setState } = useApp()
  const navigate = useNavigate()
  // The page is fixed when the flow opens, so finishing it does not swap the text.
  const [position] = useState<SerialPosition | null>(() => state.serial || startingPosition(state.finished))
  const { work, learning, page, error, retry } = useSerialPage(position, state.pace, true)
  const [phase, setPhase] = useState<Phase>('read')
  const [selection, setSelection] = useState<TokenSelection | null>(null)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<number[]>([])
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [readRatio, setReadRatio] = useState(0)
  const [copied, setCopied] = useState(false)
  const takeSeconds = useReadingTimer(seconds => setState(current => ({ ...current, readingSeconds: current.readingSeconds + seconds })))
  const today = japanDate()

  const paragraphs = useMemo(() => work && page ? pageText(work, page) : [], [work, page])
  const vocabulary = useMemo(() => new Map(learning?.vocabulary.map(entry => [entry.id, entry]) || []), [learning])
  const grammar = useMemo(() => new Map(learning?.grammar.map(entry => [entry.id, entry]) || []), [learning])
  const quiz = useMemo<QuizQuestion[]>(() => {
    if (!learning || !paragraphs.length) return []
    const seed = `${position?.workId}:${page?.ordinals[0]}`
    return buildQuiz(quizSources(paragraphs, learning), {
      vocabulary: learning.vocabulary.filter(entry => entry.articles.length).map(entry => entry.meaning),
      grammar: learning.grammar.map(entry => entry.meaning),
    }, seed)
  }, [learning, paragraphs, position, page])
  const nextPage = useMemo(() => work && page && !page.isLast ? pageAt(work.paragraphs, state.pace, page.ordinals[page.ordinals.length - 1] + 1) : null, [work, page, state.pace])
  const nextLine = useMemo(() => {
    if (!work || !nextPage) return null
    const paragraph = work.paragraphs.find(item => item.ordinal === nextPage.ordinals[0])
    return paragraph ? firstSentence(paragraph.text, 60) : null
  }, [work, nextPage])

  const started = useRef(false)
  useEffect(() => {
    if (!work || started.current) return
    started.current = true
    document.title = `${work.title} 第${page?.number || 1}頁 — 青空しおり`
    trackEvent('read_start', { workID: work.id, label: work.title, path: '/daily' })
  }, [work, page])

  useEffect(() => {
    if (phase !== 'read') return
    const update = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight
      setReadRatio(scrollable > 0 ? Math.min(1, window.scrollY / scrollable) : 1)
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [phase, paragraphs])

  const finish = (correct: number, total: number) => {
    if (!work || !page || !position) return
    const seconds = takeSeconds()
    const { position: next, finishedWork } = advance(position, page)
    const quizWords = quiz.map(question => question.surface)
    setOutcome({ correct, total, quote: pickQuote(paragraphs.map(paragraph => paragraph.text), quizWords), nextLine, finishedTitle: finishedWork ? work.title : null })
    setState(current => {
      const previous = current.days[today]
      const updated: ReaderState = {
        ...current,
        serial: next,
        finished: finishedWork && !current.finished.includes(finishedWork) ? [...current.finished, finishedWork] : current.finished,
        readingSeconds: current.readingSeconds + seconds,
        days: { ...current.days, [today]: previous
          ? { ...previous, pages: previous.pages + 1, correct: previous.correct + correct, total: previous.total + total, seconds: previous.seconds + seconds }
          : { workId: work.id, pages: 1, correct, total, seconds } },
      }
      return updated
    })
    trackEvent('page_complete', { workID: work.id, label: work.title, value: page.number, path: '/daily' })
    setPhase('done')
    window.scrollTo(0, 0)
  }

  const startQuiz = () => {
    setSelection(null)
    if (!quiz.length) { finish(0, 0); return }
    setPhase('quiz')
    window.scrollTo(0, 0)
  }

  const answer = (choice: number) => {
    if (answers.length > questionIndex) return
    const question = quiz[questionIndex]
    const correct = choice === question.answerIndex
    const nextAnswers = [...answers, choice]
    setAnswers(nextAnswers)
    setState(current => {
      const existing = current.cards[question.id]
      if (existing) return { ...current, cards: { ...current.cards, [question.id]: reviewCard(existing, correct ? Rating.Good : Rating.Again) } }
      if (correct) return current
      const [kind, entryId] = question.id.split(':') as ['vocabulary' | 'grammar', string]
      const entry = kind === 'vocabulary' ? vocabulary.get(entryId) : grammar.get(entryId)
      if (!entry) return current
      return addCard(current, { kind, entryId, word: 'term' in entry ? entry.term : entry.pattern, reading: 'term' in entry ? entry.reading : entry.formation, meaning: entry.meaning, level: entry.level, context: question.context, workId: position?.workId, ordinal: undefined })
    })
    window.setTimeout(() => {
      if (questionIndex < quiz.length - 1) setQuestionIndex(questionIndex + 1)
      else {
        const score = nextAnswers.filter((value, index) => value === quiz[index].answerIndex).length
        trackEvent('quiz_done', { workID: position?.workId, value: score, path: '/daily' })
        finish(score, quiz.length)
      }
    }, correct ? 750 : 1800)
  }

  const saveSelection = () => {
    if (!selection) return
    const { selected, context, ordinal } = selection
    setState(current => addCard(current, {
      kind: selected.kind, entryId: selected.entry.id, word: entryWord(selected),
      reading: selected.kind === 'vocabulary' ? selected.entry.reading : selected.entry.formation,
      meaning: selected.entry.meaning, level: selected.entry.level, context, workId: work?.id, ordinal,
    }))
    trackEvent('learning_open', { label: `save_${selected.kind}`, path: '/daily' })
  }

  const copyQuote = async () => {
    if (!outcome?.quote || !work) return
    const text = `${outcome.quote}\n— ${work.author}「${work.title}」\n青空しおりで毎日一頁 ${window.location.origin}`
    try { await navigator.clipboard.writeText(text); setCopied(true) } catch { setCopied(false) }
  }

  if (!position) return <main className="daily-shell daily-center"><p>本棚の十冊はすべて読み終えました。</p><Link className="daily-button is-accent" to="/articles">作品を探す</Link></main>
  if (error) return <main className="daily-shell daily-center"><p>{error}</p><button className="daily-button is-accent" onClick={retry}>もう一度読み込む</button><Link to="/">今日に戻る</Link></main>
  if (!work || !page || !learning) return <main className="daily-shell daily-center"><p className="serial-loading">頁をひらいています…</p></main>

  const streak = streakSummary(state.days, today)
  const selectedKey = selection ? `${selection.selected.kind}:${selection.selected.entry.id}` : undefined

  return <div className={`daily-shell phase-${phase}`}>
    <header className="daily-bar">
      <button className="daily-close" onClick={() => navigate('/')} aria-label="今日に戻る"><X size={20}/></button>
      <span className="daily-title">{work.title}<small>第{page.number}頁 / 全{page.total}頁</small></span>
      <span className="daily-time">{phase === 'read' ? `約${readingMinutes(page.characters)}分` : phase === 'quiz' ? `${questionIndex + 1} / ${quiz.length}` : '読了'}</span>
      {phase === 'read' && <i className="daily-progress" style={{ transform: `scaleX(${readRatio})` }} aria-hidden="true"/>}
    </header>

    {phase === 'read' && <main className="daily-reading">
      <div className="daily-heading"><span>{work.author}</span><h1>{work.title}</h1></div>
      <AnnotatedText paragraphs={paragraphs} vocabulary={vocabulary} grammar={grammar} furigana activeKey={selectedKey} onSelect={selection => { setSelection(selection); trackEvent('learning_open', { label: selection.selected.kind, path: '/daily' }) }}/>
      <div className="daily-cliff">
        {nextLine ? <><span>今日はここまで。つづきは明日。</span><p>{nextLine}</p></> : <><span>この頁で最後です。</span><p>「{work.title}」を読み終えると、本棚に一冊並びます。</p></>}
      </div>
      <button className="daily-button is-accent daily-finish" onClick={startQuiz}>{quiz.length ? `読みおわった · ${quiz.length}語を確かめる` : '読みおわった'} <ArrowRight size={17}/></button>
      <p className="daily-hint">下線の言葉をタップすると、意味と原文の一文が出ます。</p>
      <p className="daily-source">出典：<a href={work.sourceUrl} target="_blank" rel="noreferrer">青空文庫「{work.title}」</a></p>
      {selection && <WordSheet selected={selection.selected} context={selection.context} saved={Boolean(state.cards[`${selection.selected.kind}:${selection.selected.entry.id}`])} onSave={saveSelection} onClose={() => setSelection(null)}/>}
    </main>}

    {phase === 'quiz' && quiz[questionIndex] && <main className="daily-quiz">
      <ol className="quiz-steps" aria-hidden="true">{quiz.map((_, index) => <li key={index} className={index <= questionIndex ? 'is-on' : ''}/>)}</ol>
      <p className="quiz-sentence">{highlight(quiz[questionIndex].context, quiz[questionIndex].surface)}</p>
      <p className="quiz-ask">{quiz[questionIndex].kind === 'grammar' ? '下線の表現のはたらきは？' : '下線の言葉の意味は？'}<span>{quiz[questionIndex].level}</span></p>
      <div className="daily-options">{quiz[questionIndex].options.map((option, index) => {
        const answered = answers.length > questionIndex
        const tone = !answered ? '' : index === quiz[questionIndex].answerIndex ? 'is-right' : index === answers[questionIndex] ? 'is-wrong' : 'is-dim'
        return <button key={option} className={tone} disabled={answered} onClick={() => answer(index)}>{option}</button>
      })}</div>
      <p className="quiz-feedback" role="status">{answers.length > questionIndex && (answers[questionIndex] === quiz[questionIndex].answerIndex ? '正解。' : `正解は「${quiz[questionIndex].options[quiz[questionIndex].answerIndex]}」。「${quiz[questionIndex].word}」を単語帳に入れました。`)}</p>
    </main>}

    {phase === 'done' && outcome && <main className="daily-done">
      <div className="seal" aria-hidden="true"><span>読了</span><small>{formatJapaneseDate(today).replace(/（.）/, '')}</small></div>
      <h1>{streak.total}日目の栞</h1>
      <p className="done-sub">{outcome.total ? `${outcome.total}語のうち ${outcome.correct}語正解` : '今日の頁を読みました'}{streak.current > 1 && ` · 連続 ${streak.current} 日`}</p>
      <StreakStrip days={state.days} today={today}/>
      {outcome.finishedTitle && <p className="done-shelf">「{outcome.finishedTitle}」を読み終えました。<Link to="/shelf">本棚を見る</Link></p>}
      {outcome.quote && <figure className="quote-card"><blockquote>{outcome.quote}</blockquote><figcaption>{work.author}「{work.title}」 · 第{page.number}頁</figcaption></figure>}
      {outcome.quote && <button className="daily-button is-quiet" onClick={() => void copyQuote()}><Copy size={16}/> {copied ? 'コピーしました' : 'この一文をコピーして送る'}</button>}
      {outcome.nextLine && <div className="done-tomorrow"><span>明日の一行目</span><p>{outcome.nextLine}</p></div>}
      <div className="done-actions">
        <Link className="daily-button is-accent" to="/">今日を閉じる</Link>
        {state.serial && <button className="daily-button is-quiet" onClick={() => navigate('/daily', { replace: true, state: { again: Date.now() } })}>もう一頁だけ読む</button>}
      </div>
    </main>}
  </div>
}
