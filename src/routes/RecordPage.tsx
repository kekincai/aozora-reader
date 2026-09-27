import { Link, useLocation } from 'react-router-dom'
import { Cloud, KeyRound, MessageCircle, ShieldCheck } from 'lucide-react'
import { PaceChooser } from './TodayPage'
import { ReminderSettings } from '../daily/ReminderSettings'
import { useApp } from '../state/context'
import { japanDate, streakSummary } from '../state/store'

function formatDuration(seconds: number) {
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}分`
  return `${Math.floor(minutes / 60)}時間${minutes % 60 ? ` ${minutes % 60}分` : ''}`
}

export function MonthCalendar({ month, days, restDays, today }: { month: string; days: Record<string, unknown>; restDays: Set<string>; today: string }) {
  const [year, monthNumber] = month.split('-').map(Number)
  const first = new Date(Date.UTC(year, monthNumber - 1, 1))
  const length = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  const offset = first.getUTCDay()
  return <div className="month">
    <div className="month-head">{['日', '月', '火', '水', '木', '金', '土'].map(day => <span key={day}>{day}</span>)}</div>
    <div className="month-grid">
      {Array.from({ length: offset }, (_, index) => <span key={`blank-${index}`} className="is-blank"/>)}
      {Array.from({ length }, (_, index) => {
        const date = `${month}-${String(index + 1).padStart(2, '0')}`
        const kind = days[date] ? 'is-done' : restDays.has(date) ? 'is-rest' : date > today ? 'is-future' : date === today ? 'is-today' : ''
        return <span key={date} className={kind} title={days[date] ? '読了' : restDays.has(date) ? '休み札' : undefined}>{index + 1}</span>
      })}
    </div>
  </div>
}

export function RecordPage() {
  const { state, setState, auth, syncStatus, openAuth } = useApp()
  const location = useLocation()
  const today = japanDate()
  const summary = streakSummary(state.days, today)
  const month = today.slice(0, 7)
  const monthCount = Object.keys(state.days).filter(date => date.startsWith(month)).length
  const [, monthNumber] = month.split('-').map(Number)
  return <main className="record-page page-frame">
    <header className="page-head">
      <span className="page-kicker">記録</span>
      <h1>{monthNumber}月に押した印 {monthCount}こ</h1>
      <p>読み終えた日に印が押されます。金色は休み札で埋めた日です。</p>
    </header>
    <div className="record-layout">
      <section className="record-calendar"><MonthCalendar month={month} days={state.days} restDays={summary.restDays} today={today}/></section>
      <section className="record-stats">
        <div><strong>{summary.total}</strong><span>読んだ日</span></div>
        <div><strong>{summary.current}</strong><span>連続</span></div>
        <div><strong>{Object.keys(state.cards).length}</strong><span>集めた言葉</span></div>
        <div><strong>{formatDuration(state.readingSeconds)}</strong><span>読書時間</span></div>
      </section>
      <section className="record-settings">
        <h2>一日の長さ</h2>
        <PaceChooser pace={state.pace} onChange={pace => setState(current => ({ ...current, pace }))}/>
        <h2>毎日のお知らせ</h2>
        <ReminderSettings/>
        <h2>記録の同期</h2>
        <button className="today-tile" onClick={openAuth}>
          {auth.user ? <Cloud size={18}/> : <KeyRound size={18}/>}
          <div><strong>{auth.user ? `${auth.user.displayName}さん` : 'パスキーで同期する'}</strong><span>{auth.user ? (syncStatus === 'error' ? '同期を再試行しています' : syncStatus === 'saving' ? '保存しています…' : 'クラウドに保存済み') : '登録しなくても、この端末には記録が残ります'}</span></div>
        </button>
        <Link className="today-tile" to={{ pathname: '/feedback', search: `?from=${encodeURIComponent(location.pathname)}` }}><MessageCircle size={18}/><div><strong>ご意見を送る</strong><span>不具合や読みたい作品を教えてください</span></div></Link>
        {auth.user?.isAdmin && <Link className="today-tile" to="/admin"><ShieldCheck size={18}/><div><strong>管理</strong><span>運営の数字を見る</span></div></Link>}
      </section>
    </div>
  </main>
}
