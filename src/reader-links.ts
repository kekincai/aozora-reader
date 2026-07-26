const VALID_TOPIC_FORMS = new Set(['kureru', 'morau', 'ageru', 'causative'])

/** Keeps corpus links readable and safe to share or open in a new tab. */
export function topicExampleReaderLink(workID: string, paragraphOrdinal: number, form: string) {
  const params = new URLSearchParams({ paragraph: String(Math.max(1, Math.trunc(paragraphOrdinal))), view: 'reader' })
  if (VALID_TOPIC_FORMS.has(form)) params.set('focus', form)
  return `/read/${encodeURIComponent(workID)}?${params}`
}

export function parseReaderTarget(value: string | null) {
  if (!value || !/^\d{1,7}$/.test(value)) return null
  const ordinal = Number(value)
  return ordinal > 0 ? ordinal : null
}
