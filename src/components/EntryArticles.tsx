import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { loadEntryArticles, type ArticleRef, type SelectedEntry } from '../learning'
import { entryReaderLink } from '../reader-links'

/** Other works where the entry appears most, fetched when the sheet opens. */
export function EntryArticles({ selected, className, label }: { selected: SelectedEntry; className: string; label: string }) {
  const [articles, setArticles] = useState<ArticleRef[] | null>(null)
  useEffect(() => {
    let active = true
    setArticles(null)
    void loadEntryArticles(selected.kind, selected.entry.id).then(result => { if (active) setArticles(result) })
    return () => { active = false }
  }, [selected])
  if (articles && !articles.length) return null
  return <div className={className}><span>{label}</span>{articles
    ? articles.map(article => <Link key={article.id} to={entryReaderLink(article.id, article.ordinal, article.text || '')}>{article.title}<small> · {article.count}回</small></Link>)
    : <small>探しています…</small>}</div>
}
