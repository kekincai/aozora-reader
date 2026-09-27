import { useEffect, useMemo, useState } from 'react'
import { loadSerialWork, type SerialWork } from '../learning'
import type { Pace, SerialPosition } from '../state/store'
import { pageAt, type DailyPage } from './serial'

export type SerialPageResult = {
  work: SerialWork | null
  page: DailyPage | null
  error: string
  retry: () => void
}

/** Loads the work behind a serial position (with its dictionary entries) and the page that starts there. */
export function useSerialPage(position: SerialPosition | null, pace: Pace): SerialPageResult {
  const [work, setWork] = useState<SerialWork | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const workId = position?.workId
  useEffect(() => {
    if (!workId) return
    let active = true
    setError('')
    loadSerialWork(workId)
      .then(nextWork => { if (active) setWork(nextWork) })
      .catch(() => { if (active) setError('作品を読み込めませんでした。少し時間をおいて、もう一度お試しください。') })
    return () => { active = false }
  }, [workId, attempt])
  const page = useMemo(() => work && position && work.id === position.workId ? pageAt(work.paragraphs, pace, position.ordinal) : null, [work, position, pace])
  return { work: work?.id === workId ? work : null, page, error, retry: () => setAttempt(value => value + 1) }
}

export function pageText(work: SerialWork, page: DailyPage) {
  const wanted = new Set(page.ordinals)
  return work.paragraphs.filter(paragraph => wanted.has(paragraph.ordinal))
}

export function readingMinutes(characters: number) {
  return Math.max(1, Math.round(characters / 220))
}
