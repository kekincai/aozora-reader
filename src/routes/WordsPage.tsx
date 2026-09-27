import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BookOpenText, Search } from 'lucide-react'
import { trackEvent } from '../operations'
import { useApp } from '../state/context'
import { dueCards, dueInDays, isLearned, Rating, reviewCard, type WordCard } from '../state/store'

function dueLabel(card: WordCard) {
  const days = dueInDays(card)
  if (days <= 0) return { text: '今日', due: true }
  return { text: days === 1 ? '明日' : `${days}日後`, due: false }
}

function sourceLink(card: WordCard) {
  if (!card.workId) return null
  return card.ordinal ? `/read/${card.workId}?view=reader&paragraph=${card.ordinal}&text=${encodeURIComponent(card.word.slice(0, 40))}` : `/read/${card.workId}`
}

export function WordsPage() {
  const { state } = useApp()
  const [filter, setFilter] = useState<'all' | 'due' | 'learned'>('all')
  const cards = useMemo(() => Object.values(state.cards).sort((a, b) => a.srs.due.localeCompare(b.srs.due)), [state.cards])
  const due = dueCards(state)
  const visible = cards.filter(card => filter === 'all' || (filter === 'due' ? dueLabel(card).due : isLearned(card)))
  return <main className="words-page page-frame">
    <header className="page-head">
      <span className="page-kicker">単語帳</span>
      <h1>読んで出会った言葉</h1>
      <p>頁で拾った言葉と、確かめで間違えた言葉が入ります。忘れかけたころに復習へ戻ってきます。</p>
    </header>
    <div className="words-layout">
      <section>
        {due.length > 0
          ? <Link className="daily-button is-accent words-review" to="/review">今日の復習 · {due.length}枚 <ArrowRight size={17}/></Link>
          : cards.length > 0 && <p className="words-clear">今日の復習は終わりました。次は{dueLabel(cards[0]).text}です。</p>}
        {cards.length > 0 && <div className="segmented" role="tablist">
          {([['all', `すべて ${cards.length}`], ['due', `今日 ${due.length}`], ['learned', `覚えた ${cards.filter(isLearned).length}`]] as const).map(([key, label]) =>
            <button key={key} role="tab" aria-selected={filter === key} className={filter === key ? 'is-on' : ''} onClick={() => setFilter(key)}>{label}</button>)}
        </div>}
        {cards.length === 0 && <div className="empty-note"><BookOpenText size={22}/><p>まだ言葉はありません。今日の一頁で下線の言葉をタップして「単語帳に入れる」を押すと、ここに並びます。</p><Link className="daily-button is-accent" to="/daily">今日の一頁をひらく</Link></div>}
        <ul className="word-list">{visible.map(card => {
          const label = dueLabel(card)
          const link = sourceLink(card)
          return <li key={card.key}>
            <div className="word-list-main"><strong>{card.word}</strong>{card.reading && card.reading !== card.word && <small>{card.reading}</small>}<span className={`level-chip ${card.level.toLowerCase()}`}>{card.level}</span></div>
            <p className="word-list-meaning">{card.meaning}</p>
            {card.context && <p className="word-list-context">{link ? <Link to={link}>{card.context}</Link> : card.context}</p>}
            <span className={`word-list-due ${label.due ? 'is-due' : ''}`}>{isLearned(card) ? '覚えた' : label.text}</span>
          </li>
        })}</ul>
      </section>
      <aside className="words-side">
        <Link className="today-tile" to="/learn"><Search size={18}/><div><strong>語彙・文法の索引</strong><span>N2・N1 の5,311語と434文法から探す</span></div><ArrowRight size={16}/></Link>
        <Link className="today-tile" to="/topics"><BookOpenText size={18}/><div><strong>特集</strong><span>一つの文法を原文で深く読む</span></div><ArrowRight size={16}/></Link>
      </aside>
    </div>
  </main>
}

const GRADES = [
  { rating: Rating.Again, label: 'もう一度' },
  { rating: Rating.Hard, label: 'むずかしい' },
  { rating: Rating.Good, label: 'わかった' },
  { rating: Rating.Easy, label: 'かんたん' },
] as const

export function ReviewPage() {
  const { state, setState } = useApp()
  // Freeze the queue at the start so rated cards do not reshuffle mid-session.
  const [queue] = useState(() => dueCards(state).map(card => card.key))
  const [index, setIndex] = useState(0)
  const [show, setShow] = useState(false)
  const card = state.cards[queue[index]]
  const rate = (rating: typeof GRADES[number]['rating']) => {
    setState(current => ({ ...current, cards: { ...current.cards, [card.key]: reviewCard(current.cards[card.key], rating) } }))
    trackEvent('review_complete', { value: index + 1, path: '/review' })
    setShow(false)
    setIndex(index + 1)
  }
  const highlighted = card?.context && card.context.includes(card.word)
    ? <>{card.context.slice(0, card.context.indexOf(card.word))}<mark>{card.word}</mark>{card.context.slice(card.context.indexOf(card.word) + card.word.length)}</>
    : card?.context
  return <main className="review-page page-frame">
    <header className="page-head is-center"><span className="page-kicker">復習</span><h1>{card ? '忘れる少し前に、もう一度' : queue.length ? `${queue.length}枚、おわりました` : '今日の復習はありません'}</h1></header>
    {card ? <section className="flash-card">
      <span className="flash-count">{index + 1} / {queue.length}</span>
      <h2>{card.word}</h2>
      {card.context && <p className="flash-context">{highlighted}</p>}
      {show ? <>
        <div className="flash-answer">{card.reading && card.reading !== card.word && <p className="flash-reading">{card.reading}</p>}<p>{card.meaning}</p></div>
        <div className="flash-grades">{GRADES.map(grade => <button key={grade.label} onClick={() => rate(grade.rating)}>{grade.label}</button>)}</div>
      </> : <button className="daily-button is-accent" onClick={() => setShow(true)}>答えを見る</button>}
    </section> : <section className="empty-note is-center"><p>{queue.length ? '次の復習は単語帳で確認できます。' : '単語帳に入れた言葉は、忘れかけたころにここへ戻ってきます。'}</p><div className="done-actions"><Link className="daily-button is-accent" to="/">今日に戻る</Link><Link className="daily-button is-quiet" to="/words">単語帳を見る</Link></div></section>}
  </main>
}
