import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, BookOpen, MessageCircle, RefreshCw, Users } from 'lucide-react'
import type { CloudUser } from './auth'
import { loadAdminOverview, setFeedbackStatus, type AdminOverview, type FeedbackStatus } from './operations'

const number = new Intl.NumberFormat('ja-JP')
const date = new Intl.DateTimeFormat('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
const eventLabels: Record<string,string> = { page_view:'ページ閲覧', read_start:'読書開始', search:'文章検索', learning_open:'学習項目', review_complete:'復習完了', feedback_submitted:'ご意見' }
const statusLabels: Record<FeedbackStatus,string> = { open:'未対応', reviewing:'確認中', resolved:'対応済み', closed:'終了' }

function TrendChart({ data }: { data: AdminOverview['daily'] }) {
  const points = useMemo(() => {
    if (!data.length) return []
    const max = Math.max(1, ...data.map(item => Number(item.readers) + Number(item.readStarts)))
    return data.map((item, index) => ({ ...item, x: 34 + index * (632 / Math.max(1, data.length - 1)), y: 176 - ((Number(item.readers) + Number(item.readStarts)) / max) * 132 }))
  }, [data])
  if (!points.length) return <div className="admin-empty">データが集まると、ここに14日間の推移が表示されます。</div>
  return <svg className="trend-chart" viewBox="0 0 700 220" role="img" aria-label="直近14日間の利用推移">
    {[44,88,132,176].map(y => <line key={y} x1="34" y1={y} x2="666" y2={y}/>) }
    <path d={points.map((point,index) => `${index ? 'L' : 'M'}${point.x},${point.y}`).join(' ')}/>
    {points.map(point => <g key={point.date}><circle cx={point.x} cy={point.y} r="4"/><text x={point.x} y="207" textAnchor="middle">{point.date.slice(5)}</text></g>)}
  </svg>
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

  if (!user?.isAdmin) return <main className="admin-denied"><h1>管理者ページ</h1><p>このページを表示するには、管理者のパスキーでログインしてください。</p></main>
  const metrics = data?.metrics || {}
  const changeStatus = async (id: string, status: FeedbackStatus) => { await setFeedbackStatus(id, status); await load() }
  const maxEvent = Math.max(1, ...(data?.events.map(item => Number(item.count)) || [1]))
  return <main className="admin-page">
    <header className="admin-heading"><div><h1>管理ダッシュボード</h1><p>読書の流れと、読者から届いた声を確認できます。</p></div><button onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? 'spin' : ''} size={16}/>更新</button></header>
    {error && <p className="form-error">{error}</p>}
    <section className="metric-rail">
      <div><Users/><span>登録ユーザー</span><strong>{number.format(metrics.totalUsers || 0)}</strong></div>
      <div><Activity/><span>7日間の利用セッション</span><strong>{number.format(metrics.activeReaders7d || 0)}</strong></div>
      <div><BookOpen/><span>7日間の読書開始</span><strong>{number.format(metrics.readStarts7d || 0)}</strong></div>
      <div><MessageCircle/><span>未対応のご意見</span><strong>{number.format(metrics.openFeedback || 0)}</strong></div>
    </section>
    <section className="admin-grid">
      <div className="admin-panel trend-panel"><div className="admin-panel-title"><h2>利用推移</h2><span>直近14日間</span></div><TrendChart data={data?.daily || []}/></div>
      <div className="admin-panel"><div className="admin-panel-title"><h2>よく読まれている作品</h2><span>7日間</span></div><div className="admin-table top-works">{data?.topWorks.length ? data.topWorks.map((item,index) => <div key={item.workID}><b>{index + 1}</b><span>{item.title}</span><strong>{number.format(item.count)}回</strong></div>) : <div className="admin-empty">読書データはまだありません。</div>}</div></div>
      <div className="admin-panel event-panel"><div className="admin-panel-title"><h2>イベント分布</h2><span>7日間</span></div>{data?.events.length ? data.events.map(item => <div className="event-row" key={item.eventName}><span>{eventLabels[item.eventName] || item.eventName}</span><i><b style={{width:`${Number(item.count) / maxEvent * 100}%`}}/></i><strong>{number.format(item.count)}</strong></div>) : <div className="admin-empty">イベントはまだありません。</div>}</div>
      <div className="admin-panel user-panel"><div className="admin-panel-title"><h2>登録ユーザー</h2><span>{data?.users.length || 0}人</span></div><div className="admin-table users-table"><div className="table-head"><span>名前</span><span>登録日</span><span>最終利用</span><span>イベント</span></div>{data?.users.map(item => <div key={item.id}><strong>{item.displayName}</strong><span>{date.format(item.createdAt)}</span><span>{item.lastActiveAt ? date.format(item.lastActiveAt) : '—'}</span><span>{number.format(item.eventCount)}</span></div>)}</div></div>
    </section>
    <section className="admin-panel feedback-admin"><div className="admin-panel-title"><h2>最近のご意見</h2><span>{data?.feedback.length || 0}件</span></div><div className="feedback-admin-list">{data?.feedback.length ? data.feedback.map(item => <article key={item.id}><div><time>{date.format(item.createdAt)}</time><span>{item.displayName || '匿名'}</span><span>{item.pagePath}</span></div><p>{item.message}</p>{item.contact && <small>返信先：{item.contact}</small>}<select aria-label="対応状況" value={item.status} onChange={event => void changeStatus(item.id, event.target.value as FeedbackStatus)}>{(Object.keys(statusLabels) as FeedbackStatus[]).map(status => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></article>) : <div className="admin-empty">ご意見はまだ届いていません。</div>}</div></section>
  </main>
}
