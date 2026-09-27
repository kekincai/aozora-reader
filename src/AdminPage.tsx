import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { CloudUser } from './auth'
import { loadAdminOverview, setFeedbackStatus, type AdminOverview, type FeedbackStatus, type Retention } from './operations'

const number = new Intl.NumberFormat('ja-JP')
const dateTime = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
const eventLabels: Record<string, string> = { page_view: 'ページ閲覧', read_start: '読書開始', page_complete: '一頁読了', quiz_done: '確かめ完了', search: '作品検索', learning_open: '言葉を開く', review_complete: '復習', feedback_submitted: 'ご意見' }
const statusLabels: Record<FeedbackStatus, string> = { open: '未対応', reviewing: '確認中', resolved: '対応済み', closed: '終了' }
const categoryLabels: Record<string, string> = { bug: '不具合', suggestion: '提案', content: '内容', other: 'その他' }

function rate(value?: Retention, day: 1 | 7 = 1) {
  const cohort = Number(day === 1 ? value?.cohortDay1 : value?.cohortDay7) || 0
  const returned = Number(day === 1 ? value?.returnedDay1 : value?.returnedDay7) || 0
  return { text: cohort ? `${Math.round(100 * returned / cohort)}%` : '—', detail: `${number.format(returned)} / ${number.format(cohort)}人` }
}

function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="admin-kpi"><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>
}

function Panel({ title, note, children, className = '' }: { title: string; note?: string; children: React.ReactNode; className?: string }) {
  return <section className={`admin-card ${className}`}><header><h2>{title}</h2>{note && <span>{note}</span>}</header>{children}</section>
}

function Bars({ data }: { data: NonNullable<AdminOverview['dailyReading']> }) {
  if (!data.length) return <p className="admin-empty">一頁を読み終えた記録が集まると、ここに表示されます。</p>
  const max = Math.max(1, ...data.map(item => Number(item.pages)))
  return <div className="admin-bars" role="img" aria-label="日ごとの一頁読了数">{data.map(item => <div key={item.date} title={`${item.date}　${item.pages}頁 · ${item.readers}人`}>
    <b>{item.readers}</b><i style={{ height: `${Math.max(4, Number(item.pages) / max * 100)}%` }}/><span>{item.date.slice(5).replace('-', '/')}</span>
  </div>)}</div>
}

export function AdminPage({ user }: { user: CloudUser | null }) {
  const [data, setData] = useState<AdminOverview | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const load = useCallback(async () => {
    if (!user?.isAdmin) return
    setLoading(true); setError('')
    try { setData(await loadAdminOverview()) }
    catch (cause) { setError(cause instanceof Error ? cause.message : '統計を読み込めませんでした。') }
    finally { setLoading(false) }
  }, [user?.isAdmin])
  useEffect(() => { void load() }, [load])

  if (!user?.isAdmin) return <main className="page-frame"><header className="page-head is-center"><span className="page-kicker">管理</span><h1>管理者のパスキーでログインしてください</h1><p>運営の数字とご意見は、管理者だけが見られます。</p></header></main>

  const metrics = data?.metrics || {}
  const today = data?.dailyReading?.at(-1)
  const todayKey = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10)
  const readersToday = today?.date === todayKey ? Number(today.readers) : 0
  const maxEvent = Math.max(1, ...(data?.events.map(item => Number(item.count)) || [1]))
  const changeStatus = async (id: string, status: FeedbackStatus) => { await setFeedbackStatus(id, status); await load() }
  const readerDay1 = rate(data?.retention?.readers, 1)

  return <main className="page-frame admin">
    <header className="admin-top">
      <div><span className="page-kicker">管理</span><h1>運営の様子</h1><p>{data ? `${dateTime.format(data.generatedAt)} 時点` : '読み込んでいます…'}</p></div>
      <button className="daily-button is-quiet" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? 'spin' : ''} size={16}/> 更新</button>
    </header>
    {error && <p className="study-status">{error}</p>}

    <div className="admin-kpis">
      <Kpi label="今日読み終えた人" value={number.format(readersToday)} note={today?.date === todayKey ? `${number.format(Number(today.pages))}頁` : undefined}/>
      <Kpi label="7日間の利用者" value={number.format(Number(metrics.activeReaders7d || 0))} note={`登録 ${number.format(Number(metrics.totalUsers || 0))}人`}/>
      <Kpi label="翌日も読んだ人" value={readerDay1.text} note={readerDay1.detail}/>
      <Kpi label="未対応のご意見" value={number.format(Number(metrics.openFeedback || 0))}/>
    </div>

    <Panel title="毎日の一頁" note="直近14日 · 日本時間 · 棒は頁数、数字は人数" className="admin-wide">
      <Bars data={data?.dailyReading || []}/>
      <div className="admin-retention">
        {([['一頁を読み終えた人', data?.retention?.readers], ['訪れた人', data?.retention?.visitors]] as const).map(([label, value]) => <div key={label}>
          <span>{label}</span>
          <p><strong>{rate(value, 1).text}</strong> 翌日 <small>{rate(value, 1).detail}</small></p>
          <p><strong>{rate(value, 7).text}</strong> 7日以内 <small>{rate(value, 7).detail}</small></p>
        </div>)}
      </div>
      <p className="admin-footnote">9月28日より前は訪問ごとに別人として数えていたため、それ以前に来た人の回帰率は低く出ます。</p>
    </Panel>

    <div className="admin-grid-2">
      <Panel title="よく読まれている作品" note="7日間 · 読書開始">
        {data?.topWorks.length ? <ol className="admin-rank">{data.topWorks.map(item => <li key={item.workID}><span>{item.title}</span><b>{number.format(item.count)}</b></li>)}</ol> : <p className="admin-empty">読書データはまだありません。</p>}
      </Panel>
      <Panel title="イベント" note="7日間">
        {data?.events.length ? <ul className="admin-events">{data.events.map(item => <li key={item.eventName}><span>{eventLabels[item.eventName] || item.eventName}</span><i><b style={{ width: `${Number(item.count) / maxEvent * 100}%` }}/></i><strong>{number.format(item.count)}</strong></li>)}</ul> : <p className="admin-empty">イベントはまだありません。</p>}
      </Panel>
    </div>

    <Panel title="ご意見" note={`${data?.feedback.length || 0}件`} className="admin-wide">
      {data?.feedback.length ? <ul className="admin-feedback">{data.feedback.map(item => <li key={item.id} className={`is-${item.status}`}>
        <div className="admin-feedback-meta"><span className="level-chip">{categoryLabels[item.category] || item.category}</span><time>{dateTime.format(item.createdAt)}</time><span>{item.displayName || '匿名'}</span><span>{item.pagePath}</span></div>
        <p>{item.message}</p>
        {item.contact && <small>返信先：{item.contact}</small>}
        <select aria-label="対応状況" value={item.status} onChange={event => void changeStatus(item.id, event.target.value as FeedbackStatus)}>{(Object.keys(statusLabels) as FeedbackStatus[]).map(status => <option key={status} value={status}>{statusLabels[status]}</option>)}</select>
      </li>)}</ul> : <p className="admin-empty">ご意見はまだ届いていません。</p>}
    </Panel>

    <Panel title="登録ユーザー" note={`${data?.users.length || 0}人`} className="admin-wide">
      {data?.users.length ? <div className="admin-table-wrap"><table className="admin-table">
        <thead><tr><th>名前</th><th>登録</th><th>最終利用</th><th>イベント</th><th>同期</th></tr></thead>
        <tbody>{data.users.map(item => <tr key={item.id}><td>{item.displayName}</td><td>{dateTime.format(item.createdAt)}</td><td>{item.lastActiveAt ? dateTime.format(item.lastActiveAt) : '—'}</td><td>{number.format(item.eventCount)}</td><td>{item.hasCloudState ? '済' : '—'}</td></tr>)}</tbody>
      </table></div> : <p className="admin-empty">登録ユーザーはまだいません。</p>}
    </Panel>
  </main>
}
