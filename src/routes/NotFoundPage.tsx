import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return <main className="page-frame">
    <header className="page-head is-center">
      <span className="page-kicker">404</span>
      <h1>この頁は見つかりませんでした</h1>
      <p>リンクが古くなっているかもしれません。今日の一頁から続けて読めます。</p>
    </header>
    <div className="done-actions"><Link className="daily-button is-accent" to="/">今日の一頁へ</Link><Link className="daily-button is-quiet" to="/shelf">本棚を見る</Link></div>
  </main>
}
