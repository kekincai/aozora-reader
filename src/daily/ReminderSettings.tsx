import { useEffect, useState } from 'react'
import { Bell, BellOff, Share } from 'lucide-react'
import { currentJapanHour, disableReminder, enableReminder, reminderStatus, reminderSupport } from '../push'

const HOURS = Array.from({ length: 24 }, (_, hour) => hour)
const INVITE_KEY = 'aozora-reminder-invite-dismissed'

function useReminder() {
  const support = reminderSupport()
  const [status, setStatus] = useState<{ enabled: boolean; hour: number | null } | null>(null)
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => { if (support === 'supported') void reminderStatus().then(setStatus).catch(() => setStatus({ enabled: false, hour: null })) }, [support])
  const run = async (action: () => Promise<void>, done: string) => {
    setWorking(true); setMessage('')
    try { await action(); setStatus(await reminderStatus()); setMessage(done) }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : '通知を設定できませんでした。') }
    finally { setWorking(false) }
  }
  return { support, status, working, message, run }
}

function HomeScreenHint() {
  return <p className="reminder-hint"><Share size={15}/> iPhone・iPad では、Safari の共有ボタンから「ホーム画面に追加」し、そのアイコンから開くと通知を受け取れます。</p>
}

/** Full settings for the Record page. */
export function ReminderSettings() {
  const { support, status, working, message, run } = useReminder()
  const [hour, setHour] = useState(21)
  useEffect(() => { if (status?.hour !== null && status?.hour !== undefined) setHour(status.hour) }, [status])
  if (support === 'unsupported') return <p className="reminder-hint">このブラウザは通知に対応していません。</p>
  if (support === 'needs-home-screen') return <HomeScreenHint/>
  return <div className="reminder">
    <label className="reminder-time"><span>毎日</span>
      <select value={hour} onChange={event => setHour(Number(event.target.value))} disabled={working}>{HOURS.map(value => <option key={value} value={value}>{value}:00</option>)}</select>
      <span>に知らせる</span>
    </label>
    <p className="reminder-note">その日の一頁を読み終えていれば、通知は届きません。</p>
    <div className="reminder-actions">
      {status?.enabled
        ? <>
          <button className="daily-button is-accent" disabled={working || status.hour === hour} onClick={() => void run(() => enableReminder(hour, false), `${hour}:00 に変えました。`)}><Bell size={16}/> 時刻を変える</button>
          <button className="daily-button is-quiet" disabled={working} onClick={() => void run(disableReminder, '通知を止めました。')}><BellOff size={16}/> 止める</button>
        </>
        : <button className="daily-button is-accent" disabled={working} onClick={() => void run(() => enableReminder(hour, false), `毎日 ${hour}:00 にお知らせします。`)}><Bell size={16}/> 通知を受け取る</button>}
    </div>
    {message && <p className="reminder-message" role="status">{message}</p>}
  </div>
}

/** A one-time question after finishing a page: remind me at this time tomorrow? */
export function ReminderInvite() {
  const { support, status, working, message, run } = useReminder()
  const [dismissed, setDismissed] = useState(() => { try { return localStorage.getItem(INVITE_KEY) === '1' } catch { return true } })
  const hour = currentJapanHour()
  if (dismissed || support === 'unsupported' || !status && support === 'supported' || status?.enabled && !message) return null
  const dismiss = () => { try { localStorage.setItem(INVITE_KEY, '1') } catch { /* ignore */ } setDismissed(true) }
  return <section className="reminder-invite">
    <Bell size={18}/>
    <div>
      <strong>明日も {hour}:00 ごろに知らせましょうか？</strong>
      {support === 'needs-home-screen' ? <HomeScreenHint/> : message ? <p className="reminder-message" role="status">{message}</p> : <p>読み終えた日は届きません。記録ページでいつでも変えられます。</p>}
      {support === 'supported' && !status?.enabled && <div className="reminder-actions">
        <button className="daily-button is-accent" disabled={working} onClick={() => void run(() => enableReminder(hour, true), `毎日 ${hour}:00 にお知らせします。`)}>知らせてもらう</button>
        <button className="daily-button is-quiet" onClick={dismiss}>今はいい</button>
      </div>}
      {support === 'needs-home-screen' && <button className="text-link" onClick={dismiss}>閉じる</button>}
    </div>
  </section>
}
