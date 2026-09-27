import { useMemo, useState } from 'react'
import { CheckCircle2, LockKeyhole, Send } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { submitFeedback, type FeedbackCategory } from './operations'

const categories: Array<{ value: FeedbackCategory; label: string }> = [
  { value: 'suggestion', label: '要望' }, { value: 'bug', label: '不具合' },
  { value: 'content', label: '作品・学習内容' }, { value: 'other', label: 'その他' },
]

export function FeedbackPage() {
  const location = useLocation()
  const contextPath = useMemo(() => new URLSearchParams(location.search).get('from') || '/', [location.search])
  const [category, setCategory] = useState<FeedbackCategory>('suggestion')
  const [message, setMessage] = useState('')
  const [contact, setContact] = useState('')
  const [website, setWebsite] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const send = async (event: React.FormEvent) => {
    event.preventDefault(); setWorking(true); setError('')
    try {
      await submitFeedback({ category, message, contact, pagePath: contextPath, website })
      setSubmitted(true); setMessage(''); setContact('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : '送信できませんでした。') }
    finally { setWorking(false) }
  }

  return <main className="page-frame feedback">
    <header className="page-head">
      <span className="page-kicker">ご意見</span>
      <h1>使いにくいところを教えてください</h1>
      <p>学習内容の誤り、読みたい作品、ほしい機能など、どんなことでも。ひとつずつ読んで改善に使います。</p>
    </header>
    {submitted ? <section className="empty-note is-center" role="status"><CheckCircle2 size={24}/><p><strong>受け付けました。</strong>ありがとうございます。</p><button className="daily-button is-quiet" onClick={() => setSubmitted(false)}>もう一件送る</button></section>
      : <form className="feedback-card" onSubmit={send}>
        <div className="catalog-chips" role="radiogroup" aria-label="ご意見の種類"><span>種類</span>
          {categories.map(item => <button type="button" key={item.value} role="radio" aria-checked={category === item.value} className={category === item.value ? 'is-on' : ''} onClick={() => setCategory(item.value)}>{item.label}</button>)}
        </div>
        <label className="feedback-field"><span>内容 <b>必須</b></span>
          <textarea value={message} onChange={event => setMessage(event.target.value)} minLength={10} maxLength={2000} required rows={7} placeholder="できるだけ具体的にお書きください（10文字以上）"/>
          <small>{message.trim().length} / 2000</small>
        </label>
        <label className="feedback-field"><span>返信先（任意）</span><input value={contact} onChange={event => setContact(event.target.value)} maxLength={160} placeholder="返信が必要な場合だけ"/></label>
        <label className="feedback-honeypot" aria-hidden="true"><span>ウェブサイト</span><input value={website} onChange={event => setWebsite(event.target.value)} tabIndex={-1} autoComplete="off"/></label>
        <button className="daily-button is-accent" disabled={working || message.trim().length < 10}>{working ? '送信しています…' : <><Send size={16}/> 送信する</>}</button>
        {error && <p className="study-status" role="alert">{error}</p>}
        <p className="feedback-privacy"><LockKeyhole size={14}/> 保存するのは本文・返信先・送信したページ（{contextPath}）だけです。IP アドレスや端末情報は保存しません。</p>
      </form>}
  </main>
}
