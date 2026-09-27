import { readingForToken, type AnnotatedToken } from '../catalog'
import { entryForToken, sentenceAround, type GrammarEntry, type SelectedEntry, type VocabularyEntry } from '../learning'
import { findTopicFocusRange } from '../reader-links'

export type TokenSelection = { selected: SelectedEntry; context: string; ordinal: number; surface: string }
/** A paragraph to point at, and optionally the exact text in it to highlight. */
export type TextTarget = { ordinal: number; text?: string; label?: string }

type Props = {
  paragraphs: { ordinal: number; tokens: AnnotatedToken[] }[]
  vocabulary: Map<string, VocabularyEntry>
  grammar: Map<string, GrammarEntry>
  furigana: boolean
  activeKey?: string
  target?: TextTarget | null
  onSelect: (selection: TokenSelection) => void
}

/** Book-style text where N2/N1 words are underlined and open a word sheet. */
export function AnnotatedText({ paragraphs, vocabulary, grammar, furigana, activeKey, target, onSelect }: Props) {
  return <div className="daily-text">{paragraphs.map(paragraph => {
    const text = paragraph.tokens.map(token => token.text).join('')
    const isTarget = target?.ordinal === paragraph.ordinal
    const focus = isTarget && target?.text ? findTopicFocusRange(text, target.text) : null
    let offset = 0
    let anchored = false
    return <p key={paragraph.ordinal} id={`paragraph-${paragraph.ordinal}`} className={isTarget ? 'is-target' : undefined}>
      {isTarget && <span className="target-label">{target?.label || 'ここに出てきます'}</span>}
      {paragraph.tokens.map((token, index) => {
        const start = offset
        offset += Array.from(token.text).length
        const focused = Boolean(focus && start < focus.end && offset > focus.start)
        const anchor = focused && !anchored ? 'topic-focus' : undefined
        if (anchor) anchored = true
        const selected = entryForToken(token, vocabulary, grammar)
        // Only the author's own ruby: a dictionary reading can be wrong in context (灯 as ひ, not ともしび).
        const reading = furigana ? readingForToken(token) : undefined
        const content = reading ? <ruby>{token.text}<rt>{reading}</rt></ruby> : token.text
        const focusClass = focused ? ' is-focus' : ''
        if (!selected) return <span key={index} id={anchor} className={focusClass.trim() || undefined}>{content}</span>
        const key = `${selected.kind}:${selected.entry.id}`
        return <button type="button" key={index} id={anchor}
          className={`daily-word ${selected.kind === 'grammar' ? 'is-grammar' : `is-${selected.entry.level.toLowerCase()}`} ${activeKey === key ? 'is-active' : ''}${focusClass}`}
          onClick={() => onSelect({ selected, context: sentenceAround(text, start), ordinal: paragraph.ordinal, surface: token.text })}>{content}</button>
      })}
    </p>
  })}</div>
}

/** What the underline colours mean, with a switch to read without them. */
export function MarksLegend({ marks, onToggle }: { marks: boolean; onToggle: () => void }) {
  return <div className="daily-legend">
    {marks ? <><span className="legend-n2">N2 語彙</span><span className="legend-n1">N1 語彙</span><span className="legend-grammar">文法</span><small>タップで意味</small></> : <small>印を隠しています</small>}
    <button onClick={onToggle} aria-pressed={!marks}>{marks ? '印を隠す' : '印を表示'}</button>
  </div>
}
