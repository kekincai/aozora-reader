const VALID_TOPIC_FORMS = new Set(['kureru', 'morau', 'ageru', 'causative'])

/** Keeps corpus links readable and safe to share or open in a new tab. */
const TOPIC_FOCUS_PATTERNS: Record<string, RegExp> = {
  kureru: /[てで](?:くれ|呉れ|くださ|下さ)/,
  morau: /[てで](?:もら|貰|いただ|戴|頂)/,
  ageru: /[てで](?:あげ|上げ|やる|やり|やっ|やれ|差し上げ)/,
  causative: /(?:させて|[かがたなばまらわ]せて)(?:くれ|呉れ|くださ|下さ|もら|貰|いただ|戴|頂|あげ|上げ|やる|やり|やっ|やれ)/,
}

export function topicFocusText(text: string, form: string) {
  return text.match(TOPIC_FOCUS_PATTERNS[form] || /$^/)?.[0] || ''
}

export function topicExampleReaderLink(workID: string, paragraphOrdinal: number, form: string, focusText = '') {
  const params = new URLSearchParams({ paragraph: String(Math.max(1, Math.trunc(paragraphOrdinal))), view: 'reader' })
  if (VALID_TOPIC_FORMS.has(form)) params.set('focus', form)
  if (focusText.trim()) params.set('text', focusText.trim().slice(0, 40))
  return `/read/${encodeURIComponent(workID)}?${params}`
}

export function parseReaderTarget(value: string | null) {
  if (!value || !/^\d{1,7}$/.test(value)) return null
  const ordinal = Number(value)
  return ordinal > 0 ? ordinal : null
}

export function findTopicFocusRange(paragraphText: string, focusText: string) {
  const start = focusText ? paragraphText.indexOf(focusText) : -1
  return start < 0 ? null : { start, end: start + focusText.length }
}
