import { readingForToken, type AnnotatedToken } from '../catalog'
import { entryForToken, sentenceAround, type GrammarEntry, type SelectedEntry, type VocabularyEntry } from '../learning'

export type TokenSelection = { selected: SelectedEntry; context: string; ordinal: number; surface: string }

type Props = {
  paragraphs: { ordinal: number; tokens: AnnotatedToken[] }[]
  vocabulary: Map<string, VocabularyEntry>
  grammar: Map<string, GrammarEntry>
  furigana: boolean
  activeKey?: string
  onSelect: (selection: TokenSelection) => void
}

/** Book-style text where N2/N1 words are underlined and open a word sheet. */
export function AnnotatedText({ paragraphs, vocabulary, grammar, furigana, activeKey, onSelect }: Props) {
  return <div className="daily-text">{paragraphs.map(paragraph => {
    const text = paragraph.tokens.map(token => token.text).join('')
    let offset = 0
    return <p key={paragraph.ordinal} id={`paragraph-${paragraph.ordinal}`}>{paragraph.tokens.map((token, index) => {
      const start = offset
      offset += Array.from(token.text).length
      const selected = entryForToken(token, vocabulary, grammar)
      // Only the author's own ruby: a dictionary reading can be wrong in context (灯 as ひ, not ともしび).
      const reading = furigana ? readingForToken(token) : undefined
      const content = reading ? <ruby>{token.text}<rt>{reading}</rt></ruby> : token.text
      if (!selected) return <span key={index}>{content}</span>
      const key = `${selected.kind}:${selected.entry.id}`
      return <button type="button" key={index}
        className={`daily-word ${selected.kind === 'grammar' ? 'is-grammar' : ''} ${activeKey === key ? 'is-active' : ''}`}
        onClick={() => onSelect({ selected, context: sentenceAround(text, start), ordinal: paragraph.ordinal, surface: token.text })}>{content}</button>
    })}</p>
  })}</div>
}
