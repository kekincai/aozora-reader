import { Check, Plus, X } from 'lucide-react'
import { EntryArticles } from './EntryArticles'
import { entryWord, type SelectedEntry } from '../learning'

type Props = {
  selected: SelectedEntry
  context?: string
  saved: boolean
  onSave: () => void
  onClose: () => void
  showArticles?: boolean
}

/** Bottom sheet on phones, a floating card beside the text on desktop. */
export function WordSheet({ selected, context, saved, onSave, onClose, showArticles }: Props) {
  const { entry } = selected
  return <aside className="word-panel" role="dialog" aria-label={entryWord(selected)}>
    <button className="word-panel-close" onClick={onClose} aria-label="閉じる"><X size={18}/></button>
    <span className="word-panel-level">{entry.level} · {selected.kind === 'vocabulary' ? '語彙' : '文法'}</span>
    <h2>{entryWord(selected)}</h2>
    <p className="word-panel-reading">{selected.kind === 'vocabulary' ? selected.entry.reading : selected.entry.formation}</p>
    <p className="word-panel-meaning">{entry.meaning}</p>
    {context && <p className="word-panel-context">{context}</p>}
    {selected.kind === 'grammar' && selected.entry.examples[0] && !context && <p className="word-panel-context">{selected.entry.examples[0].jp}{selected.entry.examples[0].zh && <small>{selected.entry.examples[0].zh}</small>}</p>}
    {showArticles && <EntryArticles selected={selected} className="word-panel-articles" label="ほかの作品では"/>}
    <button className={`daily-button ${saved ? 'is-quiet' : 'is-accent'}`} onClick={onSave} disabled={saved}>{saved ? <><Check size={17}/> 単語帳に入れました</> : <><Plus size={17}/> 単語帳に入れる</>}</button>
  </aside>
}
