import { useMemo, useState } from 'react'
import { CheckCircle2, LockKeyhole, MessageSquareText, Send } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { submitFeedback, type FeedbackCategory } from './operations'

const categories: Array<{ value: FeedbackCategory; label: string }> = [
  { value: 'bug', label: '不具合の報告' }, { value: 'suggestion', label: '機能のご要望' },
  { value: 'content', label: '作品・学習内容について' }, { value: 'other', label: 'その他' },
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

  return <main className="feedback-page">
    <section className="feedback-layout">
      <div className="feedback-intro">
        <MessageSquareText size={27}/><h1>ご意見をお聞かせください</h1>
        <p>青空しおりは、読む人とともに育つ小さな書店のような場所でありたいと考えています。</p>
        <p>使いにくいところ、学習内容の誤り、追加してほしい機能など、どんなことでもお寄せください。</p>
        <div className="privacy-note"><LockKeyhole size={20}/><div><strong>プライバシーについて</strong><p>本文、任意の返信先、参照ページだけを保存します。アプリのデータベースには IP アドレス、端末情報、検索語の原文を保存しません。</p></div></div>
      </div>
      <form className="feedback-form" onSubmit={send}>
        <label><span>ご意見の種類</span><select value={category} onChange={event => setCategory(event.target.value as FeedbackCategory)}>{categories.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label><span>ご意見・ご要望 <b>必須</b></span><textarea value={message} onChange={event => setMessage(event.target.value)} minLength={10} maxLength={2000} required placeholder="できるだけ具体的にお書きください"/><small>{message.length} / 2,000</small></label>
        <label><span>返信先（任意）</span><input value={contact} onChange={event => setContact(event.target.value)} maxLength={160} placeholder="返信が必要な場合だけご記入ください"/></label>
        <label><span>参照ページ</span><input value={contextPath} readOnly/></label>
        <label className="feedback-honeypot" aria-hidden="true"><span>ウェブサイト</span><input value={website} onChange={event => setWebsite(event.target.value)} tabIndex={-1} autoComplete="off"/></label>
        <button className="primary-button feedback-submit" disabled={working || message.trim().length < 10}>{working ? '送信しています…' : <><Send size={16}/> 送信する</>}</button>
        {error && <p className="form-error" role="alert">{error}</p>}
        {submitted && <div className="feedback-success" role="status"><CheckCircle2/><div><strong>ご意見を受け付けました</strong><p>ありがとうございます。管理画面から確認し、改善に活用します。</p></div></div>}
      </form>
    </section>
    <section className="collection-policy"><strong>記録するもの</strong><span>ご意見本文・任意の返信先・参照ページ</span><strong>記録しないもの</strong><span>検索語の原文・読んだ本文・IP・端末指紋</span></section>
  </main>
}

