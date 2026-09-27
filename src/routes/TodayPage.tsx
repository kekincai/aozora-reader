import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BookMarked, RotateCcw } from 'lucide-react'
import { openingLine, SERIAL_ORDER, startingPosition, PACE_CHARACTERS } from '../daily/serial'
import { formatJapaneseDate } from '../daily/dates'
import { NextBookChooser } from '../daily/NextBookChooser'
import { ReadersToday } from '../daily/ReadersToday'
import { StreakStrip } from '../daily/StreakStrip'
import { pageText, readingMinutes, useSerialPage } from '../daily/useSerialPage'
import { useApp } from '../state/context'
import { dueCards, japanDate, streakSummary, type Pace } from '../state/store'
import { MonthCalendar } from './RecordPage'

function greeting(hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', hour: 'numeric', hourCycle: 'h23' }).format(new Date()))) {
  if (hour < 5) return '夜ふけの一頁を。'
  if (hour < 11) return 'おはようございます。'
  if (hour < 17) return 'こんにちは。'
  return 'こんばんは。'
}

export function PaceChooser({ pace, onChange }: { pace: Pace; onChange: (pace: Pace) => void }) {
  return <div className="pace-chooser" role="radiogroup" aria-label="一日の長さ">
    {([3, 5, 10] as Pace[]).map(value => <button key={value} role="radio" aria-checked={pace === value} className={pace === value ? 'is-on' : ''} onClick={() => onChange(value)}>
      <strong>{value}分</strong><small>約{PACE_CHARACTERS[value].toLocaleString()}字</small>
    </button>)}
  </div>
}

export function TodayPage() {
  const { state, setState, auth } = useApp()
  const today = japanDate()
  const record = state.days[today]
  const position = state.serial || startingPosition(state.finished)
  const { work, page, error, retry } = useSerialPage(position, state.pace)
  const due = dueCards(state).length
  const paragraphs = useMemo(() => work && page ? pageText(work, page) : [], [work, page])
  const vocabularyCount = useMemo(() => new Set(paragraphs.flatMap(paragraph => paragraph.tokens.map(token => token.vocabId).filter(Boolean))).size, [paragraphs])
  const grammarCount = useMemo(() => new Set(paragraphs.flatMap(paragraph => paragraph.tokens.flatMap(token => token.grammarIds || []))).size, [paragraphs])
  const teaser = openingLine(paragraphs.map(paragraph => paragraph.text))
  const name = auth.user?.displayName
  const isNew = Object.keys(state.days).length === 0

  return <main className="today-page">
    <section className="today-main">
      <p className="today-date">{formatJapaneseDate(today)}</p>
      <h1 className="today-hello">{record ? `おつかれさま${name ? `、${name}さん` : ''}。` : `${greeting()}${name ? ` ${name}さん` : ''}`}</h1>
      <StreakStrip days={state.days} today={today}/>

      {!position ? <NextBookChooser after={state.finished[state.finished.length - 1] || null} note="読み終えた本より少しだけ難しい本を、作者が重ならないように選んでいます。"/> : <article className="serial-card" aria-busy={!page && !error}>
        <span className="serial-kicker">{record ? `今日の一頁 · 読了（${record.pages}頁）` : '連載 · 今日の一頁'}</span>
        <h2>{work?.title || '　'}</h2>
        <p className="serial-author">{work?.author}{page && `　第${page.number}頁 / 全${page.total}頁`}</p>
        {page && <div className="serial-pages" aria-hidden="true">{Array.from({ length: page.total }, (_, index) => <span key={index} className={index + 1 < page.number ? 'is-read' : index + 1 === page.number ? 'is-next' : ''}/>)}</div>}
        {error ? <><p className="serial-teaser">{error}</p><button className="daily-button is-light" onClick={retry}>もう一度読み込む</button></>
          : !page ? <p className="serial-teaser serial-loading">頁をひらいています…</p>
          : <>
            <p className="serial-teaser">{record ? <><small>つづきは明日</small>{teaser}</> : teaser}</p>
            {!record && <div className="serial-chips"><span>約{readingMinutes(page.characters)}分</span>{vocabularyCount > 0 && <span>N2・N1 語彙 {vocabularyCount}</span>}{grammarCount > 0 && <span>文法 {grammarCount}</span>}</div>}
            <Link className="daily-button is-light" to="/daily">{record ? 'もう一頁だけ読む' : '今日の一頁をひらく'} <ArrowRight size={17}/></Link>
          </>}
      </article>}

      <ReadersToday/>

      {isNew && <section className="today-pace">
        <h2>一日の長さを選ぶ</h2>
        <p>短いほど続けやすくなります。あとから記録ページで変えられます。</p>
        <PaceChooser pace={state.pace} onChange={pace => setState(current => ({ ...current, pace }))}/>
      </section>}
    </section>

    <aside className="today-side">
      <Link className="today-tile" to={due ? '/review' : '/words'}>
        <RotateCcw size={18}/>
        <div><strong>{due ? `${due}枚` : Object.keys(state.cards).length ? 'なし' : '—'}</strong><span>{due ? `今日の復習 · 約${Math.max(1, Math.round(due / 4))}分` : Object.keys(state.cards).length ? '今日の復習は終わりました' : '読んで拾った言葉がここに並びます'}</span></div>
        <ArrowRight size={16}/>
      </Link>
      <Link className="today-tile" to="/shelf">
        <BookMarked size={18}/>
        <div><strong>{state.finished.length} / {SERIAL_ORDER.length}</strong><span>本棚 · N2 から N1 への十冊</span></div>
        <ArrowRight size={16}/>
      </Link>
      <Link className="today-month" to="/record" aria-label="今月の記録">
        <span>{Number(today.slice(5, 7))}月の印</span>
        <MonthCalendar month={today.slice(0, 7)} days={state.days} restDays={streakSummary(state.days, today).restDays} today={today}/>
      </Link>
      <p className="today-note">毎日の頁は日本時間の0時に切り替わります。</p>
    </aside>
  </main>
}
