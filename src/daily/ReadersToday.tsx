import { useEffect, useState } from 'react'
import { loadDailyStats } from '../operations'

// Below this the number discourages more than it encourages, so the line stays hidden.
const MINIMUM = 3

/** A quiet line saying how many people finished a page today. */
export function ReadersToday({ refreshKey = 0 }: { refreshKey?: number }) {
  const [readers, setReaders] = useState(0)
  useEffect(() => {
    let active = true
    void loadDailyStats().then(result => { if (active) setReaders(result.readersToday) }).catch(() => undefined)
    return () => { active = false }
  }, [refreshKey])
  if (readers < MINIMUM) return null
  return <p className="readers-today">今日、<b>{readers}</b>人が一頁を読み終えました</p>
}
