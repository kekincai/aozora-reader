import { useEffect, useMemo, useState } from 'react'
import { loadLearningIndex, loadSerialWork, type LearningIndex, type SerialWork } from '../learning'
import type { Pace, SerialPosition } from '../state/store'
import { pageAt, type DailyPage } from './serial'

export type SerialPageResult = {
  work: SerialWork | null
  learning: LearningIndex | null
  page: DailyPage | null
  error: string
  retry: () => void
}

/** Loads the work behind a serial position and the page that starts there. */
export function useSerialPage(position: SerialPosition | null, pace: Pace, withLearning = false): SerialPageResult {
  const [work, setWork] = useState<SerialWork | null>(null)
  const [learning, setLearning] = useState<LearningIndex | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const workId = position?.workId
  useEffect(() => {
    if (!workId) return
    let active = true
    setError('')
    Promise.all([loadSerialWork(workId), withLearning ? loadLearningIndex() : Promise.resolve(null)])
      .then(([nextWork, nextLearning]) => { if (active) { setWork(nextWork); setLearning(nextLearning) } })
      .catch(() => { if (active) setError('作品を読み込めませんでした。少し時間をおいて、もう一度お試しください。') })
    return () => { active = false }
  }, [workId, withLearning, attempt])
  const page = useMemo(() => work && position && work.id === position.workId ? pageAt(work.paragraphs, pace, position.ordinal) : null, [work, position, pace])
  return { work: work?.id === workId ? work : null, learning, page, error, retry: () => setAttempt(value => value + 1) }
}

export function pageText(work: SerialWork, page: DailyPage) {
  const wanted = new Set(page.ordinals)
  return work.paragraphs.filter(paragraph => wanted.has(paragraph.ordinal))
}

export function readingMinutes(characters: number) {
  return Math.max(1, Math.round(characters / 220))
}
